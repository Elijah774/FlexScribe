-- =================================================================
-- FlexScribe Local Database Setup Script
-- SQL Server (run in SSMS)
-- =================================================================
-- This script creates the FlexScribeDB database for LOCAL development.
-- Based on "flexscribe database.sql" with the following corrections:
--
-- FIXES APPLIED:
-- 1. CHECK constraints: Removed NULL from IN() lists.
--    SQL Server does not match NULL via CHECK/IN. Nullable columns
--    already allow NULL without it appearing in the constraint.
--    Affected: DependantTask.recurrenceCycle, Subscription.paymentSource
--
-- 2. Added IF NOT EXISTS guards so the script can be re-run safely.
--
-- 3. Added 'individual' and 'dependant' (lowercase) to the
--    Subscriber.userType CHECK constraint because backend/server.js
--    inserts those values in addition to 'MainMember'/'Dependant'.
--
-- SCHEMA NOTES:
-- This schema is used by ALL three backends:
--   • server/ (Node.js, port 3000) — uses walletID, allowance, deadline
--   • backend/server.js (Node.js, port 5000) — UPDATED to match
--   • flexscribe-backend/ (Spring Boot, port 8080) — uses JPA entities
-- =================================================================

-- ── Create the database ──────────────────────────────────────────
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'FlexScribeDB')
BEGIN
    CREATE DATABASE FlexScribeDB;
END
GO

USE FlexScribeDB;
GO

-- =================================================================
-- TABLE CREATION (in dependency order)
-- =================================================================

-- ── SubscriptionCategory ─────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SubscriptionCategory')
BEGIN
    CREATE TABLE SubscriptionCategory (
        categoryID      INT             NOT NULL IDENTITY(1,1),
        categoryName    VARCHAR(100)    NOT NULL,
        CONSTRAINT PK_SubscriptionCategory PRIMARY KEY (categoryID),
        CONSTRAINT UQ_Category_Name UNIQUE (categoryName)
    );
END
GO

-- ── Subscriber (base user table) ─────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Subscriber')
BEGIN
    CREATE TABLE Subscriber (
        subscriberID    INT             NOT NULL IDENTITY(1,1),
        firstName       VARCHAR(100)    NOT NULL,
        lastName        VARCHAR(100)    NOT NULL,
        preferredName   VARCHAR(100)        NULL,
        email           VARCHAR(255)    NOT NULL,
        passwordHash    VARCHAR(255)    NOT NULL,
        phone           VARCHAR(50)         NULL,
        dateOfBirth     DATE                NULL,
        bio             VARCHAR(500)        NULL,
        userType        VARCHAR(50)     NOT NULL DEFAULT 'MainMember',
        scribeScore     INT             NOT NULL DEFAULT 0,
        avatarUrl       VARCHAR(500)        NULL,
        marketingOptIn  BIT             NOT NULL DEFAULT 0,
        termsAcceptedAt DATETIME            NULL,
        twoFactorEnabled BIT            NOT NULL DEFAULT 0,
        theme           VARCHAR(10)     NOT NULL DEFAULT 'dark',
        accentColor     VARCHAR(7)          NULL,
        notifyPayments  BIT             NOT NULL DEFAULT 1,
        notifyGoals     BIT             NOT NULL DEFAULT 1,
        notifyWeekly    BIT             NOT NULL DEFAULT 0,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        updatedAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Subscriber PRIMARY KEY (subscriberID),
        CONSTRAINT UQ_Subscriber_Email UNIQUE (email),
        -- Includes lowercase variants used by backend/server.js
        CONSTRAINT CK_Subscriber_UserType CHECK (userType IN ('MainMember', 'Dependant', 'Admin', 'individual', 'dependant')),
        CONSTRAINT CK_Subscriber_Theme CHECK (theme IN ('dark', 'light'))
    );
END
GO

