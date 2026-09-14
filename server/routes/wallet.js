/* ===========================================================
   /api/wallet — Merchant wallet
   Balance, transactions, add/withdraw/transfer, recipient
   resolution, transaction details, withdrawal destinations.

   Balance model (reuses existing VirtualWallet — no duplicate
   wallet table):
     balance    -> available merchant balance (spendable)
     pendingIn  -> pending incoming (not yet spendable)
     total      -> balance + pendingIn (computed, never stored)

   All money math and balance changes happen server-side. The
   client is never trusted for balances. Transfers run inside a
   real SQL transaction so a failure rolls the whole thing back.
=========================================================== */
const express = require('express');
const { sql, query, getPool } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { updateUserAnalytics } = require('../helpers/update-analytics');
const notificationEvents = require('../services/notificationEvents');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES, ENTITY_TYPES } = require('../constants/notificationTypes');

const router = express.Router();
router.use(authenticateToken);

/* ----------------------------------------------------------
   HELPERS
---------------------------------------------------------- */

/** Build a human-facing reference like FS-TRF-000123. */
function makeReference(prefix, id) {
    return `FS-${prefix}-${String(id).padStart(6, '0')}`;
}

/** Display name for a Subscriber row (preferredName > first last). */
function displayName(row) {
    if (!row) return 'FlexScribe User';
    if (row.preferredName && row.preferredName.trim()) return row.preferredName.trim();
    const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
    return full || (row.email || 'FlexScribe User');
}

/** Round to 2dp and return a Number (avoids float drift on money). */
function money(n) {
    return Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100;
}

/** Fetch the caller's wallet row, or null. */
async function getWalletBySubscriber(subscriberID) {
    const r = await query('SELECT * FROM VirtualWallet WHERE subscriberID = @id', { id: subscriberID });
    return r.recordset[0] || null;
}

/** Shape a raw WalletTransaction row for the API/frontend. */
function shapeTransaction(t) {
    return {
        transactionID: t.transactionID,
        reference: t.reference || null,
        type: t.transactionType,
        status: t.status || 'completed',
        amount: parseFloat(t.transactionAmount) || 0,
        runningBalance: t.runningBalance != null ? parseFloat(t.runningBalance) : null,
        balanceBefore: t.balanceBefore != null ? parseFloat(t.balanceBefore) : null,
        balanceAfter: t.balanceAfter != null ? parseFloat(t.balanceAfter) : null,
        description: t.description || '',
        category: t.category || null,
        recipientUserID: t.recipientUserID || null,
        recipientName: t.recipientName || null,
        senderName: t.senderName || null,
        failureReason: t.failureReason || null,
        completedAt: t.completedAt || null,
        date: t.transactionDate,
        metadata: t.metadata || null
    };
}

/* ===========================================================
   GET /api/wallet — balance summary (available/pending/total)
=========================================================== */
router.get('/', async (req, res) => {
    try {
        const w = await getWalletBySubscriber(req.user.subscriberID);
        if (!w) return res.status(404).json({ error: 'Wallet not found' });

        const available = parseFloat(w.balance) || 0;
        const pending = parseFloat(w.pendingIn) || 0;
        const pendingOut = parseFloat(w.pendingOut) || 0;

        // Return the raw row (back-compat) plus computed merchant fields.
        res.json({
            ...w,
            available,
            pending,
            pendingOut,
            total: money(available + pending)
        });
    } catch (err) {
        console.error('GET /wallet error:', err.message);
        res.status(500).json({ error: 'Could not load wallet' });
    }
});

