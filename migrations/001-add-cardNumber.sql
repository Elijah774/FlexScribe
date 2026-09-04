-- ═══════════════════════════════════════════════════════════════
-- Migration: Add cardNumber column to VirtualWallet
-- Run this in SSMS with a user that has ALTER permissions
-- ═══════════════════════════════════════════════════════════════

USE FlexScribeDB;
GO

-- Add the column
ALTER TABLE VirtualWallet ADD cardNumber VARCHAR(19) NULL;
GO

-- Generate a unique 16-digit card number for each existing wallet
-- Format: 4XXX XXXX XXXX XXXX (Visa-style, starting with 4)
UPDATE VirtualWallet
SET cardNumber = '4' +
    RIGHT('000' + CAST(ABS(CHECKSUM(NEWID())) % 1000 AS VARCHAR), 3) +
    RIGHT('0000' + CAST(ABS(CHECKSUM(NEWID())) % 10000 AS VARCHAR), 4) +
    RIGHT('0000' + CAST(ABS(CHECKSUM(NEWID())) % 10000 AS VARCHAR), 4) +
    RIGHT('0000' + CAST(ABS(CHECKSUM(NEWID())) % 10000 AS VARCHAR), 4)
WHERE cardNumber IS NULL;
GO

-- Add unique constraint so no two wallets share a card number
ALTER TABLE VirtualWallet ADD CONSTRAINT UQ_VirtualWallet_CardNumber UNIQUE (cardNumber);
GO

-- Verify
SELECT walletID, subscriberID, cardNumber FROM VirtualWallet;
GO
