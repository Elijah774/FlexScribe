/* ============================================================
   Migration 009 — default Scribe Score to 500
   New accounts start at a baseline Scribe Score of 500, which
   then moves up or down based on the member's conduct.

   The register endpoint already inserts 500 explicitly; this
   makes the DATABASE column default 500 too, so any insert path
   that omits scribeScore also lands at 500 (defence in depth).

   Existing rows are left untouched (we don't overwrite a score
   a member has already earned/lost).
   Idempotent: safe to run more than once.
============================================================ */

DECLARE @def SYSNAME;

-- Find the current DEFAULT constraint on Subscriber.scribeScore (if any).
SELECT @def = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('dbo.Subscriber')
  AND c.name = 'scribeScore';

-- Drop it only if it isn't already the 500 default we want.
IF @def IS NOT NULL
BEGIN
    DECLARE @sql NVARCHAR(MAX) = N'ALTER TABLE dbo.Subscriber DROP CONSTRAINT ' + QUOTENAME(@def) + N';';
    EXEC sp_executesql @sql;
END
GO

-- Add the 500 default (named so it's easy to find later).
IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_Subscriber_ScribeScore_500'
)
BEGIN
    ALTER TABLE dbo.Subscriber
        ADD CONSTRAINT DF_Subscriber_ScribeScore_500 DEFAULT (500) FOR scribeScore;
END
GO
