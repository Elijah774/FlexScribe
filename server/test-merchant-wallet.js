/* ===========================================================
   test-merchant-wallet.js
   Merchant wallet endpoint tests (transfer / withdraw /
   recipient resolution / history / detail / ownership).

   Strategy:
   - Talks to the running HTTP server on localhost:3000.
   - Mints JWTs directly with generateToken (no login needed).
   - Snapshots the two test wallets' balances up front and
     RESTORES them at the end, then deletes only the test
     transactions it created. Real data is left intact.

   Prerequisites:
     - migration 004 applied
     - seed-withdrawal-destinations.sql applied
     - server running:  node server.js   (port 3000)

   Usage:  node test-merchant-wallet.js
=========================================================== */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { query, getPool, sql } = require('./db');
const { generateToken } = require('./middleware/auth');

const BASE = 'http://localhost:3000/api';

const USER_A = { subscriberID: 1, email: 'mntiviso@gmail.com', userType: 'MainMember' };
const USER_B = { subscriberID: 4, email: 'amyj@gmail.com', userType: 'MainMember' };

const tokenA = generateToken(USER_A);
const tokenB = generateToken(USER_B);

let passed = 0, failed = 0;
function check(name, cond, detail) {
    if (cond) { console.log('  PASS -', name); passed++; }
    else { console.log('  FAIL -', name, detail !== undefined ? '=> ' + JSON.stringify(detail) : ''); failed++; }
}

async function api(method, path, token, body) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? ('Bearer ' + token) : ''
        },
        body: body != null ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, body: json };
}

async function getBalance(sid) {
    const r = await query('SELECT balance FROM VirtualWallet WHERE subscriberID = @sid', { sid });
    return r.recordset.length ? parseFloat(r.recordset[0].balance) : null;
}

async function setBalance(sid, bal) {
    await query('UPDATE VirtualWallet SET balance = @bal WHERE subscriberID = @sid', { sid, bal });
}

