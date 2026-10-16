/* ===========================================================
   /api/notifications — User notifications
   Backed by services/notificationService.js which uses the
   shared SQL Server connection. All routes require auth and
   are scoped to the authenticated user (req.user.subscriberID).
=========================================================== */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();
router.use(authenticateToken);

/* -----------------------------------------------------------
   GET /api/notifications
   Query params:
     ?unread=true       only unread notifications
     ?limit=50          page size (default 50, max 200)
     ?offset=0          pagination offset
     ?meta=true         return { items, total, unread, ... } envelope

   BACKWARD COMPATIBILITY: by default returns a raw array
   (the existing website bell/dropdown expects an array).
   Pass ?meta=true to get the paginated envelope.
----------------------------------------------------------- */
router.get('/', async (req, res) => {
    try {
        const unreadOnly = req.query.unread === 'true';
        const wantMeta = req.query.meta === 'true';
        const result = await notificationService.getUserNotifications(req.user.subscriberID, {
            unreadOnly,
            limit: req.query.limit,
            offset: req.query.offset
        });

        if (wantMeta) {
            return res.json(result);
        }
        // Legacy shape: raw array
        return res.json(result.items);
    } catch (err) {
        console.error('[notifications] list error:', err.message);
        res.status(500).json({ error: 'Could not retrieve notifications' });
    }
});

/* -----------------------------------------------------------
   GET /api/notifications/unread-count
   Returns { count: <n> }
----------------------------------------------------------- */
router.get('/unread-count', async (req, res) => {
    try {
        const count = await notificationService.getUnreadCount(req.user.subscriberID);
        res.json({ count });
    } catch (err) {
        console.error('[notifications] unread-count error:', err.message);
        res.status(500).json({ error: 'Could not retrieve unread count' });
    }
});

/* -----------------------------------------------------------
   PATCH /api/notifications/:id/read
   Marks a single notification read (owner-checked).
----------------------------------------------------------- */
router.patch('/:id/read', async (req, res) => {
    try {
        const nid = parseInt(req.params.id, 10);
        if (isNaN(nid)) return res.status(400).json({ error: 'Invalid notification ID' });

        const result = await notificationService.markAsRead(req.user.subscriberID, nid);
        if (!result.updated) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error('[notifications] mark-read error:', err.message);
        res.status(500).json({ error: 'Could not mark notification as read' });
    }
});

/* -----------------------------------------------------------
   PATCH /api/notifications/read-all      (spec name)
   PATCH /api/notifications/mark-all-read (legacy website name)
   Both mark all of the user's notifications read.
----------------------------------------------------------- */
async function _markAllHandler(req, res) {
    try {
        const result = await notificationService.markAllAsRead(req.user.subscriberID);
        res.json({ message: 'All marked as read', updated: result.updated });
    } catch (err) {
        console.error('[notifications] mark-all-read error:', err.message);
        res.status(500).json({ error: 'Could not mark all as read' });
    }
}
router.patch('/read-all', _markAllHandler);
router.patch('/mark-all-read', _markAllHandler);

/* -----------------------------------------------------------
   POST /api/notifications/generate-reminders
   Immediately generates upcoming-payment reminder notifications
   for the authenticated user, bypassing the hour-gate.
   Returns how many new notifications were created.
----------------------------------------------------------- */
router.post('/generate-reminders', async (req, res) => {
    try {
        const subscriptionReminders = require('../jobs/subscriptionReminders');
        const paymentSummaries = require('../jobs/paymentSummaries');
        const now = new Date();
        const opts = { force: true };

        // Run per-subscription reminders (7/3/1/0 days before billing date)
        const reminders = await subscriptionReminders.runSubscriptionReminders(now, opts);
        // Run upcoming-payment summary (aggregated list for the next 7 days)
        const summary = await paymentSummaries.runUpcomingPaymentSummary(now, opts);
        // Run insufficient-funds check within next 7 days
        const funds = await paymentSummaries.runInsufficientFundsCheck(now, opts);

        res.json({
            message: 'Reminders generated',
            sent: (reminders.sent || 0) + (summary.sent || 0) + (funds.sent || 0),
            details: { reminders, summary, funds }
        });
    } catch (err) {
        console.error('[notifications] generate-reminders error:', err.message);
        res.status(500).json({ error: 'Could not generate reminders: ' + err.message });
    }
});

/* -----------------------------------------------------------
   DELETE /api/notifications/:id
   Deletes a notification (owner-checked).
----------------------------------------------------------- */
router.delete('/:id', async (req, res) => {
    try {
        const nid = parseInt(req.params.id, 10);
        if (isNaN(nid)) return res.status(400).json({ error: 'Invalid notification ID' });

        const result = await notificationService.deleteNotification(req.user.subscriberID, nid);
        if (!result.deleted) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json({ message: 'Notification deleted' });
    } catch (err) {
        console.error('[notifications] delete error:', err.message);
        res.status(500).json({ error: 'Could not delete notification' });
    }
});

module.exports = router;
