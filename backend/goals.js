/* =============================================================
   FlexScribe — Goals Backend (client-side data layer)
   backend/goals.js

   Responsibilities:
   • In-memory data store loaded from SQL Server API
   • CRUD: add, edit, remove goals
   • Contribute funds to a goal
   • onChange pub/sub for UI re-renders
   • All mutations call the API then reload
   • Exposes a single global `GoalsStore` object consumed
     by the UI layer (scripts/goals-ui.js)
============================================================= */

'use strict';

const GoalsStore = (() => {

    /* ----------------------------------------------------------
       CONSTANTS
    ---------------------------------------------------------- */
    const CATEGORIES = ['Travel', 'Tech', 'Education', 'Emergency', 'Home', 'Vehicle', 'Other'];

    /* ----------------------------------------------------------
       PRIVATE STATE
    ---------------------------------------------------------- */
    let _data = { goals: [] };
    let _listeners = [];

    /* ----------------------------------------------------------
       PERSISTENCE — no-op (API is source of truth)
    ---------------------------------------------------------- */
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
       LOAD FROM API
    ---------------------------------------------------------- */
    async function loadFromAPI() {
        if (typeof API === 'undefined') {
            throw new Error('API not available');
        }

        const result = await API.Goals.getAll();

        if (!result.success) {
            throw new Error(result.error || 'Failed to load goals');
        }

        // After api.js normalizer, result.data is already mapped to the
        // correct shape (id, name, targetAmount, savedAmount, etc.)
        _data.goals = Array.isArray(result.data)
            ? result.data.map(g => ({ ...g, contributions: [] }))
            : [];

        _listeners.forEach(fn => fn(getAll()));

        return _data.goals;
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
    async function add({ name, targetAmount, targetDate, category, imageUrl }) {
        if (typeof API === 'undefined') throw new Error('API not available');

        const result = await API.Goals.add({ name, targetAmount, targetDate, category, imageUrl });

        if (!result.success) {
            throw new Error(result.error || 'Failed to add goal.');
        }

        await loadFromAPI();

        return result.data;
    }

    /* ----------------------------------------------------------
       WRITE — Edit Goal
    ---------------------------------------------------------- */
    async function edit(id, updates) {
        if (typeof API === 'undefined') throw new Error('API not available');

        const result = await API.Goals.edit(id, updates);

        if (!result.success) {
            throw new Error(result.error || 'Failed to edit goal.');
        }

        await loadFromAPI();
    }

    /* ----------------------------------------------------------
       WRITE — Remove Goal
    ---------------------------------------------------------- */
    async function remove(id) {
        if (typeof API === 'undefined') throw new Error('API not available');

        const result = await API.Goals.remove(id);

        if (!result.success) {
            throw new Error(result.error || 'Failed to remove goal.');
        }

        await loadFromAPI();
    }

    /* ----------------------------------------------------------
       WRITE — Contribute to Goal
    ---------------------------------------------------------- */
    async function contribute(id, amount) {
        if (typeof API === 'undefined') throw new Error('API not available');

        const result = await API.Goals.contribute(id, amount);

        if (!result.success) {
            throw new Error(result.error || 'Failed to contribute to goal.');
        }

        await loadFromAPI();
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
        // API loading
        loadFromAPI,
        // Events
        onChange,
        offChange,
        // Utility
        fmtCurrency,
        fmtDate,
        CATEGORIES,
    });

})();
