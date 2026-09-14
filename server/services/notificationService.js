/* ===========================================================
   notificationService.js
   Central notification service for FlexScribe.

   Responsibilities:
   - createNotification()        create a notification (with dedupe)
   - getUserNotifications()      list a user's notifications (filter/paginate)
   - getUnreadCount()            unread count for a user
   - markAsRead()                mark one notification read (owner-checked)
   - markAllAsRead()             mark all of a user's notifications read
   - deleteNotification()        delete one (owner-checked)
   - preventDuplicateNotification() dedupe helper

   Uses the shared SQL Server connection from ../db (no new pool).
   Requires migration 002-extend-notifications.sql to have been run.
=========================================================== */

'use strict';

const { query } = require('../db');
const {
    NOTIFICATION_TYPES,
    PRIORITY,
    ENTITY_TYPES,
    DEFAULT_ACTION_URLS,
    DEFAULT_PRIORITY,
    isValidType,
    isValidPriority
} = require('../constants/notificationTypes');

/* -----------------------------------------------------------
   DEDUPE KEY
   Builds a stable string identifying a unique notification
   event so the scheduler can run repeatedly without creating
   duplicates. Combines: type + entity type + entity id + a
   caller-supplied event token (e.g. a billing date).
----------------------------------------------------------- */
function buildDedupeKey(subscriberID, type, entityType, entityID, eventToken) {
    return [
        subscriberID,
        type,
        entityType || 'NONE',
        entityID != null ? entityID : 'x',
        eventToken || ''
    ].join('|');
}

/* -----------------------------------------------------------
   preventDuplicateNotification
   Returns true if a notification with the same dedupeKey
   already exists for this user (so the caller should skip
   creating another one).
----------------------------------------------------------- */
async function preventDuplicateNotification(subscriberID, dedupeKey) {
    if (!dedupeKey) return false; // no key => can't dedupe, allow creation
    const result = await query(`
        SELECT TOP 1 notificationID
        FROM Notification
        WHERE subscriberID = @sid AND dedupeKey = @key
    `, { sid: subscriberID, key: dedupeKey });
    return result.recordset.length > 0;
}

/* -----------------------------------------------------------
   createNotification
   @param {object} opts
     subscriberID   (required) target user
     type           (required) one of NOTIFICATION_TYPES
     title          (required)
     message        (optional) body text
     priority       (optional) defaults per-type
     relatedEntityType (optional)
     relatedEntityID   (optional)
     actionUrl      (optional) defaults per-type
     metadata       (optional) object -> stored as JSON
     scheduledFor   (optional) Date/string for future send
     expiresAt      (optional) Date/string
     eventToken     (optional) used to build dedupeKey
     subscriptionID (optional) legacy FK column
     transactionID  (optional) legacy FK column
   @returns { created: bool, notification: {...} | null, reason?: string }
----------------------------------------------------------- */
async function createNotification(opts) {
    const {
        subscriberID,
        type,
        title,
        message = null,
        relatedEntityType = ENTITY_TYPES.NONE,
        relatedEntityID = null,
        metadata = null,
        scheduledFor = null,
        expiresAt = null,
        eventToken = null,
        subscriptionID = null,
        transactionID = null
    } = opts || {};

    // Validation
    if (!subscriberID) throw new Error('subscriberID is required');
    if (!type || !isValidType(type)) throw new Error('A valid notification type is required');
    if (!title) throw new Error('title is required');

    const priority = (opts.priority && isValidPriority(opts.priority))
        ? opts.priority
        : (DEFAULT_PRIORITY[type] || PRIORITY.MEDIUM);

    const actionUrl = opts.actionUrl || DEFAULT_ACTION_URLS[type] || null;

    // Build dedupe key and check for an existing duplicate
    const dedupeKey = buildDedupeKey(subscriberID, type, relatedEntityType, relatedEntityID, eventToken);
    const isDuplicate = await preventDuplicateNotification(subscriberID, dedupeKey);
    if (isDuplicate) {
        return { created: false, notification: null, reason: 'duplicate' };
    }

    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    // NOTE: We intentionally do NOT write the legacy subscriptionID /
    // transactionID FK columns. Those carry FK constraints
    // (FK_Notification_Subscription / FK_Notification_Transaction) that
    // would reject a notification whose referenced row does not exist
    // (e.g. a failed payment that never produced a transaction row).
    // Entity links are stored in relatedEntityType + relatedEntityID
    // (no FK), which is the correct, decoupled place for them.
    const result = await query(`
        INSERT INTO Notification (
            subscriberID,
            notificationType, title, body, isRead, priority,
            linkTo, relatedEntityType, relatedEntityID, actionUrl,
            metadata, scheduledFor, sentAt, expiresAt, dedupeKey, createdAt
        )
        OUTPUT INSERTED.*
        VALUES (
            @subscriberID,
            @type, @title, @message, 0, @priority,
            @actionUrl, @relatedEntityType, @relatedEntityID, @actionUrl,
            @metadata, @scheduledFor, @sentAt, @expiresAt, @dedupeKey, GETDATE()
        )
    `, {
        subscriberID,
        type,
        title,
        message,
        priority,
        actionUrl,
        relatedEntityType,
        relatedEntityID,
        metadata: metadataJson,
        scheduledFor: scheduledFor || null,
        // If not scheduled for later, it is effectively sent now
        sentAt: scheduledFor ? null : new Date(),
        expiresAt: expiresAt || null,
        dedupeKey
    });

    return { created: true, notification: result.recordset[0] };
}

