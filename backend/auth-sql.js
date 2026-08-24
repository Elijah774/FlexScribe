/* =============================================================
   FlexScribe — Auth / User SQL Statements
   backend/auth-sql.js

   SQL statements for user registration, login, profile editing,
   and account deletion. These map directly to the FlexScribeDB
   schema (Subscriber, MainMember tables).

   NOTE: Database integration is not yet active. These are
   prepared statements using named parameters (e.g. @paramName)
   following SQL Server / SSMS conventions.
============================================================= */

'use strict';

const AuthSQL = (() => {

    /* ==========================================================
       ── REGISTRATION ──
       Creating a new user requires INSERTing into Subscriber
       and then MainMember (since all self-registered users
       are main members).
    ========================================================== */

    /* ----------------------------------------------------------
       REGISTER — Step 1: Insert into Subscriber
    ---------------------------------------------------------- */
    const INSERT_SUBSCRIBER = `
        INSERT INTO Subscriber (firstName, lastName, preferredName, email, passwordHash, phone, userType, scribeScore, avatarUrl, marketingOptIn, createdAt, updatedAt)
        VALUES (@firstName, @lastName, @preferredName, @email, @passwordHash, @phone, 'MainMember', 0, @avatarUrl, @marketingOptIn, GETDATE(), GETDATE());

        SELECT SCOPE_IDENTITY() AS newSubscriberID;
    `;

    /* ----------------------------------------------------------
       REGISTER — Step 2: Insert into MainMember
    ---------------------------------------------------------- */
    const INSERT_MAIN_MEMBER = `
        INSERT INTO MainMember (mainMemberID, monthlyIncome, planType, riskFlagStatus)
        VALUES (@mainMemberID, NULL, 'Free', NULL);
    `;

    /* ----------------------------------------------------------
       REGISTER — Step 3: Create VirtualWallet for new user
    ---------------------------------------------------------- */
    const INSERT_WALLET_FOR_NEW_USER = `
        INSERT INTO VirtualWallet (subscriberID, balance, pendingIn, pendingOut, currency, lastTopUpDate, createdAt)
        VALUES (@subscriberID, 0, 0, 0, 'ZAR', NULL, GETDATE());
    `;

    /* ----------------------------------------------------------
       REGISTER — Check if email already exists
    ---------------------------------------------------------- */
    const CHECK_EMAIL_EXISTS = `
        SELECT subscriberID, email
        FROM Subscriber
        WHERE email = @email;
    `;


    /* ==========================================================
       ── LOGIN ──
       Retrieve user credentials and profile for authentication.
    ========================================================== */

    /* ----------------------------------------------------------
       LOGIN — Get user by email (for password verification)
    ---------------------------------------------------------- */
    const GET_USER_BY_EMAIL = `
        SELECT
            s.subscriberID,
            s.firstName,
            s.lastName,
            s.preferredName,
            s.email,
            s.passwordHash,
            s.phone,
            s.userType,
            s.scribeScore,
            s.avatarUrl,
            s.marketingOptIn,
            s.createdAt,
            m.planType,
            m.monthlyIncome,
            m.riskFlagStatus
        FROM Subscriber s
        LEFT JOIN MainMember m ON m.mainMemberID = s.subscriberID
        WHERE s.email = @email;
    `;

    /* ----------------------------------------------------------
       LOGIN — Get user by ID (for session/token refresh)
    ---------------------------------------------------------- */
    const GET_USER_BY_ID = `
        SELECT
            s.subscriberID,
            s.firstName,
            s.lastName,
            s.preferredName,
            s.email,
            s.phone,
            s.userType,
            s.scribeScore,
            s.avatarUrl,
            s.marketingOptIn,
            s.createdAt,
            m.planType,
            m.monthlyIncome,
            m.riskFlagStatus
        FROM Subscriber s
        LEFT JOIN MainMember m ON m.mainMemberID = s.subscriberID
        WHERE s.subscriberID = @subscriberID;
    `;


    /* ==========================================================
       ── PROFILE EDITING ──
       Update user details in the Subscriber and MainMember tables.
    ========================================================== */

    /* ----------------------------------------------------------
       EDIT — Update Subscriber personal details
    ---------------------------------------------------------- */
    const UPDATE_SUBSCRIBER_PROFILE = `
        UPDATE Subscriber
        SET firstName     = @firstName,
            lastName      = @lastName,
            preferredName = @preferredName,
            phone         = @phone,
            avatarUrl     = @avatarUrl,
            updatedAt     = GETDATE()
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       EDIT — Update email (separate due to unique constraint)
    ---------------------------------------------------------- */
    const UPDATE_SUBSCRIBER_EMAIL = `
        UPDATE Subscriber
        SET email     = @newEmail,
            updatedAt = GETDATE()
        WHERE subscriberID = @subscriberID
          AND email = @currentEmail;
    `;

    /* ----------------------------------------------------------
       EDIT — Update password
    ---------------------------------------------------------- */
    const UPDATE_SUBSCRIBER_PASSWORD = `
        UPDATE Subscriber
        SET passwordHash = @newPasswordHash,
            updatedAt    = GETDATE()
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       EDIT — Update marketing opt-in preference
    ---------------------------------------------------------- */
    const UPDATE_MARKETING_OPTIN = `
        UPDATE Subscriber
        SET marketingOptIn = @marketingOptIn,
            updatedAt     = GETDATE()
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       EDIT — Update MainMember financial details
    ---------------------------------------------------------- */
    const UPDATE_MAIN_MEMBER_DETAILS = `
        UPDATE MainMember
        SET monthlyIncome  = @monthlyIncome,
            planType       = @planType
        WHERE mainMemberID = @subscriberID;
    `;


    /* ==========================================================
       ── ACCOUNT DELETION ──
       Deleting an account requires removing data from all
       related tables in the correct FK order.
    ========================================================== */

    /* ----------------------------------------------------------
       DELETE — Step 1: Remove all notifications
    ---------------------------------------------------------- */
    const DELETE_USER_NOTIFICATIONS = `
        DELETE FROM Notification
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 2: Remove wallet transactions
    ---------------------------------------------------------- */
    const DELETE_USER_WALLET_TRANSACTIONS = `
        DELETE FROM WalletTransaction
        WHERE walletID IN (
            SELECT walletID FROM VirtualWallet WHERE subscriberID = @subscriberID
        );
    `;

    /* ----------------------------------------------------------
       DELETE — Step 3: Remove virtual wallet
    ---------------------------------------------------------- */
    const DELETE_USER_WALLET = `
        DELETE FROM VirtualWallet
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 4: Remove goal contributions
    ---------------------------------------------------------- */
    const DELETE_USER_GOAL_CONTRIBUTIONS = `
        DELETE FROM GoalContribution
        WHERE goalID IN (
            SELECT goalID FROM FinancialGoal WHERE subscriberID = @subscriberID
        );
    `;

    /* ----------------------------------------------------------
       DELETE — Step 5: Remove financial goals
    ---------------------------------------------------------- */
    const DELETE_USER_GOALS = `
        DELETE FROM FinancialGoal
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 6: Remove payment schedules for user subscriptions
    ---------------------------------------------------------- */
    const DELETE_USER_PAYMENT_SCHEDULES = `
        DELETE FROM PaymentSchedule
        WHERE subscriptionID IN (
            SELECT subscriptionID FROM Subscription WHERE subscriberID = @subscriberID
        );
    `;

    /* ----------------------------------------------------------
       DELETE — Step 7: Remove subscriptions
    ---------------------------------------------------------- */
    const DELETE_USER_SUBSCRIPTIONS = `
        DELETE FROM Subscription
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 8: Remove scribe scores
    ---------------------------------------------------------- */
    const DELETE_USER_SCRIBE_SCORES = `
        DELETE FROM ScribeScore
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 9: Remove dependant tasks (for dependants under this member)
    ---------------------------------------------------------- */
    const DELETE_USER_DEPENDANT_TASKS = `
        DELETE FROM DependantTask
        WHERE mainMemberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 10: Remove dependants (and their Subscriber records)
    ---------------------------------------------------------- */
    const DELETE_USER_DEPENDANTS = `
        DELETE FROM Dependant
        WHERE mainMemberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 11: Remove MainMember record
    ---------------------------------------------------------- */
    const DELETE_MAIN_MEMBER = `
        DELETE FROM MainMember
        WHERE mainMemberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Step 12: Remove Subscriber record (final step)
    ---------------------------------------------------------- */
    const DELETE_SUBSCRIBER = `
        DELETE FROM Subscriber
        WHERE subscriberID = @subscriberID;
    `;


    /* ==========================================================
       ── SUPPLEMENTARY QUERIES ──
    ========================================================== */

    /* ----------------------------------------------------------
       Get user's scribe score history
    ---------------------------------------------------------- */
    const GET_SCRIBE_SCORES = `
        SELECT scoreID, scoreValue, subscriptionPct, budgetPct, savingsPct, generatedAt
        FROM ScribeScore
        WHERE subscriberID = @subscriberID
        ORDER BY generatedAt DESC;
    `;

    /* ----------------------------------------------------------
       Get user's current plan type
    ---------------------------------------------------------- */
    const GET_USER_PLAN = `
        SELECT planType, monthlyIncome, riskFlagStatus
        FROM MainMember
        WHERE mainMemberID = @subscriberID;
    `;


    /* ==========================================================
       PUBLIC API
    ========================================================== */
    return Object.freeze({
        // ── Registration ──
        INSERT_SUBSCRIBER,
        INSERT_MAIN_MEMBER,
        INSERT_WALLET_FOR_NEW_USER,
        CHECK_EMAIL_EXISTS,

        // ── Login ──
        GET_USER_BY_EMAIL,
        GET_USER_BY_ID,

        // ── Profile Editing ──
        UPDATE_SUBSCRIBER_PROFILE,
        UPDATE_SUBSCRIBER_EMAIL,
        UPDATE_SUBSCRIBER_PASSWORD,
        UPDATE_MARKETING_OPTIN,
        UPDATE_MAIN_MEMBER_DETAILS,

        // ── Account Deletion ──
        DELETE_USER_NOTIFICATIONS,
        DELETE_USER_WALLET_TRANSACTIONS,
        DELETE_USER_WALLET,
        DELETE_USER_GOAL_CONTRIBUTIONS,
        DELETE_USER_GOALS,
        DELETE_USER_PAYMENT_SCHEDULES,
        DELETE_USER_SUBSCRIPTIONS,
        DELETE_USER_SCRIBE_SCORES,
        DELETE_USER_DEPENDANT_TASKS,
        DELETE_USER_DEPENDANTS,
        DELETE_MAIN_MEMBER,
        DELETE_SUBSCRIBER,

        // ── Supplementary ──
        GET_SCRIBE_SCORES,
        GET_USER_PLAN,
    });

})();
