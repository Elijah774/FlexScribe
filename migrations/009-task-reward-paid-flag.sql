-- ═══════════════════════════════════════════════════════════════
-- Migration 009: Track whether a task occurrence's reward has been paid
-- Run in SSMS (or via sqlcmd) with ALTER permissions.
--
-- Adds a per-occurrence guard so that un-marking a completed task refunds
-- its reward EXACTLY once, and re-completing charges it again cleanly —
-- preventing the wallet from being debited twice for a single occurrence.
--
--   taskRewardPaid  1 = this occurrence's reward has been charged to the
--                       main member's wallet and NOT yet refunded.
--                   0 = not charged (default), or already refunded.
--
-- SAFE: nullable-safe default; existing rows get 0 (no reward outstanding).
-- Existing completed rows that were charged under the old code stay 0, which
-- is correct: un-marking them will simply not issue a refund (there is no
-- way to retroactively know they were charged, and not refunding is the
-- non-destructive choice).
-- ═══════════════════════════════════════════════════════════════
USE FlexScribeDB;
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DependantTask' AND COLUMN_NAME = 'taskRewardPaid'
)
BEGIN
    ALTER TABLE dbo.DependantTask ADD taskRewardPaid BIT NOT NULL DEFAULT 0;
END
GO

-- VERIFY
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'DependantTask' AND COLUMN_NAME = 'taskRewardPaid';
GO