(async () => {
    console.log('\n=== Merchant Wallet Tests ===\n');

    // Snapshot real balances so we can restore them afterwards
    const snapA = await getBalance(USER_A.subscriberID);
    const snapB = await getBalance(USER_B.subscriberID);
    if (snapA == null || snapB == null) {
        console.error('Test users must both have wallets (subscriberID 1 and 4). Aborting.');
        process.exit(1);
    }

    // Track created transaction IDs for targeted cleanup
    const createdTxRefs = [];

    try {
        // Put both wallets in a known state for deterministic assertions
        await setBalance(USER_A.subscriberID, 1000.00);
        await setBalance(USER_B.subscriberID, 50.00);

        /* ---- AUTH ---- */
        const noAuth = await api('GET', '/wallet', null);
        check('GET /wallet without token -> 401', noAuth.status === 401, noAuth.status);

        const badAuth = await api('GET', '/wallet', 'garbage.token.here');
        check('GET /wallet with bad token -> 403', badAuth.status === 403, badAuth.status);

        /* ---- BALANCE SUMMARY ---- */
        const bal = await api('GET', '/wallet', tokenA);
        check('GET /wallet returns available/pending/total', bal.status === 200 &&
            bal.body.available === 1000 && typeof bal.body.total === 'number', bal.body);

        /* ---- RECIPIENT RESOLUTION ---- */
        const resEmail = await api('GET', '/wallet/recipients/' + encodeURIComponent(USER_B.email), tokenA);
        check('resolve recipient by email', resEmail.status === 200 && resEmail.body.subscriberID === USER_B.subscriberID, resEmail.body);

        const resMissing = await api('GET', '/wallet/recipients/' + encodeURIComponent('nobody@nowhere.xyz'), tokenA);
        check('resolve unknown recipient -> 404', resMissing.status === 404, resMissing.status);

        const resSelf = await api('GET', '/wallet/recipients/' + encodeURIComponent(USER_A.email), tokenA);
        check('resolve self -> 400', resSelf.status === 400, resSelf.status);

        /* ---- TRANSFER: validation ---- */
        const tZero = await api('POST', '/wallet/transfer', tokenA, { recipientUserID: USER_B.subscriberID, amount: 0 });
        check('transfer amount 0 -> 400', tZero.status === 400, tZero.status);

        const tNeg = await api('POST', '/wallet/transfer', tokenA, { recipientUserID: USER_B.subscriberID, amount: -20 });
        check('transfer negative -> 400', tNeg.status === 400, tNeg.status);

        const tSelf = await api('POST', '/wallet/transfer', tokenA, { recipientUserID: USER_A.subscriberID, amount: 10 });
        check('transfer to self -> 400', tSelf.status === 400, tSelf.status);

        const tNoRecip = await api('POST', '/wallet/transfer', tokenA, { amount: 10 });
        check('transfer without recipient -> 400', tNoRecip.status === 400, tNoRecip.status);

        const tBadRecip = await api('POST', '/wallet/transfer', tokenA, { recipientUserID: 999999, amount: 10 });
        check('transfer to unknown recipient -> 404', tBadRecip.status === 404, tBadRecip.status);

        const tInsufficient = await api('POST', '/wallet/transfer', tokenA, { recipientUserID: USER_B.subscriberID, amount: 999999 });
        check('transfer exceeding balance -> 400 (insufficient)', tInsufficient.status === 400, tInsufficient.body);

        /* ---- TRANSFER: success + atomic balance movement ---- */
        const tOk = await api('POST', '/wallet/transfer', tokenA, { recipientUserID: USER_B.subscriberID, amount: 300, note: 'test transfer' });
        check('transfer success -> 200 with reference', tOk.status === 200 && /^FS-TRF-\d{6}$/.test(tOk.body.reference || ''), tOk.body);
        if (tOk.body && tOk.body.reference) createdTxRefs.push(tOk.body.reference);

        const aAfter = await getBalance(USER_A.subscriberID);
        const bAfter = await getBalance(USER_B.subscriberID);
        check('sender debited by exactly 300', aAfter === 700, aAfter);
        check('recipient credited by exactly 300', bAfter === 350, bAfter);

        /* ---- TRANSFER produced BOTH legs sharing the reference ---- */
        const legs = await query(
            'SELECT transactionType, status FROM WalletTransaction WHERE reference = @ref ORDER BY transactionType',
            { ref: tOk.body.reference }
        );
        check('transfer wrote 2 legs (in + out)', legs.recordset.length === 2, legs.recordset.map(r => r.transactionType));
        check('both legs completed', legs.recordset.every(r => r.status === 'completed'), legs.recordset);

        /* ---- HISTORY: sender sees transfer_out ---- */
        const hist = await api('GET', '/wallet/transactions?type=transfer_out&limit=5', tokenA);
        check('history filter type=transfer_out returns rows', hist.status === 200 &&
            hist.body.transactions.length >= 1 &&
            hist.body.transactions.every(t => t.type === 'transfer_out'), hist.body && hist.body.transactions);

        const senderTxID = hist.body.transactions[0].transactionID;

        /* ---- DETAIL + OWNERSHIP ---- */
        const detOwn = await api('GET', '/wallet/transactions/' + senderTxID, tokenA);
        check('owner can read own transaction detail', detOwn.status === 200 && detOwn.body.transactionID === senderTxID, detOwn.status);

        const detCross = await api('GET', '/wallet/transactions/' + senderTxID, tokenB);
        check('other user cannot read that transaction -> 404', detCross.status === 404, detCross.status);

        /* ---- TOP UP (canonical /top-up + legacy /add-funds) ---- */
        const balBeforeTopup = await getBalance(USER_A.subscriberID); // 700 after transfer
        const topup = await api('POST', '/wallet/top-up', tokenA, { amount: 200, method: 'Bank Transfer' });
        check('top-up success -> 200 with FS-DEP ref', topup.status === 200 && /^FS-DEP-\d{6}$/.test(topup.body.reference || ''), topup.body);
        check('top-up status completed', topup.body && topup.body.status === 'completed', topup.body);
        if (topup.body && topup.body.reference) createdTxRefs.push(topup.body.reference);
        const balAfterTopup = await getBalance(USER_A.subscriberID);
        check('top-up credited by exactly 200', balAfterTopup === balBeforeTopup + 200, { balBeforeTopup, balAfterTopup });

        const topupZero = await api('POST', '/wallet/top-up', tokenA, { amount: 0 });
        check('top-up amount 0 -> 400', topupZero.status === 400, topupZero.status);

        const topupNeg = await api('POST', '/wallet/top-up', tokenA, { amount: -50 });
        check('top-up negative -> 400', topupNeg.status === 400, topupNeg.status);

        const addFunds = await api('POST', '/wallet/add-funds', tokenA, { amount: 50, source: 'EFT' });
        check('legacy /add-funds alias still works -> 200', addFunds.status === 200 && /^FS-DEP-\d{6}$/.test(addFunds.body.reference || ''), addFunds.body);
        if (addFunds.body && addFunds.body.reference) createdTxRefs.push(addFunds.body.reference);

        /* ---- WITHDRAW: destinations + success (PENDING) + settle ---- */
        const dests = await api('GET', '/wallet/destinations', tokenA);
        check('destinations returns masked accounts', dests.status === 200 && Array.isArray(dests.body) && dests.body.length >= 1, dests.body);

        const destID = dests.body[0].destinationID;
        const balBeforeWdl = await getBalance(USER_A.subscriberID);
        const wdl = await api('POST', '/wallet/withdraw', tokenA, { amount: 100, destinationID: destID });
        check('withdraw success -> 200 with FS-WDL ref', wdl.status === 200 && /^FS-WDL-\d{6}$/.test(wdl.body.reference || ''), wdl.body);
        check('withdraw returns PENDING (not completed)', wdl.body && wdl.body.status === 'pending', wdl.body);
        if (wdl.body && wdl.body.reference) createdTxRefs.push(wdl.body.reference);

        const aAfterWdl = await getBalance(USER_A.subscriberID);
        check('withdraw debited (held) by exactly 100', aAfterWdl === balBeforeWdl - 100, { balBeforeWdl, aAfterWdl });

        // The pending withdrawal transaction row should have status 'pending'
        const wdlRow = await query('SELECT status FROM WalletTransaction WHERE reference = @ref', { ref: wdl.body.reference });
        check('withdrawal row stored as pending', wdlRow.recordset.length === 1 && wdlRow.recordset[0].status === 'pending', wdlRow.recordset);

        // Settle it -> completed
        const settle = await api('POST', '/wallet/withdraw/' + wdl.body.transactionID + '/settle', tokenA);
        check('settle withdrawal -> 200 completed', settle.status === 200 && settle.body.status === 'completed', settle.body);
        const wdlRow2 = await query('SELECT status FROM WalletTransaction WHERE reference = @ref', { ref: wdl.body.reference });
        check('withdrawal row now completed', wdlRow2.recordset[0].status === 'completed', wdlRow2.recordset);

        // Ownership: user B cannot settle user A's withdrawal
        const settleCross = await api('POST', '/wallet/withdraw/' + wdl.body.transactionID + '/settle', tokenB);
        check('other user cannot settle that withdrawal -> 404', settleCross.status === 404, settleCross.status);

        const wdlBad = await api('POST', '/wallet/withdraw', tokenA, { amount: 100, destinationID: 999999 });
        check('withdraw to invalid destination -> 400', wdlBad.status === 400, wdlBad.status);

        const wdlNoDest = await api('POST', '/wallet/withdraw', tokenA, { amount: 100 });
        check('withdraw without destination -> 400', wdlNoDest.status === 400, wdlNoDest.status);

        const wdlOver = await api('POST', '/wallet/withdraw', tokenA, { amount: 999999, destinationID: destID });
        check('withdraw exceeding balance -> 400', wdlOver.status === 400, wdlOver.status);

        /* ---- ROLLBACK: a transfer that fails mid-way moves NO money ---- */
        // Force a failure by transferring to a recipient with no wallet (user 3/5).
        const noWalletUser = await query("SELECT TOP 1 subscriberID FROM Subscriber WHERE subscriberID NOT IN (SELECT subscriberID FROM VirtualWallet)", {});
        if (noWalletUser.recordset.length) {
            const targetSid = noWalletUser.recordset[0].subscriberID;
            const beforeRB = await getBalance(USER_A.subscriberID);
            const rb = await api('POST', '/wallet/transfer', tokenA, { recipientUserID: targetSid, amount: 50 });
            const afterRB = await getBalance(USER_A.subscriberID);
            check('transfer to walletless recipient -> 400', rb.status === 400, rb.status);
            check('failed transfer moved NO money (rollback)', beforeRB === afterRB, { beforeRB, afterRB });
        } else {
            console.log('  SKIP - rollback test (no walletless user available)');
        }

    } catch (err) {
        console.error('Test run error:', err);
        failed++;
    } finally {
        // ---- CLEANUP: delete test transactions, restore balances ----
        try {
            if (createdTxRefs.length) {
                await query(
                    "DELETE FROM WalletTransaction WHERE reference IN (SELECT value FROM STRING_SPLIT(@refs, ','))",
                    { refs: createdTxRefs.join(',') }
                );
            }
            // Remove any stray test rows left on the two wallets from this run
            await query(`DELETE FROM WalletTransaction
                         WHERE description = 'Transfer to Amy J — test transfer'
                            OR description LIKE 'Transfer from %— test transfer'`, {});
            await setBalance(USER_A.subscriberID, snapA);
            await setBalance(USER_B.subscriberID, snapB);
            console.log('\n  (cleanup) balances restored: A=' + snapA + ' B=' + snapB);
        } catch (cErr) {
            console.error('  cleanup error:', cErr.message);
        }

        console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
        try { await (await getPool()).close(); } catch (e) {}
        process.exit(failed === 0 ? 0 : 1);
    }
})();
