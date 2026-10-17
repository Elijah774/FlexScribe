/* =================================================================
   FlexScribeDatabase.sql
   Full database creation script for FlexScribe.
   Generated from the live FlexScribeDB schema (all applied migrations).

   HOW TO RUN (on a fresh local machine):
     SSMS:    open this file, make sure you're connected to your
              SQL Server instance, and Execute (F5).
     sqlcmd:  sqlcmd -S localhost -E -i FlexScribeDatabase.sql
              (-E = Windows Auth; or use -U <login> -P <password>)

   - Creates the FlexScribeDB database if it does not exist.
   - Creates every table with its exact columns, defaults, keys,
     unique/ check constraints and foreign keys.
   - Seeds the SubscriptionCategory lookup values.
   - Idempotent: safe to run more than once (IF NOT EXISTS guards).
================================================================= */

/* ── 1. Database ───────────────────────────────────────────────── */
IF DB_ID('FlexScribeDB') IS NULL
BEGIN
    CREATE DATABASE FlexScribeDB;
END
GO

USE FlexScribeDB;
GO

/* ── 2. Lookup / base tables (no FK dependencies first) ────────── */

-- SubscriptionCategory
IF OBJECT_ID('dbo.SubscriptionCategory') IS NULL
BEGIN
    CREATE TABLE dbo.SubscriptionCategory (
        categoryID      INT             NOT NULL IDENTITY(1,1),
        categoryName    VARCHAR(100)    NOT NULL,
        CONSTRAINT PK_SubscriptionCategory PRIMARY KEY (categoryID),
        CONSTRAINT UQ_Category_Name UNIQUE (categoryName)
    );
END
GO

-- Subscriber (base user table)
IF OBJECT_ID('dbo.Subscriber') IS NULL
BEGIN
    CREATE TABLE dbo.Subscriber (
        subscriberID     INT             NOT NULL IDENTITY(1,1),
        firstName        VARCHAR(100)    NOT NULL,
        lastName         VARCHAR(100)    NOT NULL,
        preferredName    VARCHAR(100)        NULL,
        email            VARCHAR(255)    NOT NULL,
        passwordHash     VARCHAR(255)    NOT NULL,
        phone            VARCHAR(50)         NULL,
        dateOfBirth      DATE                NULL,
        bio              VARCHAR(500)        NULL,
        userType         VARCHAR(50)     NOT NULL DEFAULT 'MainMember',
        scribeScore      INT             NOT NULL DEFAULT 500,
        avatarUrl        VARCHAR(500)        NULL,
        marketingOptIn   BIT             NOT NULL DEFAULT 0,
        termsAcceptedAt  DATETIME            NULL,
        twoFactorEnabled BIT             NOT NULL DEFAULT 0,
        theme            VARCHAR(10)     NOT NULL DEFAULT 'dark',
        accentColor      VARCHAR(7)          NULL,
        notifyPayments   BIT             NOT NULL DEFAULT 1,
        notifyGoals      BIT             NOT NULL DEFAULT 1,
        notifyWeekly     BIT             NOT NULL DEFAULT 0,
        createdAt        DATETIME        NOT NULL DEFAULT GETDATE(),
        updatedAt        DATETIME        NOT NULL DEFAULT GETDATE(),
        timezone         VARCHAR(64)     NOT NULL DEFAULT 'Africa/Johannesburg',
        quietHoursEnabled BIT            NOT NULL DEFAULT 1,
        quietHoursStart  INT             NOT NULL DEFAULT 1320,
        quietHoursEnd    INT             NOT NULL DEFAULT 420,
        CONSTRAINT PK_Subscriber PRIMARY KEY (subscriberID),
        CONSTRAINT UQ_Subscriber_Email UNIQUE (email),
        CONSTRAINT CK_Subscriber_UserType CHECK (userType IN ('MainMember','Dependant','Admin','individual','dependant')),
        CONSTRAINT CK_Subscriber_Theme CHECK (theme IN ('dark','light'))
    );
