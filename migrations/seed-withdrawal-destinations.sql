-- ═══════════════════════════════════════════════════════════════
-- DEV SEED: simulated (masked) withdrawal destinations — DISABLED
--
-- The Withdraw flow now starts with NO saved bank accounts; users add
-- their own via the "Add New Bank Account" form. The previous seed
-- rows have been removed. This seed is intentionally left inert so
-- re-running migrations won't re-create demo accounts.
--
-- If you ever want demo accounts back, uncomment the block below.
-- ═══════════════════════════════════════════════════════════════
USE FlexScribeDB;
GO

/*  -- (disabled seed — see note above)
;WITH seed(subscriberID, bankName, accountLabel, accountMask, accountType, isDefault) AS (
    SELECT * FROM (VALUES
        (1, 'Standard Bank', 'Everyday Savings', N'•••• 4821', 'Savings', 1),
        (1, 'FNB',           'Cheque Account',   N'•••• 7390', 'Cheque',  0),
        (4, 'Capitec',       'Global One',       N'•••• 1156', 'Savings', 1)
    ) v(subscriberID, bankName, accountLabel, accountMask, accountType, isDefault)
)
INSERT INTO dbo.WithdrawalDestination (subscriberID, bankName, accountLabel, accountMask, accountType, isDefault, isActive)
SELECT s.subscriberID, s.bankName, s.accountLabel, s.accountMask, s.accountType, s.isDefault, 1
FROM seed s
WHERE EXISTS (SELECT 1 FROM dbo.Subscriber sub WHERE sub.subscriberID = s.subscriberID)
  AND NOT EXISTS (
      SELECT 1 FROM dbo.WithdrawalDestination d
      WHERE d.subscriberID = s.subscriberID AND d.accountMask = s.accountMask
  );
GO
*/

SELECT destinationID, subscriberID, bankName, accountMask, isActive
FROM dbo.WithdrawalDestination ORDER BY subscriberID, destinationID;
GO
