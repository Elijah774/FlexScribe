/* ===========================================================
   jobs/paymentSummaries.js
   Two 09:00-local scheduled jobs:

   1. runInsufficientFundsCheck(now)
      3 days before an active subscription's billing date, if the
      wallet balance cannot cover it, warn the user.

   2. runUpcomingPaymentSummary(now)
      A once-daily summary of payments due in the next 7 days.
      Only sent when the user has at least one upcoming payment.

   Both are duplicate-safe (dedupe keys), quiet-hours aware, and
   run at the user's LOCAL 09:00. Each exposes a run function that
   accepts an injectable `now` for tests.
=========================================================== */

'use strict';

const { query } = require('../db');
const notificationService = require('../services/notificationService');
const tz = require('../services/timezone');
const { NOTIFICATION_TYPES, PRIORITY, ENTITY_TYPES } = require('../constants/notificationTypes');

const RUN_HOUR = 9; // 09:00 local

function _money(amount) {
    const n = parseFloat(amount) || 0;
    return 'R' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function _daysUntil(billingDateKey, localDateKey) {
    const a = new Date(billingDateKey + 'T00:00:00Z');
    const b = new Date(localDateKey + 'T00:00:00Z');
    return Math.round((a - b) / 86400000);
}

function _labelForDays(days) {
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return days + ' days';
}

/* -----------------------------------------------------------
   runInsufficientFundsCheck(now, opts)
   3 days before billing, warn if wallet < subscription amount.
   opts.force skips the hour-gate and quiet-hours.
----------------------------------------------------------- */
async function runInsufficientFundsCheck(now, opts) {
    const when = now || new Date();
    const force = !!(opts && opts.force);
    const summary = { checked: 0, sent: 0, skippedQuiet: 0, skippedDup: 0, ok: 0, errors: 0 };

    const rows = await query(`
        SELECT s.subscriptionID, s.subscriberID, s.serviceName, s.billingAmount, s.billingDate,
               w.balance,
               sub.timezone, sub.quietHoursEnabled, sub.quietHoursStart, sub.quietHoursEnd, sub.notifyPayments
        FROM Subscription s
        JOIN Subscriber sub ON s.subscriberID = sub.subscriberID
        LEFT JOIN VirtualWallet w ON w.subscriberID = s.subscriberID
        WHERE s.subStatus = 'active' AND s.billingDate IS NOT NULL
    `, {});

    for (const r of rows.recordset) {
        try {
            if (!(r.notifyPayments === true || r.notifyPayments === 1)) continue;

            const user = { timezone: r.timezone, quietHoursEnabled: r.quietHoursEnabled, quietHoursStart: r.quietHoursStart, quietHoursEnd: r.quietHoursEnd };
            const local = tz.getLocalParts(when, r.timezone);
            if (!force && local.hour !== RUN_HOUR) continue;

            const billingKey = new Date(r.billingDate).toISOString().slice(0, 10);
            const daysAway = _daysUntil(billingKey, local.dateKey);
            // Normal mode: only 3 days before. Force mode: within 7 days.
            if (force ? (daysAway < 0 || daysAway > 7) : daysAway !== 3) continue;

            summary.checked++;

            const balance = parseFloat(r.balance) || 0;
            const amount = parseFloat(r.billingAmount) || 0;
            if (balance >= amount) { summary.ok++; continue; } // funds are sufficient

            const gate = force ? { allowed: true } : tz.shouldSendNow(user, when, { critical: false });
            if (!gate.allowed) { summary.skippedQuiet++; continue; }

            const result = await notificationService.createNotification({
                subscriberID: r.subscriberID,
                type: NOTIFICATION_TYPES.INSUFFICIENT_FUNDS,
                title: 'Payment warning',
                message: `Your ${r.serviceName} payment of ${_money(amount)} is due in 3 days, but your wallet balance is only ${_money(balance)}.`,
                priority: PRIORITY.HIGH,
                relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
                relatedEntityID: r.subscriptionID,
                actionUrl: '/wallet',
                eventToken: 'insufficient-' + billingKey,
                metadata: { serviceName: r.serviceName, amount, balance, shortfall: amount - balance }
            });

            if (result.created) summary.sent++; else summary.skippedDup++;
        } catch (err) {
            summary.errors++;
            console.error('[insufficientFunds] error for subscription', r.subscriptionID, ':', err.message);
        }
    }

    return summary;
}

/* -----------------------------------------------------------
   runUpcomingPaymentSummary(now, opts)
   One daily summary per user of payments due in the next 7 days.
   opts.force skips the hour-gate and quiet-hours.
----------------------------------------------------------- */
async function runUpcomingPaymentSummary(now, opts) {
    const when = now || new Date();
    const force = !!(opts && opts.force);
    const summary = { usersChecked: 0, sent: 0, skippedQuiet: 0, skippedDup: 0, noUpcoming: 0, errors: 0 };

    // All active subscriptions with billing dates + owner scheduling prefs
    const rows = await query(`
        SELECT s.subscriptionID, s.subscriberID, s.serviceName, s.billingAmount, s.billingDate,
               sub.timezone, sub.quietHoursEnabled, sub.quietHoursStart, sub.quietHoursEnd, sub.notifyPayments
        FROM Subscription s
        JOIN Subscriber sub ON s.subscriberID = sub.subscriberID
        WHERE s.subStatus = 'active' AND s.billingDate IS NOT NULL
    `, {});

    // Group by subscriber
    const byUser = new Map();
    for (const r of rows.recordset) {
        if (!byUser.has(r.subscriberID)) byUser.set(r.subscriberID, []);
        byUser.get(r.subscriberID).push(r);
    }

    for (const [subscriberID, subs] of byUser.entries()) {
        try {
            const first = subs[0];
            if (!(first.notifyPayments === true || first.notifyPayments === 1)) continue;

            const user = { timezone: first.timezone, quietHoursEnabled: first.quietHoursEnabled, quietHoursStart: first.quietHoursStart, quietHoursEnd: first.quietHoursEnd };
            const local = tz.getLocalParts(when, first.timezone);
            if (!force && local.hour !== RUN_HOUR) continue;

            summary.usersChecked++;

            // Collect payments due within the next 7 days (0..7)
            const upcoming = [];
            for (const s of subs) {
                const billingKey = new Date(s.billingDate).toISOString().slice(0, 10);
                const days = _daysUntil(billingKey, local.dateKey);
                if (days >= 0 && days <= 7) {
                    upcoming.push({ name: s.serviceName, amount: parseFloat(s.billingAmount) || 0, days, billingKey });
                }
            }

            if (upcoming.length === 0) { summary.noUpcoming++; continue; } // nothing to send

            const gate = force ? { allowed: true } : tz.shouldSendNow(user, when, { critical: false });
            if (!gate.allowed) { summary.skippedQuiet++; continue; }

            upcoming.sort((a, b) => a.days - b.days);
            const lines = upcoming.map(u => `${u.name} — ${_money(u.amount)} — ${_labelForDays(u.days)}`);
            const count = upcoming.length;

            const result = await notificationService.createNotification({
                subscriberID,
                type: NOTIFICATION_TYPES.UPCOMING_PAYMENT,
                title: `You have ${count} upcoming payment${count === 1 ? '' : 's'} this week`,
                message: lines.join('\n'),
                priority: PRIORITY.MEDIUM,
                relatedEntityType: ENTITY_TYPES.NONE,
                actionUrl: '/timeline',
                // One summary per user per local day
                eventToken: 'upcoming-summary-' + local.dateKey,
                metadata: { count, items: upcoming }
            });

            if (result.created) summary.sent++; else summary.skippedDup++;
        } catch (err) {
            summary.errors++;
            console.error('[upcomingSummary] error for subscriber', subscriberID, ':', err.message);
        }
    }

    return summary;
}

module.exports = {
    runInsufficientFundsCheck,
    runUpcomingPaymentSummary,
    _daysUntil,
    _labelForDays,
    RUN_HOUR
};