/* ===========================================================
   GET /api/wallet/transactions — history with filters + paging
   Query params:
     type    credit|debit|transfer|refund|payment|transfer_in|
             transfer_out|withdrawal|adjustment  (optional)
     status  pending|completed|failed             (optional)
     limit   default 25, max 100
     offset  default 0
=========================================================== */
router.get('/transactions', async (req, res) => {
    try {
        const w = await getWalletBySubscriber(req.user.subscriberID);
        if (!w) return res.json({ transactions: [], total: 0, limit: 25, offset: 0 });

        let limit = parseInt(req.query.limit, 10);
        let offset = parseInt(req.query.offset, 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = 25;
        if (limit > 100) limit = 100;
        if (!Number.isFinite(offset) || offset < 0) offset = 0;

        const filters = ['t.walletID = @wid'];
        const params = { wid: w.walletID };

        if (req.query.type) { filters.push('t.transactionType = @type'); params.type = String(req.query.type); }
        if (req.query.status) { filters.push('t.status = @status'); params.status = String(req.query.status); }

        const whereClause = filters.join(' AND ');

        const countResult = await query(
            `SELECT COUNT(*) AS total FROM WalletTransaction t WHERE ${whereClause}`, params
        );
        const total = countResult.recordset[0].total;

        const pageResult = await query(`
            SELECT t.* FROM WalletTransaction t
            WHERE ${whereClause}
            ORDER BY t.transactionDate DESC, t.transactionID DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `, { ...params, offset, limit });

        res.json({
            transactions: pageResult.recordset.map(shapeTransaction),
            total,
            limit,
            offset
        });
    } catch (err) {
        console.error('GET /wallet/transactions error:', err.message);
        res.status(500).json({ error: 'Could not load transactions' });
    }
});

/* ===========================================================
   GET /api/wallet/transactions/:id — single transaction detail
   Ownership-checked: the tx must belong to the caller's wallet.
=========================================================== */
router.get('/transactions/:id', async (req, res) => {
    try {
        const txID = parseInt(req.params.id, 10);
        if (!Number.isFinite(txID)) return res.status(400).json({ error: 'Invalid transaction id' });

        const result = await query(`
            SELECT t.* FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE t.transactionID = @txID AND w.subscriberID = @sid
        `, { txID, sid: req.user.subscriberID });

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.json(shapeTransaction(result.recordset[0]));
    } catch (err) {
        console.error('GET /wallet/transactions/:id error:', err.message);
        res.status(500).json({ error: 'Could not load transaction' });
    }
});

/* ===========================================================
   GET /api/wallet/trends?metric=&period=
   Aggregates the caller's real WalletTransaction rows into
   time buckets for the trend chart.
     metric: income | expenses | savings
       income   -> credit, transfer_in, payment, refund
       expenses -> debit, transfer_out, withdrawal
       savings  -> transfer (money moved into goals)
     period: weekly (7 days) | monthly (~4 weeks) | yearly (12 months)
   Only 'completed' (or NULL legacy status) transactions count.
   Returns { labels:[...], values:[...], total }.
=========================================================== */
const TREND_TYPES = {
    income:   ['credit', 'transfer_in', 'payment', 'refund'],
    expenses: ['debit', 'transfer_out', 'withdrawal'],
    savings:  ['transfer']
};

router.get('/trends', async (req, res) => {
    try {
        const metric = TREND_TYPES[req.query.metric] ? req.query.metric : 'income';
        const period = ['weekly', 'monthly', 'yearly'].includes(req.query.period) ? req.query.period : 'monthly';
        const types = TREND_TYPES[metric];

        const w = await getWalletBySubscriber(req.user.subscriberID);
        if (!w) return res.json({ labels: [], values: [], total: 0, metric, period });

        // Build the "type IN (...)" clause with individual params (safe)
        const typeParams = {};
        const typePlaceholders = types.map((t, i) => { typeParams['t' + i] = t; return '@t' + i; }).join(', ');

        // Only completed (or legacy NULL) transactions
        const statusClause = "(t.status = 'completed' OR t.status IS NULL)";

        const now = new Date();
        let labels = [];
        let buckets = [];   // each: { label, start, end }

        if (period === 'weekly') {
            // Last 7 days ending today
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
                const end = new Date(d); end.setDate(end.getDate() + 1);
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                buckets.push({ label: days[d.getDay()], start: d, end });
            }
        } else if (period === 'monthly') {
            // Last 4 weeks (7-day windows), oldest first
            for (let i = 3; i >= 0; i--) {
                const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - (i * 7) + 1);
                const start = new Date(end); start.setDate(start.getDate() - 7);
                buckets.push({ label: 'W' + (4 - i), start, end });
            }
        } else { // yearly — last 12 months
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            for (let i = 11; i >= 0; i--) {
                const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                buckets.push({ label: months[start.getMonth()], start, end });
            }
        }

        const rangeStart = buckets[0].start;
        const rangeEnd = buckets[buckets.length - 1].end;

        // Pull matching transactions in range, then bucket them in JS
        const rows = await query(`
            SELECT t.transactionAmount AS amount, t.transactionDate AS date
            FROM WalletTransaction t
            WHERE t.walletID = @wid
              AND t.transactionType IN (${typePlaceholders})
              AND ${statusClause}
              AND t.transactionDate >= @rangeStart
              AND t.transactionDate < @rangeEnd
        `, Object.assign({ wid: w.walletID, rangeStart, rangeEnd }, typeParams));

        const values = buckets.map(() => 0);
        rows.recordset.forEach(function (r) {
            const dt = new Date(r.date);
            for (let i = 0; i < buckets.length; i++) {
                if (dt >= buckets[i].start && dt < buckets[i].end) {
                    values[i] += parseFloat(r.amount) || 0;
                    break;
                }
            }
        });

        labels = buckets.map(b => b.label);
        const rounded = values.map(v => Math.round((v + Number.EPSILON) * 100) / 100);
        const total = Math.round((rounded.reduce((s, v) => s + v, 0) + Number.EPSILON) * 100) / 100;

        res.json({ labels, values: rounded, total, metric, period });
    } catch (err) {
        console.error('GET /wallet/trends error:', err.message);
        res.status(500).json({ error: 'Could not load trends' });
    }
});