END
GO

-- MainMember (specialisation of Subscriber)
IF OBJECT_ID('dbo.MainMember') IS NULL
BEGIN
    CREATE TABLE dbo.MainMember (
        mainMemberID    INT             NOT NULL,
        monthlyIncome   DECIMAL(18,2)       NULL,
        planType        VARCHAR(50)     NOT NULL DEFAULT 'Free',
        riskFlagStatus  VARCHAR(50)         NULL,
        CONSTRAINT PK_MainMember PRIMARY KEY (mainMemberID),
        CONSTRAINT FK_MainMember_Subscriber FOREIGN KEY (mainMemberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT CK_MainMember_Plan CHECK (planType IN ('Free','Premium','Business'))
    );
END
GO

-- Dependant (specialisation of Subscriber)
IF OBJECT_ID('dbo.Dependant') IS NULL
BEGIN
    CREATE TABLE dbo.Dependant (
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
        CONSTRAINT FK_Dependant_Subscriber FOREIGN KEY (dependantID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT FK_Dependant_MainMember FOREIGN KEY (mainMemberID) REFERENCES dbo.MainMember(mainMemberID),
        CONSTRAINT CK_Dependant_Status CHECK (status IN ('active','invited','suspended'))
    );
END
GO

-- VirtualWallet
IF OBJECT_ID('dbo.VirtualWallet') IS NULL
BEGIN
    CREATE TABLE dbo.VirtualWallet (
        walletID        INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        balance         DECIMAL(18,2)   NOT NULL DEFAULT 0,
        pendingIn       DECIMAL(18,2)   NOT NULL DEFAULT 0,
        pendingOut      DECIMAL(18,2)   NOT NULL DEFAULT 0,
        currency        VARCHAR(10)     NOT NULL DEFAULT 'ZAR',
        lastTopUpDate   DATETIME            NULL,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        cardNumber      VARCHAR(19)         NULL,
        CONSTRAINT PK_VirtualWallet PRIMARY KEY (walletID),
        CONSTRAINT FK_VirtualWallet_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT UQ_VirtualWallet_Subscriber UNIQUE (subscriberID),
        CONSTRAINT UQ_VirtualWallet_CardNumber UNIQUE (cardNumber)
    );
END
GO

-- Subscription
IF OBJECT_ID('dbo.Subscription') IS NULL
BEGIN
    CREATE TABLE dbo.Subscription (
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
        CONSTRAINT FK_Subscription_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT FK_Subscription_Category FOREIGN KEY (categoryID) REFERENCES dbo.SubscriptionCategory(categoryID),
        CONSTRAINT CK_Subscription_Cycle CHECK (billingCycle IN ('weekly','monthly','quarterly','yearly')),
        CONSTRAINT CK_Subscription_Status CHECK (subStatus IN ('active','paused','cancelled')),
        CONSTRAINT CK_Subscription_PaymentSource CHECK (paymentSource IN ('wallet','bank-card'))
    );
END
GO

-- FinancialGoal
IF OBJECT_ID('dbo.FinancialGoal') IS NULL
BEGIN
    CREATE TABLE dbo.FinancialGoal (
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
        fundsReturned   BIT             NOT NULL DEFAULT 0,
        CONSTRAINT PK_FinancialGoal PRIMARY KEY (goalID),
        CONSTRAINT FK_FinancialGoal_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT CK_Goal_Status CHECK (goalStatus IN ('active','completed','paused','expired')),
        CONSTRAINT CK_Goal_Category CHECK (category IN ('Travel','Tech','Education','Emergency','Home','Vehicle','Other'))
    );
END
GO

-- GoalContribution
IF OBJECT_ID('dbo.GoalContribution') IS NULL
BEGIN
    CREATE TABLE dbo.GoalContribution (
        contributionID  INT             NOT NULL IDENTITY(1,1),
        goalID          INT             NOT NULL,
        amount          DECIMAL(18,2)   NOT NULL,
        note            VARCHAR(200)        NULL,
        source          VARCHAR(50)     NOT NULL DEFAULT 'wallet',
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_GoalContribution PRIMARY KEY (contributionID),
        CONSTRAINT FK_GoalContribution_Goal FOREIGN KEY (goalID) REFERENCES dbo.FinancialGoal(goalID)
    );
END
GO

-- DependantTask
IF OBJECT_ID('dbo.DependantTask') IS NULL
BEGIN
    CREATE TABLE dbo.DependantTask (
        dependantTaskID         INT             NOT NULL IDENTITY(1,1),
        dependantID             INT             NOT NULL,
        mainMemberID            INT             NOT NULL,
        taskName                VARCHAR(200)    NOT NULL,
        description             VARCHAR(500)        NULL,
        dueDate                 DATE                NULL,
        reward                  DECIMAL(18,2)   NOT NULL DEFAULT 0,
        taskStatus              VARCHAR(50)     NOT NULL DEFAULT 'pending',
        recurring               BIT             NOT NULL DEFAULT 0,
        recurrenceCycle         VARCHAR(20)         NULL,
        completedAt             DATETIME            NULL,
        createdAt               DATETIME        NOT NULL DEFAULT GETDATE(),
        updatedAt               DATETIME        NOT NULL DEFAULT GETDATE(),
        recurrenceParentID      INT                 NULL,
        nextOccurrenceGenerated BIT             NOT NULL DEFAULT 0,
        taskRewardPaid          BIT             NOT NULL DEFAULT 0,
        CONSTRAINT PK_DependantTask PRIMARY KEY (dependantTaskID),
        CONSTRAINT FK_DependantTask_Dependant FOREIGN KEY (dependantID) REFERENCES dbo.Dependant(dependantID),
        CONSTRAINT FK_DependantTask_MainMember FOREIGN KEY (mainMemberID) REFERENCES dbo.MainMember(mainMemberID),
        CONSTRAINT CK_DependantTask_Status CHECK (taskStatus IN ('pending','in_progress','completed','overdue','cancelled')),
        CONSTRAINT CK_DependantTask_Recurrence CHECK (recurrenceCycle IN ('daily','weekly','biweekly','monthly'))
    );
END
GO

-- ScribeScore
IF OBJECT_ID('dbo.ScribeScore') IS NULL
BEGIN
    CREATE TABLE dbo.ScribeScore (
        scoreID         INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        scoreValue      INT             NOT NULL DEFAULT 0,
        subscriptionPct DECIMAL(5,2)        NULL,
        budgetPct       DECIMAL(5,2)        NULL,
        savingsPct      DECIMAL(5,2)        NULL,
        generatedAt     DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_ScribeScore PRIMARY KEY (scoreID),
        CONSTRAINT FK_ScribeScore_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID)
    );
END
GO

-- ScribeScoreEvent (conduct-based points log + idempotency)
IF OBJECT_ID('dbo.ScribeScoreEvent') IS NULL
BEGIN
    CREATE TABLE dbo.ScribeScoreEvent (
        eventID        INT             NOT NULL IDENTITY(1,1),
        subscriberID   INT             NOT NULL,
        eventType      VARCHAR(50)     NOT NULL,
        periodKey      VARCHAR(60)     NOT NULL,
        points         INT             NOT NULL,
        scoreAfter     INT                 NULL,
        createdAt      DATETIME        NOT NULL DEFAULT GETDATE(),
        category       VARCHAR(40)         NULL,
        CONSTRAINT PK_ScribeScoreEvent PRIMARY KEY (eventID),
        CONSTRAINT FK_ScribeScoreEvent_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT UQ_ScribeScoreEvent UNIQUE (subscriberID, eventType, periodKey)
    );
END
GO

-- UserAnalytics
IF OBJECT_ID('dbo.UserAnalytics') IS NULL
BEGIN
    CREATE TABLE dbo.UserAnalytics (
        userAnalyticsID INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        scoreID         INT                 NULL,
        riskScore       DECIMAL(10,4)       NULL,
        memberType      VARCHAR(50)         NULL,
        CONSTRAINT PK_UserAnalytics PRIMARY KEY (userAnalyticsID),
        CONSTRAINT FK_UserAnalytics_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT FK_UserAnalytics_ScribeScore FOREIGN KEY (scoreID) REFERENCES dbo.ScribeScore(scoreID)
    );
END
GO

-- WalletTransaction
IF OBJECT_ID('dbo.WalletTransaction') IS NULL
BEGIN
    CREATE TABLE dbo.WalletTransaction (
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
        reference           VARCHAR(40)         NULL,
        status              VARCHAR(20)     NOT NULL DEFAULT 'completed',
        balanceBefore       DECIMAL(18,2)       NULL,
        balanceAfter        DECIMAL(18,2)       NULL,
        recipientUserID     INT                 NULL,
        recipientName       VARCHAR(200)        NULL,
        senderName          VARCHAR(200)        NULL,
        completedAt         DATETIME            NULL,
        failureReason       VARCHAR(300)        NULL,
        metadata            VARCHAR(MAX)        NULL,
        paymentRequestId    INT                 NULL,
        CONSTRAINT PK_WalletTransaction PRIMARY KEY (transactionID),
        CONSTRAINT FK_WalletTx_Wallet FOREIGN KEY (walletID) REFERENCES dbo.VirtualWallet(walletID),
        CONSTRAINT FK_WalletTx_Subscription FOREIGN KEY (subscriptionID) REFERENCES dbo.Subscription(subscriptionID),
        CONSTRAINT FK_WalletTx_Goal FOREIGN KEY (goalID) REFERENCES dbo.FinancialGoal(goalID),
        CONSTRAINT FK_WalletTx_Dependant FOREIGN KEY (dependantID) REFERENCES dbo.Dependant(dependantID),
        CONSTRAINT FK_WalletTx_Recipient FOREIGN KEY (recipientUserID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT CK_WalletTx_Type CHECK (transactionType IN ('credit','debit','transfer','refund','payment','transfer_in','transfer_out','withdrawal','adjustment')),
        CONSTRAINT CK_WalletTx_Status CHECK (status IN ('pending','completed','failed'))
    );
END
GO
-- FK to PaymentRequest is added after that table exists (see below).

-- Notification
IF OBJECT_ID('dbo.Notification') IS NULL
BEGIN
    CREATE TABLE dbo.Notification (
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
        relatedEntityType   VARCHAR(50)         NULL,
        relatedEntityID     INT                 NULL,
        actionUrl           VARCHAR(255)        NULL,
        metadata            NVARCHAR(MAX)       NULL,
        scheduledFor        DATETIME            NULL,
        sentAt              DATETIME            NULL,
        expiresAt           DATETIME            NULL,
        dedupeKey           VARCHAR(255)        NULL,
        CONSTRAINT PK_Notification PRIMARY KEY (notificationID),
        CONSTRAINT FK_Notification_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT FK_Notification_Subscription FOREIGN KEY (subscriptionID) REFERENCES dbo.Subscription(subscriptionID),
        CONSTRAINT FK_Notification_Transaction FOREIGN KEY (transactionID) REFERENCES dbo.WalletTransaction(transactionID),
        CONSTRAINT CK_Notification_Priority CHECK (priority IN ('low','medium','high','critical')),
        CONSTRAINT CK_Notification_Type CHECK (notificationType IN (
            'payment','goal','security','score','system','dependant',
            'PAYMENT_SUCCESS','PAYMENT_FAILED','SUBSCRIPTION_ADDED','SUBSCRIPTION_UPDATED',
            'SUBSCRIPTION_CANCELLED','SUBSCRIPTION_PAUSED','SUBSCRIPTION_RENEWAL_REMINDER',
            'UPCOMING_PAYMENT','LOW_BALANCE','INSUFFICIENT_FUNDS','GOAL_PROGRESS','GOAL_COMPLETED',
            'WEEKLY_SUMMARY','MONTHLY_SUMMARY','SYSTEM','FLEXTAP','FLEXTAP_SENT','FLEXTAP_RECEIVED',
            'FLEXTAP_FAILED','DEPENDANT_TASK_COMPLETED','DEPENDANT_TASK_OVERDUE','AI_INSIGHT'
        ))
    );
END
GO

-- PaymentSchedule
IF OBJECT_ID('dbo.PaymentSchedule') IS NULL
BEGIN
    CREATE TABLE dbo.PaymentSchedule (
        scheduleID          INT             NOT NULL IDENTITY(1,1),
        subscriptionID      INT             NOT NULL,
        nextPaymentDate     DATE            NOT NULL,
        amountDue           DECIMAL(18,2)   NOT NULL,
        scheduleStatus      VARCHAR(50)     NOT NULL DEFAULT 'pending',
        CONSTRAINT PK_PaymentSchedule PRIMARY KEY (scheduleID),
        CONSTRAINT FK_PaymentSchedule_Subscription FOREIGN KEY (subscriptionID) REFERENCES dbo.Subscription(subscriptionID),
        CONSTRAINT CK_Schedule_Status CHECK (scheduleStatus IN ('pending','paid','overdue','cancelled'))
    );
END
GO

-- LinkedBankAccount
IF OBJECT_ID('dbo.LinkedBankAccount') IS NULL
BEGIN
    CREATE TABLE dbo.LinkedBankAccount (
        linkedBankAccountID INT             NOT NULL IDENTITY(1,1),
        subscriberID        INT             NOT NULL,
        bankName            VARCHAR(100)    NOT NULL,
        accountType         VARCHAR(50)     NOT NULL,
        lastFour            CHAR(4)         NOT NULL,
        holderName          VARCHAR(200)        NULL,
        isDefault           BIT             NOT NULL DEFAULT 0,
        createdAt           DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_LinkedBankAccount PRIMARY KEY (linkedBankAccountID),
        CONSTRAINT FK_LinkedBankAccount_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID)
    );
END
GO

-- PaymentRequest (deposits / withdrawals)
IF OBJECT_ID('dbo.PaymentRequest') IS NULL
BEGIN
    CREATE TABLE dbo.PaymentRequest (
        paymentRequestID    INT             NOT NULL IDENTITY(1,1),
        subscriberID        INT             NOT NULL,
        type                VARCHAR(20)     NOT NULL,
        method              VARCHAR(20)     NOT NULL,
        amount              DECIMAL(18,2)   NOT NULL,
        fee                 DECIMAL(18,2)   NOT NULL DEFAULT 0,
        totalAmount         DECIMAL(18,2)   NOT NULL,
        status              VARCHAR(30)     NOT NULL,
        reference           VARCHAR(40)     NOT NULL,
        idempotencyKey      VARCHAR(100)    NOT NULL,
        bankName            VARCHAR(100)        NULL,
        cardLast4           CHAR(4)             NULL,
        cardBrand           VARCHAR(20)         NULL,
        linkedBankAccountID INT                 NULL,
        speed               VARCHAR(20)         NULL,
        voucherReference    VARCHAR(40)         NULL,
        codeHash            VARCHAR(128)        NULL,
        codeExpiresAt       DATETIME            NULL,
        codeAttempts        INT             NOT NULL DEFAULT 0,
        codeLastSentAt      DATETIME            NULL,
        expiresAt           DATETIME            NULL,
        createdAt           DATETIME        NOT NULL DEFAULT GETDATE(),
        updatedAt           DATETIME        NOT NULL DEFAULT GETDATE(),
        completedAt         DATETIME            NULL,
        cancelledAt         DATETIME            NULL,
        cancelReason        VARCHAR(200)        NULL,
        CONSTRAINT PK_PaymentRequest PRIMARY KEY (paymentRequestID),
        CONSTRAINT FK_PaymentRequest_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID),
        CONSTRAINT FK_PaymentRequest_LinkedBankAccount FOREIGN KEY (linkedBankAccountID) REFERENCES dbo.LinkedBankAccount(linkedBankAccountID),
        CONSTRAINT UQ_PaymentRequest_Idempotency UNIQUE (subscriberID, idempotencyKey),
        CONSTRAINT CK_PaymentRequest_Type CHECK (type IN ('Deposit','Withdrawal')),
        CONSTRAINT CK_PaymentRequest_Method CHECK (method IN ('Card','InstantEFT','CashVoucher','BankTransfer')),
        CONSTRAINT CK_PaymentRequest_Speed CHECK (speed IS NULL OR speed IN ('Standard','Instant')),
        CONSTRAINT CK_PaymentRequest_Status CHECK (status IN (
            'Created','AwaitingAuthentication','AwaitingConfirmation','Pending',
            'Processing','Completed','Failed','Cancelled','Expired'
        ))
    );
