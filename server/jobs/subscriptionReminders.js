/* ===========================================================
   jobs/subscriptionReminders.js
   Scheduled subscription renewal reminders.

   For each ACTIVE subscription, sends reminders when the billing
   date is 7, 3, or 1 day(s) away, and on the day of payment.

   Timing (per user's local timezone):
   - 7 / 3 / 1 days before: delivered on the daily 08:00 tick
   - day of payment:        delivered at 08:00 local

   Duplicate-safe: dedupe key includes the subscription id, the
   specific billing date, and the days-before bucket, so each
   reminder for a given billing date is sent at most once.

   Quiet hours: reminders respect quiet hours (non-critical).
   If auto-renew is disabled, wording changes accordingly.

   Exposes runSubscriptionReminders(now) so tests can inject a
   fixed instant.
=========================================================== */

'use strict';

const { query } = require('../db');
const notificationService = require('../services/notificationService');
const tz = require('../services/timezone');
const { NOTIFICATION_TYPES, PRIORITY, ENTITY_TYPES } = require('../constants/notificationTypes');

const REMIND_HOUR = 8; // 08:00 local

function _money(amount) {
    const n = parseFloat(amount) || 0;
    return 'R' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* Whole-day difference between the billing date and the user's local
   "today" (both as calendar dates). Positive = billing is in the future. */
function _daysUntil(billingDateKey, localDateKey) {
    const a = new Date(billingDateKey + 'T00:00:00Z');
    const b = new Date(localDateKey + 'T00:00:00Z');
    return Math.round((a - b) / 86400000);
}

/* Build the reminder title/message for a given days-before bucket. */
function _buildMessage(sub, daysBefore) {
    const name = sub.serviceName;
    const amount = _money(sub.billingAmount);
    const autoRenewOff = !(sub.autoRenew === true || sub.autoRenew === 1);

    if (daysBefore === 0) {
        if (autoRenewOff) {
            return {
                title: `${name} renewal today`,
                message: `Your ${name} subscription is scheduled for payment today, but auto-renew is currently disabled.`
            };
        }
        return {
            title: `${name} payment due today`,
            message: `Your ${amount} ${name} subscription is scheduled for payment today.`
        };
    }
    if (daysBefore === 1) {
        if (autoRenewOff) {
            return {
                title: `${name} renewal reminder`,
                message: `Your ${name} subscription is scheduled to renew tomorrow, but auto-renew is currently disabled.`
            };
        }
        return {
            title: `${name} payment tomorrow`,
            message: `Your ${amount} ${name} subscription will renew tomorrow.`
        };
    }
    // 3 or 7 days
    return {
        title: daysBefore === 7 ? `${name} payment coming up` : `${name} payment reminder`,
        message: `Your ${amount} ${name} payment is due in ${daysBefore} days.`
    };
}

/* -----------------------------------------------------------
   runSubscriptionReminders(now, opts)
   @param now  Date (defaults to new Date()) — injectable for tests
   @param opts { force: bool }  — when true, skips the hour-gate and
               quiet-hours so reminders are generated immediately.
               Used by the admin "run now" endpoint.
   @returns summary { checked, sent, skippedQuiet, skippedDup, errors, details }
----------------------------------------------------------- */
async function runSubscriptionReminders(now, opts) {
    const when = now || new Date();
    const force = !!(opts && opts.force);
    const summary = { checked: 0, sent: 0, skippedQuiet: 0, skippedDup: 0, errors: 0, details: [] };
    const REMIND_DAYS = [7, 3, 1, 0];

    const subsRes = await query(`
        SELECT s.subscriptionID, s.subscriberID, s.serviceName, s.billingAmount,
               s.billingCycle, s.billingDate, s.autoRenew,
               sub.timezone, sub.quietHoursEnabled, sub.quietHoursStart, sub.quietHoursEnd,
               sub.notifyPayments
        FROM Subscription s
        JOIN Subscriber sub ON s.subscriberID = sub.subscriberID
        WHERE s.subStatus = 'active' AND s.billingDate IS NOT NULL
    `, {});

    for (const sub of subsRes.recordset) {
        try {
            // Respect the per-user payment-notification preference
            if (!(sub.notifyPayments === true || sub.notifyPayments === 1)) continue;

            const user = {
                timezone: sub.timezone,
                quietHoursEnabled: sub.quietHoursEnabled,
                quietHoursStart: sub.quietHoursStart,
                quietHoursEnd: sub.quietHoursEnd
            };
            const local = tz.getLocalParts(when, sub.timezone);

            // Only run this job at the user's local reminder hour (08:00)
            // unless forced — in that case generate for all upcoming days
            if (!force && local.hour !== REMIND_HOUR) continue;

            const billingKey = new Date(sub.billingDate).toISOString().slice(0, 10);
            const days = _daysUntil(billingKey, local.dateKey);

            // In force mode, generate reminders for any subscription due within 7 days
            const daysToCheck = force ? (days >= 0 && days <= 7 ? [days] : []) : REMIND_DAYS;
            if (!daysToCheck.includes(days)) continue;

            summary.checked++;

            // Quiet-hours check (bypass when forced)
            const gate = force ? { allowed: true } : tz.shouldSendNow(user, when, { critical: false });
            if (!gate.allowed) { summary.skippedQuiet++; continue; }

            const { title, message } = _buildMessage(sub, days);
            const result = await notificationService.createNotification({
                subscriberID: sub.subscriberID,
                type: NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL_REMINDER,
                title,
                message,
                priority: PRIORITY.MEDIUM,
                relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
                relatedEntityID: sub.subscriptionID,
                actionUrl: '/subscriptions',
                // Dedupe: one reminder per (subscription, billing date, days-bucket)
                eventToken: 'sub-reminder-' + billingKey + '-d' + days,
                metadata: {
                    serviceName: sub.serviceName,
                    amount: parseFloat(sub.billingAmount) || 0,
                    billingDate: billingKey,
                    daysBefore: days
                }
            });

            if (result.created) {
                summary.sent++;
                summary.details.push({ subscriptionID: sub.subscriptionID, days, sent: true });
            } else {
                summary.skippedDup++;
            }
        } catch (err) {
            summary.errors++;
            console.error('[subscriptionReminders] error for subscription', sub.subscriptionID, ':', err.message);
        }
    }

    return summary;
}

module.exports = { runSubscriptionReminders, _daysUntil, _buildMessage, REMIND_HOUR };
