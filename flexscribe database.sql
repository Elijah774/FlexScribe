-- ═══════════════════════════════════════════════════════════════
-- FlexScribe Database Schema
-- SQL Server (run in SSMS)
-- ═══════════════════════════════════════════════════════════════

CREATE DATABASE FlexScribeDB;
GO

USE FlexScribeDB;
GO

-- ── SubscriptionCategory ─────────────────────────────────────
CREATE TABLE SubscriptionCategory (
    categoryID      INT             NOT NULL IDENTITY(1,1),
    categoryName    VARCHAR(100)    NOT NULL,
    CONSTRAINT PK_SubscriptionCategory PRIMARY KEY (categoryID),
    CONSTRAINT UQ_Category_Name UNIQUE (categoryName)
);
GO

-- ── Subscriber (base user table) ─────────────────────────────
CREATE TABLE Subscriber (
    subscriberID    INT             NOT NULL IDENTITY(1,1),
    firstName       VARCHAR(100)    NOT NULL,
    lastName        VARCHAR(100)    NOT NULL,
    preferredName   VARCHAR(100)        NULL,
    email           VARCHAR(255)    NOT NULL,
    passwordHash    VARCHAR(255)    NOT NULL,
    phone           VARCHAR(50)         NULL,
    userType        VARCHAR(50)     NOT NULL DEFAULT 'MainMember',
    scribePoints    INT             NOT NULL DEFAULT 0,
    avatarUrl       VARCHAR(500)        NULL,
    marketingOptIn  BIT             NOT NULL DEFAULT 0,
    createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
    updatedAt       DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_Subscriber PRIMARY KEY (subscriberID),
    CONSTRAINT UQ_Subscriber_Email UNIQUE (email),
    CONSTRAINT CK_Subscriber_UserType CHECK (userType IN ('MainMember', 'Dependant', 'Admin'))
);
GO

-- ── MainMember (specialisation of Subscriber) ────────────────
CREATE TABLE MainMember (
    mainMemberID    INT             NOT NULL,
    monthlyIncome   DECIMAL(18,2)       NULL,
    planType        VARCHAR(50)     NOT NULL DEFAULT 'Free',
    riskFlagStatus  VARCHAR(50)         NULL,
    CONSTRAINT PK_MainMember PRIMARY KEY (mainMemberID),
    CONSTRAINT FK_MainMember_Subscriber FOREIGN KEY (mainMemberID) REFERENCES Subscriber(subscriberID),
    CONSTRAINT CK_MainMember_Plan CHECK (planType IN ('Free', 'Premium', 'Business'))
);
GO

-- ── Dependant (specialisation of Subscriber) ─────────────────
CREATE TABLE Dependant (
    dependantID     INT             NOT NULL,
    mainMemberID    INT             NOT NULL,
    age             INT                 NULL,
    relationship    VARCHAR(100)        NULL,
    allowance       DECIMAL(18,2)   NOT NULL DEFAULT 0,
    spendingLimit   DECIMAL(18,2)       NULL,
    status          VARCHAR(50)     NOT NULL DEFAULT 'invited',
    CONSTRAINT PK_Dependant PRIMARY KEY (dependantID),
    CONSTRAINT FK_Dependant_Subscriber FOREIGN KEY (dependantID) REFERENCES Subscriber(subscriberID),
    CONSTRAINT FK_Dependant_MainMember FOREIGN KEY (mainMemberID) REFERENCES MainMember(mainMemberID),
    CONSTRAINT CK_Dependant_Status CHECK (status IN ('active', 'invited', 'suspended'))
);
GO

-- ── VirtualWallet (1:1 with Subscriber) ──────────────────────
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
GO

-- ── Subscription ─────────────────────────────────────────────
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
    notes           VARCHAR(500)        NULL,
    colorTag        VARCHAR(7)          NULL,
    reminderDays    INT                 NULL,
    providerUrl     VARCHAR(500)        NULL,
    createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
    updatedAt       DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_Subscription PRIMARY KEY (subscriptionID),
    CONSTRAINT FK_Subscription_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
    CONSTRAINT FK_Subscription_Category FOREIGN KEY (categoryID) REFERENCES SubscriptionCategory(categoryID),
    CONSTRAINT CK_Subscription_Cycle CHECK (billingCycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    CONSTRAINT CK_Subscription_Status CHECK (subStatus IN ('active', 'paused', 'cancelled'))
);
GO

-- ── FinancialGoal ────────────────────────────────────────────
CREATE TABLE FinancialGoal (
    goalID          INT             NOT NULL IDENTITY(1,1),
    subscriberID    INT             NOT NULL,
    goalName        VARCHAR(200)    NOT NULL,
    targetAmount    DECIMAL(18,2)   NOT NULL,
    currentProgress DECIMAL(18,2)   NOT NULL DEFAULT 0,
    deadline        DATE                NULL,
    imageUrl        VARCHAR(500)        NULL,
    goalStatus      VARCHAR(50)     NOT NULL DEFAULT 'active',
    lastTopUpDate   DATETIME            NULL,
    createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_FinancialGoal PRIMARY KEY (goalID),
    CONSTRAINT FK_FinancialGoal_Subscriber FOREIGN KEY (subscriberID) REFERENCES Subscriber(subscriberID),
    CONSTRAINT CK_Goal_Status CHECK (goalStatus IN ('active', 'completed', 'paused'))
);
GO

-- ── GoalContribution ─────────────────────────────────────────
CREATE TABLE GoalContribution (
    contributionID  INT             NOT NULL IDENTITY(1,1),
    goalID          INT             NOT NULL,
    amountCents     INT             NOT NULL,
    source          VARCHAR(50)     NOT NULL DEFAULT 'wallet',
    createdAt       DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_GoalContribution PRIMARY KEY (contributionID),
    CONSTRAINT FK_GoalContribution_Goal FOREIGN KEY (goalID) REFERENCES FinancialGoal(goalID)
);
GO

-- ── ScribeScore ──────────────────────────────────────────────
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
GO

-- ── WalletTransaction ────────────────────────────────────────
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
GO

-- ── Notification ─────────────────────────────────────────────
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
GO

-- ── PaymentSchedule ──────────────────────────────────────────
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
GO

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════

INSERT INTO SubscriptionCategory (categoryName) VALUES
    ('Entertainment'), ('Music'), ('Shopping'), ('Productivity'),
    ('Education'), ('Utilities'), ('Fitness'), ('News'),
    ('Gaming'), ('Health'), ('AI'), ('Other');
GO

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════
SELECT TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_CATALOG = 'FlexScribeDB'
ORDER BY TABLE_NAME;
GO
