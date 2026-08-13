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
                createdAt: '2024-06-15'
            }
        ]
    };

    /* ----------------------------------------------------------
       PRIVATE STATE
    ---------------------------------------------------------- */
    let _data = null;
    let _listeners = [];

    /* ----------------------------------------------------------
       PERSISTENCE
    ---------------------------------------------------------- */
    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            _data = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED));
        } catch {
            _data = JSON.parse(JSON.stringify(SEED));
        }
    }

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
        } catch (e) {
            console.warn('FlexScribe: could not persist dependants data', e);
        }
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
        return _data.dependants.map(d => ({ ...d, activity: [...d.activity], permissions: { ...d.permissions } }));
    }

    function getById(id) {
        const dep = _data.dependants.find(d => d.id === id);
        return dep ? { ...dep, activity: [...dep.activity], permissions: { ...dep.permissions } } : null;
    }

    /* ----------------------------------------------------------
       WRITE — Add Dependant
    ---------------------------------------------------------- */
    function add({ name, email, relationship, allowance, spendingLimit }) {
        if (!name || !name.trim()) throw new Error('Dependant name is required.');
        if (!email || !email.trim()) throw new Error('Email is required.');
        allowance = parseFloat(allowance) || 0;
        spendingLimit = parseFloat(spendingLimit) || 0;

        const dep = {
            id: _uid(),
            name: name.trim(),
            email: email.trim(),
            relationship: relationship || 'Other',
            avatar: _initials(name),
            allowance,
            spendingLimit,
            status: 'invited',
            permissions: { canSpend: true, canViewWallet: false, canRequestFunds: true },
            activity: [],
            createdAt: new Date().toISOString().slice(0, 10)
        };

        _data.dependants.push(dep);
        _notify();
        return dep;
    }

    /* ----------------------------------------------------------
       WRITE — Edit Dependant
    ---------------------------------------------------------- */
    function edit(id, updates) {
        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');

        const dep = _data.dependants[idx];
        if (updates.name !== undefined) {
            dep.name = updates.name.trim();
            dep.avatar = _initials(dep.name);
        }
        if (updates.email !== undefined) dep.email = updates.email.trim();
        if (updates.relationship !== undefined) dep.relationship = updates.relationship;
        if (updates.allowance !== undefined) dep.allowance = parseFloat(updates.allowance) || 0;
        if (updates.spendingLimit !== undefined) dep.spendingLimit = parseFloat(updates.spendingLimit) || 0;
        if (updates.status !== undefined) dep.status = updates.status;
        if (updates.permissions !== undefined) dep.permissions = { ...dep.permissions, ...updates.permissions };

        _notify();
        return { ...dep, activity: [...dep.activity], permissions: { ...dep.permissions } };
    }

    /* ----------------------------------------------------------
       WRITE — Remove Dependant
    ---------------------------------------------------------- */
    function remove(id) {
        const idx = _data.dependants.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('Dependant not found.');
        _data.dependants.splice(idx, 1);
        _notify();
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

        // Debit wallet if available
        if (typeof WalletStore !== 'undefined') {
            const snap = WalletStore.getSnapshot();
            if (snap.balance < amount) throw new Error('Insufficient wallet balance.');
            WalletStore.sendToDependant(amount, _data.dependants[idx].name);
        }

        const dep = _data.dependants[idx];
        const activityEntry = {
            id: _aid(),
            type: 'allowance',
            description: frequency === 'recurring' ? 'Recurring allowance sent' : 'One-time allowance sent',
            amount,
            date: new Date().toISOString().slice(0, 10)
        };

        dep.activity.push(activityEntry);

        // Update status to active if was invited
        if (dep.status === 'invited') dep.status = 'active';

        _notify();
        return activityEntry;
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
       PUBLIC API
    ---------------------------------------------------------- */
    _load();

    return Object.freeze({
        // Data access
        getAll,
        getById,
        // Mutations
        add,
        edit,
        remove,
        sendAllowance,
        updatePermissions,
        // Events
        onChange,
        offChange,
        // Utility
        fmtCurrency,
        fmtDate,
        RELATIONSHIPS,
    });

})();
