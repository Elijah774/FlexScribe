/* ============================================================
   Migration 006 — Goal funds-return support
   • Adds FinancialGoal.fundsReturned (BIT) so a completed/expired
     goal's money is only returned to the wallet once.
   • Extends CK_Goal_Status to allow 'expired'.
   Idempotent: safe to run more than once.
============================================================ */

/* 1. fundsReturned flag ------------------------------------- */
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'FinancialGoal' AND COLUMN_NAME = 'fundsReturned'
)
BEGIN
    ALTER TABLE FinancialGoal
        ADD fundsReturned BIT NOT NULL CONSTRAINT DF_Goal_FundsReturned DEFAULT 0;
END
GO

/* 2. Allow 'expired' in the status check -------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Goal_Status')
BEGIN
    ALTER TABLE FinancialGoal DROP CONSTRAINT CK_Goal_Status;
END
GO

ALTER TABLE FinancialGoal
    ADD CONSTRAINT CK_Goal_Status
    CHECK (goalStatus IN ('active', 'completed', 'paused', 'expired'));
GO
