/* ===========================================================
   /api/me — Dependant self-service endpoints
   Everything here is scoped to the signed-in DEPENDANT's own
   account (req.user.subscriberID). A dependant can:
     • view their own assigned tasks
     • complete an eligible task
     • submit a fund request (only when the feature is enabled)
     • view their own fund requests
   They can NEVER create/edit/delete task definitions, change
   rewards/recurrence, change their allowance/limit/role, or touch
   another dependant's data. Those are blocked by requireDependant
   and by always keying on req.user.subscriberID.
=========================================================== */

const express = require('express');
const { query, getPool, sql } = require('../db');
const { authenticateToken, requireDependant } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES, ENTITY_TYPES } = require('../constants/notificationTypes');

const router = express.Router();
router.use(authenticateToken);
router.use(requireDependant);

const MAX_AMOUNT = 100000;

function money(n) {
    return Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100;
}
function makeReference(prefix, id) {
    return `FS-${prefix}-${String(id).padStart(6, '0')}`;
}

/* Amount validator mirroring scripts/validators.js (exact messages). */
function validateAmount(value, options) {
    const opts = options || {};
    const required = !!opts.required;
    const max = typeof opts.max === 'number' ? opts.max : MAX_AMOUNT;
    let raw;
    if (typeof value === 'number') {
        if (!isFinite(value)) return { valid: false, value: null, message: 'Please enter a valid amount using numbers and up to two decimal places.' };
        raw = String(value);
    } else {
        raw = (value == null ? '' : String(value)).trim();
    }
    if (raw === '') {
        if (required) return { valid: false, value: null, message: 'Please enter an amount.' };
        return { valid: true, value: 0, message: '' };
    }
    if (/^-/.test(raw)) {
        if (/^-\d+(\.\d+)?$/.test(raw)) return { valid: false, value: null, message: 'The amount cannot be negative.' };
        return { valid: false, value: null, message: 'Please enter a valid amount using numbers and up to two decimal places.' };
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        return { valid: false, value: null, message: 'Please enter a valid amount using numbers and up to two decimal places.' };
    }
    const num = parseFloat(raw);
    if (!isFinite(num)) return { valid: false, value: null, message: 'Please enter a valid amount using numbers and up to two decimal places.' };
    if (num < 0) return { valid: false, value: null, message: 'The amount cannot be negative.' };
    if (num === 0 && required) return { valid: false, value: null, message: 'Please enter an amount greater than zero.' };
    if (num > max) return { valid: false, value: null, message: 'The amount cannot exceed R100,000.00.' };
    return { valid: true, value: num, message: '' };
}

/** The dependant's own Dependant row (relationship to a main member). */
async function getSelfDependant(subscriberID) {
    const r = await query(
        'SELECT dependantID, mainMemberID, canRequestFunds, status FROM Dependant WHERE dependantID = @id',
        { id: subscriberID }
    );
    return r.recordset[0] || null;
}

