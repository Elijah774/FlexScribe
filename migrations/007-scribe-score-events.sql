/* ============================================================
   Migration 007 — ScribeScore event log
   Records every conduct-based ScribeScore change and provides
   idempotent dedupe via a (subscriber, eventType, periodKey)
   unique key — e.g. only one "+10 all subs paid" per month, and
   the yearly bank-statement upload cap.
   Idempotent: safe to run more than once.
============================================================ */

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ScribeScoreEvent')
BEGIN
    CREATE TABLE ScribeScoreEvent (
        eventID        INT             NOT NULL IDENTITY(1,1),
        subscriberID   INT             NOT NULL,
        eventType      VARCHAR(50)     NOT NULL,   -- 'subs_paid' | 'subs_unpaid' | 'bank_upload'
        periodKey      VARCHAR(20)     NOT NULL,   -- 'YYYY-MM' (monthly) or 'YYYY' (yearly) or a timestamp for repeatable events
        points         INT             NOT NULL,   -- signed delta applied (+10 / +50 / -10)
        scoreAfter     INT                 NULL,   -- resulting Subscriber.scribeScore
        createdAt      DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_ScribeScoreEvent PRIMARY KEY (eventID),
        CONSTRAINT FK_ScribeScoreEvent_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT UQ_ScribeScoreEvent UNIQUE (subscriberID, eventType, periodKey)
    );
END
GO
