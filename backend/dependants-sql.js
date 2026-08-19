/* =============================================================
   FlexScribe — Dependants SQL Statements
   backend/dependants-sql.js

   SQL statements for all Dependant and DependantTask CRUD
   operations. These map directly to the FlexScribeDB schema
   (Subscriber, Dependant, DependantTask tables).

   NOTE: Database integration is not yet active. These are
   prepared statements using named parameters (e.g. @paramName)
   following SQL Server / SSMS conventions.
============================================================= */

'use strict';

const DependantSQL = (() => {

    /* ==========================================================
       ── DEPENDANT QUERIES ──
       The Dependant table is a specialisation of Subscriber.
       Adding a dependant requires INSERTing into both tables.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Get all dependants for a main member
    ---------------------------------------------------------- */
    const GET_ALL_DEPENDANTS = `
        SELECT
            s.subscriberID,
            s.firstName,
            s.lastName,
            s.preferredName,
            s.email,
            s.phone,
            s.avatarUrl,
            s.createdAt,
            d.age,
            d.relationship,
            d.allowance,
            d.spendingLimit,
            d.status
        FROM Dependant d
        INNER JOIN Subscriber s ON s.subscriberID = d.dependantID
        WHERE d.mainMemberID = @mainMemberID
        ORDER BY s.firstName, s.lastName;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Get a single dependant by ID
    ---------------------------------------------------------- */
    const GET_DEPENDANT_BY_ID = `
        SELECT
            s.subscriberID,
            s.firstName,
            s.lastName,
            s.preferredName,
            s.email,
            s.phone,
            s.avatarUrl,
            s.createdAt,
            d.age,
            d.relationship,
            d.allowance,
            d.spendingLimit,
            d.status
        FROM Dependant d
        INNER JOIN Subscriber s ON s.subscriberID = d.dependantID
        WHERE d.dependantID = @dependantID
          AND d.mainMemberID = @mainMemberID;
    `;

    /* ----------------------------------------------------------
       ADD — Insert new dependant (two-step: Subscriber + Dependant)
       Step 1: Insert into Subscriber table
    ---------------------------------------------------------- */
    const INSERT_SUBSCRIBER_FOR_DEPENDANT = `
        INSERT INTO Subscriber (firstName, lastName, preferredName, email, passwordHash, phone, userType, scribePoints, avatarUrl, marketingOptIn, createdAt, updatedAt)
        VALUES (@firstName, @lastName, @preferredName, @email, @passwordHash, @phone, 'Dependant', 0, @avatarUrl, 0, GETDATE(), GETDATE());

        SELECT SCOPE_IDENTITY() AS newSubscriberID;
    `;

    /* ----------------------------------------------------------
       ADD — Step 2: Insert into Dependant table
    ---------------------------------------------------------- */
    const INSERT_DEPENDANT = `
        INSERT INTO Dependant (dependantID, mainMemberID, age, relationship, allowance, spendingLimit, status)
        VALUES (@dependantID, @mainMemberID, @age, @relationship, @allowance, @spendingLimit, 'invited');
    `;

    /* ----------------------------------------------------------
       EDIT — Update dependant details (Subscriber fields)
    ---------------------------------------------------------- */
    const UPDATE_SUBSCRIBER_DETAILS = `
        UPDATE Subscriber
        SET firstName     = @firstName,
            lastName      = @lastName,
            preferredName = @preferredName,
            email         = @email,
            phone         = @phone,
            avatarUrl     = @avatarUrl,
            updatedAt     = GETDATE()
        WHERE subscriberID = @dependantID;
    `;

    /* ----------------------------------------------------------
       EDIT — Update dependant-specific fields
    ---------------------------------------------------------- */
    const UPDATE_DEPENDANT_DETAILS = `
        UPDATE Dependant
        SET age           = @age,
            relationship  = @relationship,
            allowance     = @allowance,
            spendingLimit = @spendingLimit,
            status        = @status
        WHERE dependantID = @dependantID
          AND mainMemberID = @mainMemberID;
    `;

    /* ----------------------------------------------------------
       DELETE — Remove dependant
       Deletes from Dependant first (child), then Subscriber.
       Associated tasks are removed via cascade or explicit delete.
    ---------------------------------------------------------- */
    const DELETE_DEPENDANT_TASKS = `
        DELETE FROM DependantTask
        WHERE dependantID = @dependantID
          AND mainMemberID = @mainMemberID;
    `;

    const DELETE_DEPENDANT = `
        DELETE FROM Dependant
        WHERE dependantID = @dependantID
          AND mainMemberID = @mainMemberID;
    `;

    const DELETE_DEPENDANT_SUBSCRIBER = `
        DELETE FROM Subscriber
        WHERE subscriberID = @dependantID
          AND userType = 'Dependant';
    `;


    /* ==========================================================
       ── DEPENDANT TASK QUERIES ──
       DependantTask table stores tasks assigned to dependants.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Get all tasks for a specific dependant
    ---------------------------------------------------------- */
    const GET_ALL_TASKS_FOR_DEPENDANT = `
        SELECT
            dependantTaskID,
            dependantID,
            mainMemberID,
            taskName,
            description,
            dueDate,
            reward,
            taskStatus,
            recurring,
            recurrenceCycle,
            completedAt,
            createdAt,
            updatedAt
        FROM DependantTask
        WHERE dependantID = @dependantID
          AND mainMemberID = @mainMemberID
        ORDER BY dueDate ASC;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Get a single task by ID
    ---------------------------------------------------------- */
    const GET_TASK_BY_ID = `
        SELECT
            dependantTaskID,
            dependantID,
            mainMemberID,
            taskName,
            description,
            dueDate,
            reward,
            taskStatus,
            recurring,
            recurrenceCycle,
            completedAt,
            createdAt,
            updatedAt
        FROM DependantTask
        WHERE dependantTaskID = @dependantTaskID
          AND dependantID = @dependantID;
    `;

    /* ----------------------------------------------------------
       ADD — Insert a new task for a dependant
    ---------------------------------------------------------- */
    const INSERT_TASK = `
        INSERT INTO DependantTask (dependantID, mainMemberID, taskName, description, dueDate, reward, taskStatus, recurring, recurrenceCycle, completedAt, createdAt, updatedAt)
        VALUES (@dependantID, @mainMemberID, @taskName, @description, @dueDate, @reward, 'pending', @recurring, @recurrenceCycle, NULL, GETDATE(), GETDATE());

        SELECT SCOPE_IDENTITY() AS newTaskID;
    `;

    /* ----------------------------------------------------------
       EDIT — Update an existing task
    ---------------------------------------------------------- */
    const UPDATE_TASK = `
        UPDATE DependantTask
        SET taskName        = @taskName,
            description     = @description,
            dueDate         = @dueDate,
            reward          = @reward,
            recurring       = @recurring,
            recurrenceCycle = @recurrenceCycle,
            updatedAt       = GETDATE()
        WHERE dependantTaskID = @dependantTaskID
          AND dependantID = @dependantID;
    `;

    /* ----------------------------------------------------------
       UPDATE — Mark task as complete
    ---------------------------------------------------------- */
    const COMPLETE_TASK = `
        UPDATE DependantTask
        SET taskStatus  = 'completed',
            completedAt = GETDATE(),
            updatedAt   = GETDATE()
        WHERE dependantTaskID = @dependantTaskID
          AND dependantID = @dependantID;
    `;

    /* ----------------------------------------------------------
       UPDATE — Mark overdue tasks (batch update)
       Runs periodically or on page load to flag overdue tasks.
    ---------------------------------------------------------- */
    const MARK_OVERDUE_TASKS = `
        UPDATE DependantTask
        SET taskStatus = 'overdue',
            updatedAt  = GETDATE()
        WHERE dependantID = @dependantID
          AND taskStatus = 'pending'
          AND dueDate < CAST(GETDATE() AS DATE);
    `;

    /* ----------------------------------------------------------
       DELETE — Remove a specific task
    ---------------------------------------------------------- */
    const DELETE_TASK = `
        DELETE FROM DependantTask
        WHERE dependantTaskID = @dependantTaskID
          AND dependantID = @dependantID;
    `;


    /* ==========================================================
       ── SUPPLEMENTARY QUERIES ──
       Useful for allowance transfers, activity logging, etc.
    ========================================================== */

    /* ----------------------------------------------------------
       UPDATE — Update dependant status (active/invited/suspended)
    ---------------------------------------------------------- */
    const UPDATE_DEPENDANT_STATUS = `
        UPDATE Dependant
        SET status = @status
        WHERE dependantID = @dependantID
          AND mainMemberID = @mainMemberID;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Count dependants for a main member
    ---------------------------------------------------------- */
    const COUNT_DEPENDANTS = `
        SELECT COUNT(*) AS dependantCount
        FROM Dependant
        WHERE mainMemberID = @mainMemberID;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Get task summary/statistics for a dependant
    ---------------------------------------------------------- */
    const GET_TASK_STATS = `
        SELECT
            COUNT(*) AS totalTasks,
            SUM(CASE WHEN taskStatus = 'completed' THEN 1 ELSE 0 END) AS completedTasks,
            SUM(CASE WHEN taskStatus = 'pending' THEN 1 ELSE 0 END) AS pendingTasks,
            SUM(CASE WHEN taskStatus = 'overdue' THEN 1 ELSE 0 END) AS overdueTasks,
            SUM(CASE WHEN taskStatus = 'completed' THEN reward ELSE 0 END) AS totalRewardsEarned,
            SUM(CASE WHEN taskStatus = 'pending' OR taskStatus = 'in_progress' THEN reward ELSE 0 END) AS totalRewardsPending
        FROM DependantTask
        WHERE dependantID = @dependantID
          AND mainMemberID = @mainMemberID;
    `;


    /* ==========================================================
       PUBLIC API
    ========================================================== */
    return Object.freeze({
        // ── Dependant CRUD ──
        GET_ALL_DEPENDANTS,
        GET_DEPENDANT_BY_ID,
        INSERT_SUBSCRIBER_FOR_DEPENDANT,
        INSERT_DEPENDANT,
        UPDATE_SUBSCRIBER_DETAILS,
        UPDATE_DEPENDANT_DETAILS,
        DELETE_DEPENDANT_TASKS,
        DELETE_DEPENDANT,
        DELETE_DEPENDANT_SUBSCRIBER,

        // ── Task CRUD ──
        GET_ALL_TASKS_FOR_DEPENDANT,
        GET_TASK_BY_ID,
        INSERT_TASK,
        UPDATE_TASK,
        COMPLETE_TASK,
        MARK_OVERDUE_TASKS,
        DELETE_TASK,

        // ── Supplementary ──
        UPDATE_DEPENDANT_STATUS,
        COUNT_DEPENDANTS,
        GET_TASK_STATS,
    });

})();