-- ── MainMember (specialisation of Subscriber) ────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MainMember')
BEGIN
    CREATE TABLE MainMember (
        mainMemberID    INT             NOT NULL,
        monthlyIncome   DECIMAL(18,2)       NULL,
        planType        VARCHAR(50)     NOT NULL DEFAULT 'Free',
        riskFlagStatus  VARCHAR(50)         NULL,
        CONSTRAINT PK_MainMember PRIMARY KEY (mainMemberID),
        CONSTRAINT FK_MainMember_Subscriber FOREIGN KEY (mainMemberID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT CK_MainMember_Plan CHECK (planType IN ('Free', 'Premium', 'Business'))
    );
END
GO

-- ── Dependant (specialisation of Subscriber) ─────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Dependant')
BEGIN
    CREATE TABLE Dependant (
        dependantID     INT             NOT NULL,
        mainMemberID    INT             NOT NULL,
        age             INT                 NULL,
        relationship    VARCHAR(100)        NULL,
        allowance       DECIMAL(18,2)   NOT NULL DEFAULT 0,
        spendingLimit   DECIMAL(18,2)       NULL,
        status          VARCHAR(50)     NOT NULL DEFAULT 'invited',
        canSpend        BIT             NOT NULL DEFAULT 1,
        canViewWallet   BIT             NOT NULL DEFAULT 0,
        canRequestFunds BIT             NOT NULL DEFAULT 1,
        CONSTRAINT PK_Dependant PRIMARY KEY (dependantID),
        CONSTRAINT FK_Dependant_Subscriber FOREIGN KEY (dependantID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT FK_Dependant_MainMember FOREIGN KEY (mainMemberID) REFERENCES MainMember(mainMemberID),
        CONSTRAINT CK_Dependant_Status CHECK (status IN ('active', 'invited', 'suspended'))
    );
END
GO

-- ── DependantTask (tasks assigned to dependants) ─────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DependantTask')
BEGIN
    CREATE TABLE DependantTask (
        dependantTaskID INT             NOT NULL IDENTITY(1,1),
        dependantID     INT             NOT NULL,
        mainMemberID    INT             NOT NULL,
        taskName        VARCHAR(200)    NOT NULL,
        description     VARCHAR(500)        NULL,
        dueDate         DATE                NULL,
        reward          DECIMAL(18,2)   NOT NULL DEFAULT 0,
        taskStatus      VARCHAR(50)     NOT NULL DEFAULT 'pending',
        recurring       BIT             NOT NULL DEFAULT 0,
        recurrenceCycle VARCHAR(20)         NULL,
        completedAt     DATETIME            NULL,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        updatedAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_DependantTask PRIMARY KEY (dependantTaskID),
        CONSTRAINT FK_DependantTask_Dependant FOREIGN KEY (dependantID) REFERENCES Dependant(dependantID),
        CONSTRAINT FK_DependantTask_MainMember FOREIGN KEY (mainMemberID) REFERENCES MainMember(mainMemberID),
        CONSTRAINT CK_DependantTask_Status CHECK (taskStatus IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')),
        -- FIX: Removed NULL from IN() list. Column is nullable so NULL is allowed implicitly.
        CONSTRAINT CK_DependantTask_Recurrence CHECK (recurrenceCycle IN ('daily', 'weekly', 'biweekly', 'monthly'))
    );
END
GO

-- ── VirtualWallet (1:1 with Subscriber) ──────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'VirtualWallet')
BEGIN
    CREATE TABLE VirtualWallet (
        walletID        INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        balance         DECIMAL(18,2)   NOT NULL DEFAULT 0,
        pendingIn       DECIMAL(18,2)   NOT NULL DEFAULT 0,
        pendingOut      DECIMAL(18,2)   NOT NULL DEFAULT 0,
        currency        VARCHAR(10)     NOT NULL DEFAULT 'ZAR',
        lastTopUpDate   DATETIME            NULL,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_VirtualWallet PRIMARY KEY (walletID),
        CONSTRAINT FK_VirtualWallet_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT UQ_VirtualWallet_Subscriber UNIQUE (subscriberID)
    );
END
GO

-- ── Subscription ─────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Subscription')
BEGIN
    CREATE TABLE Subscription (
        subscriptionID  INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        categoryID      INT             NOT NULL,
        serviceName     VARCHAR(200)    NOT NULL,
        billingAmount   DECIMAL(18,2)   NOT NULL,
        billingCycle    VARCHAR(20)     NOT NULL DEFAULT 'monthly',
        billingDate     DATE                NULL,
        subStatus       VARCHAR(50)     NOT NULL DEFAULT 'active',
        autoRenew       BIT             NOT NULL DEFAULT 1,
        logoClass       VARCHAR(50)         NULL,
        logoText        VARCHAR(10)         NULL,
        customLogo      VARCHAR(MAX)        NULL,
        notes           VARCHAR(500)        NULL,
        colorTag        VARCHAR(7)          NULL,
        reminderDays    INT                 NULL,
        providerUrl     VARCHAR(500)        NULL,
        pauseReason     VARCHAR(200)        NULL,
        notifyOnPayment BIT             NOT NULL DEFAULT 1,
        paymentSource   VARCHAR(20)         NULL,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        updatedAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Subscription PRIMARY KEY (subscriptionID),
        CONSTRAINT FK_Subscription_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT FK_Subscription_Category FOREIGN KEY (categoryID) REFERENCES SubscriptionCategory(categoryID),
        CONSTRAINT CK_Subscription_Cycle CHECK (billingCycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
        CONSTRAINT CK_Subscription_Status CHECK (subStatus IN ('active', 'paused', 'cancelled')),
        -- FIX: Removed NULL from IN() list. Column is nullable so NULL is allowed implicitly.
        CONSTRAINT CK_Subscription_PaymentSource CHECK (paymentSource IN ('wallet', 'bank-card'))
    );
END
GO

-- ── FinancialGoal ────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FinancialGoal')
BEGIN
    CREATE TABLE FinancialGoal (
        goalID          INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        goalName        VARCHAR(200)    NOT NULL,
        targetAmount    DECIMAL(18,2)   NOT NULL,
        currentProgress DECIMAL(18,2)   NOT NULL DEFAULT 0,
        deadline        DATE                NULL,
        category        VARCHAR(50)         NULL,
        imageUrl        VARCHAR(500)        NULL,
        goalStatus      VARCHAR(50)     NOT NULL DEFAULT 'active',
        lastTopUpDate   DATETIME            NULL,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_FinancialGoal PRIMARY KEY (goalID),
        CONSTRAINT FK_FinancialGoal_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT CK_Goal_Status CHECK (goalStatus IN ('active', 'completed', 'paused')),
        CONSTRAINT CK_Goal_Category CHECK (category IN ('Travel', 'Tech', 'Education', 'Emergency', 'Home', 'Vehicle', 'Other'))
    );
END
GO

-- ── GoalContribution ─────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GoalContribution')
BEGIN
    CREATE TABLE GoalContribution (
        contributionID  INT             NOT NULL IDENTITY(1,1),
        goalID          INT             NOT NULL,
        amount          DECIMAL(18,2)   NOT NULL,
        note            VARCHAR(200)        NULL,
        source          VARCHAR(50)     NOT NULL DEFAULT 'wallet',
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_GoalContribution PRIMARY KEY (contributionID),
        CONSTRAINT FK_GoalContribution_Goal FOREIGN KEY (goalID) REFERENCES FinancialGoal(goalID)
    );
END
GO

-- ── ScribeScore ──────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ScribeScore')
BEGIN
    CREATE TABLE ScribeScore (
        scoreID         INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        scoreValue      INT             NOT NULL DEFAULT 0,
        subscriptionPct DECIMAL(5,2)        NULL,
        budgetPct       DECIMAL(5,2)        NULL,
        savingsPct      DECIMAL(5,2)        NULL,
        generatedAt     DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_ScribeScore PRIMARY KEY (scoreID),
        CONSTRAINT FK_ScribeScore_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID)
    );
END
GO

-- ── WalletTransaction ────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'WalletTransaction')
BEGIN
    CREATE TABLE WalletTransaction (
        transactionID       INT             NOT NULL IDENTITY(1,1),
        walletID            INT             NOT NULL,
        subscriptionID      INT                 NULL,
        goalID              INT                 NULL,
        dependantID         INT                 NULL,
        transactionType     VARCHAR(50)     NOT NULL,
        transactionAmount   DECIMAL(18,2)   NOT NULL,
        runningBalance      DECIMAL(18,2)       NULL,
        description         VARCHAR(200)        NULL,
        category            VARCHAR(100)        NULL,
        transactionDate     DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_WalletTransaction PRIMARY KEY (transactionID),
        CONSTRAINT FK_WalletTx_Wallet FOREIGN KEY (walletID) REFERENCES VirtualWallet(walletID),
        CONSTRAINT FK_WalletTx_Subscription FOREIGN KEY (subscriptionID) REFERENCES Subscription(subscriptionID),
        CONSTRAINT FK_WalletTx_Goal FOREIGN KEY (goalID) REFERENCES FinancialGoal(goalID),
        CONSTRAINT FK_WalletTx_Dependant FOREIGN KEY (dependantID) REFERENCES Dependant(dependantID),
        CONSTRAINT CK_WalletTx_Type CHECK (transactionType IN ('credit', 'debit', 'transfer', 'refund'))
    );
END
GO

-- ── Notification ─────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Notification')
BEGIN
    CREATE TABLE Notification (
        notificationID      INT             NOT NULL IDENTITY(1,1),
        subscriberID        INT             NOT NULL,
        subscriptionID      INT                 NULL,
        transactionID       INT                 NULL,
        notificationType    VARCHAR(50)     NOT NULL DEFAULT 'payment',
        title               VARCHAR(200)    NOT NULL,
        body                VARCHAR(MAX)        NULL,
        isRead              BIT             NOT NULL DEFAULT 0,
        priority            VARCHAR(20)     NOT NULL DEFAULT 'medium',
        linkTo              VARCHAR(100)        NULL,
        createdAt           DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_Notification PRIMARY KEY (notificationID),
        CONSTRAINT FK_Notification_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT FK_Notification_Subscription FOREIGN KEY (subscriptionID) REFERENCES Subscription(subscriptionID),
        CONSTRAINT FK_Notification_Transaction FOREIGN KEY (transactionID) REFERENCES WalletTransaction(transactionID),
        CONSTRAINT CK_Notification_Type CHECK (notificationType IN ('payment', 'goal', 'security', 'score', 'system', 'dependant')),
        CONSTRAINT CK_Notification_Priority CHECK (priority IN ('low', 'medium', 'high'))
    );
END
GO

-- ── PaymentSchedule ──────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PaymentSchedule')
BEGIN
    CREATE TABLE PaymentSchedule (
        scheduleID          INT             NOT NULL IDENTITY(1,1),
        subscriptionID      INT             NOT NULL,
        nextPaymentDate     DATE            NOT NULL,
        amountDue           DECIMAL(18,2)   NOT NULL,
        scheduleStatus      VARCHAR(50)     NOT NULL DEFAULT 'pending',
        CONSTRAINT PK_PaymentSchedule PRIMARY KEY (scheduleID),
        CONSTRAINT FK_PaymentSchedule_Subscription FOREIGN KEY (subscriptionID) REFERENCES Subscription(subscriptionID),
        CONSTRAINT CK_Schedule_Status CHECK (scheduleStatus IN ('pending', 'paid', 'overdue', 'cancelled'))
    );
END
GO

-- ── SpendingReport ───────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SpendingReport')
BEGIN
    CREATE TABLE SpendingReport (
        spendingReportID        INT             NOT NULL IDENTITY(1,1),
        subscriberID            INT             NOT NULL,
        reportDateGenerate      DATE                NULL,
        startDate               DATE                NULL,
        endDate                 DATE                NULL,
        totalSubscriptionCost   DECIMAL(18,2)       NULL,
        totalSpending           DECIMAL(18,2)       NULL,
        spendingPerCategory     VARCHAR(MAX)        NULL,
        subscriptionBreakdown   VARCHAR(MAX)        NULL,
        transactionList         VARCHAR(MAX)        NULL,
        CONSTRAINT PK_SpendingReport PRIMARY KEY (spendingReportID),
        CONSTRAINT FK_SpendingReport_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID)
    );
