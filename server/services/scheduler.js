/* ===========================================================
   scheduler.js
   Central notification scheduler (Phase 3).

   Registers node-cron jobs that run while the backend is up.
   Because each job internally checks the USER'S LOCAL time
   (timezone-aware), the cron ticks run hourly and every job
   decides for itself whether it is the right local hour/day
   for each user. This one-tick-covers-all-timezones approach
   keeps the cron config simple and correct across timezones.

   Ticks (server local time — the hour value is irrelevant since
   jobs gate on each user's local time):
     - Hourly, on the hour: all reminder/summary jobs + billing
       (each job no-ops for users whose local hour doesn't match)

   Duplicate safety comes from the jobs' dedupe keys, so running
   hourly cannot create duplicates.

   start()  — registers and starts all cron tasks
   stop()   — stops all cron tasks (useful for tests/shutdown)
   runAllOnce(now) — runs every job once immediately (manual trigger/testing)
=========================================================== */

'use strict';

const cron = require('node-cron');

const billingProcessor = require('./billingProcessor');
const subscriptionReminders = require('../jobs/subscriptionReminders');
const paymentSummaries = require('../jobs/paymentSummaries');
const financialSummaries = require('../jobs/financialSummaries');

let _tasks = [];
let _running = false;

/* Wrap a job so a failure is logged but never crashes the scheduler. */
async function _safeRun(label, fn) {
    try {
        const result = await fn(new Date());
        // Only log when something actually happened, to keep logs quiet
        if (result && (result.sent > 0 || result.success > 0 || result.failed > 0)) {
            console.log(`[scheduler] ${label}:`, JSON.stringify(result));
        }
        return result;
    } catch (err) {
        console.error(`[scheduler] ${label} crashed:`, err.message);
        return { error: err.message };
    }
}

/* The full sweep run every tick. Order matters slightly: billing first
   (so PAYMENT_SUCCESS/FAILED + balance changes are current), then the
   informational jobs. */
async function _tick() {
    await _safeRun('billing', billingProcessor.runBilling);
    await _safeRun('subscriptionReminders', subscriptionReminders.runSubscriptionReminders);
    await _safeRun('insufficientFunds', paymentSummaries.runInsufficientFundsCheck);
    await _safeRun('upcomingSummary', paymentSummaries.runUpcomingPaymentSummary);
    await _safeRun('weeklySummary', financialSummaries.runWeeklySummary);
    await _safeRun('monthlyReport', financialSummaries.runMonthlyReport);
}

/* -----------------------------------------------------------
   start()
   Registers the hourly tick. Idempotent — calling twice is a no-op.
----------------------------------------------------------- */
function start() {
    if (_running) {
        console.log('[scheduler] already running');
        return;
    }

    // Run at minute 0 of every hour. Each job gates on the user's local
    // hour/day, so this single schedule serves every timezone correctly.
    const task = cron.schedule('0 * * * *', () => {
        _tick().catch(err => console.error('[scheduler] tick error:', err.message));
    });

    _tasks.push(task);
    _running = true;
    console.log('[scheduler] notification scheduler started (hourly tick)');
}

/* -----------------------------------------------------------
   stop()  — stops all registered cron tasks.
----------------------------------------------------------- */
function stop() {
    for (const t of _tasks) {
        try { t.stop(); } catch (e) { /* ignore */ }
    }
    _tasks = [];
    _running = false;
    console.log('[scheduler] notification scheduler stopped');
}

/* -----------------------------------------------------------
   runAllOnce(now)
   Manually run every job once with the given instant. Useful for
   tests and for an admin "run now" trigger. Returns per-job results.
----------------------------------------------------------- */
async function runAllOnce(now, opts) {
    const at = now || new Date();
    return {
        billing: await billingProcessor.runBilling(at),
        subscriptionReminders: await subscriptionReminders.runSubscriptionReminders(at, opts),
        insufficientFunds: await paymentSummaries.runInsufficientFundsCheck(at, opts),
        upcomingSummary: await paymentSummaries.runUpcomingPaymentSummary(at, opts),
        weeklySummary: await financialSummaries.runWeeklySummary(at),
        monthlyReport: await financialSummaries.runMonthlyReport(at)
    };
}

function isRunning() {
    return _running;
}

module.exports = { start, stop, runAllOnce, isRunning };
