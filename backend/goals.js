/* =============================================================
   FlexScribe — Goals Backend (client-side data layer)
   backend/goals.js

   Responsibilities:
   • In-memory data store seeded from localStorage
   • CRUD: add, edit, remove goals
   • Contribute funds to a goal
   • onChange pub/sub for UI re-renders
   • All mutations persist to localStorage automatically
   • Exposes a single global `GoalsStore` object consumed
     by the UI layer (scripts/goals-ui.js)
============================================================= */

'use strict';

const GoalsStore = (() => {

    /* ----------------------------------------------------------
       CONSTANTS
    ---------------------------------------------------------- */
    const STORAGE_KEY = 'flexscribe_goals';

    const CATEGORIES = ['Travel', 'Tech', 'Education', 'Emergency', 'Home', 'Vehicle', 'Other'];

    /* ----------------------------------------------------------
       SEED DATA (used only when localStorage is empty)
    ---------------------------------------------------------- */
    const SEED = {
        goals: [
            {
                id: 'goal_001',
                name: 'Vacation Fund',
                targetAmount: 25000,
                savedAmount: 15800,
                targetDate: '2025-12-01',
                category: 'Travel',
                imageUrl: '',
                status: 'in_progress',
                createdAt: '2024-06-01',
                contributions: [
                    { id: 'gc_001', amount: 5000, date: '2024-06-15', note: 'Initial deposit' },
                    { id: 'gc_002', amount: 3000, date: '2024-08-01', note: 'Monthly savings' },
                    { id: 'gc_003', amount: 5000, date: '2024-10-01', note: 'Bonus contribution' },
                    { id: 'gc_004', amount: 2800, date: '2025-01-15', note: 'Monthly savings' }
                ]
            },
            {
                id: 'goal_002',
                name: 'New Laptop',
                targetAmount: 18000,
                savedAmount: 12500,
                targetDate: '2025-08-15',
                category: 'Tech',
                imageUrl: '',
                status: 'in_progress',
                createdAt: '2024-09-01',
                contributions: [
                    { id: 'gc_005', amount: 5000, date: '2024-09-15', note: 'Starting fund' },
                    { id: 'gc_006', amount: 4000, date: '2024-11-01', note: 'Freelance income' },
                    { id: 'gc_007', amount: 3500, date: '2025-02-01', note: 'Monthly savings' }
                ]
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
            console.warn('FlexScribe: could not persist goals data', e);
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
        return 'goal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function _cid() {
        return 'gc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /** Format currency as "R12,450.00" */
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
        return _data.goals.map(g => ({ ...g, contributions: [...g.contributions] }));
    }

    function getById(id) {
        const g = _data.goals.find(goal => goal.id === id);
        return g ? { ...g, contributions: [...g.contributions] } : null;
    }

    function getStats() {
        const goals = _data.goals;
        const totalSaved = goals.reduce((sum, g) => sum + g.savedAmount, 0);
        const active = goals.filter(g => g.status === 'in_progress').length;
        const completed = goals.filter(g => g.status === 'completed').length;
        return { totalSaved, active, completed };
    }

    /* ----------------------------------------------------------
       WRITE — Add Goal
    ---------------------------------------------------------- */
    function add({ name, targetAmount, targetDate, category, imageUrl }) {
        targetAmount = parseFloat(targetAmount);
        if (!name || !name.trim()) throw new Error('Goal name is required.');
        if (!targetAmount || targetAmount <= 0) throw new Error('Target amount must be greater than zero.');

        const goal = {
            id: _uid(),
            name: name.trim(),
            targetAmount,
            savedAmount: 0,
            targetDate: targetDate || '',
            category: category || 'Other',
            imageUrl: imageUrl || '',
            status: 'in_progress',
            createdAt: new Date().toISOString().slice(0, 10),
            contributions: []
        };

        _data.goals.push(goal);
        _notify();
        return goal;
    }

    /* ----------------------------------------------------------
       WRITE — Edit Goal
    ---------------------------------------------------------- */
    function edit(id, updates) {
        const idx = _data.goals.findIndex(g => g.id === id);
        if (idx === -1) throw new Error('Goal not found.');

        const goal = _data.goals[idx];
        if (updates.name !== undefined) goal.name = updates.name.trim();
        if (updates.targetAmount !== undefined) goal.targetAmount = parseFloat(updates.targetAmount);
        if (updates.targetDate !== undefined) goal.targetDate = updates.targetDate;
        if (updates.category !== undefined) goal.category = updates.category;
        if (updates.imageUrl !== undefined) goal.imageUrl = updates.imageUrl;

        // Auto-mark completed if saved >= target
        if (goal.savedAmount >= goal.targetAmount) {
            goal.status = 'completed';
        } else {
            goal.status = 'in_progress';
        }

        _notify();
        return { ...goal, contributions: [...goal.contributions] };
    }

    /* ----------------------------------------------------------
       WRITE — Remove Goal
    ---------------------------------------------------------- */
    function remove(id) {
        const idx = _data.goals.findIndex(g => g.id === id);
        if (idx === -1) throw new Error('Goal not found.');
        _data.goals.splice(idx, 1);
        _notify();
    }

    /* ----------------------------------------------------------
       WRITE — Contribute to Goal
    ---------------------------------------------------------- */
    function contribute(id, amount, note) {
        amount = parseFloat(amount);
        if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');

        const idx = _data.goals.findIndex(g => g.id === id);
        if (idx === -1) throw new Error('Goal not found.');

        const goal = _data.goals[idx];
        goal.savedAmount += amount;

        const contribution = {
            id: _cid(),
            amount,
            date: new Date().toISOString().slice(0, 10),
            note: note || ''
        };
        goal.contributions.push(contribution);

        // Auto-mark completed if saved >= target
        if (goal.savedAmount >= goal.targetAmount) {
            goal.status = 'completed';
        }

        _notify();
        return contribution;
    }

    /* ----------------------------------------------------------
       UTILITY — Forecast completion date
    ---------------------------------------------------------- */
    function getForecast(id) {
        const goal = _data.goals.find(g => g.id === id);
        if (!goal || goal.contributions.length < 2) return null;
        if (goal.status === 'completed') return null;

        // Calculate average monthly contribution
        const sorted = [...goal.contributions].sort((a, b) => a.date.localeCompare(b.date));
        const firstDate = new Date(sorted[0].date);
        const lastDate = new Date(sorted[sorted.length - 1].date);
        const monthsElapsed = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 30.44));
        const avgMonthly = goal.savedAmount / monthsElapsed;

        if (avgMonthly <= 0) return null;

        const remaining = goal.targetAmount - goal.savedAmount;
        const monthsToGo = remaining / avgMonthly;
        const forecastDate = new Date();
        forecastDate.setMonth(forecastDate.getMonth() + Math.ceil(monthsToGo));

        return {
            avgMonthly,
            monthsToGo: Math.ceil(monthsToGo),
            forecastDate: forecastDate.toISOString().slice(0, 10)
        };
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    _load();

    return Object.freeze({
        // Data access
        getAll,
        getById,
        getStats,
        getForecast,
        // Mutations
        add,
        edit,
        remove,
        contribute,
        // Events
        onChange,
        offChange,
        // Utility
        fmtCurrency,
        fmtDate,
        CATEGORIES,
    });

})();
