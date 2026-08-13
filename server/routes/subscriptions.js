/* ===========================================================
   /api/subscriptions — CRUD for user subscriptions
=========================================================== */
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/subscriptions
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT s.*, c.categoryName
            FROM Subscription s
            JOIN SubscriptionCategory c ON s.categoryID = c.categoryID
            WHERE s.subscriberID = @id
            ORDER BY s.createdAt DESC
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/subscriptions/stats
router.get('/stats', async (req, res) => {
    try {
        const subs = await query(`
            SELECT s.*, c.categoryName
            FROM Subscription s
            JOIN SubscriptionCategory c ON s.categoryID = c.categoryID
            WHERE s.subscriberID = @id
        `, { id: req.user.subscriberID });

        const all = subs.recordset;
        const active = all.filter(s => s.subStatus === 'active');
        const monthly = active.reduce((sum, s) => {
            let amt = parseFloat(s.billingAmount);
            if (s.billingCycle === 'weekly') amt = amt * 52 / 12;
            else if (s.billingCycle === 'quarterly') amt = amt / 3;
            else if (s.billingCycle === 'yearly') amt = amt / 12;
            return sum + amt;
        }, 0);

        res.json({
            activeCount: active.length,
            totalCount: all.length,
            monthly: monthly.toFixed(2),
            annual: (monthly * 12).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/subscriptions
router.post('/', async (req, res) => {
    try {
        const { serviceName, categoryID, billingAmount, billingCycle, billingDate, notes, logoClass, logoText, colorTag, reminderDays, providerUrl } = req.body;

        if (!serviceName || !billingAmount) {
            return res.status(400).json({ error: 'Service name and amount are required.' });
        }

        const result = await query(`
            INSERT INTO Subscription (subscriberID, categoryID, serviceName, billingAmount, billingCycle, billingDate, notes, logoClass, logoText, colorTag, reminderDays, providerUrl)
            OUTPUT INSERTED.*
            VALUES (@subscriberID, @categoryID, @serviceName, @billingAmount, @billingCycle, @billingDate, @notes, @logoClass, @logoText, @colorTag, @reminderDays, @providerUrl)
        `, {
            subscriberID: req.user.subscriberID,
            categoryID: categoryID || 12, // 'Other'
            serviceName, billingAmount,
            billingCycle: billingCycle || 'monthly',
            billingDate: billingDate || null,
            notes: notes || null,
            logoClass: logoClass || null,
            logoText: logoText || null,
            colorTag: colorTag || null,
            reminderDays: reminderDays || null,
            providerUrl: providerUrl || null
        });

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res) => {
    try {
        const { serviceName, categoryID, billingAmount, billingCycle, billingDate, subStatus, notes, logoClass, logoText, colorTag, reminderDays, providerUrl } = req.body;

        await query(`
            UPDATE Subscription SET
                serviceName = ISNULL(@serviceName, serviceName),
                categoryID = ISNULL(@categoryID, categoryID),
                billingAmount = ISNULL(@billingAmount, billingAmount),
                billingCycle = ISNULL(@billingCycle, billingCycle),
                billingDate = @billingDate,
                subStatus = ISNULL(@subStatus, subStatus),
                notes = @notes,
                logoClass = @logoClass,
                logoText = @logoText,
                colorTag = @colorTag,
                reminderDays = @reminderDays,
                providerUrl = @providerUrl,
                updatedAt = GETDATE()
            WHERE subscriptionID = @subID AND subscriberID = @subscriberID
        `, {
            subID: parseInt(req.params.id),
            subscriberID: req.user.subscriberID,
            serviceName, categoryID, billingAmount, billingCycle,
            billingDate: billingDate || null,
            subStatus, notes: notes || null,
            logoClass: logoClass || null, logoText: logoText || null,
            colorTag: colorTag || null, reminderDays: reminderDays || null,
            providerUrl: providerUrl || null
        });

        res.json({ message: 'Subscription updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/subscriptions/:id
router.delete('/:id', async (req, res) => {
    try {
        await query('DELETE FROM Subscription WHERE subscriptionID = @id AND subscriberID = @subscriberID', {
            id: parseInt(req.params.id),
            subscriberID: req.user.subscriberID
        });
        res.json({ message: 'Subscription deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/subscriptions/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
    try {
        await query(`
            UPDATE Subscription SET
                subStatus = CASE WHEN subStatus = 'active' THEN 'paused' ELSE 'active' END,
                updatedAt = GETDATE()
            WHERE subscriptionID = @id AND subscriberID = @subscriberID
        `, { id: parseInt(req.params.id), subscriberID: req.user.subscriberID });

        res.json({ message: 'Subscription toggled' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
