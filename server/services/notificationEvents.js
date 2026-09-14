/* ===========================================================
   notificationEvents.js
   Event-driven notification helpers (Phase 2).

   Each function builds a consistent message + dedupe key and
   calls the Phase 1 notificationService.createNotification().

   DESIGN RULES:
   - Every helper is wrapped in try/catch and NEVER throws.
     Notification creation is secondary to the primary business
     transaction, so a failure here only gets logged.
   - Callers should invoke these AFTER the DB write succeeds.
   - Dedupe keys follow the patterns from the Phase 2 spec.
=========================================================== */

'use strict';

const notificationService = require('./notificationService');
const { query } = require('../db');
const {
    NOTIFICATION_TYPES,
    PRIORITY,
    ENTITY_TYPES
} = require('../constants/notificationTypes');

// Low-balance thresholds (highest first so we notify the first one crossed)
const BALANCE_THRESHOLDS = [500, 250, 100];

/* -----------------------------------------------------------
   Currency formatting: R199.00 / R1,234.56
----------------------------------------------------------- */
function _money(amount) {
    const n = parseFloat(amount) || 0;
    return 'R' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* -----------------------------------------------------------
   Safe wrapper: run an async notification action, swallow &
   log any error so the caller's primary flow is never broken.
----------------------------------------------------------- */
async function _safe(label, fn) {
    try {
        return await fn();
    } catch (err) {
        console.error('[notificationEvents] ' + label + ' failed:', err.message);
        return { created: false, error: err.message };
    }
}

/* ===========================================================
   SUBSCRIPTION EVENTS
=========================================================== */

function subscriptionAdded(subscriberID, sub) {
    return _safe('subscriptionAdded', () => {
        const name = sub.serviceName || 'Subscription';
        const amount = _money(sub.billingAmount);
        const cycle = sub.billingCycle || 'monthly';
        const cycleWord = cycle === 'monthly' ? 'month'
                        : cycle === 'yearly' ? 'year'
                        : cycle === 'weekly' ? 'week'
                        : cycle === 'quarterly' ? 'quarter' : 'month';
        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.SUBSCRIPTION_ADDED,
            title: 'Subscription added',
            message: `${name} has been added to your subscriptions for ${amount}/${cycleWord}.`,
            relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
            relatedEntityID: sub.subscriptionID,
            subscriptionID: sub.subscriptionID,
            eventToken: 'subscription-added-' + sub.subscriptionID,
            metadata: {
                serviceName: name,
                amount: parseFloat(sub.billingAmount) || 0,
                nextBillingDate: sub.billingDate || null,
                category: sub.categoryID || null
            }
        });
    });
}

function subscriptionUpdated(subscriberID, subscriptionID, serviceName) {
    return _safe('subscriptionUpdated', () => {
        const name = serviceName || 'subscription';
        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.SUBSCRIPTION_UPDATED,
            title: 'Subscription updated',
            message: `Your ${name} subscription has been updated successfully.`,
            relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
            relatedEntityID: subscriptionID,
            subscriptionID: subscriptionID,
            // Include a coarse timestamp (per-minute) so genuine repeat edits
            // create a fresh notification, but a single save doesn't duplicate.
            eventToken: 'subscription-updated-' + subscriptionID + '-' + _minuteToken()
        });
    });
}

function subscriptionPaused(subscriberID, subscriptionID, serviceName) {
    return _safe('subscriptionPaused', () => {
        const name = serviceName || 'subscription';
        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.SUBSCRIPTION_PAUSED,
            title: 'Subscription paused',
            message: `Your ${name} subscription has been paused.`,
            relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
            relatedEntityID: subscriptionID,
            subscriptionID: subscriptionID,
            eventToken: 'subscription-paused-' + subscriptionID + '-' + _minuteToken()
        });
    });
}

function subscriptionCancelled(subscriberID, subscriptionID, serviceName, finalBillingDate) {
    return _safe('subscriptionCancelled', () => {
        const name = serviceName || 'subscription';
        let message = `Your ${name} subscription has been cancelled successfully.`;
        if (finalBillingDate) {
            message += ` Final billing date: ${finalBillingDate}.`;
        }
        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.SUBSCRIPTION_CANCELLED,
            title: 'Subscription cancelled',
            message,
            relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
            relatedEntityID: subscriptionID,
            subscriptionID: subscriptionID,
            eventToken: 'subscription-cancelled-' + subscriptionID
        });
    });
}

/* ===========================================================
   PAYMENT EVENTS
=========================================================== */

