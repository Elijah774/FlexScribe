/* ============================================================
   Migration 008 — ScribeScore categories + wider period keys
   Extends the conduct-based ScribeScore engine into the five
   rule categories (Subscription Management, Payment Readiness,
   Financial Awareness, Financial Goals, Consistency) that sum
   to a maximum of 1,000 points.

   - Adds ScribeScoreEvent.category so per-category totals (and
     per-category caps) can be computed directly from the log,
     which remains the single source of truth.
   - Widens periodKey to hold richer idempotency keys such as
     'sub_upd#123#2026-08' or 'goal_ms#45#75'.
   - Backfills category for the event types that already exist.

   Idempotent: safe to run more than once.
============================================================ */

/* 1. Widen periodKey (was VARCHAR(20)) so richer keys fit. */
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ScribeScoreEvent' AND COLUMN_NAME = 'periodKey'
      AND (CHARACTER_MAXIMUM_LENGTH IS NULL OR CHARACTER_MAXIMUM_LENGTH < 60)
)
BEGIN
    ALTER TABLE ScribeScoreEvent ALTER COLUMN periodKey VARCHAR(60) NOT NULL;
END
GO

/* 2. Add the category column. */
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ScribeScoreEvent' AND COLUMN_NAME = 'category'
)
BEGIN
    ALTER TABLE ScribeScoreEvent ADD category VARCHAR(40) NULL;
END
GO

/* 3. Backfill category for pre-existing event types. */
UPDATE ScribeScoreEvent SET category = 'subscription'
    WHERE category IS NULL AND eventType IN ('subs_paid', 'subs_unpaid', 'sub_added', 'sub_updated', 'sub_cancelled');
UPDATE ScribeScoreEvent SET category = 'payment'
    WHERE category IS NULL AND eventType IN ('payment_ready', 'payment_success');
UPDATE ScribeScoreEvent SET category = 'awareness'
    WHERE category IS NULL AND eventType IN ('bank_upload', 'analytics_reviewed', 'upcoming_reviewed');
UPDATE ScribeScoreEvent SET category = 'goals'
    WHERE category IS NULL AND eventType IN ('goal_completed', 'goal_created', 'goal_milestone');
UPDATE ScribeScoreEvent SET category = 'consistency'
    WHERE category IS NULL AND eventType IN ('weekly_checkin');
GO
