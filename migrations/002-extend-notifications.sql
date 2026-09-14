-- ═══════════════════════════════════════════════════════════════
-- Migration 002: Extend Notification table for the notification system
-- Run this in SSMS with a user that has ALTER permissions.
-- SAFE: Uses ALTER TABLE ADD (non-destructive). Existing data is preserved.
--
-- This migration:
--   1. Adds new columns needed by the notification service
--   2. Replaces the restrictive CK_Notification_Type CHECK constraint
--      with one that supports all Phase 1 notification types
--   3. Adds indexes for common query patterns
-- ═══════════════════════════════════════════════════════════════

USE FlexScribeDB;
GO

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Add new columns (only if they don't already exist)
-- ──────────────────────────────────────────────────────────────

IF COL_LENGTH('dbo.Notification', 'relatedEntityType') IS NULL
    ALTER TABLE dbo.Notification ADD relatedEntityType VARCHAR(50) NULL;
GO

IF COL_LENGTH('dbo.Notification', 'relatedEntityID') IS NULL
    ALTER TABLE dbo.Notification ADD relatedEntityID INT NULL;
GO

IF COL_LENGTH('dbo.Notification', 'actionUrl') IS NULL
    ALTER TABLE dbo.Notification ADD actionUrl VARCHAR(255) NULL;
GO

IF COL_LENGTH('dbo.Notification', 'metadata') IS NULL
    ALTER TABLE dbo.Notification ADD metadata NVARCHAR(MAX) NULL;   -- JSON blob
GO

IF COL_LENGTH('dbo.Notification', 'scheduledFor') IS NULL
    ALTER TABLE dbo.Notification ADD scheduledFor DATETIME NULL;
GO

IF COL_LENGTH('dbo.Notification', 'sentAt') IS NULL
    ALTER TABLE dbo.Notification ADD sentAt DATETIME NULL;
GO

IF COL_LENGTH('dbo.Notification', 'expiresAt') IS NULL
    ALTER TABLE dbo.Notification ADD expiresAt DATETIME NULL;
GO

-- dedupeKey: a unique-ish string built from type + entity + date to
-- prevent duplicate notifications for the same event.
IF COL_LENGTH('dbo.Notification', 'dedupeKey') IS NULL
    ALTER TABLE dbo.Notification ADD dedupeKey VARCHAR(255) NULL;
GO

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Replace the restrictive type CHECK constraint
-- The old constraint only allowed: payment, goal, security, score,
-- system, dependant. The new notification types need broader values.
-- ──────────────────────────────────────────────────────────────

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Notification_Type')
    ALTER TABLE dbo.Notification DROP CONSTRAINT CK_Notification_Type;
GO

ALTER TABLE dbo.Notification ADD CONSTRAINT CK_Notification_Type CHECK (
    notificationType IN (
        -- Legacy values (kept for backward compatibility)
        'payment', 'goal', 'security', 'score', 'system', 'dependant',
        -- New Phase 1 notification types
        'PAYMENT_SUCCESS', 'PAYMENT_FAILED',
        'SUBSCRIPTION_ADDED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PAUSED',
        'SUBSCRIPTION_RENEWAL_REMINDER', 'UPCOMING_PAYMENT',
        'LOW_BALANCE', 'INSUFFICIENT_FUNDS',
        'GOAL_PROGRESS', 'GOAL_COMPLETED',
        'WEEKLY_SUMMARY', 'MONTHLY_SUMMARY',
        'SYSTEM', 'FLEXTAP',
        'FLEXTAP_SENT', 'FLEXTAP_RECEIVED', 'FLEXTAP_FAILED',
        'DEPENDANT_TASK_COMPLETED', 'DEPENDANT_TASK_OVERDUE', 'AI_INSIGHT'
    )
);
GO

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Widen the priority CHECK constraint to include 'critical'
-- ──────────────────────────────────────────────────────────────

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Notification_Priority')
    ALTER TABLE dbo.Notification DROP CONSTRAINT CK_Notification_Priority;
GO

ALTER TABLE dbo.Notification ADD CONSTRAINT CK_Notification_Priority CHECK (
    priority IN ('low', 'medium', 'high', 'critical')
);
GO

-- ──────────────────────────────────────────────────────────────
-- STEP 4: Indexes for common query patterns
-- ──────────────────────────────────────────────────────────────

-- Fast lookup of a user's notifications, newest first
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notification_Subscriber_Created')
    CREATE INDEX IX_Notification_Subscriber_Created
        ON dbo.Notification (subscriberID, createdAt DESC);
GO

-- Fast unread count
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notification_Subscriber_IsRead')
    CREATE INDEX IX_Notification_Subscriber_IsRead
        ON dbo.Notification (subscriberID, isRead);
GO

-- Fast duplicate check
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notification_DedupeKey')
    CREATE INDEX IX_Notification_DedupeKey
        ON dbo.Notification (dedupeKey);
GO

-- ──────────────────────────────────────────────────────────────
-- VERIFY
-- ──────────────────────────────────────────────────────────────
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Notification'
ORDER BY ORDINAL_POSITION;
GO