/* ===========================================================
   GET /api/me/tasks
   The dependant's own tasks. Keyed on their subscriberID so a
   dependant can only ever see tasks assigned to them.
=========================================================== */
router.get('/tasks', async (req, res) => {
    try {
        const result = await query(`
            SELECT dependantTaskID, dependantID, mainMemberID, taskName, description,
                   dueDate, reward, taskStatus, recurring, recurrenceCycle,
                   recurrenceParentID, taskRewardPaid, completedAt, createdAt, updatedAt
            FROM DependantTask
            WHERE dependantID = @id
            ORDER BY
                CASE taskStatus WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 0
                                WHEN 'overdue' THEN 1 ELSE 2 END,
                dueDate ASC, createdAt DESC
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================================================
   POST /api/me/tasks/:taskId/complete
   Dependant marks their OWN eligible task complete. Delegates to
   the shared, atomic completion routine so all the recurrence /
   reward / daily-date rules are enforced identically to the main
   member path. Ownership is verified against req.user.subscriberID.
=========================================================== */
router.post('/tasks/:taskId/complete', async (req, res) => {
    try {
        const tid = parseInt(req.params.taskId);
        // Confirm the task belongs to THIS dependant and get the mainMemberID
        // whose wallet funds the reward.
        const own = await query(
            'SELECT mainMemberID FROM DependantTask WHERE dependantTaskID = @tid AND dependantID = @did',
            { tid, did: req.user.subscriberID }
        );
        if (own.recordset.length === 0) return res.status(404).json({ error: 'Task not found' });
        const mid = own.recordset[0].mainMemberID;

        // Reuse the exact same completion engine used by the main member so
        // behaviour (daily-date rule, reward debit/credit, recurrence, idempotency)
        // is identical and enforced server-side.
        const { completeTaskOccurrence } = require('./dependants');
        return await completeTaskOccurrence(tid, mid, res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================================================
   REQUEST FUNDS
=========================================================== */

const REQUEST_DISABLED_MSG =
    'Your main member has not enabled the Request Funds feature for your account. Please contact them if you need additional funds.';

// GET /api/me/request-funds/status — is the feature enabled for me?
router.get('/request-funds/status', async (req, res) => {
    try {
        const self = await getSelfDependant(req.user.subscriberID);
        if (!self) return res.status(404).json({ error: 'Dependant profile not found' });
        res.json({ enabled: self.canRequestFunds === true || self.canRequestFunds === 1 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/me/fund-requests — the dependant's own request history
router.get('/fund-requests', async (req, res) => {
    try {
        const r = await query(`
            SELECT fundRequestID, amount, reason, status, reference, createdAt, respondedAt
            FROM FundRequest
            WHERE dependantID = @did
            ORDER BY createdAt DESC
        `, { did: req.user.subscriberID });
        res.json(r.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/me/fund-requests — submit a fund request (request ONLY; no money moves)
router.post('/fund-requests', async (req, res) => {
    try {
        const self = await getSelfDependant(req.user.subscriberID);
        if (!self) return res.status(404).json({ error: 'Dependant profile not found' });

        // Permission is ALWAYS checked against the CURRENT database value, never
        // a cached/frontend value. If the main member disabled it (even while a
        // form was open) the submission is rejected here.
        const enabled = self.canRequestFunds === true || self.canRequestFunds === 1;
        if (!enabled) return res.status(403).json({ error: REQUEST_DISABLED_MSG });

        const amtResult = validateAmount(req.body.amount, { required: true });
        if (!amtResult.valid) return res.status(400).json({ error: amtResult.message });
        const amount = money(amtResult.value);
        if (!(amount > 0)) return res.status(400).json({ error: 'Please enter an amount greater than zero.' });

        const reason = req.body.reason != null ? String(req.body.reason).trim().slice(0, 300) : null;

        // Duplicate-guard: reject an identical pending request made within the
        // last 60 seconds (protects against double-submits / retries). This is
        // a genuine request record, not money movement.
        const recent = await query(`
            SELECT TOP 1 fundRequestID FROM FundRequest
            WHERE dependantID = @did AND status = 'pending' AND amount = @amt
              AND createdAt > DATEADD(SECOND, -60, GETDATE())
        `, { did: req.user.subscriberID, amt: amount });
        if (recent.recordset.length > 0) {
            return res.status(409).json({ error: 'You already submitted this request a moment ago. Please wait for your main member to respond.' });
        }

        const ins = await query(`
            INSERT INTO FundRequest (dependantID, mainMemberID, amount, reason, status)
            OUTPUT INSERTED.fundRequestID, INSERTED.createdAt
            VALUES (@did, @mid, @amt, @reason, 'pending')
        `, { did: req.user.subscriberID, mid: self.mainMemberID, amt: amount, reason });

        const reqId = ins.recordset[0].fundRequestID;
        const reference = makeReference('REQ', reqId);
        await query('UPDATE FundRequest SET reference = @ref WHERE fundRequestID = @id', { ref: reference, id: reqId });

        // Resolve the dependant's display name for the activity message.
        let depName = 'Your dependant';
        try {
            const n = await query('SELECT firstName, lastName, preferredName FROM Subscriber WHERE subscriberID = @id', { id: req.user.subscriberID });
            if (n.recordset.length) {
                const r = n.recordset[0];
                depName = r.preferredName || [r.firstName, r.lastName].filter(Boolean).join(' ') || depName;
            }
        } catch (_) { /* non-fatal */ }

        // ── Activity for BOTH parties (request only — never an approval) ──
        try {
            await notificationService.createNotification({
                subscriberID: self.mainMemberID,
                type: NOTIFICATION_TYPES.SYSTEM,
                title: 'Fund request received',
                message: `${depName} requested R${amount.toFixed(2)} in additional funds`
                    + (reason ? `: "${reason}".` : '.'),
                relatedEntityType: ENTITY_TYPES.DEPENDANT,
                relatedEntityID: req.user.subscriberID,
                eventToken: 'fund-request-' + reqId,
                metadata: { reference, amount, reason: reason || null, dependant: depName }
            });
        } catch (_) { /* non-fatal */ }
        try {
            await notificationService.createNotification({
                subscriberID: req.user.subscriberID,
                type: NOTIFICATION_TYPES.SYSTEM,
                title: 'Fund request sent',
                message: `You requested R${amount.toFixed(2)} in additional funds. Your main member will review it.`,
                relatedEntityType: ENTITY_TYPES.DEPENDANT,
                relatedEntityID: req.user.subscriberID,
                eventToken: 'fund-request-self-' + reqId,
                metadata: { reference, amount }
            });
        } catch (_) { /* non-fatal */ }

        res.status(201).json({
            message: 'Fund request submitted',
            fundRequestID: reqId,
            reference,
            amount,
            status: 'pending'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
