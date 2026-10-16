/* ===========================================================
   /api/goals — CRUD for financial goals + contributions
=========================================================== */
const express = require('express');
const { sql, query, getPool } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { updateUserAnalytics } = require('../helpers/update-analytics');
const notificationEvents = require('../services/notificationEvents');
const scribeScore = require('../helpers/scribe-score');

const router = express.Router();
router.use(authenticateToken);

/* ----------------------------------------------------------
   MONEY HELPERS (mirror the wallet route's conventions so goal
   money movement is consistent with the rest of the wallet).
---------------------------------------------------------- */

/** Round to 2dp and return a Number (avoids float drift on money). */
function money(n) {
    return Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100;
}

/** Human-facing reference like FS-GOAL-000123. */
function makeReference(prefix, id) {
    return `FS-${prefix}-${String(id).padStart(6, '0')}`;
}

/* Return a goal's saved funds to the owner's wallet exactly once.
   Runs INSIDE an existing sql.Transaction. Credits the wallet with
   the goal's currentProgress, writes a 'refund' WalletTransaction,
   and sets fundsReturned = 1 so it can never double-refund.
   Returns the refunded amount (0 if nothing to return). */
async function _returnGoalFundsTx(transaction, subscriberID, goal) {
    const amount = money(goal.currentProgress);
    if (!amount || amount <= 0) return 0;
    if (goal.fundsReturned) return 0;

    const req = () => new sql.Request(transaction);

    // Lock + read the wallet.
    const wRes = await req()
        .input('sid', subscriberID)
        .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @sid');
    const wallet = wRes.recordset[0];
    if (!wallet) return 0; // no wallet to refund into

    const before = parseFloat(wallet.balance) || 0;
    const after = money(before + amount);

    await req()
        .input('bal', after).input('wid', wallet.walletID)
        .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');

    const ins = await req()
        .input('wid', wallet.walletID)
        .input('amt', amount)
        .input('after', after)
        .input('before', before)
        .input('desc', 'Goal funds returned — ' + goal.goalName)
        .query(`INSERT INTO WalletTransaction
            (walletID, transactionType, transactionAmount, runningBalance,
             balanceBefore, balanceAfter, status, description, category, completedAt)
            OUTPUT INSERTED.transactionID
            VALUES (@wid, 'refund', @amt, @after, @before, @after, 'completed', @desc, 'savings', GETDATE())`);
    const txID = ins.recordset[0].transactionID;
    const reference = makeReference('GRF', txID);
    await req()
        .input('ref', reference).input('id', txID)
        .query('UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id');

    // Record the matching (negative) goal contribution + flag.
    await req()
        .input('gid', goal.goalID).input('amt', -amount)
        .query("INSERT INTO GoalContribution (goalID, amount, source, note) VALUES (@gid, @amt, 'refund', 'Returned to wallet')");
    await req()
        .input('gid', goal.goalID)
        .query('UPDATE FinancialGoal SET fundsReturned = 1 WHERE goalID = @gid');

    return amount;
}

/* Lazy expiry sweep: any ACTIVE goal whose deadline has passed is
   marked 'expired' and its funds returned to the wallet. Safe to call
   on every goals read; only touches goals that actually expired. */
async function _sweepExpiredGoals(subscriberID) {
    const due = await query(`
        SELECT goalID, goalName, currentProgress, fundsReturned
        FROM FinancialGoal
        WHERE subscriberID = @sid
          AND goalStatus = 'active'
          AND deadline IS NOT NULL
          AND deadline < CAST(GETDATE() AS DATE)
    `, { sid: subscriberID });

    if (!due.recordset.length) return;

    const pool = await getPool();
    for (const goal of due.recordset) {
        const transaction = new sql.Transaction(pool);
        try {
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            await _returnGoalFundsTx(transaction, subscriberID, goal);
            await new sql.Request(transaction)
                .input('gid', goal.goalID)
                .query("UPDATE FinancialGoal SET goalStatus = 'expired' WHERE goalID = @gid");
            await transaction.commit();
        } catch (err) {
            try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
            console.warn('Goal expiry sweep failed for goal', goal.goalID, err.message);
        }
    }
    updateUserAnalytics(subscriberID);
}

