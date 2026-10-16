/* ===========================================================
   test-dependant-logic.js
   PURE-LOGIC unit tests (NO database, NO running server).

   Verifies the correctness-critical logic added for the
   main-member / dependant feature set:
     • recurring-task next-due-date arithmetic (incl. month clamping)
     • backend monetary / email / date-of-birth validators + exact messages
     • email normalisation
     • secure invitation token hashing (SHA-256, deterministic)

   Usage:  node test-dependant-logic.js
=========================================================== */
'use strict';

const dep = require('./routes/dependants');
const inv = require('./services/invitationService');

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS -', name); passed++; }
    else { console.log('  FAIL -', name, detail != null ? '=> ' + JSON.stringify(detail) : ''); failed++; }
}

console.log('\n== Recurring next-due-date ==');
check('daily: 2026-10-15 -> 2026-10-16', dep.nextDueDate('2026-10-15', 'daily') === '2026-10-16');
check('weekly: 2026-10-15 -> 2026-10-22', dep.nextDueDate('2026-10-15', 'weekly') === '2026-10-22');
check('biweekly: 2026-10-15 -> 2026-10-29', dep.nextDueDate('2026-10-15', 'biweekly') === '2026-10-29');
check('monthly: 2026-01-31 -> 2026-02-28 (clamped)', dep.nextDueDate('2026-01-31', 'monthly') === '2026-02-28', dep.nextDueDate('2026-01-31', 'monthly'));
check('monthly: 2026-11-30 -> 2026-12-30', dep.nextDueDate('2026-11-30', 'monthly') === '2026-12-30', dep.nextDueDate('2026-11-30', 'monthly'));
check('monthly: 2026-12-15 -> 2027-01-15 (year roll)', dep.nextDueDate('2026-12-15', 'monthly') === '2027-01-15', dep.nextDueDate('2026-12-15', 'monthly'));
check('invalid cycle returns null', dep.nextDueDate('2026-10-15', 'nope') === null);
check('null input returns null', dep.nextDueDate(null, 'daily') === null);

console.log('\n== Amount validation (exact messages) ==');
check('valid 100.50', (() => { const r = dep._validateAmount('100.50', { required: true }); return r.valid && r.value === 100.5; })());
check('negative -> exact msg', (() => { const r = dep._validateAmount('-5', { required: true }); return !r.valid && r.message === 'The amount cannot be negative.'; })());
check('3 decimals -> invalid msg', (() => { const r = dep._validateAmount('1.234', { required: true }); return !r.valid && r.message === 'Please enter a valid amount using numbers and up to two decimal places.'; })());
check('over max -> exact msg', (() => { const r = dep._validateAmount('100000.01', { required: true }); return !r.valid && r.message === 'The amount cannot exceed R100,000.00.'; })());
check('exactly max 100000 ok', (() => { const r = dep._validateAmount('100000', { required: true }); return r.valid; })());
check('letters -> invalid', (() => { const r = dep._validateAmount('abc', { required: true }); return !r.valid; })());

console.log('\n== Email validation + normalisation ==');
check('valid email', dep._validateEmail('Test.User@Example.com').valid);
check('missing @ rejected', !dep._validateEmail('testexample.com').valid);
check('double @ rejected', !dep._validateEmail('a@@b.com').valid);
check('no TLD rejected', !dep._validateEmail('a@b').valid);
check('normalise lowercases + trims', dep._normaliseEmail('  Test.User@Example.COM ') === 'test.user@example.com');

console.log('\n== Date of birth (must be in the past) ==');
check('future DOB rejected', (() => { const r = dep._validateDateOfBirth('3000-01-01'); return !r.valid && r.message === 'Please enter a valid date of birth in the past. Future dates are not allowed.'; })());
const today = new Date().toISOString().slice(0, 10);
check('today rejected', !dep._validateDateOfBirth(today).valid);
check('valid past DOB', dep._validateDateOfBirth('1999-05-20').valid);
check('impossible date 2020-02-31 rejected', !dep._validateDateOfBirth('2020-02-31').valid);

console.log('\n== Invitation token hashing (SHA-256, deterministic, raw never stored) ==');
const h1 = inv._hashToken('abc123');
const h2 = inv._hashToken('abc123');
const h3 = inv._hashToken('different');
check('hash is 64 hex chars', /^[0-9a-f]{64}$/.test(h1), h1);
check('same input -> same hash', h1 === h2);
check('different input -> different hash', h1 !== h3);
check('hash is not the raw token', h1 !== 'abc123');
check('setup URL embeds token + points at setup page', (() => {
    const u = inv.buildSetupUrl('TOK');
    return u.includes('/pages/setup-account.html?token=TOK');
})(), inv.buildSetupUrl('TOK'));

console.log(`\n==== ${passed} passed, ${failed} failed ====\n`);
process.exit(failed === 0 ? 0 : 1);
