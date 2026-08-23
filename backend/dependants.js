/* =============================================================
   FlexScribe — Dependants Backend (client-side data layer)
   backend/dependants.js

   Responsibilities:
   • In-memory data store seeded from localStorage
   • CRUD: add, edit, remove dependants
   • Send allowance (debit wallet, record activity)
   • onChange pub/sub for UI re-renders
   • All mutations persist to localStorage automatically
   • Exposes a single global `DependantsStore` object consumed
     by the UI layer (scripts/dependants-ui.js)
============================================================= */

'use strict';

const DependantsStore = (() => {

    /* ----------------------------------------------------------
       CONSTANTS
    ---------------------------------------------------------- */
    const STORAGE_KEY = 'flexscribe_dependants';

    const RELATIONSHIPS = ['Son', 'Daughter', 'Spouse', 'Parent', 'Sibling', 'Other'];

    /* ----------------------------------------------------------
       SEED DATA (used only when localStorage is empty)
    ---------------------------------------------------------- */
    const SEED = {
        dependants: [
            {
                id: 'dep_001',
                name: 'James Mitchell',
                email: 'james@email.com',
                relationship: 'Son',
                avatar: 'JM',
                allowance: 500,
                spendingLimit: 2000,
                status: 'active',
                permissions: { canSpend: true, canViewWallet: false, canRequestFunds: true },
                activity: [
                    { id: 'da_001', type: 'allowance', description: 'Monthly allowance sent', amount: 500, date: '2025-05-01' },
                    { id: 'da_002', type: 'spend', description: 'Purchased school supplies', amount: 150, date: '2025-05-05' },
                    { id: 'da_003', type: 'request', description: 'Requested funds for trip', amount: 800, date: '2025-05-10' }
                ],
                tasks: [
                    { id: 'dt_001', task: 'Complete math homework', description: 'Chapters 5 and 6 exercises', dueDate: '2025-06-01', reward: 50, status: 'complete', recurring: false, frequency: null },
                    { id: 'dt_002', task: 'Clean room', description: '', dueDate: '2025-06-07', reward: 30, status: 'pending', recurring: true, frequency: 'weekly' },
                    { id: 'dt_003', task: 'Read a book chapter', description: 'Any fiction book', dueDate: '2025-05-20', reward: 20, status: 'pending', recurring: false, frequency: null }
                ],
                createdAt: '2024-03-01'
            },
            {
                id: 'dep_002',
                name: 'Sarah Mitchell',
                email: 'sarah.m@email.com',
                relationship: 'Daughter',
                avatar: 'SM',
                allowance: 350,
                spendingLimit: 1500,
                status: 'active',
                permissions: { canSpend: true, canViewWallet: true, canRequestFunds: true },
                activity: [
                    { id: 'da_004', type: 'allowance', description: 'Monthly allowance sent', amount: 350, date: '2025-05-01' },
                    { id: 'da_005', type: 'spend', description: 'Music subscription', amount: 60, date: '2025-05-03' }
                ],
                tasks: [
                    { id: 'dt_004', task: 'Practice piano for 30 min', description: 'Scales and one piece', dueDate: '2025-06-05', reward: 25, status: 'pending', recurring: true, frequency: 'daily' }
                ],
                createdAt: '2024-06-15'
            }
        ]
    };

    /* ----------------------------------------------------------
       PRIVATE STATE
    ---------------------------------------------------------- */
    let _data = { dependants: [] };
    let _listeners = [];

    /* ----------------------------------------------------------
       PERSISTENCE — Backend API (SQL Server)
       No localStorage. API is the source of truth.
    ---------------------------------------------------------- */
    function _load() {
        // No-op. Data comes from loadFromAPI().
    }

    async function loadFromAPI() {
        if (typeof API === 'undefined') {
            throw new Error('API not available');
        }
        const result = await API.Dependants.getAll();
        if (result.success && result.data) {
            const apiData = Array.isArray(result.data) ? result.data : (result.data.data || []);
            _data.dependants = apiData.map(function(d) {
                return {
                    id: String(d.id),
                    name: d.name || '',
                    email: d.email || '',
                    relationship: d.relationship || 'Other',
                    avatar: (d.name || '??').split(' ').map(function(w) { return w[0]; }).join('').toUpperCase(),
                    allowance: (d.allowanceCents || 0) / 100,
                    spendingLimit: 0,
                    status: d.status || 'active',
                    permissions: { canSpend: true, canViewWallet: false, canRequestFunds: true },
                    activity: [],
                    tasks: [],
                    createdAt: d.createdAt || ''
                };
            });
            _listeners.forEach(fn => fn(getAll()));
            return _data.dependants;
        } else {
            throw new Error(result.error || 'Failed to load dependants');
        }
    }

    function _save() {
        // No-op. We do not persist to localStorage.
    }

    /* ----------------------------------------------------------
       CHANGE NOTIFICATION (pub/sub for UI re-renders)
    ---------------------------------------------------------- */
    function _notify() {
        _save();
        _listeners.forEach(fn => fn(getAll()));
    }

    function onChange(fn) {
        _listeners.push(fn);
    }

    function offChange(fn) {
        _listeners = _listeners.filter(l => l !== fn);
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */
    function _uid() {
        return 'dep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function _aid() {
        return 'da_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /** Generate avatar initials from a name */
    function _initials(name) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.slice(0, 2).toUpperCase();
    }

    /** Format currency as "R500.00" */
    function fmtCurrency(val) {
        return 'R' + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /** Format date "YYYY-MM-DD" → "MMM D, YYYY" */
    function fmtDate(iso) {
        if (!iso) return '—';
        const [y, m, d] = iso.split('-').map(Number);
        const months = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[m - 1]} ${d}, ${y}`;
    }

    /* ----------------------------------------------------------
       READ
    ---------------------------------------------------------- */
    function getAll() {
        return _data.dependants.map(d => ({ ...d, activity: [...d.activity], tasks: [...(d.tasks || [])], permissions: { ...d.permissions } }));
    }

    function getById(id) {
        const dep = _data.dependants.find(d => d.id === id);
        return dep ? { ...dep, activity: [...dep.activity], tasks: [...(dep.tasks || [])], permissions: { ...dep.permissions } } : null;
    }

    /* ----------------------------------------------------------
       WRITE — Add Dependant
       SQL: DependantSQL.INSERT_SUBSCRIBER_FOR_DEPENDANT
            DependantSQL.INSERT_DEPENDANT
    ---------------------------------------------------------- */
    function add({ name, email, relationship, allowance, spendingLimit }) {
        if (!name || !name.trim()) throw new Error('Dependant name is required.');
        if (!email || !email.trim()) throw new Error('Email is required.');
        allowance = parseFloat(allowance) || 0;

        // Call backend API
        API.Dependants.add({ name: name.trim(), email: email.trim(), relationship: relationship || 'Other', allowanceCents: Math.round(allowance * 100) })
            .then(function(result) {
                if (result.success) { loadFromAPI(); }
                else { console.error('Failed to add dependant:', result.error); }
            })
            .catch(function(err) { console.error('Add dependant network error:', err); });

        return { id: 'pending', name: name.trim(), status: 'invited' };
    }
    }

    /* ----------------------------------------------------------
       WRITE — Edit Dependant
       SQL: DependantSQL.UPDATE_SUBSCRIBER_DETAILS
            DependantSQL.UPDATE_DEPENDANT_DETAILS
    ---------------------------------------------------------- */
    function edit(id, updates) {
        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');

        // Call backend API
        API.Dependants.edit(id, {
            name: updates.name,
            relationship: updates.relationship,
            allowanceCents: updates.allowance !== undefined ? Math.round(updates.allowance * 100) : undefined
        }).then(function(result) {
            if (result.success) { loadFromAPI(); }
            else { console.error('Failed to edit dependant:', result.error); }
        }).catch(function(err) { console.error('Edit dependant network error:', err); });

        return _data.dependants[idx];
    }

    /* ----------------------------------------------------------
       WRITE — Remove Dependant
    ---------------------------------------------------------- */
    function remove(id) {
        // Call backend API
        API.Dependants.remove(id).then(function(result) {
            if (result.success) { loadFromAPI(); }
            else { console.error('Failed to delete dependant:', result.error); }
        }).catch(function(err) { console.error('Delete dependant network error:', err); });
    }

    /* ----------------------------------------------------------
       WRITE — Send Allowance
    ---------------------------------------------------------- */
    /**
     * @param {string} id - dependant ID
     * @param {number} amount
     * @param {string} frequency - 'one-time' | 'recurring'
     * @returns {Object} activity record
     */
    function sendAllowance(id, amount, frequency) {
        amount = parseFloat(amount);
        if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');

        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');

        // Call backend API
        API.Dependants.sendAllowance(id, Math.round(amount * 100), frequency).then(function(result) {
            if (result.success) { loadFromAPI(); }
            else { console.error('Failed to send allowance:', result.error); }
        }).catch(function(err) { console.error('Send allowance network error:', err); });

        return { id: 'pending', type: 'allowance', amount: amount, date: new Date().toISOString().slice(0, 10) };
    }

    /* ----------------------------------------------------------
       WRITE — Update Permissions
    ---------------------------------------------------------- */
    function updatePermissions(id, permissions) {
        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');

        _data.dependants[idx].permissions = { ..._data.dependants[idx].permissions, ...permissions };
        _notify();
    }

    /* ----------------------------------------------------------
       TASKS — CRUD
    ---------------------------------------------------------- */
    function _tid() {
        return 'dt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /**
     * Add a task to a dependant.
     * SQL: DependantSQL.INSERT_TASK
     * @param {string} depId
     * @param {{ task: string, description: string, dueDate: string, reward: number, recurring: boolean, frequency: string|null }} data
     */
    function addTask(depId, { task, description, dueDate, reward, recurring, frequency }) {
        const idx = _data.dependants.findIndex(d => d.id === depId);
        if (idx === -1) throw new Error('Dependant not found.');
        if (!task || !task.trim()) throw new Error('Task description is required.');

        const entry = {
            id: _tid(),
            task: task.trim(),
            description: (description || '').trim().slice(0, 100),
            dueDate: dueDate || null,
            reward: parseFloat(reward) || 0,
            status: 'pending',
            recurring: !!recurring,
            frequency: recurring ? (frequency || 'weekly') : null
        };

        if (!_data.dependants[idx].tasks) _data.dependants[idx].tasks = [];
        _data.dependants[idx].tasks.push(entry);
        _notify();

        // Persist to database when integration is enabled
        if (typeof DependantsDB !== 'undefined' && DependantsDB.isEnabled()) {
            DependantsDB.addTask(depId, { task, description, dueDate, reward, recurring, frequency })
                .catch(err => console.warn('DB: Failed to add task', err));
        }

        return entry;
    }

    /**
     * Edit an existing task.
     * SQL: DependantSQL.UPDATE_TASK
     * @param {string} depId
     * @param {string} taskId
     * @param {Object} updates
     */
    function editTask(depId, taskId, updates) {
        const dep = _data.dependants.find(d => d.id === depId);
        if (!dep) throw new Error('Dependant not found.');
        if (!dep.tasks) dep.tasks = [];

        const task = dep.tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Task not found.');

        if (updates.task !== undefined) task.task = updates.task.trim();
        if (updates.description !== undefined) task.description = (updates.description || '').trim().slice(0, 100);
        if (updates.dueDate !== undefined) task.dueDate = updates.dueDate;
        if (updates.reward !== undefined) task.reward = parseFloat(updates.reward) || 0;
        if (updates.recurring !== undefined) {
            task.recurring = !!updates.recurring;
            task.frequency = updates.recurring ? (updates.frequency || task.frequency || 'weekly') : null;
        }
        if (updates.frequency !== undefined && task.recurring) task.frequency = updates.frequency;

        _notify();

        // Persist to database when integration is enabled
        if (typeof DependantsDB !== 'undefined' && DependantsDB.isEnabled()) {
            DependantsDB.editTask(depId, taskId, updates)
                .catch(err => console.warn('DB: Failed to edit task', err));
        }

        return { ...task };
    }

    /**
     * Mark a task as complete.
     * SQL: DependantSQL.COMPLETE_TASK
     * @param {string} depId
     * @param {string} taskId
     */
    function completeTask(depId, taskId) {
        const dep = _data.dependants.find(d => d.id === depId);
        if (!dep) throw new Error('Dependant not found.');
        if (!dep.tasks) dep.tasks = [];

        const task = dep.tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Task not found.');

        task.status = 'complete';
        _notify();

        // Persist to database when integration is enabled
        if (typeof DependantsDB !== 'undefined' && DependantsDB.isEnabled()) {
            DependantsDB.completeTask(depId, taskId)
                .catch(err => console.warn('DB: Failed to complete task', err));
        }

        return { ...task };
    }

    /**
     * Remove a task from a dependant.
     * SQL: DependantSQL.DELETE_TASK
     * @param {string} depId
     * @param {string} taskId
     */
    function removeTask(depId, taskId) {
        const dep = _data.dependants.find(d => d.id === depId);
        if (!dep) throw new Error('Dependant not found.');
        if (!dep.tasks) dep.tasks = [];

        const idx = dep.tasks.findIndex(t => t.id === taskId);
        if (idx === -1) throw new Error('Task not found.');
        dep.tasks.splice(idx, 1);
        _notify();

        // Persist to database when integration is enabled
        if (typeof DependantsDB !== 'undefined' && DependantsDB.isEnabled()) {
            DependantsDB.deleteTask(depId, taskId)
                .catch(err => console.warn('DB: Failed to delete task', err));
        }
    }

    /**
     * Get all tasks for a dependant, optionally sorted.
     * Auto-marks pending tasks as overdue if due date has passed.
     * @param {string} depId
     * @param {string} sortBy - 'dueDate' | 'reward' | 'status'
     * @param {string} order - 'asc' | 'desc'
     */
    function getTasks(depId, sortBy, order) {
        const dep = _data.dependants.find(d => d.id === depId);
        if (!dep) return [];

        const today = new Date().toISOString().slice(0, 10);
        let changed = false;

        // Auto-mark overdue
        (dep.tasks || []).forEach(t => {
            if (t.status === 'pending' && t.dueDate && t.dueDate < today) {
                t.status = 'overdue';
                changed = true;
            }
        });

        if (changed) _save();

        const tasks = [...(dep.tasks || [])];

        if (sortBy === 'dueDate') {
            tasks.sort((a, b) => {
                const da = a.dueDate || '9999-12-31';
                const db = b.dueDate || '9999-12-31';
                return order === 'desc' ? db.localeCompare(da) : da.localeCompare(db);
            });
        } else if (sortBy === 'reward') {
            tasks.sort((a, b) => order === 'desc' ? b.reward - a.reward : a.reward - b.reward);
        } else if (sortBy === 'status') {
            const STATUS_ORDER = { overdue: 0, pending: 1, complete: 2 };
            tasks.sort((a, b) => {
                const sa = STATUS_ORDER[a.status] ?? 1;
                const sb = STATUS_ORDER[b.status] ?? 1;
                return order === 'desc' ? sb - sa : sa - sb;
            });
        }

        return tasks;
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    // Do NOT auto-load. Data comes from loadFromAPI().

    // TEMPORARY: Load SEED data for local development/testing.
    // When backend is running, comment this out and use loadFromAPI() instead.
    _data = JSON.parse(JSON.stringify(SEED));

    return Object.freeze({
        // Data access
        getAll,
        getById,
        // Mutations (API-backed)
        add,
        edit,
        remove,
        sendAllowance,
        updatePermissions,
        // Tasks (local only — no DB table for tasks)
        addTask,
        editTask,
        removeTask,
        completeTask,
        getTasks,
        // API loading
        loadFromAPI,
        // Events
        onChange,
        offChange,
        // Utility
        fmtCurrency,
        fmtDate,
        RELATIONSHIPS,
    });

})();
