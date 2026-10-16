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
            const apiData = Array.isArray(result.data) ? result.data : [];
            _data.dependants = apiData.map(function(d) {
                const firstName = d.firstName || '';
                const lastName = d.lastName || '';
                const fullName = (firstName + ' ' + lastName).trim();

                // Calculate age from dateOfBirth
                let age = d.age || null;
                const dob = d.dateOfBirth ? d.dateOfBirth.split('T')[0] : null;
                if (dob) {
                    const dobDate = new Date(dob);
                    const today = new Date();
                    age = today.getFullYear() - dobDate.getFullYear();
                    const monthDiff = today.getMonth() - dobDate.getMonth();
                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) age--;
                }

                return {
                    id: String(d.dependantID || d.id),
                    name: fullName,
                    email: d.email || '',
                    relationship: d.relationship || 'Other',
                    avatar: _initials(fullName || '??'),
                    allowance: parseFloat(d.allowance) || 0,
                    spendingLimit: parseFloat(d.spendingLimit) || 0,
                    totalReceived: parseFloat(d.totalReceived) || 0,
                    status: d.status || 'active',
                    age: age,
                    dateOfBirth: dob || '',
                    permissions: {
                        canSpend: d.canSpend !== undefined ? !!d.canSpend : true,
                        canViewWallet: d.canViewWallet !== undefined ? !!d.canViewWallet : false,
                        canRequestFunds: d.canRequestFunds !== undefined ? !!d.canRequestFunds : true
                    },
                    activity: [],
                    tasks: [],
                    createdAt: d.createdAt ? d.createdAt.split('T')[0] : ''
                };
            });

            // Load tasks for each dependant
            for (var i = 0; i < _data.dependants.length; i++) {
                try {
                    var tasksResult = await API.Dependants.getTasks(_data.dependants[i].id);
                    if (tasksResult.success && Array.isArray(tasksResult.data)) {
                        _data.dependants[i].tasks = tasksResult.data.map(function(t) {
                            return {
                                id: String(t.dependantTaskID),
                                task: t.taskName || '',
                                description: t.description || '',
                                dueDate: t.dueDate ? t.dueDate.split('T')[0] : null,
                                reward: parseFloat(t.reward) || 0,
                                status: t.taskStatus || 'pending',
                                recurring: !!t.recurring,
                                frequency: t.recurrenceCycle || null
                            };
                        });
                    }
                } catch (e) { /* ignore task load errors */ }

                // Load activity (wallet transactions, e.g. allowances sent)
                try {
                    var actResult = await API.Dependants.getActivity(_data.dependants[i].id);
                    if (actResult.success && Array.isArray(actResult.data)) {
                        _data.dependants[i].activity = actResult.data.map(function(a) {
                            // Map the dependant's own wallet row → activity
                            // item. Direction reflects the dependant: credit =
                            // money in (+), debit = money out (-).
                            var isCredit = a.transactionType === 'credit';
                            var isTaskReward = a.category === 'task-reward-earned';
                            return {
                                id: 'da_' + a.transactionID,
                                direction: isCredit ? 'in' : 'out',
                                type: isTaskReward ? 'task' : (isCredit ? 'allowance' : 'spend'),
                                description: a.description || (isCredit ? 'Allowance received' : 'Payment'),
                                amount: parseFloat(a.transactionAmount) || 0,
                                date: a.transactionDate ? a.transactionDate.split('T')[0] : ''
                            };
                        });
                    }
                } catch (e) { /* ignore activity load errors */ }
            }
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
    function add({ name, email, relationship, allowance, spendingLimit, dob }) {
        if (!name || !name.trim()) throw new Error('Dependant name is required.');

        // Email — proper format check (shared rules).
        if (typeof Validators !== 'undefined') {
            const er = Validators.validateEmail(email);
            if (!er.valid) throw new Error(er.message);
            email = er.value;
        } else if (!email || !email.trim()) {
            throw new Error('Email is required.');
        }

        // Date of birth — must be a real date in the past.
        if (typeof Validators !== 'undefined') {
            const dr = Validators.validateDateOfBirth(dob);
            if (!dr.valid) throw new Error(dr.message);
            dob = dr.value;
        }

        // Allowance / spending limit — validated monetary amounts (no silent coercion).
        if (typeof Validators !== 'undefined') {
            const ar = Validators.validateAmount(allowance, { required: false });
            if (!ar.valid) throw new Error(ar.message);
            allowance = ar.value;

            const sr = Validators.validateAmount(spendingLimit, { required: false });
            if (!sr.valid) throw new Error(sr.message);
            spendingLimit = sr.value;
        } else {
            allowance = parseFloat(allowance) || 0;
        }

        // Split name into first/last for the backend
        const parts = name.trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';

        // Calculate age from DOB
        let age = null;
        if (dob) {
            const dobDate = new Date(dob);
            const today = new Date();
            age = today.getFullYear() - dobDate.getFullYear();
            const monthDiff = today.getMonth() - dobDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) age--;
        }

        // Call backend API
        API.Dependants.add({
            firstName: firstName,
            lastName: lastName,
            email: email.trim(),
            relationship: relationship || 'Other',
            allowance: allowance,
            spendingLimit: (spendingLimit != null && spendingLimit > 0) ? spendingLimit : null,
            dateOfBirth: dob || null,
            age: age
        }).then(function(result) {
                if (result.success) { loadFromAPI(); }
                else { console.error('Failed to add dependant:', result.error); }
            })
            .catch(function(err) { console.error('Add dependant network error:', err); });

        return { id: 'pending', name: name.trim(), status: 'invited' };
    }

    /* ----------------------------------------------------------
       WRITE — Edit Dependant
       SQL: DependantSQL.UPDATE_SUBSCRIBER_DETAILS
            DependantSQL.UPDATE_DEPENDANT_DETAILS
    ---------------------------------------------------------- */
    function edit(id, updates) {
        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');

        updates = updates || {};

        // Validate any provided fields before touching local state so an
        // invalid value never silently overwrites a good one. Permission-only
        // updates (canSpend etc.) skip these checks.
        if (typeof Validators !== 'undefined') {
            if (updates.email !== undefined) {
                const er = Validators.validateEmail(updates.email);
                if (!er.valid) throw new Error(er.message);
                updates.email = er.value;
            }
            if (updates.dob !== undefined && updates.dob !== '' && updates.dob != null) {
                const dr = Validators.validateDateOfBirth(updates.dob);
                if (!dr.valid) throw new Error(dr.message);
                updates.dob = dr.value;
            }
            if (updates.allowance !== undefined) {
                const ar = Validators.validateAmount(updates.allowance, { required: false });
                if (!ar.valid) throw new Error(ar.message);
                updates.allowance = ar.value;
            }
            if (updates.spendingLimit !== undefined) {
                const sr = Validators.validateAmount(updates.spendingLimit, { required: false });
                if (!sr.valid) throw new Error(sr.message);
                updates.spendingLimit = sr.value;
            }
        }

        // Update local state immediately
        const dep = _data.dependants[idx];
        if (updates.name !== undefined) {
            dep.name = updates.name;
            dep.avatar = _initials(updates.name);
        }
        if (updates.email !== undefined) dep.email = updates.email;
        if (updates.relationship !== undefined) dep.relationship = updates.relationship;
        if (updates.dob !== undefined) {
            // Store under dateOfBirth (the key the rest of the app reads) and
            // keep age in sync so the drawer/edit modal reflect the new DOB.
            dep.dateOfBirth = updates.dob;
            if (updates.dob) {
                const dobDate = new Date(updates.dob);
                const today = new Date();
                let a = today.getFullYear() - dobDate.getFullYear();
                const md = today.getMonth() - dobDate.getMonth();
                if (md < 0 || (md === 0 && today.getDate() < dobDate.getDate())) a--;
                dep.age = a;
            }
        }
        if (updates.allowance !== undefined) dep.allowance = updates.allowance;
        if (updates.spendingLimit !== undefined) dep.spendingLimit = updates.spendingLimit;

        _notify();

        // Call backend API to persist
        var parts = (updates.name || '').split(/\s+/);
        var firstName = parts[0] || undefined;
        var lastName = parts.slice(1).join(' ') || undefined;

        API.Dependants.edit(id, {
            firstName: firstName,
            lastName: lastName,
            email: updates.email,
            relationship: updates.relationship,
            allowance: updates.allowance !== undefined ? updates.allowance : undefined,
            spendingLimit: updates.spendingLimit !== undefined ? updates.spendingLimit : undefined,
            dateOfBirth: updates.dob || undefined,
            status: updates.status
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
        if (typeof Validators !== 'undefined') {
            const ar = Validators.validateAmount(amount, { required: true });
            if (!ar.valid) throw new Error(ar.message);
            amount = ar.value;
        } else {
            amount = parseFloat(amount);
        }
        if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');

        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');

        // Call backend API. Return a promise that resolves AFTER the data
        // (including the new activity entry) has been reloaded, so callers
        // can refresh the drawer once the activity actually exists.
        return API.Dependants.sendAllowance(id, amount, frequency).then(function(result) {
            if (result.success) {
                return loadFromAPI().then(function() {
                    return { success: true };
                });
            }
            console.error('Failed to send allowance:', result.error);
            return { success: false, error: result.error || 'Failed to send allowance.' };
        }).catch(function(err) {
            console.error('Send allowance network error:', err);
            return { success: false, error: 'Could not reach the server.' };
        });
    }

    /* ----------------------------------------------------------
       READ — Dependant Activity (on-demand)
       Fetches the dependant's wallet activity (e.g. allowances sent)
       straight from the API and maps it to the drawer's format.
    ---------------------------------------------------------- */
    function getActivity(id) {
        if (typeof API === 'undefined' || !API.Dependants || !API.Dependants.getActivity) {
            return Promise.resolve([]);
        }
        return API.Dependants.getActivity(id).then(function(result) {
            if (!result.success || !Array.isArray(result.data)) return [];
            var mapped = result.data.map(function(a) {
                // These are the DEPENDANT's own wallet rows, so direction maps
                // directly: credit = money in (+), debit = money out (-).
                var isCredit = a.transactionType === 'credit';
                var isTaskReward = a.category === 'task-reward-earned';
                return {
                    id: 'da_' + a.transactionID,
                    // direction drives the +/- sign in the UI
                    direction: isCredit ? 'in' : 'out',
                    // type is used only for optional styling
                    type: isTaskReward ? 'task' : (isCredit ? 'allowance' : 'spend'),
                    description: a.description || (isCredit ? 'Allowance received' : 'Payment'),
                    amount: parseFloat(a.transactionAmount) || 0,
                    date: a.transactionDate ? a.transactionDate.split('T')[0] : ''
                };
            });
            // Keep local copy in sync so other renders have it too.
            var dep = _data.dependants.find(function(d) { return d.id === id; });
            if (dep) dep.activity = mapped;
            return mapped;
        }).catch(function() { return []; });
    }

    /* ----------------------------------------------------------
       WRITE — Update Permissions
    ---------------------------------------------------------- */
    function updatePermissions(id, permissions) {
        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');

        _data.dependants[idx].permissions = { ..._data.dependants[idx].permissions, ...permissions };
        _notify();

        // Persist to database
        if (typeof API !== 'undefined') {
            API.Dependants.edit(id, {
                canSpend: _data.dependants[idx].permissions.canSpend ? 1 : 0,
                canViewWallet: _data.dependants[idx].permissions.canViewWallet ? 1 : 0,
                canRequestFunds: _data.dependants[idx].permissions.canRequestFunds ? 1 : 0
            }).catch(function(err) { console.error('Permission update error:', err); });
        }
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

        // Optimistic local update
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

        // Call backend API to persist to DependantTask table. The server
        // enforces the wallet funding rule and may reject with HTTP 402; if so
        // we roll back the optimistic entry and surface the server's message.
        if (typeof API !== 'undefined') {
            API.Dependants.addTask(depId, {
                taskName: task.trim(),
                description: (description || '').trim().slice(0, 100),
                dueDate: dueDate || null,
                reward: parseFloat(reward) || 0,
                recurring: !!recurring,
                recurrenceCycle: recurring ? (frequency || 'weekly') : null
            }).then(function(result) {
                if (result.success) { loadFromAPI(); }
                else {
                    console.error('Failed to add task:', result.error);
                    // Remove the optimistic entry so the UI reflects reality.
                    var d = _data.dependants.find(function(x) { return x.id === depId; });
                    if (d && d.tasks) {
                        var i = d.tasks.findIndex(function(t) { return t.id === entry.id; });
                        if (i !== -1) { d.tasks.splice(i, 1); _notify(); }
                    }
                    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                        window.showToast(result.error || 'Could not add task.', 'error');
                    }
                }
            }).catch(function(err) { console.error('Add task network error:', err); });
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

        // Persist to database
        if (typeof API !== 'undefined') {
            API.Dependants.editTask(depId, taskId, {
                taskName: updates.task,
                description: updates.description,
                dueDate: updates.dueDate,
                reward: updates.reward,
                recurring: updates.recurring,
                recurrenceCycle: updates.frequency,
                taskStatus: updates.status
            }).catch(function(err) { console.error('Edit task error:', err); });
        }

        return { ...task };
    }

    /**
     * Mark a task as complete.
     */
    function completeTask(depId, taskId) {
        const dep = _data.dependants.find(d => d.id === depId);
        if (!dep) throw new Error('Dependant not found.');
        if (!dep.tasks) dep.tasks = [];

        const task = dep.tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Task not found.');

        task.status = 'completed';
        _notify();

        // Persist to database. The server marks this occurrence completed AND
        // (for recurring tasks) generates the next occurrence atomically, so a
        // full reload is required to surface the new occurrence. The returned
        // promise resolves only AFTER that reload so the UI can re-render the
        // task list with both the completed row and the new pending one.
        if (typeof API !== 'undefined') {
            return API.Dependants.editTask(depId, taskId, { taskStatus: 'completed' })
                .then(function(result) {
                    if (result.success) {
                        return loadFromAPI().then(function() { return { success: true, data: result.data }; });
                    }
                    console.error('Complete task failed:', result.error);
                    return { success: false, error: result.error };
                })
                .catch(function(err) {
                    console.error('Complete task error:', err);
                    return { success: false, error: (err && err.message) || 'Network error' };
                });
        }

        return Promise.resolve({ success: true });
    }

    /**
     * Mark a task as pending (undo completion).
     */
    function uncompleteTask(depId, taskId) {
        const dep = _data.dependants.find(d => d.id === depId);
        if (!dep) throw new Error('Dependant not found.');
        if (!dep.tasks) dep.tasks = [];

        const task = dep.tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Task not found.');

        task.status = 'pending';
        _notify();

        // Persist to database. Resolve after reload so the UI reflects the
        // server state (re-opening a completed occurrence also re-arms its
        // next-occurrence guard server-side).
        if (typeof API !== 'undefined') {
            return API.Dependants.editTask(depId, taskId, { taskStatus: 'pending' })
                .then(function(result) {
                    if (result.success) {
                        return loadFromAPI().then(function() { return { success: true }; });
                    }
                    console.error('Uncomplete task failed:', result.error);
                    return { success: false, error: result.error };
                })
                .catch(function(err) {
                    console.error('Uncomplete task error:', err);
                    return { success: false, error: (err && err.message) || 'Network error' };
                });
        }

        return Promise.resolve({ success: true });
    }

    /**
     * Remove a task from a dependant.
     */
    function removeTask(depId, taskId) {
        const dep = _data.dependants.find(d => d.id === depId);
        if (!dep) throw new Error('Dependant not found.');
        if (!dep.tasks) dep.tasks = [];

        const idx = dep.tasks.findIndex(t => t.id === taskId);
        if (idx === -1) throw new Error('Task not found.');
        dep.tasks.splice(idx, 1);
        _notify();

        // Persist to database
        if (typeof API !== 'undefined') {
            API.Dependants.deleteTask(depId, taskId)
                .catch(function(err) { console.error('Delete task error:', err); });
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

    // No seed data — real data loaded from FlexScribeDB via loadFromAPI()
    _data = { dependants: [] };

    return Object.freeze({
        // Data access
        getAll,
        getById,
        getActivity,
        // Mutations (API-backed)
        add,
        edit,
        remove,
        sendAllowance,
        updatePermissions,
        // Tasks (API-backed via DependantTask table; recurring tasks keep
        // one active occurrence at a time, next generated on completion)
        addTask,
        editTask,
        removeTask,
        completeTask,
        uncompleteTask,
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
