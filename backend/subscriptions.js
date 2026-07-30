/* =============================================================
   FlexScribe — Subscriptions Backend (client-side data layer)
   backend/subscriptions.js

   Responsibilities:
   • In-memory data store seeded from localStorage
   • Full CRUD: add, edit, toggle, cancel/delete
   • Derived stat recalculation (active count, monthly, annual,
     potential savings, upcoming payments)
   • Donut chart data computation by category
   • CSV export
   • All mutations persist to localStorage automatically
   • Exposes a single global `SubscriptionStore` object consumed
     by the UI layer (scripts/subscriptions-ui.js)
============================================================= */

'use strict';

const SubscriptionStore = (() => {

    /* ----------------------------------------------------------
       CONSTANTS
    ---------------------------------------------------------- */
    const STORAGE_KEY = 'flexscribe_subscriptions';

    const CATEGORIES = [
        'Entertainment', 'Music', 'Shopping', 'Productivity',
        'Education', 'Utilities', 'Fitness', 'News', 'Gaming', 'Other'
    ];

    const BILLING_CYCLES = ['monthly', 'yearly', 'weekly', 'quarterly'];

    // Category → CSS variable colour for donut slices
    const CATEGORY_COLORS = {
        Entertainment: 'var(--orange)',
        Music:         'var(--green)',
        Shopping:      'var(--blue)',
        Productivity:  'var(--purple)',
        Education:     'var(--yellow)',
        Utilities:     '#22c55e',
        Fitness:       '#f43f5e',
        News:          '#06b6d4',
        Gaming:        '#a855f7',
        Other:         'var(--text-light)',
    };

    /* ----------------------------------------------------------
       SEED DATA  (used only when localStorage is empty)
    ---------------------------------------------------------- */
    const SEED = [
        {
            id: 'sub_001',
            name: 'Netflix',
            category: 'Entertainment',
            amount: 199.00,
            billingCycle: 'monthly',
            nextPaymentDate: '2025-05-18',
            active: true,
            logoClass: 'netflix',
            logoText: 'N',
            notes: 'Premium 4K plan',
            createdAt: '2024-01-15',
        },
        {
            id: 'sub_002',
            name: 'Spotify',
            category: 'Music',
            amount: 59.99,
            billingCycle: 'monthly',
            nextPaymentDate: '2025-05-16',
            active: true,
            logoClass: 'spotify',
            logoText: '',
            notes: 'Individual plan',
            createdAt: '2024-02-01',
        },
        {
            id: 'sub_003',
            name: 'Disney+',
            category: 'Entertainment',
            amount: 89.00,
            billingCycle: 'monthly',
            nextPaymentDate: '2025-05-24',
            active: true,
            logoClass: 'disney',
            logoText: 'D+',
            notes: '',
            createdAt: '2024-03-10',
        },
        {
            id: 'sub_004',
            name: 'Amazon Prime',
            category: 'Shopping',
            amount: 99.00,
            billingCycle: 'monthly',
            nextPaymentDate: '2025-05-22',
            active: true,
            logoClass: 'prime',
            logoText: 'P',
            notes: 'Includes Prime Video',
            createdAt: '2024-01-20',
        },
        {
            id: 'sub_005',
            name: 'YouTube Premium',
            category: 'Entertainment',
            amount: 79.00,
            billingCycle: 'monthly',
            nextPaymentDate: '2025-05-20',
            active: false,
            logoClass: 'youtube',
            logoText: '▶',
            notes: '',
            createdAt: '2024-04-05',
        },
    ];

    /* ----------------------------------------------------------
       PRIVATE STATE
    ---------------------------------------------------------- */
    let _subs = [];
    let _listeners = [];

    /* ----------------------------------------------------------
       PERSISTENCE
    ---------------------------------------------------------- */
    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            _subs = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED));
        } catch {
            _subs = JSON.parse(JSON.stringify(SEED));
        }
    }

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_subs));
        } catch (e) {
            console.warn('FlexScribe: could not persist subscriptions', e);
        }
    }

    /* ----------------------------------------------------------
       CHANGE NOTIFICATION  (pub/sub for UI re-renders)
    ---------------------------------------------------------- */
    function _notify() {
        _save();
        _listeners.forEach(fn => fn(getStats()));
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
        return 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /** Convert any billing cycle amount to a monthly equivalent */
    function _toMonthly(amount, cycle) {
        switch (cycle) {
            case 'weekly':    return amount * 52 / 12;
            case 'monthly':   return amount;
            case 'quarterly': return amount / 3;
            case 'yearly':    return amount / 12;
            default:          return amount;
        }
    }

    /** Format a date string "YYYY-MM-DD" → "MMM D, YYYY" */
    function _fmtDate(iso) {
        if (!iso) return '—';
        const [y, m, d] = iso.split('-').map(Number);
        const months = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[m - 1]} ${d}, ${y}`;
    }

    /** Days until a date from today */
    function _daysUntil(iso) {
        if (!iso) return null;
        const now  = new Date(); now.setHours(0,0,0,0);
        const then = new Date(iso); then.setHours(0,0,0,0);
        return Math.round((then - now) / 86400000);
    }

    /** Format currency as "R 1,234.56" */
    function _fmtCurrency(val) {
        return 'R' + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /* ----------------------------------------------------------
       READ
    ---------------------------------------------------------- */
    function getAll()    { return [..._subs]; }
    function getActive() { return _subs.filter(s => s.active); }
    function getById(id) { return _subs.find(s => s.id === id) || null; }

    /** Returns the full stats object used to drive the UI */
    function getStats() {
        const active   = getActive();
        const monthly  = active.reduce((sum, s) => sum + _toMonthly(s.amount, s.billingCycle), 0);
        const annual   = monthly * 12;

        // Potential savings = inactive subs that could be cancelled
        const inactive = _subs.filter(s => !s.active);
        const savings  = inactive.reduce((sum, s) => sum + _toMonthly(s.amount, s.billingCycle), 0) * 12;

        // Upcoming payments in next 30 days (active only), sorted by date
        const today = new Date(); today.setHours(0,0,0,0);
        const upcoming = active
            .filter(s => {
                const d = _daysUntil(s.nextPaymentDate);
                return d !== null && d >= 0 && d <= 30;
            })
            .sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));

        // Category breakdown for donut chart (active only)
        const byCategory = {};
        active.forEach(s => {
            const m = _toMonthly(s.amount, s.billingCycle);
            byCategory[s.category] = (byCategory[s.category] || 0) + m;
        });
        const categorySlices = Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amt]) => ({
                category: cat,
                amount:   amt,
                pct:      monthly > 0 ? Math.round((amt / monthly) * 100) : 0,
                color:    CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other,
            }));

        return {
            activeCount:  active.length,
            totalCount:   _subs.length,
            monthly,
            annual,
            savings:      Math.max(0, savings),
            upcoming,
            byCategory:   categorySlices,
            all:          getAll(),
            fmtMonthly:   _fmtCurrency(monthly),
            fmtAnnual:    _fmtCurrency(annual),
            fmtSavings:   _fmtCurrency(Math.max(0, savings)),
        };
    }

    /* ----------------------------------------------------------
       WRITE — Add
    ---------------------------------------------------------- */
    /**
     * @param {Object} fields  { name, category, amount, billingCycle,
     *                           nextPaymentDate, notes, logoClass?, logoText? }
     * @returns {Object} newly created subscription
     */
    function add(fields) {
        const sub = {
            id:              _uid(),
            name:            (fields.name || '').trim(),
            category:        fields.category  || 'Other',
            amount:          parseFloat(fields.amount) || 0,
            billingCycle:    fields.billingCycle || 'monthly',
            nextPaymentDate: fields.nextPaymentDate || '',
            active:          true,
            logoClass:       fields.logoClass || 'default',
            logoText:        fields.logoText  || (fields.name || '?').charAt(0).toUpperCase(),
            notes:           (fields.notes   || '').trim(),
            createdAt:       new Date().toISOString().slice(0, 10),
        };

        if (!sub.name) throw new Error('Subscription name is required.');
        if (sub.amount <= 0) throw new Error('Amount must be greater than zero.');

        _subs.unshift(sub);
        _notify();
        return sub;
    }

    /* ----------------------------------------------------------
       WRITE — Edit
    ---------------------------------------------------------- */
    /**
     * @param {string} id
     * @param {Object} fields  same shape as add(), partial OK
     * @returns {Object|null} updated sub or null if not found
     */
    function edit(id, fields) {
        const idx = _subs.findIndex(s => s.id === id);
        if (idx === -1) return null;

        const sub = _subs[idx];
        if (fields.name            !== undefined) sub.name            = fields.name.trim();
        if (fields.category        !== undefined) sub.category        = fields.category;
        if (fields.amount          !== undefined) sub.amount          = parseFloat(fields.amount) || 0;
        if (fields.billingCycle    !== undefined) sub.billingCycle    = fields.billingCycle;
        if (fields.nextPaymentDate !== undefined) sub.nextPaymentDate = fields.nextPaymentDate;
        if (fields.notes           !== undefined) sub.notes           = fields.notes.trim();
        if (fields.logoClass       !== undefined) sub.logoClass       = fields.logoClass;
        if (fields.logoText        !== undefined) sub.logoText        = fields.logoText;

        _notify();
        return sub;
    }

    /* ----------------------------------------------------------
       WRITE — Toggle active/paused
    ---------------------------------------------------------- */
    function toggle(id) {
        const sub = _subs.find(s => s.id === id);
        if (!sub) return null;
        sub.active = !sub.active;
        _notify();
        return sub;
    }

    /* ----------------------------------------------------------
       WRITE — Delete
    ---------------------------------------------------------- */
    function remove(id) {
        const before = _subs.length;
        _subs = _subs.filter(s => s.id !== id);
        if (_subs.length !== before) _notify();
        return _subs.length !== before;
    }

    /* ----------------------------------------------------------
       EXPORT — CSV
    ---------------------------------------------------------- */
    function exportCSV() {
        const headers = ['Name','Category','Amount','Billing Cycle','Next Payment','Status','Notes'];
        const rows = _subs.map(s => [
            `"${s.name}"`,
            s.category,
            s.amount.toFixed(2),
            s.billingCycle,
            s.nextPaymentDate,
            s.active ? 'Active' : 'Paused',
            `"${s.notes}"`,
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `flexscribe-subscriptions-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /* ----------------------------------------------------------
       SORT
    ---------------------------------------------------------- */
    /**
     * @param {'name'|'amount'|'date'|'category'} key
     * @param {'asc'|'desc'} dir
     */
    function sort(key, dir = 'asc') {
        _subs.sort((a, b) => {
            let av, bv;
            if (key === 'amount') {
                av = _toMonthly(a.amount, a.billingCycle);
                bv = _toMonthly(b.amount, b.billingCycle);
            } else if (key === 'date') {
                av = a.nextPaymentDate || '';
                bv = b.nextPaymentDate || '';
            } else if (key === 'category') {
                av = a.category;
                bv = b.category;
            } else {
                av = a.name.toLowerCase();
                bv = b.name.toLowerCase();
            }
            if (av < bv) return dir === 'asc' ? -1 :  1;
            if (av > bv) return dir === 'asc' ?  1 : -1;
            return 0;
        });
        _notify();
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    // Initialise on first require
    _load();

    return Object.freeze({
        // Data access
        getAll,
        getActive,
        getById,
        getStats,
        // Mutations
        add,
        edit,
        toggle,
        remove,
        sort,
        // Export
        exportCSV,
        // Events
        onChange,
        offChange,
        // Constants (for populating form dropdowns)
        CATEGORIES,
        BILLING_CYCLES,
        CATEGORY_COLORS,
        // Utility (exposed for UI layer)
        fmtDate:     _fmtDate,
        fmtCurrency: _fmtCurrency,
        daysUntil:   _daysUntil,
    });

})();