// GET /api/goals
router.get('/', async (req, res) => {
    try {
        // Return funds for any goal that expired since the last read.
        await _sweepExpiredGoals(req.user.subscriberID);

        const result = await query(`
            SELECT * FROM FinancialGoal WHERE subscriberID = @id ORDER BY createdAt DESC
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/goals/:id
router.get('/:id', async (req, res) => {
    try {
        const goal = await query('SELECT * FROM FinancialGoal WHERE goalID = @gid AND subscriberID = @sid', {
            gid: parseInt(req.params.id), sid: req.user.subscriberID
        });
        if (goal.recordset.length === 0) return res.status(404).json({ error: 'Goal not found' });

        const contributions = await query('SELECT * FROM GoalContribution WHERE goalID = @gid ORDER BY createdAt DESC', { gid: parseInt(req.params.id) });

        res.json({ ...goal.recordset[0], contributions: contributions.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals
router.post('/', async (req, res) => {
    try {
        const { goalName, targetAmount, deadline, imageUrl } = req.body;
        if (!goalName || !targetAmount) return res.status(400).json({ error: 'Goal name and target amount required' });

        const result = await query(`
            INSERT INTO FinancialGoal (subscriberID, goalName, targetAmount, deadline, imageUrl)
            OUTPUT INSERTED.*
            VALUES (@sid, @name, @target, @deadline, @img)
        `, { sid: req.user.subscriberID, name: goalName, target: targetAmount, deadline: deadline || null, img: imageUrl || null });

        const createdGoal = result.recordset[0];
        res.status(201).json(createdGoal);
        updateUserAnalytics(req.user.subscriberID);
        // Scribe Score: +10 once for creating a valid financial goal.
        scribeScore.awardGoalCreated(req.user.subscriberID, createdGoal.goalID)
            .catch(e => console.error('[score] goal_created:', e.message));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/goals/:id
router.put('/:id', async (req, res) => {
    try {
        const { goalName, targetAmount, deadline, imageUrl, goalStatus } = req.body;

        // Build dynamic SET clause to avoid CHECK constraint violations
        const sets = [];
        const params = { gid: parseInt(req.params.id), sid: req.user.subscriberID };

        if (goalName) { sets.push('goalName = @name'); params.name = goalName; }
        if (targetAmount !== undefined && targetAmount !== null) { sets.push('targetAmount = @target'); params.target = parseFloat(targetAmount); }
        if (deadline !== undefined) { sets.push('deadline = @deadline'); params.deadline = deadline || null; }
        if (imageUrl !== undefined) { sets.push('imageUrl = @img'); params.img = imageUrl || null; }
        if (goalStatus && ['active', 'completed', 'paused', 'expired'].includes(goalStatus)) { sets.push('goalStatus = @status'); params.status = goalStatus; }

        if (sets.length === 0) return res.json({ message: 'Nothing to update' });

        // EXPIRED goals (deadline missed) auto-return their funds to the
        // wallet. COMPLETED goals do NOT — the user must click "Accept Funds"
        // (POST /goals/:id/accept-funds) to release them.
        if (goalStatus === 'expired') {
            const pool = await getPool();
            const transaction = new sql.Transaction(pool);
            try {
                await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
                const gRes = await new sql.Request(transaction)
                    .input('gid', params.gid).input('sid', params.sid)
                    .query(`SELECT goalID, goalName, currentProgress, fundsReturned
                            FROM FinancialGoal WITH (UPDLOCK, HOLDLOCK)
                            WHERE goalID = @gid AND subscriberID = @sid`);
                const g = gRes.recordset[0];
                if (g) await _returnGoalFundsTx(transaction, params.sid, g);
                await transaction.commit();
                updateUserAnalytics(params.sid);
            } catch (refundErr) {
                try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
                console.error('Goal close refund failed:', refundErr.message);
                return res.status(500).json({ error: 'Could not return goal funds.' });
            }
        }

        await query(`
            UPDATE FinancialGoal SET ${sets.join(', ')}
            WHERE goalID = @gid AND subscriberID = @sid
        `, params);

        // Manually completing a goal awards +5 ScribeScore (once per goal).
        if (goalStatus === 'completed') {
            scribeScore.awardGoalCompleted(params.sid, params.gid)
                .catch(e => console.warn('Goal-completed ScribeScore award failed:', e.message));
        }

        res.json({ message: 'Goal updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/goals/:id
//   Deleting a goal that still holds funds returns those funds to the
//   wallet first (so money is never destroyed), then removes the goal.
router.delete('/:id', async (req, res) => {
    const goalID = parseInt(req.params.id);
    const subscriberID = req.user.subscriberID;
    let transaction;
    try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const req2 = () => new sql.Request(transaction);

        const gRes = await req2()
            .input('gid', goalID).input('sid', subscriberID)
            .query(`SELECT goalID, goalName, currentProgress, fundsReturned
                    FROM FinancialGoal WITH (UPDLOCK, HOLDLOCK)
                    WHERE goalID = @gid AND subscriberID = @sid`);
        const goal = gRes.recordset[0];

        if (goal) {
            // Return any still-held funds before deleting.
            await _returnGoalFundsTx(transaction, subscriberID, goal);
            await req2().input('gid', goalID).query('DELETE FROM GoalContribution WHERE goalID = @gid');
            await req2().input('gid', goalID).input('sid', subscriberID)
                .query('DELETE FROM FinancialGoal WHERE goalID = @gid AND subscriberID = @sid');
        }

        await transaction.commit();
        res.json({ message: 'Goal deleted' });
        updateUserAnalytics(subscriberID);
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) { /* already rolled back */ } }
        console.error('DELETE /goals/:id error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals/:id/contribute
//   Moves money FROM the user's wallet INTO the goal, atomically.
//   • amount must be > 0
//   • amount must not exceed the current wallet balance
//   • wallet is debited and a WalletTransaction is recorded
//   • if the goal reaches its target it is marked completed, but its
//     funds STAY in the goal until the user accepts them via
//     POST /goals/:id/accept-funds
router.post('/:id/contribute', async (req, res) => {
    const goalID = parseInt(req.params.id);
    const subscriberID = req.user.subscriberID;
    const amount = money(req.body.amount);
    const source = req.body.source || 'wallet';

    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    let transaction;
    try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const req2 = () => new sql.Request(transaction);

        // Lock + validate the goal (must belong to the caller + be active).
        const goalRes = await req2()
            .input('gid', goalID).input('sid', subscriberID)
            .query(`SELECT goalID, goalName, targetAmount, currentProgress, goalStatus, fundsReturned
                    FROM FinancialGoal WITH (UPDLOCK, HOLDLOCK)
                    WHERE goalID = @gid AND subscriberID = @sid`);
        const goal = goalRes.recordset[0];
        if (!goal) { await transaction.rollback(); return res.status(404).json({ error: 'Goal not found' }); }
        if (goal.goalStatus !== 'active') {
            await transaction.rollback();
            return res.status(400).json({ error: 'You can only add funds to an active goal.' });
        }

        // Lock + validate the wallet balance.
        const wRes = await req2()
            .input('sid', subscriberID)
            .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @sid');
        const wallet = wRes.recordset[0];
        if (!wallet) { await transaction.rollback(); return res.status(404).json({ error: 'Wallet not found' }); }

        const walletBefore = parseFloat(wallet.balance) || 0;
        if (amount > walletBefore) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Amount exceeds your wallet balance.' });
        }

        // Debit the wallet.
        const walletAfter = money(walletBefore - amount);
        await req2()
            .input('bal', walletAfter).input('wid', wallet.walletID)
            .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');

        const txIns = await req2()
            .input('wid', wallet.walletID)
            .input('amt', amount)
            .input('after', walletAfter)
            .input('before', walletBefore)
            .input('desc', 'Contribution to goal — ' + goal.goalName)
            .query(`INSERT INTO WalletTransaction
                (walletID, transactionType, transactionAmount, runningBalance,
                 balanceBefore, balanceAfter, status, description, category, completedAt)
                OUTPUT INSERTED.transactionID
                VALUES (@wid, 'transfer_out', @amt, @after, @before, @after, 'completed', @desc, 'savings', GETDATE())`);
        const walletTxID = txIns.recordset[0].transactionID;
        const reference = makeReference('GOAL', walletTxID);
        await req2()
            .input('ref', reference).input('id', walletTxID)
            .query('UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id');

        // Credit the goal.
        const newProgress = money(parseFloat(goal.currentProgress) + amount);
        await req2()
            .input('prog', newProgress).input('gid', goalID)
            .query('UPDATE FinancialGoal SET currentProgress = @prog, lastTopUpDate = GETDATE() WHERE goalID = @gid');
        await req2()
            .input('gid', goalID).input('amt', amount).input('src', source)
            .query("INSERT INTO GoalContribution (goalID, amount, source) VALUES (@gid, @amt, @src)");

        // Completed? Mark it completed but DO NOT auto-return the funds — they
        // stay in the goal until the user explicitly accepts them (via the
        // Accept Funds button -> POST /goals/:id/accept-funds).
        let completed = false;
        if (newProgress >= parseFloat(goal.targetAmount)) {
            completed = true;
            await req2()
                .input('gid', goalID)
                .query("UPDATE FinancialGoal SET goalStatus = 'completed' WHERE goalID = @gid");
        }

        await transaction.commit();

        res.json({
            message: 'Contribution added',
            goalProgress: newProgress,
            walletBalance: walletAfter,   // funds remain in the goal on completion
            completed,
            refunded: 0
        });

        // ── Side effects (post-commit) ──
        updateUserAnalytics(subscriberID);
        notificationEvents.goalMilestoneCheck(
            subscriberID, goalID, goal.goalName, newProgress, goal.targetAmount
        );
        // Scribe Score (Financial Goals): award +5 for each 25/50/75/100%
        // milestone newly reached (idempotent per milestone per goal).
        const target = parseFloat(goal.targetAmount) || 0;
        if (target > 0) {
            const pct = Math.min(100, (newProgress / target) * 100);
            scribeScore.awardGoalProgress(subscriberID, goalID, pct)
                .catch(e => console.error('[score] goal_milestone:', e.message));
        }
        // Reaching a goal also awards the legacy +5 completion event (once per goal).
        if (completed) {
            scribeScore.awardGoalCompleted(subscriberID, goalID)
                .catch(e => console.warn('Goal-completed ScribeScore award failed:', e.message));
        }
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) { /* already rolled back */ } }
        console.error('POST /goals/:id/contribute error:', err.message);
        res.status(500).json({ error: 'Could not add funds. No money was moved.' });
    }
});

/* ----------------------------------------------------------
   POST /api/goals/:id/accept-funds
   Releases a COMPLETED goal's saved funds back to the wallet.
   The funds are not returned automatically on completion — the
   user clicks "Accept Funds". Atomic + idempotent (fundsReturned
   guards against a double credit).
---------------------------------------------------------- */
router.post('/:id/accept-funds', async (req, res) => {
    const goalID = parseInt(req.params.id);
    const subscriberID = req.user.subscriberID;

    let transaction;
    try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const req2 = () => new sql.Request(transaction);

        // Lock + validate the goal (must belong to the caller).
        const gRes = await req2()
            .input('gid', goalID).input('sid', subscriberID)
            .query(`SELECT goalID, goalName, targetAmount, currentProgress, goalStatus, fundsReturned
                    FROM FinancialGoal WITH (UPDLOCK, HOLDLOCK)
                    WHERE goalID = @gid AND subscriberID = @sid`);
        const goal = gRes.recordset[0];
        if (!goal) { await transaction.rollback(); return res.status(404).json({ error: 'Goal not found' }); }

        if (goal.goalStatus !== 'completed') {
            await transaction.rollback();
            return res.status(400).json({ error: 'Only a completed goal can release its funds.' });
        }
        if (goal.fundsReturned) {
            await transaction.rollback();
            return res.status(400).json({ error: 'These funds have already been accepted.' });
        }

        const refunded = await _returnGoalFundsTx(transaction, subscriberID, goal);

        // Read the resulting wallet balance to return to the client.
        const wRes = await req2()
            .input('sid', subscriberID)
            .query('SELECT balance FROM VirtualWallet WHERE subscriberID = @sid');
        const walletBalance = wRes.recordset.length ? parseFloat(wRes.recordset[0].balance) || 0 : 0;

        await transaction.commit();

        res.json({
            message: 'Funds accepted',
            goalID,
            refunded,
            walletBalance
        });

        // Keep analytics in sync (non-blocking).
        updateUserAnalytics(subscriberID);
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) { /* already rolled back */ } }
        console.error('POST /goals/:id/accept-funds error:', err.message);
        res.status(500).json({ error: 'Could not accept funds. No money was moved.' });
    }
});

module.exports = router;
