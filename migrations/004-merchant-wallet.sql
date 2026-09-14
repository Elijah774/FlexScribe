-- ═══════════════════════════════════════════════════════════════
-- Migration 004: Merchant Wallet (transfers, withdrawals, history)
-- Run this in SSMS (or via sqlcmd -E) with ALTER permissions.
-- SAFE: ALTER TABLE ADD + constraint replacement + new table only.
--       Existing wallet data preserved. NO data dropped.
--
-- Extends the EXISTING wallet system (VirtualWallet +
-- WalletTransaction). Does NOT create a duplicate wallet table.
--   • balance     -> available merchant balance (spendable)
--   • pendingIn   -> pending incoming (not yet spendable)
--   • total       -> balance + pendingIn (computed, not stored)
--
-- Adds to WalletTransaction the columns a real merchant wallet
-- needs for auditable transfers/withdrawals:
--   reference       human-facing ref e.g. FS-TRF-000123 / FS-WDL-000045
--   status          pending | completed | failed
--   balanceBefore   available balance immediately before the tx
--   balanceAfter    available balance immediately after the tx
--   recipientUserID FK Subscriber — the other party on a transfer
--   recipientName   snapshot of the other party's display name
--   senderName      snapshot of the initiating party's display name
--   completedAt     when a pending tx settled
--   failureReason   why a failed tx failed (shown in the detail modal)
--   metadata        free-form JSON for extra context (destination, etc.)
--
-- Relaxes CK_WalletTx_Type so merchant transaction types are allowed
-- alongside the legacy set. New table WithdrawalDestination stores
-- SIMULATED masked bank accounts (no real banking credentials).
-- ═══════════════════════════════════════════════════════════════

USE FlexScribeDB;
GO

-- ──────────────────────────────────────────────────────────────
-- 1) WalletTransaction — new columns (ADD only, idempotent)
-- ──────────────────────────────────────────────────────────────
IF COL_LENGTH('dbo.WalletTransaction', 'reference') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD reference VARCHAR(40) NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'status') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD status VARCHAR(20) NOT NULL
        CONSTRAINT DF_WalletTx_status DEFAULT 'completed';
GO

IF COL_LENGTH('dbo.WalletTransaction', 'balanceBefore') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD balanceBefore DECIMAL(18,2) NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'balanceAfter') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD balanceAfter DECIMAL(18,2) NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'recipientUserID') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD recipientUserID INT NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'recipientName') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD recipientName VARCHAR(200) NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'senderName') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD senderName VARCHAR(200) NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'completedAt') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD completedAt DATETIME NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'failureReason') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD failureReason VARCHAR(300) NULL;
GO

IF COL_LENGTH('dbo.WalletTransaction', 'metadata') IS NULL
    ALTER TABLE dbo.WalletTransaction ADD metadata VARCHAR(MAX) NULL;
GO

-- FK: recipient points at a Subscriber (nullable — only set on transfers)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_WalletTx_Recipient')
    ALTER TABLE dbo.WalletTransaction
        ADD CONSTRAINT FK_WalletTx_Recipient
        FOREIGN KEY (recipientUserID) REFERENCES dbo.Subscriber(subscriberID);
GO

-- Index for fast reference lookups (detail view + idempotency checks)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WalletTx_Reference')
    CREATE INDEX IX_WalletTx_Reference ON dbo.WalletTransaction(reference);
GO

-- ──────────────────────────────────────────────────────────────
-- 2) Relax CK_WalletTx_Type to allow merchant transaction types
--    Legacy values kept for backward compatibility:
--      credit, debit, transfer, refund
--    New merchant values:
--      payment       — simulated merchant payment received (credit)
--      transfer_in   — received from another FlexScribe user
--      transfer_out  — sent to another FlexScribe user
--      withdrawal    — payout to a (simulated) bank destination
--      adjustment    — manual/system balance adjustment
-- ──────────────────────────────────────────────────────────────
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_WalletTx_Type')
    ALTER TABLE dbo.WalletTransaction DROP CONSTRAINT CK_WalletTx_Type;
GO

ALTER TABLE dbo.WalletTransaction
    ADD CONSTRAINT CK_WalletTx_Type CHECK (transactionType IN (
        'credit', 'debit', 'transfer', 'refund',
        'payment', 'transfer_in', 'transfer_out', 'withdrawal', 'adjustment'
    ));
GO

-- Status check
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_WalletTx_Status')
    ALTER TABLE dbo.WalletTransaction
        ADD CONSTRAINT CK_WalletTx_Status CHECK (status IN ('pending', 'completed', 'failed'));
GO

-- ──────────────────────────────────────────────────────────────
-- 3) WithdrawalDestination — SIMULATED masked bank accounts
--    No real banking credentials. accountMask is display-only,
--    e.g. "Standard Bank •••• 4821".
-- ──────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'WithdrawalDestination')
BEGIN
    CREATE TABLE dbo.WithdrawalDestination (
        destinationID   INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        bankName        VARCHAR(100)    NOT NULL,
        accountLabel    VARCHAR(100)        NULL,   -- e.g. "Everyday Savings"
        accountMask     VARCHAR(50)     NOT NULL,   -- e.g. "•••• 4821"
        accountType     VARCHAR(30)         NULL,   -- e.g. "Savings" / "Cheque"
        isDefault       BIT             NOT NULL DEFAULT 0,
        isActive        BIT             NOT NULL DEFAULT 1,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_WithdrawalDestination PRIMARY KEY (destinationID),
        CONSTRAINT FK_WithdrawalDestination_Subscriber
            FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID)
    );
END
GO

-- ──────────────────────────────────────────────────────────────
-- 4) Backfill: give existing wallet transactions a status/balance
--    trail so the history/detail views render cleanly for old rows.
--    (Only touches rows where the new columns are still NULL.)
-- ──────────────────────────────────────────────────────────────
UPDATE dbo.WalletTransaction
   SET status = 'completed'
 WHERE status IS NULL;
GO

UPDATE dbo.WalletTransaction
   SET balanceAfter = runningBalance
 WHERE balanceAfter IS NULL AND runningBalance IS NOT NULL;
GO

UPDATE dbo.WalletTransaction
   SET completedAt = transactionDate
 WHERE completedAt IS NULL AND status = 'completed';
GO

-- ──────────────────────────────────────────────────────────────
-- VERIFY
-- ──────────────────────────────────────────────────────────────
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'WalletTransaction'
  AND COLUMN_NAME IN ('reference','status','balanceBefore','balanceAfter',
                      'recipientUserID','recipientName','senderName',
                      'completedAt','failureReason','metadata')
ORDER BY COLUMN_NAME;
GO

SELECT definition FROM sys.check_constraints WHERE name = 'CK_WalletTx_Type';
GO

SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'WithdrawalDestination';
GO