function paymentSuccess(subscriberID, opts) {
    return _safe('paymentSuccess', () => {
        const amount = _money(opts.amount);
        const label = opts.serviceName || opts.description || 'your subscription';
        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
            title: 'Payment successful',
            message: `Your ${amount} payment for ${label} was successfully processed.`,
            relatedEntityType: ENTITY_TYPES.TRANSACTION,
            relatedEntityID: opts.transactionID || null,
            transactionID: opts.transactionID || null,
            subscriptionID: opts.subscriptionID || null,
            eventToken: opts.transactionID
                ? 'payment-success-' + opts.transactionID
                : 'payment-success-' + (opts.subscriptionID || 'x') + '-' + _dayToken(),
            metadata: {
                amount: parseFloat(opts.amount) || 0,
                paymentDate: opts.paymentDate || new Date().toISOString(),
                paymentMethod: opts.paymentMethod || null,
                serviceName: opts.serviceName || null
            }
        });
    });
}

function paymentFailed(subscriberID, opts) {
    return _safe('paymentFailed', () => {
        const amount = _money(opts.amount);
        const label = opts.serviceName || opts.description || 'your subscription';
        let message = `Your ${amount} payment for ${label} could not be processed.`;
        if (opts.reason) {
            message = `Your ${amount} payment for ${label} could not be processed because ${opts.reason}.`;
        }
        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.PAYMENT_FAILED,
            title: 'Payment failed',
            message,
            priority: PRIORITY.HIGH,
            relatedEntityType: ENTITY_TYPES.TRANSACTION,
            relatedEntityID: opts.transactionID || null,
            transactionID: opts.transactionID || null,
            subscriptionID: opts.subscriptionID || null,
            actionUrl: '/wallet',
            eventToken: opts.transactionID
                ? 'payment-failed-' + opts.transactionID
                : 'payment-failed-' + (opts.subscriptionID || 'x') + '-' + _dayToken()
        });
    });
}

/* ===========================================================
   LOW BALANCE EVENT
   Only fires when the balance CROSSES BELOW a threshold, i.e.
   previousBalance was >= threshold and newBalance < threshold.
   The dedupe key ties the notification to the threshold value,
   NOT a timestamp, so repeated dips below the same threshold
   without recovering do not re-notify. When the balance rises
   above the threshold and falls again, the deleteThresholdState
   (via clearLowBalanceState) allows a fresh notification.
=========================================================== */

function _thresholdCrossed(previousBalance, newBalance) {
    // Returns the highest threshold that was crossed downward, or null.
    const prev = parseFloat(previousBalance);
    const next = parseFloat(newBalance);
    for (const t of BALANCE_THRESHOLDS) {
        if (prev >= t && next < t) return t;
    }
    return null;
}

async function lowBalanceCheck(subscriberID, previousBalance, newBalance) {
    return _safe('lowBalanceCheck', async () => {
        const threshold = _thresholdCrossed(previousBalance, newBalance);
        if (threshold === null) return { created: false, reason: 'no-crossing' };

        // Dedupe: one notification per (user, threshold) until the balance
        // recovers above that threshold. We clear prior state for thresholds
        // the balance is now ABOVE, so a later dip re-notifies.
        await _clearRecoveredThresholds(subscriberID, newBalance);

        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.LOW_BALANCE,
            title: 'Your wallet balance is getting low',
            message: `Your FlexScribe wallet balance is ${_money(newBalance)}. Consider adding funds before your upcoming payments.`,
            priority: PRIORITY.HIGH,
            relatedEntityType: ENTITY_TYPES.WALLET,
            actionUrl: '/wallet',
            eventToken: 'low-balance-' + threshold,
            metadata: { threshold, balance: parseFloat(newBalance) || 0 }
        });
    });
}

/* When the balance recovers above a threshold, delete the prior
   low-balance notification for that threshold so a later dip below
   it can notify again (dedupe key becomes free to reuse). */
async function _clearRecoveredThresholds(subscriberID, newBalance) {
    const next = parseFloat(newBalance);
    const recovered = BALANCE_THRESHOLDS.filter(t => next >= t);
    for (const t of recovered) {
        const dedupeKey = notificationService.buildDedupeKey(
            subscriberID, NOTIFICATION_TYPES.LOW_BALANCE, ENTITY_TYPES.WALLET, null, 'low-balance-' + t
        );
        try {
            await query(
                'DELETE FROM Notification WHERE subscriberID = @sid AND dedupeKey = @key',
                { sid: subscriberID, key: dedupeKey }
            );
        } catch (e) {
            console.error('[notificationEvents] clearRecoveredThresholds failed:', e.message);
        }
    }
}

/* Called after a top-up (credit) to clear any low-balance state the
   new balance has recovered past — so the next real dip re-notifies. */
