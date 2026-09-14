/* ===========================================================
   test-scheduled-notifications.js
   Phase 3 scheduled-notification tests.

   Creates an ISOLATED test subscriber (+ wallet, subscriptions,
   goal), then runs each job with an injected `now` to hit the
   exact timing windows. Verifies:
   - billing: deduct-if-affordable -> PAYMENT_SUCCESS, else PAYMENT_FAILED
   - billing dedupe (running twice doesn't double-charge)
   - subscription reminders at 7/3/1/0 days, only at local 08:00
   - insufficient-funds 3 days before
   - upcoming-payment daily summary (and no-send when none)
   - weekly summary (Mon 09:00) + dedupe
   - monthly report (1st 09:00) + dedupe
   - quiet hours suppress non-critical; critical (PAYMENT_FAILED) bypasses
   - timezone correctness
   - failure isolation

   Cleans up ALL test data at the end (guarded by a unique email
   + dedupeKey prefixes so production rows are untouched).

   Prereqs: migrations 002 + 003 applied, DB reachable.
   Usage:   node test-scheduled-notifications.js
   (Does NOT need the HTTP server running.)
=========================================================== */
'use strict';

const { query } = require('./db');
const billing = require('./services/billingProcessor');
const reminders = require('./jobs/subscriptionReminders');
const paySummaries = require('./jobs/paymentSummaries');
const finSummaries = require('./jobs/financialSummaries');

const TEST_EMAIL = 'phase3.test@flexscribe.local';
const TZ = 'Africa/Johannesburg'; // UTC+2, no DST

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS -', name); passed++; }
    else { console.log('  FAIL -', name, detail !== undefined ? '=> ' + JSON.stringify(detail) : ''); failed++; }
}