END
GO

-- Late FK: WalletTransaction -> PaymentRequest (table now exists).
IF OBJECT_ID('dbo.WalletTransaction') IS NOT NULL
   AND OBJECT_ID('dbo.PaymentRequest') IS NOT NULL
   AND OBJECT_ID('FK_WalletTx_PaymentRequest') IS NULL
BEGIN
    ALTER TABLE dbo.WalletTransaction
        ADD CONSTRAINT FK_WalletTx_PaymentRequest
        FOREIGN KEY (paymentRequestId) REFERENCES dbo.PaymentRequest(paymentRequestID);
END
GO

-- WithdrawalDestination
IF OBJECT_ID('dbo.WithdrawalDestination') IS NULL
BEGIN
    CREATE TABLE dbo.WithdrawalDestination (
        destinationID   INT             NOT NULL IDENTITY(1,1),
        subscriberID    INT             NOT NULL,
        bankName        VARCHAR(100)    NOT NULL,
        accountLabel    VARCHAR(100)        NULL,
        accountMask     VARCHAR(50)     NOT NULL,
        accountType     VARCHAR(30)         NULL,
        isDefault       BIT             NOT NULL DEFAULT 0,
        isActive        BIT             NOT NULL DEFAULT 1,
        createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_WithdrawalDestination PRIMARY KEY (destinationID),
        CONSTRAINT FK_WithdrawalDestination_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID)
    );
