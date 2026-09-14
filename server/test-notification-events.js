/* ===========================================================
   test-notification-events.js
   Phase 2 event-driven notification tests.

   Tests the notificationEvents helpers directly (the HTTP routes
   are thin wrappers that call these). Verifies:
   - each event creates the right notification
   - dedupe prevents repeats
   - low-balance only fires on downward threshold crossing
   - low-balance re-arms after recovery
   - goal milestones fire once each, highest-only
   - failure isolation (bad input never throws)
   - security (notifications are scoped to the given user)

   Prerequisites:
     - migration 002 applied
     - DB reachable via server/.env

   Usage:  node test-notification-events.js
   (Does NOT require the HTTP server to be running.)
=========================================================== */
'use strict';

const events = require('./services/notificationEvents');
const svc = require('./services/notificationService');
const { query } = require('./db');
const { NOTIFICATION_TYPES } = require('./constants/notificationTypes');

const USER_A = 1;   // mntiviso@gmail.com
const USER_B = 4;   // amyj@gmail.com

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS -', name); passed++; }
    else { console.log('  FAIL -', name, detail !== undefined ? '=> ' + JSON.stringify(detail) : ''); failed++; }
}

// Count notifications for a user matching a dedupeKey fragment
async function countByToken(sid, tokenFragment) {
    const r = await query(
        "SELECT COUNT(*) AS c FROM Notification WHERE subscriberID = @sid AND dedupeKey LIKE @frag",
        { sid, frag: '%' + tokenFragment + '%' }
    );
    return r.recordset[0].c;
}

async function cleanup() {
    // Remove only the test notifications we create (unique test entity IDs / tokens)
    await query("DELETE FROM Notification WHERE dedupeKey LIKE '%-99901%' OR dedupeKey LIKE '%-99902%' OR dedupeKey LIKE '%goal-99903%' OR dedupeKey LIKE '%low-balance-%'", {});
}