/* ===========================================================
   GET /api/wallet/recipients/:identifier — resolve a transfer
   recipient by email (primary) or exact name. Returns a safe,
   minimal profile. Never exposes another user's email back if
   looked up by name (privacy): only what was searched.
=========================================================== */
router.get('/recipients/:identifier', async (req, res) => {
    try {
        const identifier = String(req.params.identifier || '').trim();
        if (!identifier) return res.status(400).json({ error: 'Recipient identifier required' });

        const looksLikeEmail = identifier.includes('@');
        let row = null;

        if (looksLikeEmail) {
            const r = await query(
                `SELECT subscriberID, firstName, lastName, preferredName, email, avatarUrl
                 FROM Subscriber WHERE email = @ident`,
                { ident: identifier }
            );
            row = r.recordset[0] || null;
        } else {
            // Exact match on preferredName or "First Last"
            const r = await query(
                `SELECT subscriberID, firstName, lastName, preferredName, email, avatarUrl
                 FROM Subscriber
                 WHERE preferredName = @ident
                    OR LTRIM(RTRIM(firstName + ' ' + lastName)) = @ident`,
                { ident: identifier }
            );
            if (r.recordset.length === 1) row = r.recordset[0];
            else if (r.recordset.length > 1) {
                return res.status(409).json({ error: 'Multiple users match that name. Use their email instead.' });
            }
        }

        if (!row) return res.status(404).json({ error: 'No FlexScribe user found for that recipient' });

        // Cannot transfer to self
        if (row.subscriberID === req.user.subscriberID) {
            return res.status(400).json({ error: 'You cannot transfer to yourself' });
        }

        res.json({
            subscriberID: row.subscriberID,
            name: displayName(row),
            email: looksLikeEmail ? row.email : undefined,
            avatarUrl: row.avatarUrl || null
        });
    } catch (err) {
        console.error('GET /wallet/recipients error:', err.message);
        res.status(500).json({ error: 'Could not resolve recipient' });
    }
});

/* ===========================================================
   GET /api/wallet/destinations — simulated withdrawal targets
=========================================================== */
router.get('/destinations', async (req, res) => {
    try {
        const r = await query(
            `SELECT destinationID, bankName, accountLabel, accountMask, accountType, isDefault
             FROM WithdrawalDestination
             WHERE subscriberID = @sid AND isActive = 1
             ORDER BY isDefault DESC, destinationID ASC`,
            { sid: req.user.subscriberID }
        );
        res.json(r.recordset.map(d => ({
            destinationID: d.destinationID,
            bankName: d.bankName,
            accountLabel: d.accountLabel,
            accountMask: d.accountMask,
            accountType: d.accountType,
            isDefault: !!d.isDefault,
            label: `${d.bankName} ${d.accountMask}`
        })));
    } catch (err) {
        console.error('GET /wallet/destinations error:', err.message);
        res.status(500).json({ error: 'Could not load destinations' });
    }
});

