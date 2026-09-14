-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Timezone + Quiet Hours for scheduled notifications
-- Run this in SSMS (or via sqlcmd -E) with ALTER permissions.
-- SAFE: ALTER TABLE ADD only. Existing data preserved.
--
-- Adds per-user notification scheduling preferences used by the
-- Phase 3 cron scheduler:
--   timezone          IANA tz name (default 'Africa/Johannesburg')
--   quietHoursEnabled whether quiet hours apply (default 1)
--   quietHoursStart   start of quiet window, minutes-from-midnight (default 1320 = 22:00)
--   quietHoursEnd     end of quiet window,   minutes-from-midnight (default 420  = 07:00)
--
-- Storing quiet hours as minutes-from-midnight keeps comparison simple
-- and avoids TIME-type quirks across drivers.
-- ═══════════════════════════════════════════════════════════════

USE FlexScribeDB;
GO

IF COL_LENGTH('dbo.Subscriber', 'timezone') IS NULL
    ALTER TABLE dbo.Subscriber ADD timezone VARCHAR(64) NOT NULL
        CONSTRAINT DF_Subscriber_timezone DEFAULT 'Africa/Johannesburg';
GO

IF COL_LENGTH('dbo.Subscriber', 'quietHoursEnabled') IS NULL
    ALTER TABLE dbo.Subscriber ADD quietHoursEnabled BIT NOT NULL
        CONSTRAINT DF_Subscriber_quietHoursEnabled DEFAULT 1;
GO

IF COL_LENGTH('dbo.Subscriber', 'quietHoursStart') IS NULL
    ALTER TABLE dbo.Subscriber ADD quietHoursStart INT NOT NULL
        CONSTRAINT DF_Subscriber_quietHoursStart DEFAULT 1320;  -- 22:00
GO

IF COL_LENGTH('dbo.Subscriber', 'quietHoursEnd') IS NULL
    ALTER TABLE dbo.Subscriber ADD quietHoursEnd INT NOT NULL
        CONSTRAINT DF_Subscriber_quietHoursEnd DEFAULT 420;     -- 07:00
GO

-- ──────────────────────────────────────────────────────────────
-- VERIFY
-- ──────────────────────────────────────────────────────────────
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Subscriber'
  AND COLUMN_NAME IN ('timezone', 'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd')
ORDER BY COLUMN_NAME;
GO
