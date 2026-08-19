/* =============================================================
   FlexScribe — Dependants Database Service
   backend/dependants-db.js

   Integration layer that connects DependantSQL statements to
   the DependantsStore. When DB_ENABLED is true, these methods
   will execute real queries against the FlexScribeDB via API.
   When false, they fall back to localStorage (current behaviour).

   This file references: backend/dependants-sql.js (DependantSQL)
   This file is consumed by: backend/dependants.js (DependantsStore)
============================================================= */

'use strict';

const DependantsDB = (() => {

    /* ----------------------------------------------------------
       CONFIGURATION
       Set DB_ENABLED to true once a backend API is available.
    ---------------------------------------------------------- */
    const DB_ENABLED = false;
    const API_BASE   = '/api/dependants'; // adjust to your backend route

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    /**
     * Get the current logged-in main member ID from session.
     * Used as @mainMemberID parameter in all queries.
     */
    function _getMainMemberID() {
        const token = sessionStorage.getItem('flexscribe_token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.subscriberID || payload.mainMemberID || null;
            } catch { /* fallback */ }
        }
        return null;
    }

    /**
     * Generic fetch wrapper for API calls.
     * @param {string} endpoint
     * @param {Object} options - fetch options
     * @returns {Promise<Object>}
     */
    async function _request(endpoint, options = {}) {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('flexscribe_token') || ''}`
            },
            ...options
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(err.message || `HTTP ${res.status}`);
        }

        return res.json();
    }

    /* ==========================================================
       ── DEPENDANT OPERATIONS ──
       Each method maps to one or more SQL statements from
       DependantSQL. The SQL comment shows which statement is used.
    ========================================================== */

    /**
     * Fetch all dependants for the logged-in main member.
     * SQL: DependantSQL.GET_ALL_DEPENDANTS
     * Params: @mainMemberID
     */
    async function getAllDependants() {
        if (!DB_ENABLED) return null; // fallback to localStorage

        const mainMemberID = _getMainMemberID();
        return _request(`?mainMemberID=${mainMemberID}`);
    }

    /**
     * Fetch a single dependant by ID.
     * SQL: DependantSQL.GET_DEPENDANT_BY_ID
     * Params: @dependantID, @mainMemberID
     */
    async function getDependantById(dependantID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}`);
    }

    /**
     * Add a new dependant (inserts into Subscriber + Dependant).
     * SQL: DependantSQL.INSERT_SUBSCRIBER_FOR_DEPENDANT
     *      DependantSQL.INSERT_DEPENDANT
     * Params: @firstName, @lastName, @email, @passwordHash,
     *         @mainMemberID, @age, @relationship, @allowance, @spendingLimit
     */
    async function addDependant({ name, email, relationship, allowance, spendingLimit }) {
        if (!DB_ENABLED) return null;

        const [firstName, ...lastParts] = name.trim().split(/\s+/);
        const lastName = lastParts.join(' ') || '';

        return _request('', {
            method: 'POST',
            body: JSON.stringify({
                firstName,
                lastName,
                email,
                relationship,
                allowance,
                spendingLimit,
                mainMemberID: _getMainMemberID()
            })
        });
    }

    /**
     * Update an existing dependant's details.
     * SQL: DependantSQL.UPDATE_SUBSCRIBER_DETAILS
     *      DependantSQL.UPDATE_DEPENDANT_DETAILS
     * Params: @dependantID, @firstName, @lastName, @email,
     *         @relationship, @allowance, @spendingLimit, @status
     */
    async function editDependant(dependantID, updates) {
        if (!DB_ENABLED) return null;

        const body = { ...updates };
        if (updates.name) {
            const [firstName, ...lastParts] = updates.name.trim().split(/\s+/);
            body.firstName = firstName;
            body.lastName = lastParts.join(' ') || '';
            delete body.name;
        }

        return _request(`/${dependantID}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    /**
     * Delete a dependant and all their tasks.
     * SQL: DependantSQL.DELETE_DEPENDANT_TASKS  (step 1)
     *      DependantSQL.DELETE_DEPENDANT        (step 2)
     *      DependantSQL.DELETE_DEPENDANT_SUBSCRIBER (step 3)
     * Params: @dependantID, @mainMemberID
     */
    async function deleteDependant(dependantID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}`, {
            method: 'DELETE'
        });
    }

    /**
     * Update dependant status (active/invited/suspended).
     * SQL: DependantSQL.UPDATE_DEPENDANT_STATUS
     * Params: @dependantID, @mainMemberID, @status
     */
    async function updateDependantStatus(dependantID, status) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
    }

    /* ==========================================================
       ── TASK OPERATIONS ──
    ========================================================== */

    /**
     * Fetch all tasks for a specific dependant.
     * SQL: DependantSQL.GET_ALL_TASKS_FOR_DEPENDANT
     * Params: @dependantID, @mainMemberID
     */
    async function getAllTasks(dependantID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/tasks`);
    }

    /**
     * Get a single task by ID.
     * SQL: DependantSQL.GET_TASK_BY_ID
     * Params: @dependantTaskID, @dependantID
     */
    async function getTaskById(dependantID, taskID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/tasks/${taskID}`);
    }

    /**
     * Add a new task to a dependant.
     * SQL: DependantSQL.INSERT_TASK
     * Params: @dependantID, @mainMemberID, @taskName, @description,
     *         @dueDate, @reward, @recurring, @recurrenceCycle
     */
    async function addTask(dependantID, { task, description, dueDate, reward, recurring, frequency }) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/tasks`, {
            method: 'POST',
            body: JSON.stringify({
                taskName: task,
                description,
                dueDate,
                reward,
                recurring,
                recurrenceCycle: frequency,
                mainMemberID: _getMainMemberID()
            })
        });
    }

    /**
     * Update an existing task.
     * SQL: DependantSQL.UPDATE_TASK
     * Params: @dependantTaskID, @dependantID, @taskName,
     *         @description, @dueDate, @reward, @recurring, @recurrenceCycle
     */
    async function editTask(dependantID, taskID, updates) {
        if (!DB_ENABLED) return null;

        const body = {};
        if (updates.task !== undefined) body.taskName = updates.task;
        if (updates.description !== undefined) body.description = updates.description;
        if (updates.dueDate !== undefined) body.dueDate = updates.dueDate;
        if (updates.reward !== undefined) body.reward = updates.reward;
        if (updates.recurring !== undefined) body.recurring = updates.recurring;
        if (updates.frequency !== undefined) body.recurrenceCycle = updates.frequency;

        return _request(`/${dependantID}/tasks/${taskID}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    /**
     * Mark a task as completed.
     * SQL: DependantSQL.COMPLETE_TASK
     * Params: @dependantTaskID, @dependantID
     */
    async function completeTask(dependantID, taskID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/tasks/${taskID}/complete`, {
            method: 'PATCH'
        });
    }

    /**
     * Delete a task.
     * SQL: DependantSQL.DELETE_TASK
     * Params: @dependantTaskID, @dependantID
     */
    async function deleteTask(dependantID, taskID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/tasks/${taskID}`, {
            method: 'DELETE'
        });
    }

    /**
     * Mark overdue tasks (batch).
     * SQL: DependantSQL.MARK_OVERDUE_TASKS
     * Params: @dependantID
     */
    async function markOverdueTasks(dependantID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/tasks/mark-overdue`, {
            method: 'PATCH'
        });
    }

    /**
     * Get task statistics for a dependant.
     * SQL: DependantSQL.GET_TASK_STATS
     * Params: @dependantID, @mainMemberID
     */
    async function getTaskStats(dependantID) {
        if (!DB_ENABLED) return null;

        return _request(`/${dependantID}/tasks/stats`);
    }

    /* ==========================================================
       ── UTILITY ──
    ========================================================== */

    /**
     * Check if database integration is active.
     */
    function isEnabled() {
        return DB_ENABLED;
    }

    /* ==========================================================
       PUBLIC API
    ========================================================== */
    return Object.freeze({
        isEnabled,

        // Dependant operations
        getAllDependants,
        getDependantById,
        addDependant,
        editDependant,
        deleteDependant,
        updateDependantStatus,

        // Task operations
        getAllTasks,
        getTaskById,
        addTask,
        editTask,
        completeTask,
        deleteTask,
        markOverdueTasks,
        getTaskStats,
    });

})();
