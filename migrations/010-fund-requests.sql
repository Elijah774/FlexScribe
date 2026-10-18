-- ═══════════════════════════════════════════════════════════════
-- Migration 010: Dependant "Request Funds" feature
-- Run in SSMS (or via sqlcmd) with ALTER permissions.
--
-- Adds:
--   1. FundRequest table — genuine per-dependant fund-request records
--      (amount, optional reason, status, timestamps). A request is ONLY
--      a request: it never moves money on its own.
--   2. Flips the DEFAULT of Dependant.canRequestFunds to 0 so that newly
--      created dependants start with the feature DISABLED, as required.
--      Existing rows are left untouched (data-preserving).
--
-- SAFE / idempotent: guarded with IF NOT EXISTS / IF EXISTS so it can be
-- re-run without error and never drops existing data.
-- ═══════════════════════════════════════════════════════════════
USE FlexScribeDB;
GO

-- ── 1) FundRequest table ──────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FundRequest')
BEGIN
    CREATE TABLE dbo.FundRequest (
        fundRequestID   INT             NOT NULL IDENTITY(1,1),
        dependantID     INT             NOT NULL,   -- who asked
        mainMemberID    INT             NOT NULL,   -- who they asked
        amount          DECIMAL(18,2)   NOT NULL,
        reason          VARCHAR(300)        NULL,
        status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
        reference       VARCHAR(40)         NULL,   -- FS-REQ-000123
        respondedAt     DATETIME            NULL,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_FundRequest PRIMARY KEY (fundRequestID),
        CONSTRAINT FK_FundRequest_Dependant
            FOREIGN KEY (dependantID) REFERENCES dbo.Dependant(dependantID),
        CONSTRAINT FK_FundRequest_MainMember
            FOREIGN KEY (mainMemberID) REFERENCES dbo.MainMember(mainMemberID),
        CONSTRAINT CK_FundRequest_Status
            CHECK (status IN ('pending', 'approved', 'declined', 'cancelled'))
    );
END
GO

-- Fast lookup of a dependant's requests, newest first.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FundRequest_Dependant')
    CREATE INDEX IX_FundRequest_Dependant ON dbo.FundRequest(dependantID, createdAt DESC);
GO

-- Fast lookup of a main member's incoming requests.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FundRequest_MainMember')
    CREATE INDEX IX_FundRequest_MainMember ON dbo.FundRequest(mainMemberID, createdAt DESC);
GO

-- ── 2) Default canRequestFunds to DISABLED for NEW dependants ─────
-- The column already exists (base schema) with DEFAULT 1. We swap the
-- default to 0 so new dependants start disabled. Existing dependant rows
-- keep whatever value they currently have (no data change).
DECLARE @dfName SYSNAME;
SELECT @dfName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Dependant')
  AND c.name = 'canRequestFunds';

IF @dfName IS NOT NULL
    EXEC('ALTER TABLE dbo.Dependant DROP CONSTRAINT ' + @dfName);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Dependant_canRequestFunds'
)
    ALTER TABLE dbo.Dependant
        ADD CONSTRAINT DF_Dependant_canRequestFunds DEFAULT 0 FOR canRequestFunds;
GO

-- ── VERIFY ────────────────────────────────────────────────────────
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'FundRequest'
ORDER BY ORDINAL_POSITION;
GO