/* -----------------------------------------------------------
   getUserNotifications
   @param {number} subscriberID
   @param {object} options { unreadOnly, limit, offset }
   @returns { items: [...], total, unread, limit, offset }
----------------------------------------------------------- */
async function getUserNotifications(subscriberID, options = {}) {
    const unreadOnly = options.unreadOnly === true;
    let limit = parseInt(options.limit, 10);
    let offset = parseInt(options.offset, 10);
    if (isNaN(limit) || limit <= 0) limit = 50;
    if (limit > 200) limit = 200; // hard cap
    if (isNaN(offset) || offset < 0) offset = 0;

    const whereRead = unreadOnly ? 'AND isRead = 0' : '';

    // Only surface notifications that are due now (scheduledFor null or in past)
    // and not expired.
    const items = await query(`
        SELECT *
        FROM Notification
        WHERE subscriberID = @sid
          ${whereRead}
          AND (scheduledFor IS NULL OR scheduledFor <= GETDATE())
          AND (expiresAt IS NULL OR expiresAt > GETDATE())
        ORDER BY createdAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, { sid: subscriberID, offset, limit });

    const totals = await query(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN isRead = 0 THEN 1 ELSE 0 END) AS unread
        FROM Notification
        WHERE subscriberID = @sid
          AND (scheduledFor IS NULL OR scheduledFor <= GETDATE())
          AND (expiresAt IS NULL OR expiresAt > GETDATE())
    `, { sid: subscriberID });

    return {
        items: items.recordset,
        total: totals.recordset[0].total || 0,
        unread: totals.recordset[0].unread || 0,
        limit,
        offset
    };
}

/* -----------------------------------------------------------
   getUnreadCount
----------------------------------------------------------- */
async function getUnreadCount(subscriberID) {
    const result = await query(`
        SELECT COUNT(*) AS count
        FROM Notification
        WHERE subscriberID = @sid AND isRead = 0
          AND (scheduledFor IS NULL OR scheduledFor <= GETDATE())
          AND (expiresAt IS NULL OR expiresAt > GETDATE())
    `, { sid: subscriberID });
    return result.recordset[0].count || 0;
}

/* -----------------------------------------------------------
   markAsRead  (owner-checked)
   @returns { updated: bool }
----------------------------------------------------------- */
async function markAsRead(subscriberID, notificationID) {
    const result = await query(`
        UPDATE Notification SET isRead = 1
        WHERE notificationID = @nid AND subscriberID = @sid
    `, { nid: notificationID, sid: subscriberID });
    const affected = result.rowsAffected && result.rowsAffected[0];
    return { updated: affected > 0 };
}

/* -----------------------------------------------------------
   markAllAsRead
   @returns { updated: number }
----------------------------------------------------------- */
async function markAllAsRead(subscriberID) {
    const result = await query(`
        UPDATE Notification SET isRead = 1
        WHERE subscriberID = @sid AND isRead = 0
    `, { sid: subscriberID });
    const affected = (result.rowsAffected && result.rowsAffected[0]) || 0;
    return { updated: affected };
}

/* -----------------------------------------------------------
   deleteNotification  (owner-checked)
   @returns { deleted: bool }
----------------------------------------------------------- */
async function deleteNotification(subscriberID, notificationID) {
    const result = await query(`
        DELETE FROM Notification
        WHERE notificationID = @nid AND subscriberID = @sid
    `, { nid: notificationID, sid: subscriberID });
    const affected = (result.rowsAffected && result.rowsAffected[0]) || 0;
    return { deleted: affected > 0 };
}

module.exports = {
    createNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    preventDuplicateNotification,
    buildDedupeKey
};
