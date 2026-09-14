/* ===========================================================
   test-notifications.js
   Phase 1 notification system test harness.

   Runs against a LOCALLY running server (http://localhost:3000).
   Generates its own JWTs for two users so it can verify that
   users cannot see each other's notifications.

   Prerequisites:
     1. migrations/002-extend-notifications.sql has been run in SSMS
     2. The server is running: node server.js

   Usage:  node test-notifications.js
=========================================================== */
'use strict';

const jwt = require('jsonwebtoken');
const { createNotification } = require('./services/notificationService');
const { NOTIFICATION_TYPES, PRIORITY, ENTITY_TYPES } = require('./constants/notificationTypes');

const BASE = 'http://localhost:3000/api';
const SECRET = process.env.JWT_SECRET || 'flexscribe_jwt_secret_change_in_production';

// Two real users from the DB
const USER_A = { subscriberID: 1, email: 'mntiviso@gmail.com', userType: 'MainMember' };
const USER_B = { subscriberID: 4, email: 'amyj@gmail.com', userType: 'MainMember' };

function tokenFor(user) {
    return jwt.sign(user, SECRET, { expiresIn: '1h' });
}

async function api(method, path, token, body) {
    const opts = { method, headers: { 'Authorization': 'Bearer ' + token } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(BASE + path, opts);
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, body: json };
}

let passed = 0, failed = 0;
function check(name, condition, detail) {
    if (condition) { console.log('  PASS -', name); passed++; }
    else { console.log('  FAIL -', name, detail ? '=> ' + JSON.stringify(detail) : ''); failed++; }
}

(async () => {
    const tokenA = tokenFor(USER_A);
    const tokenB = tokenFor(USER_B);

    console.log('\n=== Phase 1 Notification Tests ===\n');

    // --- Seed test notifications directly via the service ---
    console.log('Seeding test notifications for User A...');
    const seedResults = [];
    seedResults.push(await createNotification({
        subscriberID: USER_A.subscriberID,
        type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
        title: 'Payment successful',
        message: 'Your R199 Netflix payment was successfully processed.',
        relatedEntityType: ENTITY_TYPES.TRANSACTION,
        relatedEntityID: 9001,
        eventToken: 'test-tx-9001'
    }));
    seedResults.push(await createNotification({
        subscriberID: USER_A.subscriberID,
        type: NOTIFICATION_TYPES.SUBSCRIPTION_ADDED,
        title: 'Subscription added',
        message: 'Netflix has been added to your subscriptions for R199/month.',
        relatedEntityType: ENTITY_TYPES.SUBSCRIPTION,
        relatedEntityID: 5001,
        eventToken: 'test-sub-5001'
    }));
    seedResults.push(await createNotification({
        subscriberID: USER_A.subscriberID,
        type: NOTIFICATION_TYPES.LOW_BALANCE,
        title: 'Your wallet balance is getting low',
        message: 'Your FlexScribe wallet balance is R480.',
        relatedEntityType: ENTITY_TYPES.WALLET,
        eventToken: 'test-lowbal-480'
    }));
    check('seeded 3 notifications', seedResults.every(r => r.created), seedResults);

    // --- TEST: duplicate prevention ---
    const dup = await createNotification({
        subscriberID: USER_A.subscriberID,
        type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
        title: 'Payment successful',
        message: 'DUPLICATE - should not be created',
        relatedEntityType: ENTITY_TYPES.TRANSACTION,
        relatedEntityID: 9001,
        eventToken: 'test-tx-9001'  // same event token as first
    });
    check('duplicate prevented', dup.created === false && dup.reason === 'duplicate', dup);

    // --- TEST: GET list (raw array) ---
    const listA = await api('GET', '/notifications', tokenA);
    check('GET / returns 200', listA.status === 200, listA.status);
    check('GET / returns array (legacy shape)', Array.isArray(listA.body), typeof listA.body);
    check('GET / has >= 3 items', Array.isArray(listA.body) && listA.body.length >= 3, listA.body && listA.body.length);

    // --- TEST: GET list with meta envelope ---
    const listMeta = await api('GET', '/notifications?meta=true', tokenA);
    check('GET /?meta=true returns envelope', listMeta.body && typeof listMeta.body.total === 'number', listMeta.body);

    // --- TEST: unread count ---
    const countA = await api('GET', '/notifications/unread-count', tokenA);
    check('GET /unread-count returns {count}', countA.body && typeof countA.body.count === 'number', countA.body);
    check('unread count >= 3', countA.body && countA.body.count >= 3, countA.body);

    // --- TEST: unread filter ---
    const unreadList = await api('GET', '/notifications?unread=true', tokenA);
    check('GET /?unread=true returns array', Array.isArray(unreadList.body), unreadList.body);

    // --- TEST: pagination ---
    const paged = await api('GET', '/notifications?meta=true&limit=1&offset=0', tokenA);
    check('pagination limit=1 returns 1 item', paged.body && paged.body.items.length === 1, paged.body && paged.body.items.length);

    // --- TEST: security — User B cannot see User A's notifications by ID ---
    const firstId = Array.isArray(listA.body) && listA.body[0] ? listA.body[0].notificationID : null;
    if (firstId) {
        const bReads = await api('PATCH', '/notifications/' + firstId + '/read', tokenB);
        check('User B cannot mark User A notification read (404)', bReads.status === 404, bReads.status);

        const bDeletes = await api('DELETE', '/notifications/' + firstId, tokenB);
        check('User B cannot delete User A notification (404)', bDeletes.status === 404, bDeletes.status);

        // --- TEST: mark as read (owner) ---
        const aReads = await api('PATCH', '/notifications/' + firstId + '/read', tokenA);
        check('User A marks own notification read', aReads.status === 200, aReads.status);
    } else {
        check('had a notification id to test with', false, 'no id');
    }

    // --- TEST: no token rejected ---
    const noAuth = await fetch(BASE + '/notifications');
    check('no token => 401', noAuth.status === 401, noAuth.status);

    // --- TEST: mark all read (both aliases) ---
    const markAll = await api('PATCH', '/notifications/read-all', tokenA);
    check('PATCH /read-all works', markAll.status === 200, markAll.status);
    const markAllLegacy = await api('PATCH', '/notifications/mark-all-read', tokenA);
    check('PATCH /mark-all-read (legacy) works', markAllLegacy.status === 200, markAllLegacy.status);

    const countAfter = await api('GET', '/notifications/unread-count', tokenA);
    check('unread count is 0 after mark-all', countAfter.body && countAfter.body.count === 0, countAfter.body);

    // --- TEST: delete (owner) ---
    if (firstId) {
        const del = await api('DELETE', '/notifications/' + firstId, tokenA);
        check('User A deletes own notification', del.status === 200, del.status);
        const delAgain = await api('DELETE', '/notifications/' + firstId, tokenA);
        check('deleting again returns 404', delAgain.status === 404, delAgain.status);
    }

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('Test harness error:', e.message); process.exit(1); });
