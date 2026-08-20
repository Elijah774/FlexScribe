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
       PROVIDERS LIBRARY  (recommendation engine source data)
    ---------------------------------------------------------- */
    const PROVIDERS = [
        {
            id: 'prov_netflix',
            name: 'Netflix',
            monthlyCost: 199.00,
            category: 'Entertainment',
            description: 'Stream movies, series & documentaries in 4K.',
            rating: 4.5,
            logoClass: 'netflix',
            logoText: 'N',
            benefits: ['4K Ultra HD streaming', 'Watch on 4 devices', 'Downloads for offline'],
        },
        {
            id: 'prov_spotify',
            name: 'Spotify',
            monthlyCost: 59.99,
            category: 'Music',
            description: 'Millions of songs and podcasts on demand.',
            rating: 4.6,
            logoClass: 'spotify',
            logoText: 'S',
            benefits: ['Ad-free listening', 'Offline downloads', 'High quality audio'],
        },
        {
            id: 'prov_disney',
            name: 'Disney+',
            monthlyCost: 89.00,
            category: 'Entertainment',
            description: 'Disney, Pixar, Marvel, Star Wars & more.',
            rating: 4.3,
            logoClass: 'disney',
            logoText: 'D+',
            benefits: ['Exclusive originals', '4K streaming included', 'Download for offline'],
        },
        {
            id: 'prov_showmax',
            name: 'Showmax',
            monthlyCost: 99.00,
            category: 'Entertainment',
            description: 'Local & international shows, sport, and movies.',
            rating: 4.0,
            logoClass: 'default',
            logoText: 'S',
            benefits: ['Local SA content', 'Live sport streaming', 'Download to watch offline'],
        },
        {
            id: 'prov_youtube',
            name: 'YouTube Premium',
            monthlyCost: 79.00,
            category: 'Entertainment',
            description: 'Ad-free videos, background play & YouTube Music.',
            rating: 4.4,
            logoClass: 'youtube',
            logoText: '▶',
            benefits: ['No ads on any video', 'Background play', 'YouTube Music included'],
        },
        {
            id: 'prov_apple_music',
            name: 'Apple Music',
            monthlyCost: 59.99,
            category: 'Music',
            description: 'Over 100 million songs with spatial audio.',
            rating: 4.5,
            logoClass: 'apple',
            logoText: '♫',
            benefits: ['Spatial Audio with Dolby', 'Lossless audio quality', '100M+ songs'],
        },
        {
            id: 'prov_prime',
            name: 'Amazon Prime',
            monthlyCost: 99.00,
            category: 'Shopping',
            description: 'Free delivery, Prime Video & exclusive deals.',
            rating: 4.4,
            logoClass: 'prime',
            logoText: 'P',
            benefits: ['Free next-day delivery', 'Prime Video included', 'Exclusive deals'],
        },
        {
            id: 'prov_microsoft365',
            name: 'Microsoft 365',
            monthlyCost: 149.00,
            category: 'Productivity',
            description: 'Word, Excel, PowerPoint, 1TB OneDrive cloud.',
            rating: 4.5,
            logoClass: 'microsoft',
            logoText: 'M',
            benefits: ['All Office apps', '1TB OneDrive storage', 'Advanced security'],
        },
        {
            id: 'prov_adobe',
            name: 'Adobe CC',
            monthlyCost: 599.00,
            category: 'Productivity',
            description: 'Photoshop, Illustrator, Premiere & 20+ apps.',
            rating: 4.3,
            logoClass: 'default',
            logoText: 'A',
            benefits: ['20+ creative apps', '100GB cloud storage', 'Adobe Fonts included'],
        },
        {
            id: 'prov_chatgpt',
            name: 'ChatGPT Plus',
            monthlyCost: 349.00,
            category: 'Productivity',
            description: 'GPT-4o access, DALL-E, plugins & priority.',
            rating: 4.7,
            logoClass: 'default',
            logoText: 'C',
            benefits: ['GPT-4o access', 'DALL-E image generation', 'Priority access'],
        },
        {
            id: 'prov_canva',
            name: 'Canva Pro',
            monthlyCost: 149.00,
            category: 'Productivity',
            description: 'Premium templates, brand kits & magic tools.',
            rating: 4.6,
            logoClass: 'default',
            logoText: 'C',
            benefits: ['Premium templates', 'Brand kit', 'Magic resize'],
        },
        {
            id: 'prov_github',
            name: 'GitHub Pro',
            monthlyCost: 74.00,
            category: 'Productivity',
            description: 'Advanced code review, CI minutes & insights.',
            rating: 4.4,
            logoClass: 'default',
            logoText: 'G',
            benefits: ['Advanced code review', '3000 CI minutes', 'Required reviewers'],
        },
        {
            id: 'prov_dropbox',
            name: 'Dropbox',
            monthlyCost: 199.00,
            category: 'Utilities',
            description: '2TB cloud storage with smart sync & sharing.',
            rating: 4.1,
            logoClass: 'default',
            logoText: 'D',
            benefits: ['2TB cloud storage', 'Smart sync', 'File recovery'],
        },
        {
            id: 'prov_nordvpn',
            name: 'NordVPN',
            monthlyCost: 89.00,
            category: 'Utilities',
            description: 'Fast & secure VPN with threat protection.',
            rating: 4.5,
            logoClass: 'default',
            logoText: 'N',
            benefits: ['5500+ servers', 'Threat protection', '6 simultaneous devices'],
        },
    ];

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
    let _loaded = false;
    let _loadPromise = null;

    /* ----------------------------------------------------------
       PERSISTENCE — Backend API (SQL Server)
       No localStorage. No fallback data. API is source of truth.
    ---------------------------------------------------------- */
    function _load() {
        // No-op on file load. Data is loaded via loadFromAPI().
    }

    async function loadFromAPI() {
        if (typeof API === 'undefined') {
            console.error('SubscriptionStore: API module not available.');
            throw new Error('API not available');
        }
        const result = await API.Subscriptions.getAll();
        if (result.success && result.data) {
            const apiData = Array.isArray(result.data) ? result.data : (result.data.data || []);
            _subs = apiData.map(function(s) {
                return {
                    id: String(s.id),
                    name: s.name || '',
                    category: s.category || 'Other',
                    amount: parseFloat(s.amount) || 0,
                    billingCycle: s.billingCycle || 'monthly',
                    nextPaymentDate: s.nextPaymentDate || '',
                    active: s.active !== undefined ? s.active : true,
                    logoClass: s.logoClass || 'default',
                    logoText: s.logoText || (s.name || '?').charAt(0).toUpperCase(),
                    notes: s.notes || '',
                    createdAt: s.createdAt || '',
                    customLogo: s.customLogo || '',
                    colourTag: s.colourTag || '',
                    reminderDays: s.reminderDays || null,
                    providerUrl: s.providerUrl || ''
                };
            });
            _loaded = true;
            _listeners.forEach(fn => fn(getStats()));
            return _subs;
        } else {
            throw new Error(result.error || 'Failed to load subscriptions');
        }
    }

    function _save() {
        // No-op. We do not persist to localStorage.
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
     *                           nextPaymentDate, notes, logoClass?, logoText?,
     *                           customLogo?, colourTag?, reminderDays?, providerUrl? }
     * @returns {Object} newly created subscription
     */
    function add(fields) {
        const sub = {
            name:            (fields.name || '').trim(),
            category:        fields.category  || 'Other',
            amount:          parseFloat(fields.amount) || 0,
            billingCycle:    fields.billingCycle || 'monthly',
            nextPaymentDate: fields.nextPaymentDate || '',
            notes:           (fields.notes   || '').trim(),
            logoClass:       fields.logoClass || 'default',
            logoText:        fields.logoText  || (fields.name || '?').charAt(0).toUpperCase(),
        };

        if (!sub.name) throw new Error('Subscription name is required.');
        if (sub.amount <= 0) throw new Error('Amount must be greater than zero.');

        // Call API, then refresh from backend
        API.Subscriptions.add(sub).then(function(result) {
            if (result.success) {
                loadFromAPI();
            } else {
                console.error('Failed to add subscription:', result.error);
            }
        }).catch(function(err) {
            console.error('Add subscription network error:', err);
        });

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

        // Call API, then refresh from backend
        API.Subscriptions.edit(id, fields).then(function(result) {
            if (result.success) {
                loadFromAPI();
            } else {
                console.error('Failed to edit subscription:', result.error);
            }
        }).catch(function(err) {
            console.error('Edit subscription network error:', err);
        });

        // Return current local copy for immediate UI feedback
        return _subs[idx];
    }

    /* ----------------------------------------------------------
       WRITE — Toggle active/paused
    ---------------------------------------------------------- */
    function toggle(id) {
        const sub = _subs.find(s => s.id === id);
        if (!sub) return null;

        // Call API, then refresh from backend
        API.Subscriptions.toggle(id).then(function(result) {
            if (result.success) {
                loadFromAPI();
            } else {
                console.error('Failed to toggle subscription:', result.error);
            }
        }).catch(function(err) {
            console.error('Toggle subscription network error:', err);
        });

        // Return toggled copy for immediate UI feedback
        return { ...sub, active: !sub.active };
    }

    /* ----------------------------------------------------------
       WRITE — Delete
    ---------------------------------------------------------- */
    function remove(id) {
        // Call API, then refresh from backend
        API.Subscriptions.remove(id).then(function(result) {
            if (result.success) {
                loadFromAPI();
            } else {
                console.error('Failed to delete subscription:', result.error);
            }
        }).catch(function(err) {
            console.error('Delete subscription network error:', err);
        });
        return true;
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
       RECOMMENDATIONS — exclude already-subscribed providers
    ---------------------------------------------------------- */
    function getProviders() {
        return [...PROVIDERS];
    }

    /**
     * Returns providers NOT already in the user's subscription list.
     * Matching is done by normalised name comparison.
     */
    function getRecommendations() {
        const subscribedNames = new Set(
            _subs.map(s => s.name.toLowerCase().trim())
        );
        return PROVIDERS.filter(p => !subscribedNames.has(p.name.toLowerCase().trim()));
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    // Initialise on first require
    // Do NOT auto-load from localStorage. Data comes from API via loadFromAPI().
    // _load() is intentionally not called here.

    return Object.freeze({
        // Data access
        getAll,
        getActive,
        getById,
        getStats,
        getProviders,
        getRecommendations,
        // Mutations (API-backed)
        add,
        edit,
        toggle,
        remove,
        sort,
        // API loading
        loadFromAPI,
        // Export
        exportCSV,
        // Events
        onChange,
        offChange,
        // Constants (for populating form dropdowns)
        CATEGORIES,
        BILLING_CYCLES,
        CATEGORY_COLORS,
        PROVIDERS,
        // Utility (exposed for UI layer)
        fmtDate:     _fmtDate,
        fmtCurrency: _fmtCurrency,
        daysUntil:   _daysUntil,
    });

})();