END
GO

-- ── BankStatement ────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BankStatement')
BEGIN
    CREATE TABLE BankStatement (
        statementID             INT             NOT NULL IDENTITY(1,1),
        subscriberID            INT             NOT NULL,
        uploadDate              DATE                NULL,
        fileName                VARCHAR(200)        NULL,
        fileSize                INT                 NULL,
        fileReference           VARCHAR(500)        NULL,
        statementPeriodStart    DATE                NULL,
        statementPeriodEnd      DATE                NULL,
        totalIncome             DECIMAL(18,2)       NULL,
        totalExpenses           DECIMAL(18,2)       NULL,
        netCashFlow             DECIMAL(18,2)       NULL,
        transactionCount        INT                 NULL,
        parsedData              NVARCHAR(MAX)       NULL,
        financialStatus         VARCHAR(50)         NULL,
        monthlyBreakdown        NVARCHAR(MAX)       NULL,
        CONSTRAINT PK_BankStatement PRIMARY KEY (statementID),
        CONSTRAINT FK_BankStatement_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID)
    );
END
GO

-- ── FinancialReport ──────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'FinancialReport')
BEGIN
    CREATE TABLE FinancialReport (
        reportID                INT             NOT NULL IDENTITY(1,1),
        mainMemberID            INT                 NULL,
        subscriberID            INT                 NULL,
        reportDateGenerate      DATE                NULL,
        startDate               DATE                NULL,
        endDate                 DATE                NULL,
        totalSubscriptionCost   DECIMAL(18,2)       NULL,
        totalWithdrawals        DECIMAL(18,2)       NULL,
        remainingBalance        DECIMAL(18,2)       NULL,
        riskLevel               VARCHAR(50)         NULL,
        income                  DECIMAL(18,2)       NULL,
        expenses                DECIMAL(18,2)       NULL,
        savings                 DECIMAL(18,2)       NULL,
        planType                VARCHAR(50)         NULL,
        riskFlagStatus          VARCHAR(50)         NULL,
        createdAt               DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_FinancialReport PRIMARY KEY (reportID),
        CONSTRAINT FK_FinancialReport_MainMember FOREIGN KEY (mainMemberID) REFERENCES MainMember(mainMemberID),
        CONSTRAINT FK_FinancialReport_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID)
    );
END
GO

-- ── UserAnalytics ────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserAnalytics')
BEGIN
    CREATE TABLE UserAnalytics (
        userAnalyticsID INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        scoreID         INT                 NULL,
        riskScore       DECIMAL(10,4)       NULL,
        memberType      VARCHAR(50)         NULL,
        CONSTRAINT PK_UserAnalytics PRIMARY KEY (userAnalyticsID),
        CONSTRAINT FK_UserAnalytics_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
        CONSTRAINT FK_UserAnalytics_ScribeScore FOREIGN KEY (scoreID) REFERENCES ScribeScore(scoreID)
    );
END
GO

-- =================================================================
-- SEED DATA (lookup/reference data only — no mock users)
-- =================================================================
IF NOT EXISTS (SELECT 1 FROM SubscriptionCategory)
BEGIN
    INSERT INTO SubscriptionCategory (categoryName) VALUES
        ('Entertainment'), ('Music'), ('Shopping'), ('Productivity'),
        ('Education'), ('Utilities'), ('Fitness'), ('News'),
        ('Gaming'), ('Health'), ('AI'), ('Other');
END
GO

-- =================================================================
-- VERIFY — List all tables created
-- =================================================================
SELECT TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_CATALOG = 'FlexScribeDB'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO
