/* =============================================================
   FlexScribe — Subscriptions Backend (client-side data layer)
   backend/subscriptions.js

   Responsibilities:
   • Loads subscription data from SQL Server through API
   • Full CRUD: add, edit, toggle, delete
   • Derived stat recalculation
   • Donut chart data computation by category
   • CSV export
   • All database mutations refresh data from API
   • Exposes a single global SubscriptionStore object
============================================================= */

'use strict';

const SubscriptionStore = (() => {

    /* ----------------------------------------------------------
       CONSTANTS
    ---------------------------------------------------------- */

    const STORAGE_KEY = 'flexscribe_subscriptions';

    const CATEGORIES = [
        'Entertainment',
        'Music',
        'Shopping',
        'Productivity',
        'Education',
        'Utilities',
        'Fitness',
        'News',
        'Gaming',
        'Other'
    ];

    const BILLING_CYCLES = [
        'monthly',
        'yearly',
        'weekly',
        'quarterly'
    ];

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
       PROVIDERS LIBRARY
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
            benefits: [
                '4K Ultra HD streaming',
                'Watch on 4 devices',
                'Downloads for offline'
            ],
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
            benefits: [
                'Ad-free listening',
                'Offline downloads',
                'High quality audio'
            ],
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
            benefits: [
                'Exclusive originals',
                '4K streaming included',
                'Download for offline'
            ],
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
            benefits: [
                'Local SA content',
                'Live sport streaming',
                'Download to watch offline'
            ],
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
            benefits: [
                'No ads on any video',
                'Background play',
                'YouTube Music included'
            ],
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
            benefits: [
                'Spatial Audio with Dolby',
                'Lossless audio quality',
                '100M+ songs'
            ],
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
            benefits: [
                'Free next-day delivery',
                'Prime Video included',
                'Exclusive deals'
            ],
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
            benefits: [
                'All Office apps',
                '1TB OneDrive storage',
                'Advanced security'
            ],
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
            benefits: [
                '20+ creative apps',
                '100GB cloud storage',
                'Adobe Fonts included'
            ],
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
            benefits: [
                'GPT-4o access',
                'DALL-E image generation',
                'Priority access'
            ],
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
            benefits: [
                'Premium templates',
                'Brand kit',
                'Magic resize'
            ],
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
            benefits: [
                'Advanced code review',
                '3000 CI minutes',
                'Required reviewers'
            ],
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
            benefits: [
                '2TB cloud storage',
                'Smart sync',
                'File recovery'
            ],
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
            benefits: [
                '5500+ servers',
                'Threat protection',
                '6 simultaneous devices'
            ],
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
       LOAD DATA FROM SQL SERVER API
    ---------------------------------------------------------- */

    async function loadFromAPI() {

        if (typeof API === 'undefined') {
            console.error(
                'SubscriptionStore: API module not available.'
            );

            throw new Error('API not available');
        }

        const result = await API.Subscriptions.getAll();

        if (!result.success) {
            throw new Error(
                result.error || 'Failed to load subscriptions'
            );
        }

        const apiData = Array.isArray(result.data)
            ? result.data
            : (result.data?.data || []);

        _subs = apiData.map(function (s) {

            return {
                id: String(s.id),

                name: s.name || '',

                category: s.category || 'Other',

                amount: parseFloat(s.amount) || 0,

                billingCycle: s.billingCycle || 'monthly',

                nextPaymentDate: s.nextPaymentDate || '',

                active: s.active !== undefined
                    ? s.active
                    : true,

                logoClass: s.logoClass || 'default',

                logoText: s.logoText ||
                    (s.name || '?')
                        .charAt(0)
                        .toUpperCase(),

                notes: s.notes || '',

                createdAt: s.createdAt || '',

                customLogo: s.customLogo || '',

                colourTag: s.colourTag || '',

                reminderDays: s.reminderDays || null,

                providerUrl: s.providerUrl || ''
            };
        });

        _loaded = true;

        // Notify UI that fresh database data is available.
        _listeners.forEach(function (fn) {
            fn(getStats());
        });

        return _subs;
    }


    /* ----------------------------------------------------------
       CHANGE NOTIFICATION
    ---------------------------------------------------------- */

    function _notify() {

        _listeners.forEach(function (fn) {
            fn(getStats());
        });
    }


    function onChange(fn) {

        if (typeof fn !== 'function') {
            return;
        }

        _listeners.push(fn);
    }


    function offChange(fn) {

        _listeners = _listeners.filter(function (listener) {
            return listener !== fn;
        });
    }


    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    function _uid() {

        return 'sub_' +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 6);
    }


    function _toMonthly(amount, cycle) {

        switch (cycle) {

            case 'weekly':
                return amount * 52 / 12;

            case 'monthly':
                return amount;

            case 'quarterly':
                return amount / 3;

            case 'yearly':
                return amount / 12;

            default:
                return amount;
        }
    }


    function _fmtDate(iso) {

        if (!iso) {
            return '—';
        }

        const [y, m, d] = iso
            .split('-')
            .map(Number);

        const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec'
        ];

        return `${months[m - 1]} ${d}, ${y}`;
    }


    function _daysUntil(iso) {

        if (!iso) {
            return null;
        }

        const now = new Date();

        now.setHours(0, 0, 0, 0);

        const then = new Date(iso);

        then.setHours(0, 0, 0, 0);

        return Math.round(
            (then - now) / 86400000
        );
    }


    function _fmtCurrency(val) {

        return 'R' +
            val
                .toFixed(2)
                .replace(
                    /\B(?=(\d{3})+(?!\d))/g,
                    ','
                );
    }


    /* ----------------------------------------------------------
       READ
    ---------------------------------------------------------- */

    function getAll() {

        return [..._subs];
    }


    function getActive() {

        return _subs.filter(function (s) {
            return s.active;
        });
    }


    function getById(id) {

        return _subs.find(function (s) {
            return s.id === id;
        }) || null;
    }


    /* ----------------------------------------------------------
       STATISTICS
    ---------------------------------------------------------- */

    function getStats() {

        const active = getActive();

        const monthly = active.reduce(
            function (sum, s) {

                return sum +
                    _toMonthly(
                        s.amount,
                        s.billingCycle
                    );
            },
            0
        );

        const annual = monthly * 12;


        // Potential savings from inactive subscriptions
        const inactive = _subs.filter(function (s) {
            return !s.active;
        });

        const savings =
            inactive.reduce(
                function (sum, s) {

                    return sum +
                        _toMonthly(
                            s.amount,
                            s.billingCycle
                        );
                },
                0
            ) * 12;


        // Upcoming payments in next 30 days
        const upcoming = active
            .filter(function (s) {

                const d = _daysUntil(
                    s.nextPaymentDate
                );

                return (
                    d !== null &&
                    d >= 0 &&
                    d <= 30
                );
            })
            .sort(function (a, b) {

                return new Date(
                    a.nextPaymentDate
                ) -
                new Date(
                    b.nextPaymentDate
                );
            });


        // Category breakdown
        const byCategory = {};

        active.forEach(function (s) {

            const m = _toMonthly(
                s.amount,
                s.billingCycle
            );

            byCategory[s.category] =
                (byCategory[s.category] || 0) + m;
        });


        const categorySlices =
            Object.entries(byCategory)
                .sort(function (a, b) {
                    return b[1] - a[1];
                })
                .map(function ([cat, amt]) {

                    return {
                        category: cat,

                        amount: amt,

                        pct: monthly > 0
                            ? Math.round(
                                (amt / monthly) * 100
                            )
                            : 0,

                        color:
                            CATEGORY_COLORS[cat] ||
                            CATEGORY_COLORS.Other,
                    };
                });


        return {

            activeCount: active.length,

            totalCount: _subs.length,

            monthly,

            annual,

            savings: Math.max(
                0,
                savings
            ),

            upcoming,

            byCategory: categorySlices,

            all: getAll(),

            fmtMonthly:
                _fmtCurrency(monthly),

            fmtAnnual:
                _fmtCurrency(annual),

            fmtSavings:
                _fmtCurrency(
                    Math.max(0, savings)
                ),
        };
    }


    /* ----------------------------------------------------------
       WRITE — ADD
    ---------------------------------------------------------- */

    async function add(fields) {

        const sub = {

            name:
                (fields.name || '').trim(),

            category:
                fields.category || 'Other',

            amount:
                parseFloat(fields.amount) || 0,

            billingCycle:
                fields.billingCycle || 'monthly',

            nextPaymentDate:
                fields.nextPaymentDate || '',

            notes:
                (fields.notes || '').trim(),

            logoClass:
                fields.logoClass || 'default',

            logoText:
                fields.logoText ||
                (fields.name || '?')
                    .charAt(0)
                    .toUpperCase(),

            customLogo:
                fields.customLogo || '',

            colourTag:
                fields.colourTag || '',

            reminderDays:
                fields.reminderDays || null,

            providerUrl:
                fields.providerUrl || ''
        };


        if (!sub.name) {

            throw new Error(
                'Subscription name is required.'
            );
        }


        if (sub.amount <= 0) {

            throw new Error(
                'Amount must be greater than zero.'
            );
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }


        // Send to SQL Server
        const result =
            await API.Subscriptions.add(sub);


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to add subscription.'
            );
        }


        // Reload from SQL Server
        await loadFromAPI();


        // Return actual database record
        return result.data;
    }


    /* ----------------------------------------------------------
       WRITE — EDIT
    ---------------------------------------------------------- */

    async function edit(id, fields) {

        const existing =
            _subs.find(function (s) {
                return s.id === id;
            });


        if (!existing) {
            return null;
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }


        const result =
            await API.Subscriptions.edit(
                id,
                fields
            );


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to edit subscription.'
            );
        }


        await loadFromAPI();


        return getById(id);
    }


    /* ----------------------------------------------------------
       WRITE — TOGGLE ACTIVE / PAUSED
    ---------------------------------------------------------- */

    async function toggle(id) {

        const existing =
            _subs.find(function (s) {
                return s.id === id;
            });


        if (!existing) {
            return null;
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }


        const result =
            await API.Subscriptions.toggle(id);


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to toggle subscription.'
            );
        }


        await loadFromAPI();


        return getById(id);
    }


    /* ----------------------------------------------------------
       WRITE — DELETE
    ---------------------------------------------------------- */

    async function remove(id) {

        const existing =
            _subs.find(function (s) {
                return s.id === id;
            });


        if (!existing) {
            return false;
        }


        if (typeof API === 'undefined') {

            throw new Error(
                'API module not available.'
            );
        }


        const result =
            await API.Subscriptions.remove(id);


        if (!result.success) {

            throw new Error(
                result.error ||
                'Failed to delete subscription.'
            );
        }


        await loadFromAPI();


        return true;
    }


    /* ----------------------------------------------------------
       EXPORT — CSV
    ---------------------------------------------------------- */

    function exportCSV() {

        const headers = [
            'Name',
            'Category',
            'Amount',
            'Billing Cycle',
            'Next Payment',
            'Status',
            'Notes'
        ];


        const rows = _subs.map(function (s) {

            return [

                `"${s.name}"`,

                s.category,

                s.amount.toFixed(2),

                s.billingCycle,

                s.nextPaymentDate,

                s.active
                    ? 'Active'
                    : 'Paused',

                `"${s.notes}"`
            ];
        });


        const csv =
            [
                headers.join(','),
                ...rows.map(function (r) {
                    return r.join(',');
                })
            ].join('\n');


        const blob =
            new Blob(
                [csv],
                { type: 'text/csv' }
            );


        const url =
            URL.createObjectURL(blob);


        const a =
            document.createElement('a');


        a.href = url;

        a.download =
            `flexscribe-subscriptions-${
                new Date()
                    .toISOString()
                    .slice(0, 10)
            }.csv`;


        a.click();


        URL.revokeObjectURL(url);
    }


    /* ----------------------------------------------------------
       SORT
    ---------------------------------------------------------- */

    function sort(key, dir = 'asc') {

        _subs.sort(function (a, b) {

            let av;
            let bv;


            if (key === 'amount') {

                av =
                    _toMonthly(
                        a.amount,
                        a.billingCycle
                    );

                bv =
                    _toMonthly(
                        b.amount,
                        b.billingCycle
                    );

            } else if (key === 'date') {

                av =
                    a.nextPaymentDate || '';

                bv =
                    b.nextPaymentDate || '';

            } else if (key === 'category') {

                av = a.category;

                bv = b.category;

            } else {

                av =
                    a.name.toLowerCase();

                bv =
                    b.name.toLowerCase();
            }


            if (av < bv) {

                return dir === 'asc'
                    ? -1
                    : 1;
            }


            if (av > bv) {

                return dir === 'asc'
                    ? 1
                    : -1;
            }


            return 0;
        });


        _notify();
    }


    /* ----------------------------------------------------------
       RECOMMENDATIONS
    ---------------------------------------------------------- */

    function getProviders() {

        return [...PROVIDERS];
    }


    function getRecommendations() {

        const subscribedNames =
            new Set(
                _subs.map(function (s) {
                    return s.name
                        .toLowerCase()
                        .trim();
                })
            );


        return PROVIDERS.filter(
            function (p) {

                return !subscribedNames.has(
                    p.name
                        .toLowerCase()
                        .trim()
                );
            }
        );
    }


    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */

    // TEMPORARY: Load mock data for local development/testing.
    // When backend is running, comment this out and use loadFromAPI() instead.
    _subs = [
        { id: 'sub_001', name: 'Netflix', category: 'Entertainment', amount: 199.00, billingCycle: 'monthly', nextPaymentDate: '2025-08-18', active: true, logoClass: 'netflix', logoText: 'N', notes: 'Premium 4K plan', createdAt: '2024-01-15', customLogo: '', colourTag: '', reminderDays: null, providerUrl: '' },
        { id: 'sub_002', name: 'Spotify', category: 'Music', amount: 59.99, billingCycle: 'monthly', nextPaymentDate: '2025-08-16', active: true, logoClass: 'spotify', logoText: 'S', notes: 'Individual plan', createdAt: '2024-02-01', customLogo: '', colourTag: '', reminderDays: null, providerUrl: '' },
        { id: 'sub_003', name: 'Disney+', category: 'Entertainment', amount: 89.00, billingCycle: 'monthly', nextPaymentDate: '2025-08-24', active: true, logoClass: 'disney', logoText: 'D+', notes: '', createdAt: '2024-03-10', customLogo: '', colourTag: '', reminderDays: null, providerUrl: '' },
        { id: 'sub_004', name: 'Amazon Prime', category: 'Shopping', amount: 99.00, billingCycle: 'monthly', nextPaymentDate: '2025-08-22', active: true, logoClass: 'prime', logoText: 'P', notes: 'Includes Prime Video', createdAt: '2024-01-20', customLogo: '', colourTag: '', reminderDays: null, providerUrl: '' },
        { id: 'sub_005', name: 'YouTube Premium', category: 'Entertainment', amount: 79.00, billingCycle: 'monthly', nextPaymentDate: '2025-08-20', active: false, logoClass: 'youtube', logoText: '▶', notes: '', createdAt: '2024-04-05', customLogo: '', colourTag: '', reminderDays: null, providerUrl: '' }
    ];

    return Object.freeze({

        // Data access
        getAll,
        getActive,
        getById,
        getStats,
        getProviders,
        getRecommendations,

        // Database mutations
        add,
        edit,
        toggle,
        remove,
        sort,

        // Database loading
        loadFromAPI,

        // Export
        exportCSV,

        // Events
        onChange,
        offChange,

        // Constants
        CATEGORIES,
        BILLING_CYCLES,
        CATEGORY_COLORS,
        PROVIDERS,

        // Utilities
        fmtDate: _fmtDate,
        fmtCurrency: _fmtCurrency,
        daysUntil: _daysUntil,
    });

})();