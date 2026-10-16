/* ===========================================================
   /api/dependants — Manage dependant accounts
=========================================================== */
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool, query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES, ENTITY_TYPES } = require('../constants/notificationTypes');

const router = express.Router();
router.use(authenticateToken);

/** Reference like FS-DEP-000123. */
function makeReference(prefix, id) {
    return `FS-${prefix}-${String(id).padStart(6, '0')}`;
}

// GET /api/dependants
router.get('/', async (req, res) => {
    try {
        // totalReceived = sum of every wallet transfer tagged to this dependant.
        const result = await query(`
            SELECT d.*, s.firstName, s.lastName, s.email, s.avatarUrl, s.dateOfBirth,
                   ISNULL((
                       SELECT SUM(t.transactionAmount)
                       FROM WalletTransaction t
                       WHERE t.dependantID = d.dependantID AND t.category = 'dependant'
                   ), 0) AS totalReceived
            FROM Dependant d
            JOIN Subscriber s ON d.dependantID = s.subscriberID
            WHERE d.mainMemberID = @id
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/dependants
router.post('/', async (req, res) => {
    try {
        const { firstName, lastName, email, relationship, allowance, spendingLimit, dateOfBirth } = req.body;
        if (!firstName || !email) return res.status(400).json({ error: 'Name and email are required' });

        // Calculate age from dateOfBirth
        let age = null;
        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            const today = new Date();
            age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
        }

        // Create subscriber record for dependant
        const passwordHash = await bcrypt.hash('temp_' + Date.now(), 10);
        const sub = await query(`
            INSERT INTO Subscriber (firstName, lastName, email, passwordHash, userType, dateOfBirth, scribeScore, marketingOptIn, twoFactorEnabled, theme, notifyPayments, notifyGoals, notifyWeekly, createdAt, updatedAt)
            OUTPUT INSERTED.subscriberID
            VALUES (@fn, @ln, @email, @hash, 'Dependant', @dob, 0, 0, 0, 'dark', 1, 1, 0, GETDATE(), GETDATE())
        `, { fn: firstName, ln: lastName || '', email, hash: passwordHash, dob: dateOfBirth || null });

        const depID = sub.recordset[0].subscriberID;

        // Create dependant record with calculated age
        await query(`
            INSERT INTO Dependant (dependantID, mainMemberID, relationship, allowance, spendingLimit, age, status, canSpend, canViewWallet, canRequestFunds)
            VALUES (@did, @mid, @rel, @allowance, @limit, @age, 'invited', 1, 0, 1)
        `, { did: depID, mid: req.user.subscriberID, rel: relationship || null, allowance: allowance || 0, limit: spendingLimit || null, age: age });

        res.status(201).json({ message: 'Dependant added', dependantID: depID });
    } catch (err) {
        if (err.message.includes('UQ_Subscriber_Email')) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dependants/:id
router.put('/:id', async (req, res) => {
    try {
        const { firstName, lastName, email, relationship, allowance, spendingLimit, status, dateOfBirth } = req.body;
        const did = parseInt(req.params.id);
        const mid = req.user.subscriberID;

        // Update Subscriber table (name, email, dateOfBirth)
        const subSets = [];
        const subParams = { did };
        if (firstName !== undefined && firstName) { subSets.push('firstName = @fn'); subParams.fn = String(firstName).slice(0, 100); }
        if (lastName !== undefined && lastName) { subSets.push('lastName = @ln'); subParams.ln = String(lastName).slice(0, 100); }
        if (email !== undefined && email) { subSets.push('email = @email'); subParams.email = String(email).slice(0, 255); }
        if (dateOfBirth !== undefined && dateOfBirth && dateOfBirth !== '') { subSets.push('dateOfBirth = @dob'); subParams.dob = dateOfBirth; }
        if (subSets.length > 0) {
            subSets.push('updatedAt = GETDATE()');
            await query(`UPDATE Subscriber SET ${subSets.join(', ')} WHERE subscriberID = @did`, subParams);
        }

        // Update Dependant table (relationship, allowance, spendingLimit, status, age, permissions)
        const depSets = [];
        const depParams = { did, mid };
        if (relationship !== undefined && relationship !== null && relationship !== '') { depSets.push('relationship = @rel'); depParams.rel = String(relationship).slice(0, 100); }
        if (allowance !== undefined && allowance !== null && !isNaN(allowance)) { depSets.push('allowance = @allowance'); depParams.allowance = parseFloat(allowance); }
        if (spendingLimit !== undefined) { depSets.push('spendingLimit = @limit'); depParams.limit = (spendingLimit && !isNaN(spendingLimit)) ? parseFloat(spendingLimit) : null; }
        if (status !== undefined && status !== null && ['active', 'invited', 'suspended'].includes(status)) { depSets.push('status = @status'); depParams.status = status; }

        // Permissions
        if (req.body.canSpend !== undefined) { depSets.push('canSpend = @canSpend'); depParams.canSpend = req.body.canSpend ? 1 : 0; }
        if (req.body.canViewWallet !== undefined) { depSets.push('canViewWallet = @canViewWallet'); depParams.canViewWallet = req.body.canViewWallet ? 1 : 0; }
        if (req.body.canRequestFunds !== undefined) { depSets.push('canRequestFunds = @canRequestFunds'); depParams.canRequestFunds = req.body.canRequestFunds ? 1 : 0; }

        // Recalculate age from dateOfBirth
        if (dateOfBirth) {
            const dob = new Date(dateOfBirth);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
            depSets.push('age = @age');
            depParams.age = age;
        }

        if (depSets.length > 0) {
            await query(`UPDATE Dependant SET ${depSets.join(', ')} WHERE dependantID = @did AND mainMemberID = @mid`, depParams);
        }

        res.json({ message: 'Dependant updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/dependants/:id
router.delete('/:id', async (req, res) => {
    try {
        await query('DELETE FROM Dependant WHERE dependantID = @did AND mainMemberID = @mid', { did: parseInt(req.params.id), mid: req.user.subscriberID });
        res.json({ message: 'Dependant removed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/dependants/:id/send-allowance
// POST /api/dependants/:id/send-allowance
//   Transfers funds FROM the main member's wallet TO a dependant, atomically:
//     • amount must be > 0 and not exceed the wallet balance
//     • debits the wallet and records a negative 'transfer_out' transaction
//       tagged with the dependantID (so the dependant's totalReceived grows)
router.post('/:id/send-allowance', async (req, res) => {
    const dependantID = parseInt(req.params.id);
    const amount = Math.round((parseFloat(req.body.amount) + Number.EPSILON) * 100) / 100;

    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    let transaction;
    try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const rq = () => new sql.Request(transaction);

        // Confirm the dependant belongs to this member + get a display name.
        const depRes = await rq()
            .input('did', dependantID).input('mid', req.user.subscriberID)
            .query(`SELECT d.dependantID, s.firstName, s.lastName
                    FROM Dependant d JOIN Subscriber s ON d.dependantID = s.subscriberID
                    WHERE d.dependantID = @did AND d.mainMemberID = @mid`);
        if (depRes.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Dependant not found' });
        }
        const depName = [depRes.recordset[0].firstName, depRes.recordset[0].lastName].filter(Boolean).join(' ').trim() || 'Dependant';

        // Lock + read the wallet.
        const wRes = await rq()
            .input('sid', req.user.subscriberID)
            .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @sid');
        if (wRes.recordset.length === 0) { await transaction.rollback(); return res.status(404).json({ error: 'Wallet not found' }); }

        const w = wRes.recordset[0];
        const before = parseFloat(w.balance) || 0;
        if (before < amount) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        const after = Math.round((before - amount + Number.EPSILON) * 100) / 100;

        // Debit the wallet.
        await rq().input('bal', after).input('wid', w.walletID)
            .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');

        // Record the outgoing transfer (negative/'transfer_out'), tagged to the dependant.
        const txIns = await rq()
            .input('wid', w.walletID)
            .input('did', dependantID)
            .input('amt', amount)
            .input('after', after)
            .input('before', before)
            .input('desc', 'Sent to ' + depName)
            .input('rname', depName)
            .query(`INSERT INTO WalletTransaction
                (walletID, dependantID, transactionType, transactionAmount, runningBalance,
                 balanceBefore, balanceAfter, status, description, category, recipientName, completedAt)
                OUTPUT INSERTED.transactionID
                VALUES (@wid, @did, 'transfer_out', @amt, @after, @before, @after, 'completed', @desc, 'dependant', @rname, GETDATE())`);
        const txID = txIns.recordset[0].transactionID;
        await rq().input('ref', makeReference('DEP', txID)).input('id', txID)
            .query('UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id');

        await transaction.commit();

        res.json({ message: 'Transfer sent', balance: after, amount, dependant: depName });

        // ── Notifications (post-commit; failures here don't undo the transfer) ──
        try {
            const ref = makeReference('DEP', txID);
            // Notify the sender (main member) that the transfer went out.
            await notificationService.createNotification({
                subscriberID: req.user.subscriberID,
                type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
                title: 'Transfer sent',
                message: `You sent R${amount.toFixed(2)} to ${depName}.`,
                relatedEntityType: ENTITY_TYPES.DEPENDANT,
                relatedEntityID: dependantID,
                eventToken: ref,
                metadata: { reference: ref, amount, dependant: depName }
            });
            // Notify the dependant that they received funds.
            await notificationService.createNotification({
                subscriberID: dependantID,
                type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
                title: 'Money received',
                message: `You received R${amount.toFixed(2)}.`,
                relatedEntityType: ENTITY_TYPES.DEPENDANT,
                relatedEntityID: dependantID,
                eventToken: ref,
                metadata: { reference: ref, amount }
            });
        } catch (nErr) {
            console.warn('Dependant transfer notification failed:', nErr.message);
        }
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) { /* already rolled back */ } }
        console.error('POST /dependants/:id/send-allowance error:', err.message);
        res.status(500).json({ error: 'Could not send transfer. No funds were moved.' });
    }
});

// ══════════════════════════════════════════════════════════════
// DEPENDANT TASKS
// ══════════════════════════════════════════════════════════════

// GET /api/dependants/:id/tasks
router.get('/:id/tasks', async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM DependantTask
            WHERE dependantID = @did AND mainMemberID = @mid
            ORDER BY createdAt DESC
        `, { did: parseInt(req.params.id), mid: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/dependants/:id/tasks
router.post('/:id/tasks', async (req, res) => {
    try {
        const { taskName, description, dueDate, reward, recurring, recurrenceCycle } = req.body;
        if (!taskName) return res.status(400).json({ error: 'Task name is required' });

        const result = await query(`
            INSERT INTO DependantTask (dependantID, mainMemberID, taskName, description, dueDate, reward, recurring, recurrenceCycle)
            OUTPUT INSERTED.*
            VALUES (@did, @mid, @taskName, @desc, @due, @reward, @recurring, @cycle)
        `, {
            did: parseInt(req.params.id),
            mid: req.user.subscriberID,
            taskName,
            desc: description || null,
            due: dueDate || null,
            reward: parseFloat(reward) || 0,
            recurring: recurring ? 1 : 0,
            cycle: recurring ? (recurrenceCycle || 'weekly') : null
        });

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dependants/:depId/tasks/:taskId
router.put('/:depId/tasks/:taskId', async (req, res) => {
    try {
        const { taskName, description, dueDate, reward, recurring, recurrenceCycle, taskStatus } = req.body;
        const validStatuses = ['pending', 'in_progress', 'completed', 'overdue', 'cancelled'];
        const validCycles = ['daily', 'weekly', 'biweekly', 'monthly'];

        const sets = [];
        const params = {
            tid: parseInt(req.params.taskId),
            mid: req.user.subscriberID
        };

        if (taskName !== undefined && taskName !== null) { sets.push('taskName = @taskName'); params.taskName = taskName; }
        if (description !== undefined) { sets.push('description = @desc'); params.desc = description || null; }
        if (dueDate !== undefined) { sets.push('dueDate = @due'); params.due = dueDate || null; }
        if (reward !== undefined && reward !== null) { sets.push('reward = @reward'); params.reward = parseFloat(reward); }
        if (recurring !== undefined) { sets.push('recurring = @recurring'); params.recurring = recurring ? 1 : 0; }
        if (recurrenceCycle !== undefined) {
            if (recurrenceCycle && validCycles.includes(recurrenceCycle)) {
                sets.push('recurrenceCycle = @cycle'); params.cycle = recurrenceCycle;
            } else {
                sets.push('recurrenceCycle = NULL');
            }
        }
        if (taskStatus !== undefined && taskStatus !== null && validStatuses.includes(taskStatus)) {
            sets.push('taskStatus = @status'); params.status = taskStatus;
            if (taskStatus === 'completed') {
                sets.push('completedAt = GETDATE()');
            } else {
                sets.push('completedAt = NULL');
            }
        }

        sets.push('updatedAt = GETDATE()');

        await query(`
            UPDATE DependantTask SET ${sets.join(', ')}
            WHERE dependantTaskID = @tid AND mainMemberID = @mid
        `, params);

        res.json({ message: 'Task updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/dependants/:depId/tasks/:taskId
router.delete('/:depId/tasks/:taskId', async (req, res) => {
    try {
        await query('DELETE FROM DependantTask WHERE dependantTaskID = @tid AND mainMemberID = @mid', {
            tid: parseInt(req.params.taskId), mid: req.user.subscriberID
        });
        res.json({ message: 'Task deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