END
GO

-- FinancialReport
IF OBJECT_ID('dbo.FinancialReport') IS NULL
BEGIN
    CREATE TABLE dbo.FinancialReport (
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
        CONSTRAINT FK_FinancialReport_MainMember FOREIGN KEY (mainMemberID) REFERENCES dbo.MainMember(mainMemberID),
        CONSTRAINT FK_FinancialReport_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID)
    );
END
GO

-- SpendingReport
IF OBJECT_ID('dbo.SpendingReport') IS NULL
BEGIN
    CREATE TABLE dbo.SpendingReport (
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
        CONSTRAINT FK_SpendingReport_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID)
    );
END
GO

-- BankStatement
IF OBJECT_ID('dbo.BankStatement') IS NULL
BEGIN
    CREATE TABLE dbo.BankStatement (
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
        CONSTRAINT FK_BankStatement_Subscriber FOREIGN KEY (subscriberID) REFERENCES dbo.Subscriber(subscriberID)
    );
END
GO

/* ── 3. Seed data (lookup values only — no mock users) ─────────── */
IF NOT EXISTS (SELECT 1 FROM dbo.SubscriptionCategory)
BEGIN
    INSERT INTO dbo.SubscriptionCategory (categoryName) VALUES
        ('Entertainment'), ('Music'), ('Shopping'), ('Productivity'),
        ('Education'), ('Utilities'), ('Fitness'), ('News'),
        ('Gaming'), ('Health'), ('AI'), ('Other');
END
GO

/* ── 4. Verify — list all created tables ───────────────────────── */
SELECT TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_CATALOG = 'FlexScribeDB' AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO
