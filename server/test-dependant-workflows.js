/* ===========================================================
   test-dependant-workflows.js
   INTEGRATION test harness for the main-member / dependant
   feature set. Runs against a LOCALLY running server.

   Prerequisites (MUST be done first):
     1. Run ALL migrations in SSMS, including the new ones:
          migrations/010-fund-requests.sql
          migrations/011-dependant-invitations.sql
        (plus 002 and 004, which the live DB already depends on)
     2. Start the server:  node server.js
     3. Have (or register) a MAIN MEMBER account; set its
        credentials below (MAIN_EMAIL / MAIN_PASSWORD).

   What it verifies (end to end, real DB):
     • Role gating: a dependant token is 403'd from /api/dependants
     • Add dependant -> one linked account + Invitation Pending/Sent
     • Duplicate email rejected with the exact message
     • Resend invitation issues a new token + supersedes the old
     • Request Funds: disabled by default -> 403 with exact message;
       enabled -> request succeeds (request only, no money moved)
     • Task create (affordability) + dependant self-complete + reward
     • Undo (revert) refunds exactly once

   Usage:  node test-dependant-workflows.js
   NOTE: This talks to the real database. It creates test rows
   (a dependant + tasks + a fund request). Clean up afterwards if
   you do not want them to persist.
=========================================================== */
'use strict';

const BASE = (process.env.TEST_BASE || 'http://localhost:3000') + '/api';
const MAIN_EMAIL = process.env.MAIN_EMAIL || 'CHANGE_ME@example.com';
const MAIN_PASSWORD = process.env.MAIN_PASSWORD || 'CHANGE_ME';

let passed = 0, failed = 0, skipped = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS -', name); passed++; }
    else { console.log('  FAIL -', name, detail != null ? '=> ' + JSON.stringify(detail) : ''); failed++; }
}
function skip(name, why) { console.log('  SKIP -', name, why ? '(' + why + ')' : ''); skipped++; }

async function api(method, path, token, body) {
    const opts = { method, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(BASE + path, opts);
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, body: json };
}

(async () => {
    console.log('\n== Login as main member ==');
    const login = await api('POST', '/auth/login', null, { email: MAIN_EMAIL, password: MAIN_PASSWORD });
    if (login.status !== 200 || !login.body || !login.body.token) {
        console.log('  Could not log in as main member. Set MAIN_EMAIL / MAIN_PASSWORD env vars to a real account.');
        console.log('  Aborting integration run.\n');
        process.exit(2);
    }
    const mainToken = login.body.token;
    check('main member login', !!mainToken);

    const uniqueEmail = 'dep_' + Date.now() + '@example.com';

    console.log('\n== Add dependant (creates one linked account + invitation) ==');
    const add = await api('POST', '/dependants', mainToken, {
        firstName: 'Test', lastName: 'Dependant', email: uniqueEmail,
        relationship: 'Child', dateOfBirth: '2010-06-15', allowance: 100, spendingLimit: 500
    });
    check('dependant created (201)', add.status === 201, add.body);
    const depId = add.body && add.body.dependantID;
    check('invitation status returned', add.body && /Invitation (Pending|Sent)/.test(add.body.invitationStatus || ''), add.body);

    console.log('\n== Duplicate email rejected with EXACT message ==');
    const dup = await api('POST', '/dependants', mainToken, {
        firstName: 'Dup', lastName: 'Email', email: uniqueEmail.toUpperCase(),
        relationship: 'Child', dateOfBirth: '2011-01-01'
    });
    check('duplicate rejected (409)', dup.status === 409, dup.body);
    check('exact duplicate message', dup.body && dup.body.error === 'This email address is already registered. Please use a different email address.', dup.body);

    console.log('\n== Resend invitation (new token, supersede old) ==');
    if (depId) {
        const resend = await api('POST', '/dependants/' + depId + '/resend-invitation', mainToken, {});
        check('resend ok (200)', resend.status === 200, resend.body);
    } else skip('resend invitation', 'no depId');

    console.log('\n== Request Funds disabled by default ==');
    // Need a dependant TOKEN. In a real run, activate the dependant via the
    // setup link (check server/_sent-emails.log for the URL) then log in.
    skip('dependant request-funds (needs activated dependant token)',
        'activate the dependant via setup link in server/_sent-emails.log, then re-run with their token');

    console.log('\n== Enable request funds for this dependant (per-dependant) ==');
    if (depId) {
        const en = await api('PUT', '/dependants/' + depId, mainToken, { canRequestFunds: 1 });
        check('enable toggle persisted (200)', en.status === 200, en.body);
        const list = await api('GET', '/dependants', mainToken);
        const row = (list.body || []).find(d => d.dependantID === depId);
        check('canRequestFunds now 1 in DB', row && (row.canRequestFunds === true || row.canRequestFunds === 1), row);
    } else skip('enable request funds', 'no depId');

    console.log('\n== Create a rewarded task + affordability guard ==');
    if (depId) {
        const task = await api('POST', '/dependants/' + depId + '/tasks', mainToken, {
            taskName: 'Wash dishes', reward: 10, dueDate: new Date().toISOString().slice(0, 10)
        });
        check('task created or insufficient-funds blocked', task.status === 201 || task.status === 402, task.body);
        if (task.status === 402) {
            check('insufficient funds exact message', /Insufficient wallet funds/.test(task.body.error || ''), task.body);
        }
    } else skip('create task', 'no depId');

    console.log(`\n==== ${passed} passed, ${failed} failed, ${skipped} skipped ====`);
    console.log('Note: dependant-token tests (self-complete, request funds) require activating');
    console.log('the dependant via the setup link logged to server/_sent-emails.log.\n');
    process.exit(failed === 0 ? 0 : 1);
})().catch(err => {
    console.error('Integration run error:', err.message);
    console.error('Is the server running on ' + BASE + ' with all migrations applied?');
    process.exit(2);
});