async function clearLowBalanceState(subscriberID, newBalance) {
    return _safe('clearLowBalanceState', () => _clearRecoveredThresholds(subscriberID, newBalance));
}

/* ===========================================================
   INSUFFICIENT FUNDS HELPER (Phase 3 prep — no sending)
   Determines whether a user's wallet cannot cover an upcoming
   subscription's cost. Phase 3 cron will use this; Phase 2
   only provides the reusable determination logic.
=========================================================== */

async function hasInsufficientFunds(subscriberID, subscriptionID) {
    const walletRes = await query(
        'SELECT balance FROM VirtualWallet WHERE subscriberID = @sid',
        { sid: subscriberID }
    );
    if (walletRes.recordset.length === 0) {
        return { insufficient: false, reason: 'no-wallet' };
    }
    const balance = parseFloat(walletRes.recordset[0].balance) || 0;

    const subRes = await query(
        'SELECT serviceName, billingAmount FROM Subscription WHERE subscriptionID = @subid AND subscriberID = @sid AND subStatus = \'active\'',
        { subid: subscriptionID, sid: subscriberID }
    );
    if (subRes.recordset.length === 0) {
        return { insufficient: false, reason: 'no-active-subscription' };
    }
    const sub = subRes.recordset[0];
    const cost = parseFloat(sub.billingAmount) || 0;

    return {
        insufficient: balance < cost,
        balance,
        cost,
        shortfall: Math.max(0, cost - balance),
        serviceName: sub.serviceName
    };
}

/* ===========================================================
   GOAL MILESTONE EVENTS
   Fires at 25 / 50 / 75 / 100 %. Each milestone notifies once
   (dedupe key includes the milestone number). When the goal
   crosses several milestones in one contribution, only the
   highest newly-reached milestone is notified to avoid spam.
=========================================================== */

const GOAL_MILESTONES = [25, 50, 75, 100];

function _highestMilestoneReached(pct) {
    let reached = 0;
    for (const m of GOAL_MILESTONES) {
        if (pct >= m) reached = m;
    }
    return reached; // 0 if below 25
}

async function goalMilestoneCheck(subscriberID, goalID, goalName, currentProgress, targetAmount) {
    return _safe('goalMilestoneCheck', async () => {
        const target = parseFloat(targetAmount) || 0;
        if (target <= 0) return { created: false, reason: 'no-target' };
        const pct = (parseFloat(currentProgress) / target) * 100;
        const milestone = _highestMilestoneReached(pct);
        if (milestone === 0) return { created: false, reason: 'below-first-milestone' };

        const name = goalName || 'goal';

        if (milestone === 100) {
            return notificationService.createNotification({
                subscriberID,
                type: NOTIFICATION_TYPES.GOAL_COMPLETED,
                title: 'Goal completed!',
                message: `You've reached your ${name} goal.`,
                priority: PRIORITY.MEDIUM,
                relatedEntityType: ENTITY_TYPES.GOAL,
                relatedEntityID: goalID,
                eventToken: 'goal-' + goalID + '-milestone-100',
                metadata: { goalName: name, milestone: 100 }
            });
        }

        const messages = {
            25: `You're 25% of the way to your ${name} goal!`,
            50: `You're halfway to your ${name} goal! Keep going.`,
            75: `You're 75% of the way to your ${name} goal!`
        };

        return notificationService.createNotification({
            subscriberID,
            type: NOTIFICATION_TYPES.GOAL_PROGRESS,
            title: 'Goal progress',
            message: messages[milestone],
            priority: PRIORITY.LOW,
            relatedEntityType: ENTITY_TYPES.GOAL,
            relatedEntityID: goalID,
            eventToken: 'goal-' + goalID + '-milestone-' + milestone,
            metadata: { goalName: name, milestone }
        });
    });
}

/* ===========================================================
   DEDUPE TOKEN HELPERS
----------------------------------------------------------- */
// Per-minute token: lets a genuine repeat action within different
// minutes create a new notification, while a single save (which fires
// once) never duplicates.
function _minuteToken() {
    return new Date().toISOString().slice(0, 16); // yyyy-MM-ddThh:mm
}
// Per-day token for events without a stable unique ID.
function _dayToken() {
    return new Date().toISOString().slice(0, 10); // yyyy-MM-dd
}

module.exports = {
    subscriptionAdded,
    subscriptionUpdated,
    subscriptionPaused,
    subscriptionCancelled,
    paymentSuccess,
    paymentFailed,
    lowBalanceCheck,
    clearLowBalanceState,
    hasInsufficientFunds,
    goalMilestoneCheck,
    BALANCE_THRESHOLDS,
    GOAL_MILESTONES
};