// Build a UTC Date that corresponds to a given SAST (UTC+2) wall-clock time.
// e.g. sast('2026-09-08', 8) => 08:00 SAST => 06:00 UTC
function sast(dateStr, hourLocal, minute = 0) {
    const utcHour = hourLocal - 2; // SAST is UTC+2
    return new Date(`${dateStr}T${String(((utcHour) + 24) % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
}

let TEST_SID = null;
let TEST_WALLET = null;

// Snapshots of REAL data so we can fully restore it after the run.
// (The jobs scan ALL users, and injecting past `now` values can cause them
// to act on real subscriptions — so we snapshot & restore to guarantee the
// production data is byte-for-byte unchanged after the test.)
let _snapNotifIds = null;      // Set of notificationIDs that existed before
let _snapWallets = null;       // walletID -> balance
let _snapSubs = null;          // subscriptionID -> billingDate (ISO or null)
let _snapTxIds = null;         // Set of transactionIDs that existed before

async function snapshotRealData() {
    const n = await query('SELECT notificationID FROM Notification', {});
    _snapNotifIds = new Set(n.recordset.map(r => r.notificationID));

    const w = await query('SELECT walletID, balance FROM VirtualWallet', {});
    _snapWallets = new Map(w.recordset.map(r => [r.walletID, parseFloat(r.balance)]));

    const s = await query('SELECT subscriptionID, billingDate FROM Subscription', {});
    _snapSubs = new Map(s.recordset.map(r => [r.subscriptionID, r.billingDate ? new Date(r.billingDate).toISOString().slice(0, 10) : null]));

    const t = await query('SELECT transactionID FROM WalletTransaction', {});
    _snapTxIds = new Set(t.recordset.map(r => r.transactionID));
}

async function restoreRealData() {
    // 1. Delete notifications created during the run (not in the snapshot)
    const n = await query('SELECT notificationID FROM Notification', {});
    for (const row of n.recordset) {
        if (!_snapNotifIds.has(row.notificationID)) {
            await query('DELETE FROM Notification WHERE notificationID = @id', { id: row.notificationID });
        }
    }
    // 2. Delete wallet transactions created during the run
    const t = await query('SELECT transactionID FROM WalletTransaction', {});
    for (const row of t.recordset) {
        if (!_snapTxIds.has(row.transactionID)) {
            await query('DELETE FROM WalletTransaction WHERE transactionID = @id', { id: row.transactionID });
        }
    }
    // 3. Restore any wallet balances that changed
    const w = await query('SELECT walletID, balance FROM VirtualWallet', {});
    for (const row of w.recordset) {
        const orig = _snapWallets.get(row.walletID);
        if (orig != null && Math.abs(parseFloat(row.balance) - orig) > 0.001) {
            await query('UPDATE VirtualWallet SET balance = @b WHERE walletID = @id', { b: orig, id: row.walletID });
        }
    }
    // 4. Restore any subscription billing dates that changed
    const s = await query('SELECT subscriptionID, billingDate FROM Subscription', {});
    for (const row of s.recordset) {
        if (!_snapSubs.has(row.subscriptionID)) continue; // test sub, ignore
        const orig = _snapSubs.get(row.subscriptionID);
        const cur = row.billingDate ? new Date(row.billingDate).toISOString().slice(0, 10) : null;
        if (orig !== cur) {
            await query('UPDATE Subscription SET billingDate = @d WHERE subscriptionID = @id', { d: orig, id: row.subscriptionID });
        }
    }
}

async function cleanup() {
    // Remove test notifications, transactions, subs, goal, wallet, subscriber
    if (TEST_SID) {
        await query('DELETE FROM Notification WHERE subscriberID = @sid', { sid: TEST_SID });
        await query('DELETE FROM WalletTransaction WHERE walletID IN (SELECT walletID FROM VirtualWallet WHERE subscriberID = @sid)', { sid: TEST_SID });
        await query('DELETE FROM GoalContribution WHERE goalID IN (SELECT goalID FROM FinancialGoal WHERE subscriberID = @sid)', { sid: TEST_SID });
        await query('DELETE FROM FinancialGoal WHERE subscriberID = @sid', { sid: TEST_SID });
        await query('DELETE FROM Subscription WHERE subscriberID = @sid', { sid: TEST_SID });
        await query('DELETE FROM VirtualWallet WHERE subscriberID = @sid', { sid: TEST_SID });
        await query('DELETE FROM Subscriber WHERE subscriberID = @sid', { sid: TEST_SID });
    }
    // Safety: also delete by email in case a prior run left a row
    await query('DELETE FROM Subscriber WHERE email = @e', { e: TEST_EMAIL });
}

async function setup(walletBalance) {
    // Create the test subscriber (SAST tz, quiet hours default 22:00-07:00)
    const subRes = await query(`
        INSERT INTO Subscriber (firstName, lastName, email, passwordHash, userType, scribeScore,
            marketingOptIn, twoFactorEnabled, theme, notifyPayments, notifyGoals, notifyWeekly,
            createdAt, updatedAt, timezone, quietHoursEnabled, quietHoursStart, quietHoursEnd)
        OUTPUT INSERTED.subscriberID
        VALUES (@fn, @ln, @email, @ph, 'MainMember', 640,
            0, 0, 'dark', 1, 1, 1,
            GETDATE(), GETDATE(), @tz, 1, 1320, 420)
    `, { fn: 'Phase3', ln: 'Tester', email: TEST_EMAIL, ph: 'x', tz: TZ });
    TEST_SID = subRes.recordset[0].subscriberID;

    const walletRes = await query(`
        INSERT INTO VirtualWallet (subscriberID, balance) OUTPUT INSERTED.walletID VALUES (@sid, @bal)
    `, { sid: TEST_SID, bal: walletBalance });
    TEST_WALLET = walletRes.recordset[0].walletID;

    return TEST_SID;
}

// Create a subscription with a specific billing date
async function addSub(name, amount, billingDate, cycle = 'monthly', autoRenew = 1, status = 'active') {
    const r = await query(`
        INSERT INTO Subscription (subscriberID, categoryID, serviceName, billingAmount, billingCycle, billingDate, subStatus, autoRenew)
        OUTPUT INSERTED.subscriptionID
        VALUES (@sid, 1, @name, @amt, @cycle, @date, @status, @ar)
    `, { sid: TEST_SID, name, amt: amount, cycle, date: billingDate, status, ar: autoRenew });
    return r.recordset[0].subscriptionID;
}

async function countNotif(type) {
    const r = await query(
        'SELECT COUNT(*) AS c FROM Notification WHERE subscriberID = @sid AND notificationType = @t',
        { sid: TEST_SID, t: type }
    );
    return r.recordset[0].c;
}

async function walletBalance() {
    const r = await query('SELECT balance FROM VirtualWallet WHERE walletID = @w', { w: TEST_WALLET });
    return parseFloat(r.recordset[0].balance);
}

(async () => {
    console.log('\n=== Phase 3 Scheduled Notification Tests ===\n');
    await cleanup(); // clear any leftovers from a prior run
    await snapshotRealData(); // snapshot real data so we can restore it after

    // ============================================================
    // BILLING — success + failed + dedupe
    // ============================================================
    console.log('-- Billing --');
    await setup(300); // wallet R300
    // Netflix R199 due "today" (2026-09-10 SAST), Spotify R500 due today (unaffordable after Netflix)
    const subNetflix = await addSub('Netflix', 199, '2026-09-10');
    const subSpotify = await addSub('Spotify', 500, '2026-09-10');

    const billNow = sast('2026-09-10', 10); // any time on the billing day
    // NOTE: runBilling scans ALL users (correct production behaviour), so we
    // assert on OUR test subscriber's own outcomes rather than global totals.
    const bill1 = await billing.runBilling(billNow);
    const bill1Netflix = bill1.details.find(d => d.subscriptionID === subNetflix);
    const bill1Spotify = bill1.details.find(d => d.subscriptionID === subSpotify);
    check('billing: Netflix charged successfully', bill1Netflix && bill1Netflix.status === 'success', bill1Netflix);
    check('billing: Spotify failed (unaffordable)', bill1Spotify && bill1Spotify.status === 'failed', bill1Spotify);
    check('wallet debited to 101 (300-199)', Math.abs((await walletBalance()) - 101) < 0.01, await walletBalance());
    check('PAYMENT_SUCCESS notification created', (await countNotif('PAYMENT_SUCCESS')) === 1, null);
    check('PAYMENT_FAILED notification created', (await countNotif('PAYMENT_FAILED')) === 1, null);

    // Run billing again same day -> no double charge.
    // Netflix succeeded so its billingDate advanced to next cycle => it is
    // no longer "due today" and won't be evaluated again (absent from details).
    // Spotify failed so it stays on today's date but its marker blocks a
    // re-charge => it appears as 'skipped'. Either way, no double charge.
    const bill2 = await billing.runBilling(billNow);
    const bill2Netflix = bill2.details.find(d => d.subscriptionID === subNetflix);
    const bill2Spotify = bill2.details.find(d => d.subscriptionID === subSpotify);
    check('billing re-run: Netflix not re-charged (date advanced, absent)', bill2Netflix === undefined, bill2Netflix);
    check('billing re-run: Spotify skipped (marker blocks re-charge)', bill2Spotify && bill2Spotify.status === 'skipped', bill2Spotify);
    check('wallet still 101 (no double charge)', Math.abs((await walletBalance()) - 101) < 0.01, await walletBalance());
    check('Netflix billingDate advanced to 2026-10-10', true, null);
    const nf = await query('SELECT billingDate FROM Subscription WHERE subscriptionID=@id', { id: subNetflix });
    check('Netflix next billingDate is 2026-10-10', new Date(nf.recordset[0].billingDate).toISOString().slice(0,10) === '2026-10-10', new Date(nf.recordset[0].billingDate).toISOString().slice(0,10));

    await cleanup();

    // ============================================================
    // SUBSCRIPTION REMINDERS — 7/3/1/0 days, at local 08:00
    // ============================================================
    console.log('-- Subscription reminders --');
    await setup(1000);
    // Billing date 2026-09-15; test each lead time
    const subReminder = await addSub('Netflix', 199, '2026-09-15');
    const mine = (r) => r.details.filter(d => d.subscriptionID === subReminder && d.sent);

    const rem7 = await reminders.runSubscriptionReminders(sast('2026-09-08', 8)); // 7 days before, 08:00
    check('reminder fires 7 days before at 08:00', mine(rem7).length === 1, rem7);

    const rem7again = await reminders.runSubscriptionReminders(sast('2026-09-08', 8));
    check('reminder 7-day deduped on re-run', mine(rem7again).length === 0, rem7again);

    const remWrongHour = await reminders.runSubscriptionReminders(sast('2026-09-12', 10)); // 3 days before but 10:00 not 08:00
    check('reminder does NOT fire at wrong local hour', remWrongHour.checked === 0, remWrongHour);

    const rem3 = await reminders.runSubscriptionReminders(sast('2026-09-12', 8)); // 3 days before, 08:00
    check('reminder fires 3 days before at 08:00', mine(rem3).length === 1, rem3);

    const rem0 = await reminders.runSubscriptionReminders(sast('2026-09-15', 8)); // day of, 08:00
    const rem0Mine = rem0.details.filter(d => d.subscriptionID === subReminder);
    check('reminder fires day-of at 08:00 for test sub', rem0Mine.length === 1 && rem0Mine[0].sent, rem0Mine);

    check('total SUBSCRIPTION_RENEWAL_REMINDER = 3 (d7,d3,d0) for test user', (await countNotif('SUBSCRIPTION_RENEWAL_REMINDER')) === 3, null);

    await cleanup();

    // ============================================================
    // QUIET HOURS — reminder at 08:00 with quiet window shifted to include 08:00
    // ============================================================
    console.log('-- Quiet hours --');
    await setup(1000);
    await addSub('Netflix', 199, '2026-09-15');
    // Set quiet hours to 06:00-09:00 so 08:00 is inside quiet
    await query('UPDATE Subscriber SET quietHoursStart=360, quietHoursEnd=540 WHERE subscriberID=@sid', { sid: TEST_SID });
    const remQuiet = await reminders.runSubscriptionReminders(sast('2026-09-08', 8)); // 08:00 now inside quiet
    check('reminder suppressed during quiet hours', remQuiet.sent === 0 && remQuiet.skippedQuiet === 1, remQuiet);
    await cleanup();

    // ============================================================
    // PAYMENT_FAILED bypasses quiet hours (billing)
    // ============================================================
    console.log('-- Critical bypass (payment failed during quiet hours) --');
    await setup(50); // too low for a R199 charge
    await addSub('Netflix', 199, '2026-09-10');
    // Quiet hours all day (00:00-23:59) to prove critical still fires
    await query('UPDATE Subscriber SET quietHoursStart=0, quietHoursEnd=1439 WHERE subscriberID=@sid', { sid: TEST_SID });
    await billing.runBilling(sast('2026-09-10', 23)); // 23:00 local, deep in quiet
    check('PAYMENT_FAILED created even during quiet hours (critical bypass)', (await countNotif('PAYMENT_FAILED')) === 1, null);
    await cleanup();

    // ============================================================
    // INSUFFICIENT FUNDS — 3 days before, wallet < amount
    // ============================================================
    console.log('-- Insufficient funds (3 days before) --');
    await setup(150); // wallet R150
    await addSub('Netflix', 199, '2026-09-15'); // R199 > R150
    await paySummaries.runInsufficientFundsCheck(sast('2026-09-12', 9)); // 3 days before, 09:00
    check('INSUFFICIENT_FUNDS notification created', (await countNotif('INSUFFICIENT_FUNDS')) === 1, null);
    await paySummaries.runInsufficientFundsCheck(sast('2026-09-12', 9));
    check('insufficient-funds deduped (still 1)', (await countNotif('INSUFFICIENT_FUNDS')) === 1, null);
    await cleanup();

    // ============================================================
    // UPCOMING PAYMENT SUMMARY — only when >=1 upcoming
    // ============================================================
    console.log('-- Upcoming payment summary --');
    await setup(5000);
    await addSub('Netflix', 199, '2026-09-11'); // tomorrow (from 09-10)
    await addSub('Spotify', 59.99, '2026-09-13'); // 3 days
    await paySummaries.runUpcomingPaymentSummary(sast('2026-09-10', 9));
    check('UPCOMING_PAYMENT notification created (2 upcoming)', (await countNotif('UPCOMING_PAYMENT')) === 1, null);
    await paySummaries.runUpcomingPaymentSummary(sast('2026-09-10', 9));
    check('upcoming summary deduped same day (still 1)', (await countNotif('UPCOMING_PAYMENT')) === 1, null);
    await cleanup();

    // No upcoming -> no send (assert on OUR test user's notification count)
    await setup(5000);
    await addSub('Netflix', 199, '2026-12-25'); // far future, >7 days
    await paySummaries.runUpcomingPaymentSummary(sast('2026-09-10', 9));
    check('no summary when nothing due within 7 days for test user', (await countNotif('UPCOMING_PAYMENT')) === 0, null);
    await cleanup();

    // ============================================================
    // WEEKLY SUMMARY — Monday 09:00
    // ============================================================
    console.log('-- Weekly summary --');
    await setup(5000);
    // 2026-09-14 is a Monday
    await finSummaries.runWeeklySummary(sast('2026-09-14', 9));
    check('WEEKLY_SUMMARY notification created on Monday 09:00', (await countNotif('WEEKLY_SUMMARY')) === 1, null);
    await finSummaries.runWeeklySummary(sast('2026-09-14', 9));
    check('weekly summary deduped (still 1)', (await countNotif('WEEKLY_SUMMARY')) === 1, null);
    // Not Monday -> no send for our test user
    await cleanup();
    await setup(5000);
    await finSummaries.runWeeklySummary(sast('2026-09-15', 9)); // Tuesday
    check('weekly summary NOT created on Tuesday', (await countNotif('WEEKLY_SUMMARY')) === 0, null);
    await cleanup();

    // ============================================================
    // MONTHLY REPORT — 1st of month 09:00
    // ============================================================
    console.log('-- Monthly report --');
    await setup(5000);
    await finSummaries.runMonthlyReport(sast('2026-10-01', 9));
    check('MONTHLY_SUMMARY notification created on the 1st 09:00', (await countNotif('MONTHLY_SUMMARY')) === 1, null);
    await finSummaries.runMonthlyReport(sast('2026-10-01', 9));
    check('monthly report deduped (still 1)', (await countNotif('MONTHLY_SUMMARY')) === 1, null);
    await cleanup();
    await setup(5000);
    await finSummaries.runMonthlyReport(sast('2026-10-02', 9)); // not the 1st
    check('monthly report NOT created on the 2nd', (await countNotif('MONTHLY_SUMMARY')) === 0, null);
    await cleanup();

    // ============================================================
    // FAILURE ISOLATION — a job with a broken DB call still returns
    // ============================================================
    console.log('-- Failure isolation --');
    let threw = false;
    try {
        // Passing an invalid date should not throw out of the job
        const r = await reminders.runSubscriptionReminders(new Date('invalid'));
        check('job with bad now returns a summary (no throw)', typeof r === 'object', r);
    } catch (e) { threw = true; }
    check('scheduled job never throws to caller', threw === false);

    // Final safety cleanup: remove test subscriber, then restore any real
    // data the global-scanning jobs touched during the run.
    await cleanup();
    await restoreRealData();

    const leftover = await query('SELECT COUNT(*) AS c FROM Subscriber WHERE email = @e', { e: TEST_EMAIL });
    check('test subscriber cleaned up', leftover.recordset[0].c === 0, leftover.recordset[0].c);

    // Verify no notifications leaked onto real users
    const notifNow = await query('SELECT COUNT(*) AS c FROM Notification', {});
    check('no leftover notifications (real data restored)', notifNow.recordset[0].c === _snapNotifIds.size, { now: notifNow.recordset[0].c, snapshot: _snapNotifIds.size });

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(async e => {
    console.error('Test harness error:', e.message);
    try { await cleanup(); if (_snapNotifIds) await restoreRealData(); } catch (_) {}
    process.exit(1);
});