(async () => {
    console.log('\n=== Phase 2 Event-Driven Notification Tests ===\n');
    await cleanup();

    // ---- SUBSCRIPTION ADDED ----
    const addRes = await events.subscriptionAdded(USER_A, {
        subscriptionID: 99901, serviceName: 'Netflix', billingAmount: 199, billingCycle: 'monthly', billingDate: '2026-09-15', categoryID: 1
    });
    check('subscriptionAdded creates notification', addRes.created === true, addRes);

    const addDup = await events.subscriptionAdded(USER_A, {
        subscriptionID: 99901, serviceName: 'Netflix', billingAmount: 199, billingCycle: 'monthly'
    });
    check('subscriptionAdded is deduped on repeat', addDup.created === false, addDup);

    // ---- SUBSCRIPTION CANCELLED ----
    const cancelRes = await events.subscriptionCancelled(USER_A, 99901, 'Netflix', '2026-09-15');
    check('subscriptionCancelled creates notification', cancelRes.created === true, cancelRes);

    // ---- PAYMENT SUCCESS / FAILED (helpers ready for Phase 3) ----
    const paySucc = await events.paymentSuccess(USER_A, { transactionID: 99902, amount: 199, serviceName: 'Netflix', paymentMethod: 'Wallet' });
    check('paymentSuccess creates notification', paySucc.created === true, paySucc);
    const paySuccDup = await events.paymentSuccess(USER_A, { transactionID: 99902, amount: 199, serviceName: 'Netflix' });
    check('paymentSuccess deduped by transactionID', paySuccDup.created === false, paySuccDup);

    const payFail = await events.paymentFailed(USER_A, { transactionID: 99902, amount: 199, serviceName: 'Netflix', reason: 'there were insufficient funds' });
    check('paymentFailed creates notification (separate from success)', payFail.created === true, payFail);

    // ---- LOW BALANCE: crossing detection ----
    // 620 -> 480 crosses 500
    const cross500 = await events.lowBalanceCheck(USER_A, 620, 480);
    check('low-balance fires when crossing R500 (620->480)', cross500.created === true, cross500);

    // 480 -> 450 does NOT cross another threshold => no new R500 notif
    const noRecross = await events.lowBalanceCheck(USER_A, 480, 450);
    check('low-balance does NOT refire staying below R500 (480->450)', noRecross.created === false, noRecross);

    // 450 -> 240 crosses 250
    const cross250 = await events.lowBalanceCheck(USER_A, 450, 240);
    check('low-balance fires when crossing R250 (450->240)', cross250.created === true, cross250);

    // 240 -> 90 crosses 100
    const cross100 = await events.lowBalanceCheck(USER_A, 240, 90);
    check('low-balance fires when crossing R100 (240->90)', cross100.created === true, cross100);

    // Recovery: 90 -> 700 clears all thresholds
    await events.clearLowBalanceState(USER_A, 700);
    const afterRecovery = await countByToken(USER_A, 'low-balance-');
    check('low-balance state cleared after recovery to R700', afterRecovery === 0, { remaining: afterRecovery });

    // Re-dip: 700 -> 480 fires R500 again
    const reDip = await events.lowBalanceCheck(USER_A, 700, 480);
    check('low-balance re-fires after recovery then re-dip', reDip.created === true, reDip);

    // ---- GOAL MILESTONES ----
    // 24% -> below first milestone, no notif (progress 240 of 1000)
    const g24 = await events.goalMilestoneCheck(USER_A, 99903, 'New Laptop', 240, 1000);
    check('goal below 25% => no notification', g24.created === false, g24);

    // 26% -> crosses 25%
    const g26 = await events.goalMilestoneCheck(USER_A, 99903, 'New Laptop', 260, 1000);
    check('goal 26% => fires 25% milestone', g26.created === true, g26);

    // 30% -> still 25% bucket, deduped
    const g30 = await events.goalMilestoneCheck(USER_A, 99903, 'New Laptop', 300, 1000);
    check('goal 30% => 25% milestone deduped', g30.created === false, g30);

    // 55% -> crosses 50%
    const g55 = await events.goalMilestoneCheck(USER_A, 99903, 'New Laptop', 550, 1000);
    check('goal 55% => fires 50% milestone', g55.created === true, g55);

    // 100% -> completed
    const g100 = await events.goalMilestoneCheck(USER_A, 99903, 'New Laptop', 1000, 1000);
    check('goal 100% => fires GOAL_COMPLETED', g100.created === true && g100.notification.notificationType === NOTIFICATION_TYPES.GOAL_COMPLETED, g100);

    // 100% again => deduped
    const g100dup = await events.goalMilestoneCheck(USER_A, 99903, 'New Laptop', 1000, 1000);
    check('goal 100% repeat => deduped', g100dup.created === false, g100dup);

    // ---- FAILURE ISOLATION ----
    // Bad input (no subscriberID) must NOT throw — helper returns gracefully
    let threw = false;
    try {
        const bad = await events.subscriptionAdded(null, { subscriptionID: 99999, serviceName: 'X', billingAmount: 1 });
        check('bad input returns without throwing', bad.created === false, bad);
    } catch (e) {
        threw = true;
    }
    check('helper never throws on bad input', threw === false);

    // ---- SECURITY: notifications scoped to correct user ----
    const userANetflix = await countByToken(USER_A, 'subscription-added-99901');
    const userBNetflix = await countByToken(USER_B, 'subscription-added-99901');
    check('User A has the Netflix-added notification', userANetflix >= 1, userANetflix);
    check('User B does NOT have User A notification', userBNetflix === 0, userBNetflix);

    // ---- hasInsufficientFunds helper (no sending) ----
    const insuff = await events.hasInsufficientFunds(USER_A, 999999); // non-existent sub
    check('hasInsufficientFunds returns object, no throw', typeof insuff === 'object' && 'insufficient' in insuff, insuff);

    // Cleanup test data
    await cleanup();
    const leftover = await query(
        "SELECT COUNT(*) AS c FROM Notification WHERE dedupeKey LIKE '%99901%' OR dedupeKey LIKE '%99902%' OR dedupeKey LIKE '%99903%' OR dedupeKey LIKE '%low-balance-%'", {}
    );
    check('test data cleaned up', leftover.recordset[0].c === 0, leftover.recordset[0].c);

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('Test harness error:', e.message); process.exit(1); });