/* ===========================================================
   POST /api/wallet/add-funds — (existing behaviour, extended
   with reference/status/balance trail)
=========================================================== */
async function topUpHandler(req, res) {
    try {
        const amount = money(req.body.amount);
        // Accept either `method` (new flow) or `source` (legacy) for the funding label
        const source = req.body.method || req.body.source;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount greater than R0.00.' });

        const w = await getWalletBySubscriber(req.user.subscriberID);
        if (!w) return res.status(404).json({ error: 'Wallet not found' });

        const before = parseFloat(w.balance) || 0;
        const after = money(before + amount);

        await query('UPDATE VirtualWallet SET balance = @bal, lastTopUpDate = GETDATE() WHERE walletID = @wid',
            { bal: after, wid: w.walletID });

        const ins = await query(`
            INSERT INTO WalletTransaction
                (walletID, transactionType, transactionAmount, runningBalance,
                 balanceBefore, balanceAfter, status, description, category, completedAt)
            OUTPUT INSERTED.transactionID
            VALUES (@wid, 'credit', @amount, @after, @before, @after, 'completed', @desc, 'deposit', GETDATE())
        `, { wid: w.walletID, amount, after, before, desc: 'Funds added via ' + (source || 'Bank Transfer') });

        const txID = ins.recordset[0].transactionID;
        const reference = makeReference('DEP', txID);
        await query('UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id', { ref: reference, id: txID });

        res.json({ message: 'Funds added', balance: after, reference, transactionID: txID, status: 'completed' });

        // ── Side effects (post-response) ──
        updateUserAnalytics(req.user.subscriberID);
        notificationEvents.clearLowBalanceState(req.user.subscriberID, after);
        try {
            await notificationService.createNotification({
                subscriberID: req.user.subscriberID,
                type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
                title: 'Top up successful',
                message: `R${amount.toFixed(2)} was added to your wallet.`,
                relatedEntityType: ENTITY_TYPES.TRANSACTION,
                relatedEntityID: txID,
                eventToken: reference,
                metadata: { reference, amount, method: source || 'Bank Transfer' }
            });
        } catch (nErr) {
            console.warn('Top-up notification failed:', nErr.message);
        }
    } catch (err) {
        console.error('POST /wallet/top-up error:', err.message);
        res.status(500).json({ error: 'Could not add funds' });
    }
}

// Top Up — new canonical route + legacy alias (same handler, no duplication)
router.post('/top-up', topUpHandler);
router.post('/add-funds', topUpHandler);

