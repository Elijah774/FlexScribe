/* ===========================================================
   /api/dependants — Manage dependant accounts
=========================================================== */
const express = require('express');
const bcrypt = require('bcryptjs');
const { query, getPool, sql } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES, ENTITY_TYPES } = require('../constants/notificationTypes');

const router = express.Router();
router.use(authenticateToken);

/* ===========================================================
   Task reward / wallet funding helpers
=========================================================== */

// Shown whenever the main member's available wallet balance cannot cover a
// task reward (used at task creation and when completing a rewarded task).
const INSUFFICIENT_FUNDS_MSG =
    "Insufficient wallet funds. Your available balance is not enough to cover this task's reward. Please upload funds to your wallet or reduce the reward amount.";

/** Round to 2dp as a Number (avoids float drift on money). */
function money(n) {
    return Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Ensure a subscriber (used for dependants) has exactly one VirtualWallet row.
 * Idempotent: relies on the UQ_VirtualWallet_Subscriber unique constraint and
 * an IF NOT EXISTS guard, so calling it repeatedly is safe. Returns the
 * wallet's row. Optionally runs inside a provided transaction request factory.
 *
 * @param {number} subscriberID
 * @param {object} [tx] optional mssql Transaction to run inside
 * @returns {Promise<{walletID:number, balance:number}>}
 */
async function ensureDependantWallet(subscriberID, tx) {
    const run = (q, params) => {
        if (tx) {
            const r = new sql.Request(tx);
            Object.entries(params || {}).forEach(([k, v]) => r.input(k, v));
            return r.query(q);
        }
        return query(q, params);
    };

    // Create only if missing (unique constraint also protects against races).
    const cardNumber = '4' + Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join('');
    await run(`
        IF NOT EXISTS (SELECT 1 FROM VirtualWallet WHERE subscriberID = @sid)
            INSERT INTO VirtualWallet (subscriberID, cardNumber) VALUES (@sid, @card)
    `, { sid: subscriberID, card: cardNumber });

    const r = await run('SELECT walletID, balance FROM VirtualWallet WHERE subscriberID = @sid', { sid: subscriberID });
    return r.recordset[0];
}

/* ===========================================================
   Server-side validators (mirror of scripts/validators.js) so
   invalid data cannot bypass the UI and reach the database.
=========================================================== */
const MAX_AMOUNT = 100000;

const MSG = {
    AMOUNT_REQUIRED: 'Please enter an amount.',
    AMOUNT_NEGATIVE: 'The amount cannot be negative.',
    AMOUNT_INVALID:  'Please enter a valid amount using numbers and up to two decimal places.',
    AMOUNT_MAX:      'The amount cannot exceed R100,000.00.',
    EMAIL_INVALID:   'Please enter a valid email address, for example, name@example.com.',
    DOB_INVALID:     'Please enter a valid date of birth in the past. Future dates are not allowed.'
};

const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

function isValidEmail(value) {
    if (typeof value !== 'string') return false;
    const email = value.trim();
    if (!email || email.length > 254) return false;
    if (email.indexOf(' ') !== -1) return false;
    return EMAIL_RE.test(email);
}

function validateEmail(value) {
    const email = (value == null ? '' : String(value)).trim();
    if (!email) return { valid: false, value: email, message: 'Please enter an email.' };
    if (!isValidEmail(email)) return { valid: false, value: email, message: MSG.EMAIL_INVALID };
    return { valid: true, value: email, message: '' };
}

/**
 * options: { required (bool), max (number) }
 * Returns a validated numeric value; never silently coerces bad input.
 */
function validateAmount(value, options) {
    const opts = options || {};
    const required = !!opts.required;
    const max = typeof opts.max === 'number' ? opts.max : MAX_AMOUNT;

    // Numbers coming straight from JSON are accepted after range/precision checks.
    let raw;
    if (typeof value === 'number') {
        if (!isFinite(value)) return { valid: false, value: null, message: MSG.AMOUNT_INVALID };
        raw = String(value);
    } else {
        raw = (value == null ? '' : String(value)).trim();
    }

    if (raw === '') {
        if (required) return { valid: false, value: null, message: MSG.AMOUNT_REQUIRED };
        return { valid: true, value: 0, message: '' };
    }

    if (/^-/.test(raw)) {
        if (/^-\d+(\.\d+)?$/.test(raw)) return { valid: false, value: null, message: MSG.AMOUNT_NEGATIVE };
        return { valid: false, value: null, message: MSG.AMOUNT_INVALID };
    }

    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        return { valid: false, value: null, message: MSG.AMOUNT_INVALID };
    }

    const num = parseFloat(raw);
    if (!isFinite(num)) return { valid: false, value: null, message: MSG.AMOUNT_INVALID };
    if (num < 0) return { valid: false, value: null, message: MSG.AMOUNT_NEGATIVE };
    if (num > max) return { valid: false, value: null, message: MSG.AMOUNT_MAX };

    return { valid: true, value: num, message: '' };
}

