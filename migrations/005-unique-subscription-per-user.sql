-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Prevent duplicate subscriptions per user
-- Run in SSMS (or via sqlcmd -E) with ALTER permissions.
-- SAFE: creates a unique index only. Aborts cleanly if duplicates
-- already exist (none did at authoring time).
--
-- A user cannot have two subscriptions with the same service name.
-- Under the database's default (case-insensitive) collation this
-- also blocks case-variant duplicates like "Spotify" vs "spotify".
-- ═══════════════════════════════════════════════════════════════
USE FlexScribeDB;
GO

-- Guard: report any existing duplicates (should be none). If this
-- returns rows, resolve them before the index can be created.
SELECT subscriberID, serviceName, COUNT(*) AS cnt
FROM dbo.Subscription
GROUP BY subscriberID, serviceName
HAVING COUNT(*) > 1;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_Subscription_User_Service'
      AND object_id = OBJECT_ID('dbo.Subscription')
)
BEGIN
    CREATE UNIQUE INDEX UQ_Subscription_User_Service
        ON dbo.Subscription (subscriberID, serviceName);
END
GO

-- VERIFY
SELECT name, is_unique FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.Subscription')
  AND name = 'UQ_Subscription_User_Service';
GO