/* ===========================================================
   POST /api/wallet/transfer — atomic transfer to another user
   Body: { recipientUserID | recipient (email/name), amount, note }
   • Resolves + validates recipient
   • Debits sender available balance, credits recipient available
   • Writes BOTH transaction rows (transfer_out + transfer_in)
   • Everything in ONE SQL transaction; any error => full rollback
   • Reference FS-TRF-XXXXXX shared by both legs
=========================================================== */
router.post('/transfer', async (req, res) => {
    const amount = money(req.body.amount);
    const note = (req.body.note || '').toString().slice(0, 180);

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    let pool;
    let transaction;
    try {
        pool = await getPool();

        // ── Resolve recipient (outside tx; read-only) ──
        let recipientRow = null;
        if (req.body.recipientUserID) {
            const rid = parseInt(req.body.recipientUserID, 10);
            const r = await query(
                'SELECT subscriberID, firstName, lastName, preferredName, email FROM Subscriber WHERE subscriberID = @rid',
                { rid }
            );
            recipientRow = r.recordset[0] || null;
        } else if (req.body.recipient) {
            const ident = String(req.body.recipient).trim();
            const byEmail = ident.includes('@');
            const r = await query(
                byEmail
                    ? 'SELECT subscriberID, firstName, lastName, preferredName, email FROM Subscriber WHERE email = @ident'
                    : `SELECT subscriberID, firstName, lastName, preferredName, email FROM Subscriber
                       WHERE preferredName = @ident OR LTRIM(RTRIM(firstName + ' ' + lastName)) = @ident`,
                { ident }
            );
            if (r.recordset.length > 1) return res.status(409).json({ error: 'Multiple users match that name. Use their email.' });
            recipientRow = r.recordset[0] || null;
        } else {
            return res.status(400).json({ error: 'Recipient is required' });
        }

        if (!recipientRow) return res.status(404).json({ error: 'Recipient not found' });
        if (recipientRow.subscriberID === req.user.subscriberID) {
            return res.status(400).json({ error: 'You cannot transfer to yourself' });
        }

        // ── Begin atomic transaction (SERIALIZABLE for balance safety) ──
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        const txReq = () => new sql.Request(transaction);

        // Lock + read sender wallet
        const senderWalletRes = await txReq()
            .input('sid', req.user.subscriberID)
            .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @sid');
        const senderWallet = senderWalletRes.recordset[0];
        if (!senderWallet) { await transaction.rollback(); return res.status(404).json({ error: 'Your wallet was not found' }); }

        // Lock + read recipient wallet
        const recipWalletRes = await txReq()
            .input('rid', recipientRow.subscriberID)
            .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @rid');
        const recipWallet = recipWalletRes.recordset[0];
        if (!recipWallet) { await transaction.rollback(); return res.status(400).json({ error: 'Recipient does not have a wallet' }); }

        const senderBefore = parseFloat(senderWallet.balance) || 0;
        if (senderBefore < amount) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        const senderAfter = money(senderBefore - amount);
        const recipBefore = parseFloat(recipWallet.balance) || 0;
        const recipAfter = money(recipBefore + amount);

        // Snapshot display names
        const senderProfileRes = await txReq()
            .input('sid', req.user.subscriberID)
            .query('SELECT firstName, lastName, preferredName, email FROM Subscriber WHERE subscriberID = @sid');
        const senderName = displayName(senderProfileRes.recordset[0]);
        const recipName = displayName(recipientRow);

        // Update balances
        await txReq()
            .input('bal', senderAfter).input('wid', senderWallet.walletID)
            .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');
        await txReq()
            .input('bal', recipAfter).input('wid', recipWallet.walletID)
            .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');

        // Sender leg (transfer_out) — insert to obtain ID for the shared reference
        const outIns = await txReq()
            .input('wid', senderWallet.walletID)
            .input('rid', recipientRow.subscriberID)
            .input('amt', amount)
            .input('before', senderBefore)
            .input('after', senderAfter)
            .input('desc', 'Transfer to ' + recipName + (note ? ' — ' + note : ''))
            .input('rname', recipName)
            .input('sname', senderName)
            .query(`INSERT INTO WalletTransaction
                (walletID, recipientUserID, transactionType, transactionAmount, runningBalance,
                 balanceBefore, balanceAfter, status, description, category, recipientName, senderName, completedAt)
                OUTPUT INSERTED.transactionID
                VALUES (@wid, @rid, 'transfer_out', @amt, @after, @before, @after, 'completed', @desc, 'transfer', @rname, @sname, GETDATE())`);
        const outID = outIns.recordset[0].transactionID;
        const reference = makeReference('TRF', outID);

        // Recipient leg (transfer_in), sharing the same reference
        const inIns = await txReq()
            .input('wid', recipWallet.walletID)
            .input('rid', req.user.subscriberID)
            .input('amt', amount)
            .input('before', recipBefore)
            .input('after', recipAfter)
            .input('desc', 'Transfer from ' + senderName + (note ? ' — ' + note : ''))
            .input('rname', recipName)
            .input('sname', senderName)
            .input('ref', reference)
            .query(`INSERT INTO WalletTransaction
                (walletID, recipientUserID, transactionType, transactionAmount, runningBalance,
                 balanceBefore, balanceAfter, status, description, category, recipientName, senderName, reference, completedAt)
                OUTPUT INSERTED.transactionID
                VALUES (@wid, @rid, 'transfer_in', @amt, @after, @before, @after, 'completed', @desc, 'transfer', @rname, @sname, @ref, GETDATE())`);
        const inID = inIns.recordset[0].transactionID;

        // Stamp the shared reference on the sender leg too
        await txReq()
            .input('ref', reference).input('id', outID)
            .query('UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id');

        await transaction.commit();

        res.json({
            message: 'Transfer complete',
            reference,
            amount,
            balance: senderAfter,
            recipient: { subscriberID: recipientRow.subscriberID, name: recipName },
            transactionID: outID
        });

        // ── Side effects (post-commit; failures here don't undo the transfer) ──
        updateUserAnalytics(req.user.subscriberID);
        updateUserAnalytics(recipientRow.subscriberID);
        notificationEvents.lowBalanceCheck(req.user.subscriberID, senderBefore, senderAfter);
        try {
            await notificationService.createNotification({
                subscriberID: recipientRow.subscriberID,
                type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
                title: 'Money received',
                message: `${senderName} sent you R${amount.toFixed(2)}.`,
                relatedEntityType: ENTITY_TYPES.TRANSACTION,
                relatedEntityID: inID,
                eventToken: reference,
                metadata: { reference, amount, from: senderName }
            });
        } catch (nErr) {
            console.warn('Transfer notification failed:', nErr.message);
        }
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (rbErr) { /* already rolled back */ }
        }
        console.error('POST /wallet/transfer error:', err.message);
        res.status(500).json({ error: 'Transfer failed. No funds were moved.' });
    }
});

