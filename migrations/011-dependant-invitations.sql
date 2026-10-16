-- ═══════════════════════════════════════════════════════════════
-- Migration 011: Secure dependant invitations / account-setup tokens
-- Run in SSMS (or via sqlcmd) with ALTER permissions.
--
-- Adds:
--   1. DependantInvitation table — single-use, expiring, cryptographically
--      secure account-setup tokens. Only the SHA-256 HASH of the token is
--      stored (never the raw token), so a database leak cannot be used to
--      hijack an invitation. Supports resend by marking old rows superseded.
--   2. Subscriber.mustChangePassword — forces a first-login password change
--      for any account provisioned with a temporary password.
--   3. Subscriber.onboardingComplete — gates account activation until the
--      required setup steps have been completed.
--
-- Invitation lifecycle / statuses:
--   pending    token issued, not yet used, not yet expired
--   used       token consumed (account activated) — terminal
--   expired    passed its expiry without being used
--   superseded replaced by a newer invitation (resend) — old link dead
--
-- SAFE / idempotent and data-preserving.
-- ═══════════════════════════════════════════════════════════════
USE FlexScribeDB;
GO

-- ── 1) DependantInvitation table ─────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DependantInvitation')
BEGIN
    CREATE TABLE dbo.DependantInvitation (
        invitationID    INT             NOT NULL IDENTITY(1,1),
        dependantID     INT             NOT NULL,   -- the account being set up
        mainMemberID    INT             NOT NULL,   -- who issued it
        tokenHash       CHAR(64)        NOT NULL,   -- SHA-256 hex of the raw token
        email           VARCHAR(255)    NOT NULL,   -- snapshot of invited email
        status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
        expiresAt       DATETIME        NOT NULL,
        usedAt          DATETIME            NULL,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_DependantInvitation PRIMARY KEY (invitationID),
        CONSTRAINT FK_DependantInvitation_Dependant
            FOREIGN KEY (dependantID) REFERENCES dbo.Dependant(dependantID),
        CONSTRAINT FK_DependantInvitation_MainMember
            FOREIGN KEY (mainMemberID) REFERENCES dbo.MainMember(mainMemberID),
        CONSTRAINT CK_DependantInvitation_Status
            CHECK (status IN ('pending', 'used', 'expired', 'superseded'))
    );
END
GO

-- Token lookups happen by hash — must be fast and is the hot path at setup.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DependantInvitation_TokenHash')
    CREATE INDEX IX_DependantInvitation_TokenHash ON dbo.DependantInvitation(tokenHash);
GO

-- Find the current invitation(s) for a dependant quickly.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DependantInvitation_Dependant')
    CREATE INDEX IX_DependantInvitation_Dependant ON dbo.DependantInvitation(dependantID, status);
GO

-- ── 2) Subscriber.mustChangePassword ─────────────────────────────
IF COL_LENGTH('dbo.Subscriber', 'mustChangePassword') IS NULL
    ALTER TABLE dbo.Subscriber ADD mustChangePassword BIT NOT NULL
        CONSTRAINT DF_Subscriber_mustChangePassword DEFAULT 0;
GO

-- ── 3) Subscriber.onboardingComplete ─────────────────────────────
-- Existing accounts are already "onboarded", so backfill them to 1 after
-- adding the column with a default of 1, then (optionally) the app sets 0
-- for freshly invited dependants.
IF COL_LENGTH('dbo.Subscriber', 'onboardingComplete') IS NULL
    ALTER TABLE dbo.Subscriber ADD onboardingComplete BIT NOT NULL
        CONSTRAINT DF_Subscriber_onboardingComplete DEFAULT 1;
GO

-- ── VERIFY ────────────────────────────────────────────────────────
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'DependantInvitation'
ORDER BY ORDINAL_POSITION;

SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Subscriber'
  AND COLUMN_NAME IN ('mustChangePassword', 'onboardingComplete');
GO
