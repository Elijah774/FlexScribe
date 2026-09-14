/* ===========================================================
   billingProcessor.js
   Minimal subscription billing processor (Phase 3).

   For each ACTIVE subscription whose billing date is "today"
   (in the user's timezone), attempt to charge the wallet:

     if walletBalance >= billingAmount
         -> deduct, record 'debit' WalletTransaction, PAYMENT_SUCCESS
     else
         -> PAYMENT_FAILED (insufficient funds)

   Minimal by design (per project decision):
   - no retries
   - no partial payments
   - no proration or edge-case handling
   - one charge attempt per subscription per billing date

   Duplicate safety: a processed-marker notification dedupe key
   ('billing-charged-{subscriptionID}-{billingDateKey}') ensures a
   subscription is only charged once per billing date even if the
   job runs repeatedly. We check for an existing PAYMENT_SUCCESS or
   PAYMENT_FAILED notification for that subscription+date first.

   After a charge, the subscription's billingDate is advanced to the
   next cycle so it will bill again next period.
=========================================================== */

'use strict';

const { query } = require('../db');
const events = require('./notificationEvents');
const notificationService = require('./notificationService');
const tz = require('./timezone');
const { NOTIFICATION_TYPES, ENTITY_TYPES } = require('../constants/notificationTypes');

/* Advance a billing date by one cycle. Returns a 'YYYY-MM-DD' string. */
function _nextBillingDate(dateStr, cycle) {
    const d = new Date(dateStr + 'T00:00:00Z');
    switch (cycle) {
        case 'weekly':    d.setUTCDate(d.getUTCDate() + 7); break;
        case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
        case 'yearly':    d.setUTCFullYear(d.getUTCFullYear() + 1); break;
        case 'monthly':
        default:          d.setUTCMonth(d.getUTCMonth() + 1); break;
    }
    return d.toISOString().slice(0, 10);
}

/* Charge a single subscription. Returns a result descriptor. */
async function _chargeOne(sub, billingDateKey) {
    const subscriberID = sub.subscriberID;

    // Idempotency guard: write a marker notification FIRST. createNotification
    // dedupes on (subscriberID + type + entity + eventToken), so if a marker
    // for this subscription+billing-date already exists it returns created:false
    // and we know the subscription was already charged for this date. This is
    // the single, atomic guard against double-charging on repeat/concurrent runs.
    // The marker is a low-priority SYSTEM row that expires immediately, so it
    // never shows in the user's notification list.
    const marker = await notificationService.createNotification({
        subscriberID,
        type: NOTIFICATION_TYPES.SYSTEM,
        title: 'Billing processed',
        message: `Billing run for ${sub.serviceName}.`,
        priority: 'low',
        relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
        relatedEntityID: sub.subscriptionID,
        eventToken: 'billing-charged-' + billingDateKey,
        expiresAt: new Date(Date.now() + 1000) // hidden from lists immediately
    });
    if (!marker.created) {
        return { subscriptionID: sub.subscriptionID, status: 'skipped', reason: 'already-charged' };
    }

    // Load wallet
    const walletRes = await query(
        'SELECT walletID, balance FROM VirtualWallet WHERE subscriberID = @sid',
        { sid: subscriberID }
    );
    if (walletRes.recordset.length === 0) {
        return { subscriptionID: sub.subscriptionID, status: 'skipped', reason: 'no-wallet' };
    }
    const wallet = walletRes.recordset[0];
    const balance = parseFloat(wallet.balance) || 0;
    const amount = parseFloat(sub.billingAmount) || 0;

    if (balance >= amount) {
        // AFFORDABLE -> deduct + record transaction + PAYMENT_SUCCESS
        const newBalance = balance - amount;
        await query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid',
            { bal: newBalance, wid: wallet.walletID });

        const txRes = await query(`
            INSERT INTO WalletTransaction (walletID, subscriptionID, transactionType, transactionAmount, runningBalance, description, category)
            OUTPUT INSERTED.transactionID
            VALUES (@wid, @subid, 'debit', @amount, @bal, @desc, 'subscription')
        `, {
            wid: wallet.walletID,
            subid: sub.subscriptionID,
            amount,
            bal: newBalance,
            desc: sub.serviceName + ' subscription payment'
        });
        const transactionID = txRes.recordset[0].transactionID;

        // Advance billing date to next cycle
        const nextDate = _nextBillingDate(billingDateKey, sub.billingCycle);
        await query('UPDATE Subscription SET billingDate = @d, updatedAt = GETDATE() WHERE subscriptionID = @id',
            { d: nextDate, id: sub.subscriptionID });

        // Fire PAYMENT_SUCCESS (real successful payment)
        await events.paymentSuccess(subscriberID, {
            transactionID,
            subscriptionID: sub.subscriptionID,
            amount,
            serviceName: sub.serviceName,
            paymentMethod: 'FlexScribe Wallet',
            paymentDate: new Date().toISOString()
        });

        // A charge lowered the balance — check low-balance crossing
        await events.lowBalanceCheck(subscriberID, balance, newBalance);

        return {
            subscriptionID: sub.subscriptionID, status: 'success',
            amount, newBalance, transactionID, nextDate
        };
    } else {
        // NOT AFFORDABLE -> PAYMENT_FAILED (no deduction, no retry)
        await events.paymentFailed(subscriberID, {
            subscriptionID: sub.subscriptionID,
            amount,
            serviceName: sub.serviceName,
            reason: 'there were insufficient funds'
        });
        return {
            subscriptionID: sub.subscriptionID, status: 'failed',
            reason: 'insufficient-funds', amount, balance
        };
    }
}

/* -----------------------------------------------------------
   runBilling(now)
   Finds active subscriptions whose billingDate == the user's
   local "today" and charges each one. Returns a summary.

   @param now Date (defaults to new Date()) — injectable for tests
----------------------------------------------------------- */
async function runBilling(now) {
    const when = now || new Date();
    const summary = { processed: 0, success: 0, failed: 0, skipped: 0, errors: 0, details: [] };

    // Pull active subscriptions with a billing date, plus the owner's timezone.
    const subsRes = await query(`
        SELECT s.subscriptionID, s.subscriberID, s.serviceName, s.billingAmount,
               s.billingCycle, s.billingDate, sub.timezone
        FROM Subscription s
        JOIN Subscriber sub ON s.subscriberID = sub.subscriberID
        WHERE s.subStatus = 'active' AND s.billingDate IS NOT NULL
    `, {});

    for (const sub of subsRes.recordset) {
        try {
            // A subscription is "due today" if its billingDate matches the
            // owner's local calendar date.
            const local = tz.getLocalParts(when, sub.timezone);
            const billingKey = new Date(sub.billingDate).toISOString().slice(0, 10);
            if (billingKey !== local.dateKey) continue; // not due today

            summary.processed++;
            const result = await _chargeOne(sub, billingKey);
            summary.details.push(result);
            if (result.status === 'success') summary.success++;
            else if (result.status === 'failed') summary.failed++;
            else summary.skipped++;
        } catch (err) {
            summary.errors++;
            summary.details.push({ subscriptionID: sub.subscriptionID, status: 'error', error: err.message });
            console.error('[billingProcessor] error charging subscription', sub.subscriptionID, ':', err.message);
        }
    }

    return summary;
}

module.exports = {
    runBilling,
    _nextBillingDate,   // exported for testing
    _chargeOne          // exported for testing
};