/* ===========================================================
   POST /api/wallet/withdraw — payout to a simulated bank
   destination. Debits available balance immediately, records a
   PENDING transaction, then "settles" it to COMPLETED (simulated
   clearing). Reference FS-WDL-XXXXXX.
   Body: { amount, destinationID | destination }
=========================================================== */
router.post('/withdraw', async (req, res) => {
    try {
        const amount = money(req.body.amount);
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

        const w = await getWalletBySubscriber(req.user.subscriberID);
        if (!w) return res.status(404).json({ error: 'Wallet not found' });

        // Resolve destination label (simulated, masked)
        let destLabel = req.body.destination ? String(req.body.destination).slice(0, 90) : null;
        if (req.body.destinationID) {
            const d = await query(
                `SELECT bankName, accountMask FROM WithdrawalDestination
                 WHERE destinationID = @did AND subscriberID = @sid AND isActive = 1`,
                { did: parseInt(req.body.destinationID, 10), sid: req.user.subscriberID }
            );
            if (d.recordset.length === 0) return res.status(400).json({ error: 'Invalid withdrawal destination' });
            destLabel = `${d.recordset[0].bankName} ${d.recordset[0].accountMask}`;
        }
        if (!destLabel) return res.status(400).json({ error: 'A withdrawal destination is required' });

        const before = parseFloat(w.balance) || 0;
        if (before < amount) return res.status(400).json({ error: 'Insufficient balance' });

        const after = money(before - amount);

        // Debit immediately, record as PENDING
        await query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid', { bal: after, wid: w.walletID });

        const ins = await query(`
            INSERT INTO WalletTransaction
                (walletID, transactionType, transactionAmount, runningBalance,
                 balanceBefore, balanceAfter, status, description, category, metadata)
            OUTPUT INSERTED.transactionID
            VALUES (@wid, 'withdrawal', @amount, @after, @before, @after, 'pending', @desc, 'withdrawal', @meta)
        `, {
            wid: w.walletID, amount, after, before,
            desc: 'Withdrawal to ' + destLabel,
            meta: JSON.stringify({ destination: destLabel })
        });

        const txID = ins.recordset[0].transactionID;
        const reference = makeReference('WDL', txID);

        // The funds are already debited (held), but the payout stays PENDING —
        // like a real bank withdrawal that clears later. A scheduled process
        // (or the /withdraw/:id/settle dev endpoint) marks it completed. We do
        // NOT fake completion here.
        await query(
            'UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id',
            { ref: reference, id: txID }
        );

        res.json({
            message: 'Withdrawal submitted',
            reference,
            amount,
            balance: after,
            destination: destLabel,
            status: 'pending',
            transactionID: txID
        });

        updateUserAnalytics(req.user.subscriberID);
        notificationEvents.lowBalanceCheck(req.user.subscriberID, before, after);
        try {
            await notificationService.createNotification({
                subscriberID: req.user.subscriberID,
                type: NOTIFICATION_TYPES.SYSTEM,
                title: 'Withdrawal submitted',
                message: `Your R${amount.toFixed(2)} withdrawal to ${destLabel} is being processed.`,
                relatedEntityType: ENTITY_TYPES.TRANSACTION,
                relatedEntityID: txID,
                eventToken: reference,
                metadata: { reference, amount, destination: destLabel, status: 'pending' }
            });
        } catch (nErr) {
            console.warn('Withdrawal notification failed:', nErr.message);
        }
    } catch (err) {
        console.error('POST /wallet/withdraw error:', err.message);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

/* ===========================================================
   POST /api/wallet/withdraw/:id/settle — mark a PENDING
   withdrawal as completed (simulates the payout clearing).
   Ownership-checked. Idempotent: settling an already-completed
   withdrawal is a no-op success.
=========================================================== */
router.post('/withdraw/:id/settle', async (req, res) => {
    try {
        const txID = parseInt(req.params.id, 10);
        if (!Number.isFinite(txID)) return res.status(400).json({ error: 'Invalid transaction id' });

        const r = await query(`
            SELECT t.transactionID, t.status FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE t.transactionID = @txID AND w.subscriberID = @sid AND t.transactionType = 'withdrawal'
        `, { txID, sid: req.user.subscriberID });

        if (r.recordset.length === 0) return res.status(404).json({ error: 'Withdrawal not found' });

        if (r.recordset[0].status !== 'completed') {
            await query(
                "UPDATE WalletTransaction SET status = 'completed', completedAt = GETDATE() WHERE transactionID = @txID",
                { txID }
            );
        }
        res.json({ message: 'Withdrawal completed', transactionID: txID, status: 'completed' });
    } catch (err) {
        console.error('POST /wallet/withdraw/:id/settle error:', err.message);
        res.status(500).json({ error: 'Could not settle withdrawal' });
    }
});

/* ===========================================================
   POST /api/wallet/transfer-to-goal — (existing behaviour)
=========================================================== */
router.post('/transfer-to-goal', async (req, res) => {
    try {
        const amount = money(req.body.amount);
        const goalID = req.body.goalID;
        if (!amount || amount <= 0 || !goalID) return res.status(400).json({ error: 'Amount and goalID required' });

        const w = await getWalletBySubscriber(req.user.subscriberID);
        if (!w) return res.status(404).json({ error: 'Wallet not found' });

        const before = parseFloat(w.balance) || 0;
        if (before < amount) return res.status(400).json({ error: 'Insufficient balance' });

        const after = money(before - amount);
        await query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid', { bal: after, wid: w.walletID });

        await query('UPDATE FinancialGoal SET currentProgress = currentProgress + @amount, lastTopUpDate = GETDATE() WHERE goalID = @gid',
            { amount, gid: goalID });
        await query('INSERT INTO GoalContribution (goalID, amount, source) VALUES (@gid, @amt, @src)',
            { gid: goalID, amt: amount, src: 'wallet' });

        const goal = await query('SELECT goalName, currentProgress, targetAmount FROM FinancialGoal WHERE goalID = @gid', { gid: goalID });
        const goalRow = goal.recordset[0] || {};
        const goalName = goalRow.goalName || 'Goal';

        const ins = await query(`
            INSERT INTO WalletTransaction
                (walletID, goalID, transactionType, transactionAmount, runningBalance,
                 balanceBefore, balanceAfter, status, description, category, completedAt)
            OUTPUT INSERTED.transactionID
            VALUES (@wid, @gid, 'transfer', @amount, @after, @before, @after, 'completed', @desc, 'transfer', GETDATE())
        `, { wid: w.walletID, gid: goalID, amount, after, before, desc: 'Transfer to ' + goalName });

        const reference = makeReference('GOL', ins.recordset[0].transactionID);
        await query('UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id',
            { ref: reference, id: ins.recordset[0].transactionID });

        res.json({ message: 'Transferred to goal', balance: after, reference });
        updateUserAnalytics(req.user.subscriberID);
        notificationEvents.lowBalanceCheck(req.user.subscriberID, before, after);
        notificationEvents.goalMilestoneCheck(
            req.user.subscriberID, goalID, goalName,
            goalRow.currentProgress, goalRow.targetAmount
        );
    } catch (err) {
        console.error('POST /wallet/transfer-to-goal error:', err.message);
        res.status(500).json({ error: 'Could not transfer to goal' });
    }
});

module.exports = router;
