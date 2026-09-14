/* ===========================================================
   jobs/financialSummaries.js
   Two scheduled financial-recap jobs:

   1. runWeeklySummary(now)   — Mondays, 09:00 local
   2. runMonthlyReport(now)   — 1st of month, 09:00 local

   Both compute figures from real data (WalletTransaction,
   Subscription, ScribeScore) for the relevant period, respect
   per-user notification preferences and quiet hours, and are
   duplicate-safe via period-based dedupe keys.

   Each exposes a run function accepting an injectable `now`.
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

/* Load all users with their scheduling preferences. */
async function _loadUsers() {
    const r = await query(`
        SELECT subscriberID, timezone, quietHoursEnabled, quietHoursStart, quietHoursEnd,
               notifyWeekly, notifyPayments, scribeScore
        FROM Subscriber
    `, {});
    return r.recordset;
}

/* Total spent (debit+transfer) and income (credit) for a user between
   two UTC datetimes. Uses wallet-linked transactions. */
async function _spendingBetween(subscriberID, startUtc, endUtc) {
    const r = await query(`
        SELECT
            ISNULL(SUM(CASE WHEN t.transactionType IN ('debit','transfer') THEN t.transactionAmount ELSE 0 END), 0) AS spent,
            ISNULL(SUM(CASE WHEN t.transactionType = 'credit' THEN t.transactionAmount ELSE 0 END), 0) AS income,
            ISNULL(SUM(CASE WHEN t.transactionType = 'debit' AND t.category = 'subscription' THEN t.transactionAmount ELSE 0 END), 0) AS subsSpent
        FROM WalletTransaction t
        JOIN VirtualWallet w ON t.walletID = w.walletID
        WHERE w.subscriberID = @sid
          AND t.transactionDate >= @start AND t.transactionDate < @end
    `, { sid: subscriberID, start: startUtc, end: endUtc });
    const row = r.recordset[0] || {};
    return {
        spent: parseFloat(row.spent) || 0,
        income: parseFloat(row.income) || 0,
        subsSpent: parseFloat(row.subsSpent) || 0
    };
}

/* -----------------------------------------------------------
   runWeeklySummary(now)  — Mondays 09:00 local
----------------------------------------------------------- */
async function runWeeklySummary(now) {
    const when = now || new Date();
    const summary = { usersChecked: 0, sent: 0, skippedQuiet: 0, skippedDup: 0, skippedPref: 0, errors: 0 };

    const users = await _loadUsers();
    for (const u of users) {
        try {
            const local = tz.getLocalParts(when, u.timezone);
            if (local.weekday !== 1) continue;      // Monday only
            if (local.hour !== RUN_HOUR) continue;  // 09:00 local

            summary.usersChecked++;

            if (!(u.notifyWeekly === true || u.notifyWeekly === 1)) { summary.skippedPref++; continue; }

            const gate = tz.shouldSendNow(u, when, { critical: false });
            if (!gate.allowed) { summary.skippedQuiet++; continue; }

            // Period: previous 7 days (this week vs last week comparison)
            const nowMs = when.getTime();
            const weekStart = new Date(nowMs - 7 * 86400000);
            const prevStart = new Date(nowMs - 14 * 86400000);

            const thisWeek = await _spendingBetween(u.subscriberID, weekStart, when);
            const lastWeek = await _spendingBetween(u.subscriberID, prevStart, weekStart);

            // Comparison vs last week
            let comparison = '';
            if (lastWeek.spent > 0) {
                const pct = Math.round(((thisWeek.spent - lastWeek.spent) / lastWeek.spent) * 100);
                if (pct < 0) comparison = `, which is ${Math.abs(pct)}% less than last week`;
                else if (pct > 0) comparison = `, which is ${pct}% more than last week`;
                else comparison = ', about the same as last week';
            }

            const message =
                `You spent ${_money(thisWeek.spent)} this week${comparison}.\n` +
                `Subscriptions: ${_money(thisWeek.subsSpent)} · Income: ${_money(thisWeek.income)}` +
                (u.scribeScore != null ? ` · Scribe Score: ${u.scribeScore}` : '');

            const result = await notificationService.createNotification({
                subscriberID: u.subscriberID,
                type: NOTIFICATION_TYPES.WEEKLY_SUMMARY,
                title: 'Your weekly financial summary',
                message,
                priority: PRIORITY.LOW,
                relatedEntityType: ENTITY_TYPES.NONE,
                actionUrl: '/analytics',
                eventToken: 'weekly-' + local.dateKey, // one per Monday
                metadata: { thisWeek, lastWeek }
            });

            if (result.created) summary.sent++; else summary.skippedDup++;
        } catch (err) {
            summary.errors++;
            console.error('[weeklySummary] error for subscriber', u.subscriberID, ':', err.message);
        }
    }

    return summary;
}

/* -----------------------------------------------------------
   runMonthlyReport(now)  — 1st of month, 09:00 local
----------------------------------------------------------- */
async function runMonthlyReport(now) {
    const when = now || new Date();
    const summary = { usersChecked: 0, sent: 0, skippedQuiet: 0, skippedDup: 0, skippedPref: 0, errors: 0 };

    const users = await _loadUsers();
    for (const u of users) {
        try {
            const local = tz.getLocalParts(when, u.timezone);
            if (local.day !== 1) continue;          // 1st of the month only
            if (local.hour !== RUN_HOUR) continue;  // 09:00 local

            summary.usersChecked++;

            if (!(u.notifyWeekly === true || u.notifyWeekly === 1)) {
                // notifyWeekly is the closest existing pref for periodic summaries;
                // monthly report reuses it (no separate monthly column exists).
                summary.skippedPref++; continue;
            }

            const gate = tz.shouldSendNow(u, when, { critical: false });
            if (!gate.allowed) { summary.skippedQuiet++; continue; }

            // Period: the previous ~30 days (last month)
            const nowMs = when.getTime();
            const monthStart = new Date(nowMs - 30 * 86400000);
            const lastMonth = await _spendingBetween(u.subscriberID, monthStart, when);
            const saved = Math.max(0, lastMonth.income - lastMonth.spent);

            const message =
                `Here's how you performed last month:\n` +
                `Total spent: ${_money(lastMonth.spent)}\n` +
                `Subscriptions: ${_money(lastMonth.subsSpent)}\n` +
                `Saved: ${_money(saved)}` +
                (u.scribeScore != null ? `\nScribe Score: ${u.scribeScore}` : '');

            const result = await notificationService.createNotification({
                subscriberID: u.subscriberID,
                type: NOTIFICATION_TYPES.MONTHLY_SUMMARY,
                title: 'Your monthly financial report is ready',
                message,
                priority: PRIORITY.LOW,
                relatedEntityType: ENTITY_TYPES.REPORT,
                actionUrl: '/reports',
                // One per calendar month (dateKey is 'YYYY-MM-01')
                eventToken: 'monthly-' + local.dateKey.slice(0, 7),
                metadata: { lastMonth, saved }
            });

            if (result.created) summary.sent++; else summary.skippedDup++;
        } catch (err) {
            summary.errors++;
            console.error('[monthlyReport] error for subscriber', u.subscriberID, ':', err.message);
        }
    }

    return summary;
}

module.exports = {
    runWeeklySummary,
    runMonthlyReport,
    _spendingBetween,
    RUN_HOUR
};
