-- ═══════════════════════════════════════════════════════════════
-- Migration 008: One-active-occurrence recurring dependant tasks
-- Run in SSMS (or via sqlcmd -E) with ALTER permissions.
--
-- Adds the columns needed so a recurring task sequence only ever has
-- ONE incomplete occurrence at a time, and the next occurrence is
-- generated exactly once, only after the current one is completed.
--
--   recurrenceParentID      Links every occurrence in a sequence to the
--                           original (root) occurrence. The root's own
--                           dependantTaskID is used as the sequence id.
--                           NULL for existing rows / non-recurring tasks.
--
--   nextOccurrenceGenerated Idempotency guard. Set to 1 the moment a
--                           completion spawns the next occurrence so that
--                           repeated completion requests, page refreshes
--                           or restarts cannot create duplicates.
--
-- SAFE: both columns are nullable / defaulted, so existing rows and all
-- non-recurring tasks keep working exactly as before.
-- ═══════════════════════════════════════════════════════════════
USE FlexScribeDB;
GO

-- recurrenceParentID — sequence identifier (root occurrence's id)
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DependantTask' AND COLUMN_NAME = 'recurrenceParentID'
)
BEGIN
    ALTER TABLE dbo.DependantTask ADD recurrenceParentID INT NULL;
END
GO

-- nextOccurrenceGenerated — idempotency guard for next-occurrence creation
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DependantTask' AND COLUMN_NAME = 'nextOccurrenceGenerated'
)
BEGIN
    ALTER TABLE dbo.DependantTask ADD nextOccurrenceGenerated BIT NOT NULL DEFAULT 0;
END
GO

-- Backfill: for existing recurring tasks, treat each as the root of its
-- own sequence so future completions chain correctly. Non-recurring tasks
-- are left with recurrenceParentID = NULL.
UPDATE dbo.DependantTask
SET recurrenceParentID = dependantTaskID
WHERE recurring = 1 AND recurrenceParentID IS NULL;
GO

-- VERIFY
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'DependantTask'
  AND COLUMN_NAME IN ('recurrenceParentID', 'nextOccurrenceGenerated');
GO