function _padNum(n) { return (n < 10 ? '0' : '') + n; }
function _toISO(d) { return d.getFullYear() + '-' + _padNum(d.getMonth() + 1) + '-' + _padNum(d.getDate()); }

/**
 * Accepts a 'YYYY-MM-DD' date (or a value that starts with one, e.g. an
 * ISO timestamp). Must be a real calendar date strictly before today.
 */
function validateDateOfBirth(value) {
    const raw = (value == null ? '' : String(value)).trim();
    if (!raw) return { valid: false, value: '', message: 'Please enter a date of birth.' };

    const datePart = raw.split('T')[0];
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (!m) return { valid: false, value: raw, message: MSG.DOB_INVALID };

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
        return { valid: false, value: raw, message: MSG.DOB_INVALID };
    }

    const today = _toISO(new Date());
    if (datePart >= today) {
        return { valid: false, value: datePart, message: MSG.DOB_INVALID };
    }

    return { valid: true, value: datePart, message: '' };
}

// GET /api/dependants
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT d.*, s.firstName, s.lastName, s.email, s.avatarUrl, s.dateOfBirth
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
        const { firstName, lastName, relationship } = req.body;
        if (!firstName) return res.status(400).json({ error: 'Name is required' });

        // ── Server-side validation (cannot be bypassed by the UI) ──
        const emailResult = validateEmail(req.body.email);
        if (!emailResult.valid) return res.status(400).json({ error: emailResult.message });
        const email = emailResult.value;

        const dobResult = validateDateOfBirth(req.body.dateOfBirth);
        if (!dobResult.valid) return res.status(400).json({ error: dobResult.message });
        const dateOfBirth = dobResult.value;

        const allowanceResult = validateAmount(req.body.allowance, { required: false });
        if (!allowanceResult.valid) return res.status(400).json({ error: allowanceResult.message });
        const allowance = allowanceResult.value;

        const spendingResult = validateAmount(req.body.spendingLimit, { required: false });
        if (!spendingResult.valid) return res.status(400).json({ error: spendingResult.message });
        const spendingLimit = (spendingResult.value != null && spendingResult.value > 0) ? spendingResult.value : null;

        if (!relationship || !String(relationship).trim()) {
            return res.status(400).json({ error: 'Relationship is required' });
        }

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
        `, { did: depID, mid: req.user.subscriberID, rel: String(relationship).trim().slice(0, 100), allowance: allowance || 0, limit: spendingLimit, age: age });

        // Give the dependant their own wallet so task rewards can be paid into
        // it (mirrors main-member registration). Guarded so a pre-existing
        // wallet never causes a unique-constraint failure.
        await ensureDependantWallet(depID);

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

        // ── Server-side validation for any provided fields ──
        if (email !== undefined && email !== null && email !== '') {
            const er = validateEmail(email);
            if (!er.valid) return res.status(400).json({ error: er.message });
        }

        let validatedDob;
        if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
            const dr = validateDateOfBirth(dateOfBirth);
            if (!dr.valid) return res.status(400).json({ error: dr.message });
            validatedDob = dr.value;
        }

        let validatedAllowance;
        if (allowance !== undefined && allowance !== null && allowance !== '') {
            const ar = validateAmount(allowance, { required: false });
            if (!ar.valid) return res.status(400).json({ error: ar.message });
            validatedAllowance = ar.value;
        }

        let validatedSpending;
        if (spendingLimit !== undefined && spendingLimit !== null && spendingLimit !== '') {
            const sr = validateAmount(spendingLimit, { required: false });
            if (!sr.valid) return res.status(400).json({ error: sr.message });
            validatedSpending = sr.value;
        }

        // Update Subscriber table (name, email, dateOfBirth)
        const subSets = [];
        const subParams = { did };
        if (firstName !== undefined && firstName) { subSets.push('firstName = @fn'); subParams.fn = String(firstName).slice(0, 100); }
        if (lastName !== undefined && lastName) { subSets.push('lastName = @ln'); subParams.ln = String(lastName).slice(0, 100); }
        if (email !== undefined && email) { subSets.push('email = @email'); subParams.email = String(email).trim().slice(0, 255); }
        if (validatedDob !== undefined) { subSets.push('dateOfBirth = @dob'); subParams.dob = validatedDob; }
        if (subSets.length > 0) {
            subSets.push('updatedAt = GETDATE()');
            await query(`UPDATE Subscriber SET ${subSets.join(', ')} WHERE subscriberID = @did`, subParams);
        }

        // Update Dependant table (relationship, allowance, spendingLimit, status, age, permissions)
        const depSets = [];
        const depParams = { did, mid };
        if (relationship !== undefined && relationship !== null && String(relationship).trim() !== '') { depSets.push('relationship = @rel'); depParams.rel = String(relationship).trim().slice(0, 100); }
        if (validatedAllowance !== undefined) { depSets.push('allowance = @allowance'); depParams.allowance = validatedAllowance; }
        if (validatedSpending !== undefined) { depSets.push('spendingLimit = @limit'); depParams.limit = (validatedSpending > 0) ? validatedSpending : null; }
        if (status !== undefined && status !== null && ['active', 'invited', 'suspended'].includes(status)) { depSets.push('status = @status'); depParams.status = status; }

        // Permissions
        if (req.body.canSpend !== undefined) { depSets.push('canSpend = @canSpend'); depParams.canSpend = req.body.canSpend ? 1 : 0; }
        if (req.body.canViewWallet !== undefined) { depSets.push('canViewWallet = @canViewWallet'); depParams.canViewWallet = req.body.canViewWallet ? 1 : 0; }
        if (req.body.canRequestFunds !== undefined) { depSets.push('canRequestFunds = @canRequestFunds'); depParams.canRequestFunds = req.body.canRequestFunds ? 1 : 0; }

        // Recalculate age from dateOfBirth
        if (validatedDob) {
            const dob = new Date(validatedDob);
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
router.post('/:id/send-allowance', async (req, res) => {
    try {
        const amtResult = validateAmount(req.body.amount, { required: true });
        if (!amtResult.valid) return res.status(400).json({ error: amtResult.message });
        const amount = money(amtResult.value);
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

        const depID = parseInt(req.params.id);
        const mid = req.user.subscriberID;

        // Verify the dependant belongs to this main member before moving money.
        const owns = await query(
            'SELECT 1 FROM Dependant WHERE dependantID = @did AND mainMemberID = @mid',
            { did: depID, mid }
        );
        if (owns.recordset.length === 0) return res.status(404).json({ error: 'Dependant not found' });

        // Sending an allowance is a real transfer: debit the main member's
        // wallet AND credit the dependant's wallet, atomically. Both legs run
        // in one SERIALIZABLE transaction with the wallet rows locked, so a
        // failure rolls back the whole thing and concurrent sends are safe.
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

        try {
            // Lock + read the main member's wallet.
            const srcRes = await new sql.Request(tx)
                .input('mid', mid)
                .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @mid');
            if (srcRes.recordset.length === 0) {
                await tx.rollback();
                return res.status(404).json({ error: 'Wallet not found' });
            }
            const srcWalletID = srcRes.recordset[0].walletID;
            const srcBefore = parseFloat(srcRes.recordset[0].balance) || 0;
            if (srcBefore < amount) {
                await tx.rollback();
                return res.status(400).json({ error: 'Insufficient balance' });
            }
            const srcAfter = money(srcBefore - amount);

            // Ensure + lock the dependant's wallet.
            const depWallet = await ensureDependantWallet(depID, tx);
            const depBefore = parseFloat(depWallet.balance) || 0;
            const depAfter = money(depBefore + amount);

            // Debit main member.
            await new sql.Request(tx)
                .input('bal', srcAfter).input('wid', srcWalletID)
                .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');
            await new sql.Request(tx)
                .input('wid', srcWalletID).input('did', depID).input('amt', amount).input('bal', srcAfter)
                .query(`
                    INSERT INTO WalletTransaction (walletID, dependantID, transactionType, transactionAmount, runningBalance, description, category)
                    VALUES (@wid, @did, 'debit', @amt, @bal, 'Allowance sent', 'dependant')
                `);

            // Credit dependant.
            await new sql.Request(tx)
                .input('bal', depAfter).input('wid', depWallet.walletID)
                .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');
            await new sql.Request(tx)
                .input('wid', depWallet.walletID).input('did', depID).input('amt', amount).input('bal', depAfter)
                .query(`
                    INSERT INTO WalletTransaction (walletID, dependantID, transactionType, transactionAmount, runningBalance, description, category)
                    VALUES (@wid, @did, 'credit', @amt, @bal, 'Allowance received', 'allowance')
                `);

            await tx.commit();
            res.json({ message: 'Allowance sent', balance: srcAfter, dependantBalance: depAfter });
        } catch (txErr) {
            try { await tx.rollback(); } catch (_) { /* ignore */ }
            throw txErr;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dependants/:id/activity
// Returns wallet transactions tied to this dependant (e.g. allowances sent),
// scoped to the signed-in main member's own wallet.
router.get('/:id/activity', async (req, res) => {
    try {
        // Activity is the dependant's OWN wallet transaction history, so the
        // signs reflect the dependant's perspective:
        //   • Allowance received / task reward earned  → credit (+)
        //   • Task reward reversed (un-marked)          → debit  (-)
        // Reading the dependant's wallet (not the parent's) means the UI shows
        // money as it moves for the dependant. Scoped to this main member's
        // dependant so a parent only sees their own dependants' activity.
        const depID = parseInt(req.params.id);
        const mid = req.user.subscriberID;

        const owns = await query(
            'SELECT 1 FROM Dependant WHERE dependantID = @did AND mainMemberID = @mid',
            { did: depID, mid }
        );
        if (owns.recordset.length === 0) return res.status(404).json({ error: 'Dependant not found' });

        const result = await query(`
            SELECT wt.transactionID, wt.transactionType, wt.transactionAmount,
                   wt.description, wt.category, wt.transactionDate
            FROM WalletTransaction wt
            JOIN VirtualWallet vw ON wt.walletID = vw.walletID
            WHERE vw.subscriberID = @did
            ORDER BY wt.transactionDate ASC
        `, { did: depID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════
// DEPENDANT TASKS
// ══════════════════════════════════════════════════════════════

const VALID_CYCLES = ['daily', 'weekly', 'biweekly', 'monthly'];

/** Today's date as 'YYYY-MM-DD' in the server's LOCAL timezone. */
function _localTodayISO() {
    const d = new Date();
    const pad = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * Compute the next due date for a recurring task, based on its cycle.
 * Pure date arithmetic on a 'YYYY-MM-DD' string — returns 'YYYY-MM-DD'.
 *
 * The next occurrence is always anchored to the CURRENT occurrence's due
 * date (not "today"), so a daily task due 15 Oct yields 16 Oct even if it
 * is completed late. Monthly uses calendar-month stepping with end-of-month
 * clamping (e.g. 31 Jan → 28/29 Feb).
 *
 * @param {string} currentDueISO 'YYYY-MM-DD'
 * @param {string} cycle         daily | weekly | biweekly | monthly
 * @returns {string|null} next due date, or null if inputs are invalid
 */
function nextDueDate(currentDueISO, cycle) {
    if (!currentDueISO) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(currentDueISO));
    if (!m) return null;

    const year = Number(m[1]);
    const month = Number(m[2]); // 1-12
    const day = Number(m[3]);

    // Build in UTC to avoid any timezone drift on the date boundary.
    const d = new Date(Date.UTC(year, month - 1, day));

    switch (cycle) {
        case 'daily':
            d.setUTCDate(d.getUTCDate() + 1);
            break;
        case 'weekly':
            d.setUTCDate(d.getUTCDate() + 7);
            break;
        case 'biweekly':
            d.setUTCDate(d.getUTCDate() + 14);
            break;
        case 'monthly': {
            // Step one calendar month, clamping the day to the target
            // month's last day (so 31 Jan → 28 Feb, not 3 Mar).
            const targetMonthIndex = d.getUTCMonth() + 1;
            const targetYear = d.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
            const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
            const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
            d.setUTCFullYear(targetYear, normalizedMonth, Math.min(day, lastDay));
            break;
        }
        default:
            return null;
    }

    const pad = n => (n < 10 ? '0' : '') + n;
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

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

        const rewardAmount = money(reward) || 0;

        // ── Wallet funding guardrail ──
        // The reward is only ever CHARGED when the task is completed, so we do
        // not reserve funds here. But we refuse to create a task the wallet
        // cannot currently afford, giving the main member immediate feedback.
        // For recurring tasks this validates the (single) initial occurrence —
        // we never try to pre-fund an unlimited number of future occurrences.
        if (rewardAmount > 0) {
            const walletRes = await query(
                'SELECT balance FROM VirtualWallet WHERE subscriberID = @mid',
                { mid: req.user.subscriberID }
            );
            const available = walletRes.recordset.length
                ? (parseFloat(walletRes.recordset[0].balance) || 0)
                : 0;
            if (available < rewardAmount) {
                return res.status(402).json({ error: INSUFFICIENT_FUNDS_MSG, reason: 'insufficient_funds', available });
            }
        }

        const result = await query(`
            INSERT INTO DependantTask (dependantID, mainMemberID, taskName, description, dueDate, reward, recurring, recurrenceCycle, nextOccurrenceGenerated)
            OUTPUT INSERTED.*
            VALUES (@did, @mid, @taskName, @desc, @due, @reward, @recurring, @cycle, 0)
        `, {
            did: parseInt(req.params.id),
            mid: req.user.subscriberID,
            taskName,
            desc: description || null,
            due: dueDate || null,
            reward: rewardAmount,
            recurring: recurring ? 1 : 0,
            cycle: recurring ? (recurrenceCycle || 'weekly') : null
        });

        const inserted = result.recordset[0];

        // A brand-new recurring task is the root of its own sequence: its
        // recurrenceParentID points at itself. This lets every later
        // occurrence be grouped back to the original task.
        if (inserted && inserted.recurring) {
            await query(
                'UPDATE DependantTask SET recurrenceParentID = @tid WHERE dependantTaskID = @tid',
                { tid: inserted.dependantTaskID }
            );
            inserted.recurrenceParentID = inserted.dependantTaskID;
        }

        res.status(201).json(inserted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dependants/:depId/tasks/:taskId
//
// Two distinct responsibilities, kept separate for safety:
//   1. Completing a task — handled atomically so that marking the current
//      occurrence complete and spawning the next occurrence either both
//      happen or neither does, and can never happen twice.
//   2. Editing a task's fields (name, due date, reward, recurrence, or a
//      non-completion status change) — a plain field update.
router.put('/:depId/tasks/:taskId', async (req, res) => {
    try {
        const { taskName, description, dueDate, reward, recurring, recurrenceCycle, taskStatus } = req.body;
        const validStatuses = ['pending', 'in_progress', 'completed', 'overdue', 'cancelled'];

        const tid = parseInt(req.params.taskId);
        const mid = req.user.subscriberID;

        // ── Completion path (atomic + idempotent) ──
        if (taskStatus === 'completed') {
            return await completeTaskOccurrence(tid, mid, res);
        }

        // ── Un-mark path (revert a completed task to a non-completed status) ──
        // Must refund any reward that was charged, atomically and exactly once,
        // so complete → unmark → complete can never debit the wallet twice.
        if (taskStatus !== undefined && taskStatus !== null && taskStatus !== 'completed') {
            if (!validStatuses.includes(taskStatus)) {
                return res.status(400).json({ error: 'Invalid task status' });
            }
            return await revertTaskCompletion(tid, mid, taskStatus, res);
        }

        // ── Edit path (field changes only; no status change) ──
        const sets = [];
        const params = { tid, mid };

        // Detect whether this edit changes the recurrence schedule. If so we
        // reset the "next generated" guard on an active (incomplete) occurrence
        // so the UPDATED frequency/due date drives the next occurrence. We do
        // NOT touch completed history rows.
        let scheduleChanged = false;

        if (taskName !== undefined && taskName !== null) { sets.push('taskName = @taskName'); params.taskName = taskName; }
        if (description !== undefined) { sets.push('description = @desc'); params.desc = description || null; }
        if (dueDate !== undefined) { sets.push('dueDate = @due'); params.due = dueDate || null; scheduleChanged = true; }
        if (reward !== undefined && reward !== null) { sets.push('reward = @reward'); params.reward = parseFloat(reward); }
        if (recurring !== undefined) { sets.push('recurring = @recurring'); params.recurring = recurring ? 1 : 0; scheduleChanged = true; }
        if (recurrenceCycle !== undefined) {
            scheduleChanged = true;
            if (recurrenceCycle && VALID_CYCLES.includes(recurrenceCycle)) {
                sets.push('recurrenceCycle = @cycle'); params.cycle = recurrenceCycle;
            } else {
                sets.push('recurrenceCycle = NULL');
            }
        }
        // Note: status changes are handled by the completion / un-mark paths
        // above, so taskStatus is not applied here.
        if (scheduleChanged) {
            // Editing the schedule of an incomplete occurrence: re-arm the
            // guard (only affects rows not yet completed — completed history
            // keeps its guard so it never re-generates).
            sets.push('nextOccurrenceGenerated = CASE WHEN taskStatus = \'completed\' THEN nextOccurrenceGenerated ELSE 0 END');
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

/**
 * Complete a single task occurrence and, if it is recurring, generate the
 * next occurrence — atomically and exactly once.
 *
 * Safety properties:
 *  • Wrapped in a serializable transaction so concurrent/duplicate requests
 *    cannot both pass the guard.
 *  • The completing UPDATE only fires when the row is NOT already completed,
 *    so repeated "complete" calls are no-ops.
 *  • The next occurrence is only inserted when the row is recurring and its
 *    nextOccurrenceGenerated guard is still 0; the guard is flipped to 1 in
 *    the same transaction, so refreshes/restarts never duplicate it.
 */
async function completeTaskOccurrence(tid, mid, res) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
        // Lock + read the current occurrence.
        const read = await new sql.Request(tx)
            .input('tid', tid)
            .input('mid', mid)
            .query(`
                SELECT dependantTaskID, dependantID, mainMemberID, taskName, description,
                       dueDate, reward, taskStatus, recurring, recurrenceCycle,
                       recurrenceParentID, nextOccurrenceGenerated
                FROM DependantTask WITH (UPDLOCK, HOLDLOCK)
                WHERE dependantTaskID = @tid AND mainMemberID = @mid
            `);

        if (read.recordset.length === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = read.recordset[0];

        // Already completed → no-op (idempotent). Nothing to generate.
        if (task.taskStatus === 'completed') {
            await tx.commit();
            return res.json({ message: 'Task already completed', alreadyCompleted: true });
        }

        // ── Daily recurring tasks: completable ONLY on their due date ──
        // A daily occurrence missed on its due date must stay overdue (it
        // cannot be completed late), and a future daily occurrence cannot be
        // completed early. This is authoritative server-side enforcement so
        // the UI cannot bypass it. Weekly / monthly / non-recurring tasks are
        // intentionally unaffected.
        if (task.recurring && task.recurrenceCycle === 'daily' && task.dueDate) {
            const dueISO = task.dueDate instanceof Date
                ? task.dueDate.toISOString().slice(0, 10)
                : String(task.dueDate).slice(0, 10);

            // Compare against the server's LOCAL date (due dates were created
            // in the same local frame via GETDATE()).
            const todayISO = _localTodayISO();

            if (dueISO !== todayISO) {
                await tx.rollback();
                const reason = todayISO > dueISO ? 'overdue' : 'early';
                const message = reason === 'overdue'
                    ? 'This task can only be completed on its scheduled due date as it is a daily recurring task. The task is overdue and cannot be marked as complete.'
                    : 'This task can only be completed on its scheduled due date as it is a daily recurring task. Its scheduled date has not yet arrived, therefore cannot be marked as complete today.';
                return res.status(409).json({ error: message, reason, dueDate: dueISO });
            }
        }

        // ── Fund the reward (charge-on-completion) ──
        // The reward is paid out of the main member's available wallet balance
        // at the moment of completion. This is the single point where money
        // moves for a task, which prevents double allocation across future
        // occurrences. The whole thing runs in the same SERIALIZABLE tx with
        // the row UPDLOCK'd, so concurrent/duplicate completions cannot double
        // pay: the first completes + debits, the rest hit the
        // already-completed no-op above.
        const rewardAmount = money(task.reward) || 0;
        let walletID = null;
        let balanceAfter = null;

        if (rewardAmount > 0) {
            const walletRes = await new sql.Request(tx)
                .input('mid', mid)
                .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @mid');

            if (walletRes.recordset.length === 0) {
                await tx.rollback();
                return res.status(402).json({ error: INSUFFICIENT_FUNDS_MSG, reason: 'insufficient_funds', available: 0 });
            }

            walletID = walletRes.recordset[0].walletID;
            const balanceBefore = parseFloat(walletRes.recordset[0].balance) || 0;

            if (balanceBefore < rewardAmount) {
                await tx.rollback();
                return res.status(402).json({
                    error: INSUFFICIENT_FUNDS_MSG,
                    reason: 'insufficient_funds',
                    available: balanceBefore,
                    reward: rewardAmount
                });
            }

            balanceAfter = money(balanceBefore - rewardAmount);

            // Debit the available balance.
            await new sql.Request(tx)
                .input('bal', balanceAfter)
                .input('wid', walletID)
                .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');

            // Record the reward payout in the wallet transaction history. One
            // debit row per completed occurrence (occurrences are distinct
            // DependantTask rows), so history stays accurate and no duplicate
            // payment is possible. Every meaningful field supported by the
            // WalletTransaction schema is captured:
            //   • transactionAmount  — the reward paid
            //   • transactionType    — 'debit' (money left the main wallet)
            //   • category           — 'task-reward' (so it's filterable)
            //   • dependantID        — who earned it
            //   • runningBalance     — the resulting available balance
            //   • transactionDate    — set by the DB default (GETDATE()) at
            //                          the moment of completion
            //   • description        — the task name
            await new sql.Request(tx)
                .input('wid', walletID)
                .input('did', task.dependantID)
                .input('amt', rewardAmount)
                .input('after', balanceAfter)
                .input('desc', 'Task reward: ' + task.taskName)
                .query(`
                    INSERT INTO WalletTransaction
                        (walletID, dependantID, transactionType, transactionAmount, runningBalance, description, category)
                    VALUES
                        (@wid, @did, 'debit', @amt, @after, @desc, 'task-reward')
                `);

            // ── Credit leg: pay the reward INTO the dependant's own wallet ──
            // A completed task actually moves money: it leaves the main
            // member's wallet (debit above) and arrives in the dependant's
            // wallet (credit here). Both legs run in the same SERIALIZABLE tx
            // so they are atomic. The dependant wallet is created lazily if it
            // somehow doesn't exist yet (idempotent, unique-constrained).
            const depWallet = await ensureDependantWallet(task.dependantID, tx);
            const depBefore = parseFloat(depWallet.balance) || 0;
            const depAfter = money(depBefore + rewardAmount);
            await new sql.Request(tx)
                .input('bal', depAfter)
                .input('wid', depWallet.walletID)
                .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');
            await new sql.Request(tx)
                .input('wid', depWallet.walletID)
                .input('did', task.dependantID)
                .input('amt', rewardAmount)
                .input('after', depAfter)
                .input('desc', 'Task reward earned: ' + task.taskName)
                .query(`
                    INSERT INTO WalletTransaction
                        (walletID, dependantID, transactionType, transactionAmount, runningBalance, description, category)
                    VALUES
                        (@wid, @did, 'credit', @amt, @after, @desc, 'task-reward-earned')
                `);
        }

        // Mark this occurrence completed. taskRewardPaid records whether this
        // occurrence currently has an outstanding (charged, not refunded)
        // reward — set to 1 only when we actually debited the wallet above, so
        // un-marking can refund exactly once.
        await new sql.Request(tx)
            .input('tid', tid)
            .input('mid', mid)
            .input('paid', rewardAmount > 0 ? 1 : 0)
            .query(`
                UPDATE DependantTask
                SET taskStatus = 'completed', completedAt = GETDATE(), updatedAt = GETDATE(),
                    taskRewardPaid = @paid
                WHERE dependantTaskID = @tid AND mainMemberID = @mid
            `);

        let newTaskId = null;
        let newDueDate = null;
        let nextFundingShort = false;

        // Generate the next occurrence only if: recurring, has a cycle & due
        // date, and we have NOT already generated it for this occurrence.
        const shouldGenerate =
            task.recurring &&
            !task.nextOccurrenceGenerated &&
            task.recurrenceCycle &&
            task.dueDate;

        if (shouldGenerate) {
            const currentDueISO = task.dueDate instanceof Date
                ? task.dueDate.toISOString().slice(0, 10)
                : String(task.dueDate).slice(0, 10);
            newDueDate = nextDueDate(currentDueISO, task.recurrenceCycle);

            if (newDueDate) {
                // The sequence id is the root occurrence's id (fall back to
                // this task's id for legacy rows that predate the column).
                const parentId = task.recurrenceParentID || task.dependantTaskID;

                const ins = await new sql.Request(tx)
                    .input('did', task.dependantID)
                    .input('mid', task.mainMemberID)
                    .input('taskName', task.taskName)
                    .input('desc', task.description)
                    .input('due', newDueDate)
                    .input('reward', task.reward)
                    .input('cycle', task.recurrenceCycle)
                    .input('parent', parentId)
                    .query(`
                        INSERT INTO DependantTask
                            (dependantID, mainMemberID, taskName, description, dueDate, reward,
                             taskStatus, recurring, recurrenceCycle, recurrenceParentID, nextOccurrenceGenerated)
                        OUTPUT INSERTED.dependantTaskID
                        VALUES
                            (@did, @mid, @taskName, @desc, @due, @reward,
                             'pending', 1, @cycle, @parent, 0)
                    `);
                newTaskId = ins.recordset[0].dependantTaskID;

                // Flip the guard so this completed occurrence can never spawn
                // another one (e.g. on a duplicate request or page refresh).
                await new sql.Request(tx)
                    .input('tid', tid)
                    .query('UPDATE DependantTask SET nextOccurrenceGenerated = 1 WHERE dependantTaskID = @tid');

                // Will the wallet be able to fund the NEXT occurrence's reward?
                // We do NOT reserve funds for it (that would double-allocate for
                // an unlimited recurring series). We simply detect the shortfall
                // so the main member can be told the recurring task needs
                // attention. The next occurrence is still created (so history
                // and recurrence continue), but it won't be completable until
                // the wallet is topped up — the completion charge above will
                // block it otherwise.
                if (rewardAmount > 0) {
                    const remaining = balanceAfter != null ? balanceAfter : null;
                    if (remaining != null && remaining < rewardAmount) {
                        nextFundingShort = true;
                    }
                }
            }
        }

        await tx.commit();

        // ── Post-commit side effect: warn about an unfundable next occurrence ──
        if (nextFundingShort && newTaskId != null) {
            try {
                await notificationService.createNotification({
                    subscriberID: mid,
                    type: NOTIFICATION_TYPES.INSUFFICIENT_FUNDS,
                    title: 'Recurring task needs attention',
                    message: 'Your recurring task "' + task.taskName + '" could not be guaranteed to continue '
                        + 'because your wallet has insufficient funds to cover the next reward. Please upload funds '
                        + 'to your wallet, reduce the reward amount, or edit or delete the recurring task.',
                    relatedEntityType: ENTITY_TYPES.DEPENDANT,
                    relatedEntityID: task.dependantID,
                    eventToken: 'task-funding-' + newTaskId,
                    metadata: { taskName: task.taskName, nextOccurrenceID: newTaskId, reward: rewardAmount }
                });
            } catch (nErr) {
                console.warn('Task funding notification failed:', nErr.message);
            }
        }

        return res.json({
            message: 'Task completed',
            generatedNextOccurrence: newTaskId != null,
            nextOccurrenceID: newTaskId,
            nextDueDate: newDueDate,
            rewardCharged: rewardAmount > 0 ? rewardAmount : 0,
            balanceAfter: balanceAfter,
            nextOccurrenceFundingShort: nextFundingShort
        });
    } catch (err) {
        try { await tx.rollback(); } catch (_) { /* ignore */ }
        return res.status(500).json({ error: err.message });
    }
}

/**
 * Revert a task from 'completed' to a non-completed status (un-mark / undo).
 *
 * If the occurrence's reward was actually charged (taskRewardPaid = 1), the
 * reward is REFUNDED to the main member's wallet and a reversing credit
 * transaction is recorded — atomically and exactly once. The taskRewardPaid
 * flag is cleared so a later re-completion charges the reward again cleanly.
 * This guarantees complete → unmark → complete never debits twice.
 *
 * Also clears completedAt and re-arms nextOccurrenceGenerated so re-completing
 * can regenerate the next occurrence.
 */
async function revertTaskCompletion(tid, mid, newStatus, res) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
        // Lock + read the occurrence.
        const read = await new sql.Request(tx)
            .input('tid', tid)
            .input('mid', mid)
            .query(`
                SELECT dependantTaskID, dependantID, mainMemberID, taskName,
                       reward, taskStatus, taskRewardPaid
                FROM DependantTask WITH (UPDLOCK, HOLDLOCK)
                WHERE dependantTaskID = @tid AND mainMemberID = @mid
            `);

        if (read.recordset.length === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'Task not found' });
        }

        const task = read.recordset[0];
        const rewardAmount = money(task.reward) || 0;

        // Refund only when there is an outstanding paid reward for this
        // occurrence. The taskRewardPaid guard makes this idempotent: a second
        // un-mark (or a duplicate request) finds the flag already 0 and does
        // not refund again.
        let refunded = 0;
        let balanceAfter = null;

        if (task.taskRewardPaid && rewardAmount > 0) {
            const walletRes = await new sql.Request(tx)
                .input('mid', mid)
                .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @mid');

            if (walletRes.recordset.length > 0) {
                const walletID = walletRes.recordset[0].walletID;
                const balanceBefore = parseFloat(walletRes.recordset[0].balance) || 0;
                balanceAfter = money(balanceBefore + rewardAmount);

                // Credit the reward back.
                await new sql.Request(tx)
                    .input('bal', balanceAfter)
                    .input('wid', walletID)
                    .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');

                // Record the reversing refund transaction (money back to parent).
                await new sql.Request(tx)
                    .input('wid', walletID)
                    .input('did', task.dependantID)
                    .input('amt', rewardAmount)
                    .input('after', balanceAfter)
                    .input('desc', 'Task reward reversed: ' + task.taskName)
                    .query(`
                        INSERT INTO WalletTransaction
                            (walletID, dependantID, transactionType, transactionAmount, runningBalance, description, category)
                        VALUES
                            (@wid, @did, 'credit', @amt, @after, @desc, 'task-reward-refund')
                    `);

                // ── Reverse the dependant credit leg: take the reward back
                //    OUT of the dependant's wallet, mirroring the credit made
                //    on completion. Clamped at 0 so the dependant balance never
                //    goes negative (e.g. if they already spent it).
                const depWallet = await ensureDependantWallet(task.dependantID, tx);
                const depBefore = parseFloat(depWallet.balance) || 0;
                const depAfter = money(Math.max(0, depBefore - rewardAmount));
                await new sql.Request(tx)
                    .input('bal', depAfter)
                    .input('wid', depWallet.walletID)
                    .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');
                await new sql.Request(tx)
                    .input('wid', depWallet.walletID)
                    .input('did', task.dependantID)
                    .input('amt', rewardAmount)
                    .input('after', depAfter)
                    .input('desc', 'Task reward reversed: ' + task.taskName)
                    .query(`
                        INSERT INTO WalletTransaction
                            (walletID, dependantID, transactionType, transactionAmount, runningBalance, description, category)
                        VALUES
                            (@wid, @did, 'debit', @amt, @after, @desc, 'task-reward-earned-reversal')
                    `);

                refunded = rewardAmount;
            }
        }

        // Apply the status change, clear completion state, clear the paid flag
        // (so re-completion can charge again), and re-arm next-occurrence
        // generation so re-completing can regenerate the next occurrence.
        await new sql.Request(tx)
            .input('tid', tid)
            .input('mid', mid)
            .input('status', newStatus)
            .query(`
                UPDATE DependantTask
                SET taskStatus = @status, completedAt = NULL, updatedAt = GETDATE(),
                    taskRewardPaid = 0, nextOccurrenceGenerated = 0
                WHERE dependantTaskID = @tid AND mainMemberID = @mid
            `);

        await tx.commit();
        return res.json({
            message: 'Task reverted',
            status: newStatus,
            rewardRefunded: refunded,
            balanceAfter: balanceAfter
        });
    } catch (err) {
        try { await tx.rollback(); } catch (_) { /* ignore */ }
        return res.status(500).json({ error: err.message });
    }
}

// DELETE /api/dependants/:depId/tasks/:taskId
//
// Deletes a single occurrence. Because the next occurrence is ONLY ever
// generated when the current one is completed (there is no background job
// that recreates tasks), deleting the active/incomplete occurrence of a
// recurring sequence immediately and permanently stops future generation.
// Completed history rows for the sequence are independent and are left
// untouched unless the caller deletes them explicitly.
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
