/* ===========================================================
   /api/notifications — User notifications
=========================================================== */
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/notifications
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM Notification
            WHERE subscriberID = @id
            ORDER BY createdAt DESC
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
    try {
        const result = await query(`
            SELECT COUNT(*) as count FROM Notification
            WHERE subscriberID = @id AND isRead = 0
        `, { id: req.user.subscriberID });
        res.json({ count: result.recordset[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
    try {
        await query('UPDATE Notification SET isRead = 1 WHERE notificationID = @nid AND subscriberID = @sid', {
            nid: parseInt(req.params.id), sid: req.user.subscriberID
        });
        res.json({ message: 'Marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/notifications/mark-all-read
router.patch('/mark-all-read', async (req, res) => {
    try {
        await query('UPDATE Notification SET isRead = 1 WHERE subscriberID = @id AND isRead = 0', { id: req.user.subscriberID });
        res.json({ message: 'All marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
