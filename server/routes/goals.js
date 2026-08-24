/* ===========================================================
   /api/goals — CRUD for financial goals + contributions
=========================================================== */
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/goals
router.get('/', async (req, res) => {
    try {
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

        res.status(201).json(result.recordset[0]);
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
        if (goalStatus && ['active', 'completed', 'paused'].includes(goalStatus)) { sets.push('goalStatus = @status'); params.status = goalStatus; }

        if (sets.length === 0) return res.json({ message: 'Nothing to update' });

        await query(`
            UPDATE FinancialGoal SET ${sets.join(', ')}
            WHERE goalID = @gid AND subscriberID = @sid
        `, params);

        res.json({ message: 'Goal updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/goals/:id
router.delete('/:id', async (req, res) => {
    try {
        await query('DELETE FROM GoalContribution WHERE goalID = @gid', { gid: parseInt(req.params.id) });
        await query('DELETE FROM FinancialGoal WHERE goalID = @gid AND subscriberID = @sid', { gid: parseInt(req.params.id), sid: req.user.subscriberID });
        res.json({ message: 'Goal deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals/:id/contribute
router.post('/:id/contribute', async (req, res) => {
    try {
        const { amount, source } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

        await query('UPDATE FinancialGoal SET currentProgress = currentProgress + @amt, lastTopUpDate = GETDATE() WHERE goalID = @gid AND subscriberID = @sid', {
            amt: amount, gid: parseInt(req.params.id), sid: req.user.subscriberID
        });

        await query('INSERT INTO GoalContribution (goalID, amount, source) VALUES (@gid, @amt, @src)', {
            gid: parseInt(req.params.id), amt: amount, src: source || 'manual'
        });

        // Check if goal completed
        const goal = await query('SELECT targetAmount, currentProgress FROM FinancialGoal WHERE goalID = @gid', { gid: parseInt(req.params.id) });
        if (goal.recordset.length > 0 && parseFloat(goal.recordset[0].currentProgress) >= parseFloat(goal.recordset[0].targetAmount)) {
            await query("UPDATE FinancialGoal SET goalStatus = 'completed' WHERE goalID = @gid", { gid: parseInt(req.params.id) });
        }

        res.json({ message: 'Contribution added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
