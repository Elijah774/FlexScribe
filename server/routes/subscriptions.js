/* ===========================================================
   /api/subscriptions — CRUD for user subscriptions
=========================================================== */
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { updateUserAnalytics } = require('../helpers/update-analytics');

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
        updateUserAnalytics(req.user.subscriberID);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res) => {
    try {
        const { serviceName, categoryID, billingAmount, billingCycle, billingDate, subStatus, notes, logoClass, logoText, colorTag, reminderDays, providerUrl } = req.body;

        // Build dynamic SET clause — only update fields that were actually sent
        const sets = [];
        const params = {
            subID: parseInt(req.params.id),
            subscriberID: req.user.subscriberID
        };

        if (serviceName !== undefined && serviceName !== null) { sets.push('serviceName = @serviceName'); params.serviceName = serviceName; }
        if (categoryID !== undefined && categoryID !== null) { sets.push('categoryID = @categoryID'); params.categoryID = parseInt(categoryID); }
        if (billingAmount !== undefined && billingAmount !== null) { sets.push('billingAmount = @billingAmount'); params.billingAmount = parseFloat(billingAmount); }
        if (billingCycle !== undefined && billingCycle !== null) { sets.push('billingCycle = @billingCycle'); params.billingCycle = billingCycle; }
        if (billingDate !== undefined) { sets.push('billingDate = @billingDate'); params.billingDate = billingDate || null; }
        if (subStatus !== undefined && subStatus !== null && subStatus !== '') { sets.push('subStatus = @subStatus'); params.subStatus = subStatus; }
        if (notes !== undefined) { sets.push('notes = @notes'); params.notes = notes || null; }
        if (logoClass !== undefined) { sets.push('logoClass = @logoClass'); params.logoClass = logoClass || null; }
        if (logoText !== undefined) { sets.push('logoText = @logoText'); params.logoText = logoText || null; }
        if (colorTag !== undefined) { sets.push('colorTag = @colorTag'); params.colorTag = colorTag || null; }
        if (reminderDays !== undefined) { sets.push('reminderDays = @reminderDays'); params.reminderDays = reminderDays ? parseInt(reminderDays) : null; }
        if (providerUrl !== undefined) { sets.push('providerUrl = @providerUrl'); params.providerUrl = providerUrl || null; }

        sets.push('updatedAt = GETDATE()');

        await query(`
            UPDATE Subscription SET ${sets.join(', ')}
            WHERE subscriptionID = @subID AND subscriberID = @subscriberID
        `, params);

        res.json({ message: 'Subscription updated' });
        updateUserAnalytics(req.user.subscriberID);
    } catch (err) {
        console.error('Subscription update error:', err.message);
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
        updateUserAnalytics(req.user.subscriberID);
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
        updateUserAnalytics(req.user.subscriberID);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
