/* =============================================================
   FlexScribe — API Module
   scripts/api.js

   Single source of truth for ALL backend communication.

   ── Usage ──
   When USE_MOCK = true  → every call resolves with realistic
                           seed data immediately (no network).
   When USE_MOCK = false → real fetch() calls fire against
                           window.FLEXSCRIBE_API_BASE (/api).

   ── Response shape (always) ──
   { success: true,  data: <payload> }
   { success: false, error: '<message>', code: <optional> }

   ── Auth ──
   Token stored in sessionStorage as 'flexscribe_token'.
   All real requests include: Authorization: Bearer <token>

   ── SQL Server integration ──
   1. Set window.FLEXSCRIBE_API_BASE = 'http://localhost:5000'
      (or your Express / ASP.NET Core URL) before this script.
   2. Flip USE_MOCK = false.
   3. Every function maps 1:1 to the endpoints listed in the
      FlexScribe spec (§3–§10).
============================================================= */

'use strict';

const API = (() => {

    /* ----------------------------------------------------------
       CONFIG
    ---------------------------------------------------------- */
    const USE_MOCK   = true;
    const BASE_URL   = (window.FLEXSCRIBE_API_BASE || '/api').replace(/\/$/, '');
    const MOCK_DELAY = 420; // ms — simulates network latency

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    function _token() {
        return sessionStorage.getItem('flexscribe_token') || '';
    }

    function _headers(extra = {}) {
        const h = {
            'Content-Type': 'application/json',
            ...extra,
        };
        const tok = _token();
        if (tok) h['Authorization'] = `Bearer ${tok}`;
        return h;
    }

    function _ok(data) {
        return { success: true, data };
    }

    function _err(message, code = null) {
        return { success: false, error: message, code };
    }

    function _mock(data, ms = MOCK_DELAY) {
        return new Promise(resolve =>
            setTimeout(() => resolve(_ok(data)), ms));
    }

    function _mockErr(message, ms = MOCK_DELAY) {
        return new Promise(resolve =>
            setTimeout(() => resolve(_err(message)), ms));
    }

    async function _fetch(method, path, body = null) {
        try {
            const opts = {
                method,
                headers: _headers(),
            };
            if (body) opts.body = JSON.stringify(body);
            const res  = await fetch(`${BASE_URL}${path}`, opts);
            const json = await res.json();
            if (!res.ok) return _err(json.message || `HTTP ${res.status}`, res.status);
            return _ok(json);
        } catch (e) {
            return _err(e.message || 'Network error');
        }
    }

    /* ----------------------------------------------------------
       MOCK SEED DATA
    ---------------------------------------------------------- */

    const MOCK = {
        user: {
            id:     'usr_001',
            name:   'Sarah M.',
            email:  'sarah@flexscribe.app',
            phone:  '+27 71 234 5678',
            plan:   'premium',
            scribeScore: 560,
            scribePoints: 1200,
            avatarUrl: null,
        },

        wallet: {
            balanceCents:    125010,
            pendingInCents:   50000,
            pendingOutCents:   8999,
            currency: 'ZAR',
        },

        walletHistory: [
            { date: '2025-05-17', amountCents:  50000, type: 'credit', label: 'Added Funds' },
            { date: '2025-05-16', amountCents: -19900, type: 'debit',  label: 'Netflix' },
            { date: '2025-05-16', amountCents:  -5999, type: 'debit',  label: 'Spotify' },
            { date: '2025-05-15', amountCents: -10000, type: 'transfer',label: 'Goal: New Laptop' },
            { date: '2025-05-14', amountCents: -8900,  type: 'debit',  label: 'Disney+' },
        ],

        subscriptions: [
            { id:'sub_001', name:'Netflix',       category:'Entertainment', amount:199.00, billingCycle:'monthly', nextPaymentDate:'2025-05-18', active:true,  logoClass:'netflix',  logoText:'N',  notes:'Premium 4K', createdAt:'2024-01-15' },
            { id:'sub_002', name:'Spotify',       category:'Music',         amount:59.99,  billingCycle:'monthly', nextPaymentDate:'2025-05-16', active:true,  logoClass:'spotify',  logoText:'S',  notes:'Individual', createdAt:'2024-02-01' },
            { id:'sub_003', name:'Disney+',       category:'Entertainment', amount:89.00,  billingCycle:'monthly', nextPaymentDate:'2025-05-24', active:true,  logoClass:'disney',   logoText:'D+', notes:'',           createdAt:'2024-03-10' },
            { id:'sub_004', name:'Amazon Prime',  category:'Shopping',      amount:99.00,  billingCycle:'monthly', nextPaymentDate:'2025-05-22', active:true,  logoClass:'prime',    logoText:'P',  notes:'Prime Video', createdAt:'2024-01-20' },
            { id:'sub_005', name:'YouTube Premium',category:'Entertainment',amount:79.00,  billingCycle:'monthly', nextPaymentDate:'2025-05-20', active:false, logoClass:'youtube',  logoText:'▶',  notes:'',           createdAt:'2024-04-05' },
        ],

        goals: [
            { id:'gol_001', name:'New Laptop',  targetCents:800000,  savedCents:320000, targetDate:'2026-03-01', imageUrl:'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=200&fit=crop', status:'active',    createdAt:'2024-06-01' },
            { id:'gol_002', name:'Vacation',    targetCents:1500000, savedCents:675000, targetDate:'2026-12-15', imageUrl:'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=200&fit=crop', status:'active',    createdAt:'2024-07-15' },
            { id:'gol_003', name:'Emergency Fund',targetCents:500000,savedCents:500000, targetDate:null,        imageUrl:null,                                                                               status:'completed', createdAt:'2023-11-01' },
        ],

        dependants: [
            { id:'dep_001', name:'Liam M.',  relationship:'Child',   avatarUrl:null, allowanceCents:20000, status:'active', spendingLimitCents:10000 },
            { id:'dep_002', name:'Emma M.',  relationship:'Child',   avatarUrl:null, allowanceCents:15000, status:'active', spendingLimitCents:8000  },
        ],

        notifications: [
            { id:'not_001', type:'payment',  title:'Netflix payment due tomorrow',        body:'R199.00 will be charged on 18 May.',      isRead:false, priority:'high',   createdAt:'2025-05-17T10:00:00Z', linkTo:'subscription' },
            { id:'not_002', type:'goal',     title:"You're close to your Vacation goal",  body:'You\'ve reached 45% of R15,000.',          isRead:false, priority:'medium', createdAt:'2025-05-16T14:22:00Z', linkTo:'goals' },
            { id:'not_003', type:'score',    title:'Scribe Score increased to 560',       body:'Great job staying on top of your finances.',isRead:true,  priority:'low',    createdAt:'2025-05-14T08:00:00Z', linkTo:'dashboard' },
            { id:'not_004', type:'payment',  title:'Spotify renews in 2 days',           body:'R59.99 on 16 May.',                         isRead:true,  priority:'medium', createdAt:'2025-05-14T09:00:00Z', linkTo:'subscription' },
            { id:'not_005', type:'security', title:'New sign-in detected',               body:'Chrome on Windows, Cape Town.',             isRead:true,  priority:'high',   createdAt:'2025-05-13T20:15:00Z', linkTo:'settings' },
        ],

        analytics: {
            summary: {
                totalSpentCents:   289050,
                totalIncomeCents:  500000,
                netSavingsRate:    42.2,
                vsLastMonth: { spent: +5.3, income: 0 },
            },
            byCategory: [
                { category:'Entertainment', amountCents:125000, pct:43 },
                { category:'Lifestyle',     amountCents:65000,  pct:22 },
                { category:'Utilities',     amountCents:45000,  pct:16 },
                { category:'Education',     amountCents:32000,  pct:11 },
                { category:'Other',         amountCents:22050,  pct:8  },
            ],
            trend: [
                { month:'Dec', amountCents:210000 },
                { month:'Jan', amountCents:245000 },
                { month:'Feb', amountCents:198000 },
                { month:'Mar', amountCents:312000 },
                { month:'Apr', amountCents:267000 },
                { month:'May', amountCents:289050 },
            ],
        },
    };

    /* ----------------------------------------------------------
       AUTH
    ---------------------------------------------------------- */

    const Auth = {

        /**
         * @param {string} email
         * @param {string} password
         * @returns {Promise<{success, data: {token, user}}>}
         */
        async login(email, password) {
            if (USE_MOCK) {
                if (!email || !password) return _mockErr('Email and password are required.', 100);

                // Admin login
                if (email === 'admin' && password === '1234') {
                    sessionStorage.setItem('flexscribe_token', 'mock-admin-token');
                    sessionStorage.setItem('flexscribe_admin', 'true');
                    return _mock({ token: 'mock-admin-token', user: { ...MOCK.user, name: 'Admin', role: 'admin' }, isAdmin: true });
                }

                // Normal user login
                sessionStorage.setItem('flexscribe_token', 'mock-jwt-token-2025');
                sessionStorage.removeItem('flexscribe_admin');
                return _mock({ token: 'mock-jwt-token-2025', user: MOCK.user });
            }
            const res = await _fetch('POST', '/auth/login', { email, password });
            if (res.success) sessionStorage.setItem('flexscribe_token', res.data.token);
            return res;
        },

        /**
         * @param {{ firstName, lastName, email, password, phone }} fields
         * @returns {Promise<{success, data: {token, user, scribePoints}}>}
         */
        async register(fields) {
            if (USE_MOCK) {
                if (!fields.email || !fields.password) return _mockErr('All fields required.', 400);
                if (fields.password !== fields.confirmPassword) return _mockErr('Passwords do not match.', 422);
                const token = 'mock-jwt-token-new-' + Date.now();
                sessionStorage.setItem('flexscribe_token', token);
                return _mock({
                    token,
                    user:         { ...MOCK.user, name: `${fields.firstName} ${fields.lastName}`, email: fields.email },
                    scribePoints: 500,
                });
            }
            const res = await _fetch('POST', '/auth/register', fields);
            if (res.success) sessionStorage.setItem('flexscribe_token', res.data.token);
            return res;
        },

        /**
         * Check if email is already registered.
         * @param {string} email
         * @returns {Promise<{success, data: {exists: boolean}}>}
         */
        async checkEmail(email) {
            if (USE_MOCK) {
                const taken = ['demo@flexscribe.app', 'sarah@flexscribe.app'];
                return _mock({ exists: taken.includes(email.toLowerCase()) }, 300);
            }
            return _fetch('POST', '/auth/check-email', { email });
        },

        async logout() {
            sessionStorage.removeItem('flexscribe_token');
            if (!USE_MOCK) await _fetch('POST', '/auth/logout');
            return _ok(null);
        },

        async forgotPassword(email) {
            if (USE_MOCK) return _mock({ sent: true }, 800);
            return _fetch('POST', '/auth/forgot-password', { email });
        },

        getUser() {
            if (USE_MOCK) return Promise.resolve(_ok(MOCK.user));
            return _fetch('GET', '/auth/me');
        },
    };

    /* ----------------------------------------------------------
       SUBSCRIPTIONS
    ---------------------------------------------------------- */

    const Subscriptions = {

        async getAll() {
            if (USE_MOCK) return _mock([...MOCK.subscriptions]);
            return _fetch('GET', '/subscriptions');
        },

        async add(data) {
            if (USE_MOCK) {
                const sub = { id: 'sub_' + Date.now(), ...data, createdAt: new Date().toISOString().slice(0,10) };
                MOCK.subscriptions.unshift(sub);
                return _mock(sub);
            }
            return _fetch('POST', '/subscriptions', data);
        },

        async edit(id, data) {
            if (USE_MOCK) {
                const idx = MOCK.subscriptions.findIndex(s => s.id === id);
                if (idx === -1) return _err('Not found', 404);
                Object.assign(MOCK.subscriptions[idx], data);
                return _mock(MOCK.subscriptions[idx]);
            }
            return _fetch('PATCH', `/subscriptions/${id}`, data);
        },

        async remove(id) {
            if (USE_MOCK) {
                MOCK.subscriptions = MOCK.subscriptions.filter(s => s.id !== id);
                return _mock({ deleted: true });
            }
            return _fetch('DELETE', `/subscriptions/${id}`);
        },

        async toggle(id) {
            if (USE_MOCK) {
                const sub = MOCK.subscriptions.find(s => s.id === id);
                if (!sub) return _err('Not found', 404);
                sub.active = !sub.active;
                return _mock(sub);
            }
            return _fetch('POST', `/subscriptions/${id}/toggle`);
        },

        async getProviders(params = {}) {
            // Provider catalogue — no auth needed
            if (USE_MOCK) return _mock(MOCK.subscriptions, 200);
            const qs = new URLSearchParams(params).toString();
            return _fetch('GET', `/subscriptions/providers${qs ? '?' + qs : ''}`);
        },
    };

    /* ----------------------------------------------------------
       WALLET
    ---------------------------------------------------------- */

    const Wallet = {

        async get() {
            if (USE_MOCK) return _mock({ ...MOCK.wallet });
            return _fetch('GET', '/wallet/balance');
        },

        async getHistory(range = '30d') {
            if (USE_MOCK) return _mock([...MOCK.walletHistory]);
            return _fetch('GET', `/wallet/history?range=${range}`);
        },

        async addFunds(amountCents, sourceId = 'default') {
            if (USE_MOCK) {
                MOCK.wallet.balanceCents += amountCents;
                return _mock({ balanceCents: MOCK.wallet.balanceCents });
            }
            return _fetch('POST', '/wallet/add-funds', { amountCents, sourceId });
        },

        async withdraw(amountCents, destinationId) {
            if (USE_MOCK) {
                if (amountCents > MOCK.wallet.balanceCents) return _err('Insufficient funds', 422);
                MOCK.wallet.balanceCents -= amountCents;
                return _mock({ balanceCents: MOCK.wallet.balanceCents });
            }
            return _fetch('POST', '/wallet/withdraw', { amountCents, destinationId });
        },

        async transfer(amountCents, goalId) {
            if (USE_MOCK) return _mock({ transferred: true, amountCents });
            return _fetch('POST', '/wallet/transfer', { amountCents, goalId });
        },
    };

    /* ----------------------------------------------------------
       GOALS
    ---------------------------------------------------------- */

    const Goals = {

        async getAll() {
            if (USE_MOCK) return _mock([...MOCK.goals]);
            return _fetch('GET', '/goals');
        },

        async add(data) {
            if (USE_MOCK) {
                const goal = { id: 'gol_' + Date.now(), savedCents: 0, status: 'active', createdAt: new Date().toISOString().slice(0,10), ...data };
                MOCK.goals.unshift(goal);
                return _mock(goal);
            }
            return _fetch('POST', '/goals', data);
        },

        async edit(id, data) {
            if (USE_MOCK) {
                const goal = MOCK.goals.find(g => g.id === id);
                if (!goal) return _err('Not found', 404);
                Object.assign(goal, data);
                return _mock(goal);
            }
            return _fetch('PATCH', `/goals/${id}`, data);
        },

        async remove(id) {
            if (USE_MOCK) {
                MOCK.goals = MOCK.goals.filter(g => g.id !== id);
                return _mock({ deleted: true });
            }
            return _fetch('DELETE', `/goals/${id}`);
        },

        async contribute(id, amountCents) {
            if (USE_MOCK) {
                const goal = MOCK.goals.find(g => g.id === id);
                if (!goal) return _err('Not found', 404);
                goal.savedCents += amountCents;
                return _mock(goal);
            }
            return _fetch('POST', `/goals/${id}/contribute`, { amountCents });
        },
    };

    /* ----------------------------------------------------------
       DEPENDANTS
    ---------------------------------------------------------- */

    const Dependants = {

        async getAll() {
            if (USE_MOCK) return _mock([...MOCK.dependants]);
            return _fetch('GET', '/dependants');
        },

        async add(data) {
            if (USE_MOCK) {
                const dep = { id: 'dep_' + Date.now(), status: 'invited', allowanceCents: 0, ...data };
                MOCK.dependants.push(dep);
                return _mock(dep);
            }
            return _fetch('POST', '/dependants', data);
        },

        async edit(id, data) {
            if (USE_MOCK) {
                const dep = MOCK.dependants.find(d => d.id === id);
                if (!dep) return _err('Not found', 404);
                Object.assign(dep, data);
                return _mock(dep);
            }
            return _fetch('PATCH', `/dependants/${id}`, data);
        },

        async remove(id) {
            if (USE_MOCK) {
                MOCK.dependants = MOCK.dependants.filter(d => d.id !== id);
                return _mock({ deleted: true });
            }
            return _fetch('DELETE', `/dependants/${id}`);
        },

        async sendAllowance(id, amountCents, recurrence = 'once') {
            if (USE_MOCK) return _mock({ sent: true, amountCents });
            return _fetch('POST', `/dependants/${id}/allowance`, { amountCents, recurrence });
        },
    };

    /* ----------------------------------------------------------
       NOTIFICATIONS
    ---------------------------------------------------------- */

    const Notifications = {

        async getAll(filter = 'all') {
            if (USE_MOCK) {
                const list = filter === 'unread'
                    ? MOCK.notifications.filter(n => !n.isRead)
                    : [...MOCK.notifications];
                return _mock(list, 200);
            }
            return _fetch('GET', `/notifications?filter=${filter}`);
        },

        async markRead(id) {
            if (USE_MOCK) {
                const n = MOCK.notifications.find(n => n.id === id);
                if (n) n.isRead = true;
                return _mock({ updated: true }, 150);
            }
            return _fetch('POST', `/notifications/${id}/read`);
        },

        async markAllRead() {
            if (USE_MOCK) {
                MOCK.notifications.forEach(n => n.isRead = true);
                return _mock({ updated: MOCK.notifications.length }, 150);
            }
            return _fetch('POST', '/notifications/mark-all-read');
        },

        unreadCount() {
            return MOCK.notifications.filter(n => !n.isRead).length;
        },
    };

    /* ----------------------------------------------------------
       ANALYTICS
    ---------------------------------------------------------- */

    const Analytics = {

        async getSummary(range = '30d') {
            if (USE_MOCK) return _mock({ ...MOCK.analytics.summary });
            return _fetch('GET', `/analytics/summary?range=${range}`);
        },

        async getByCategory(range = '30d') {
            if (USE_MOCK) return _mock([...MOCK.analytics.byCategory]);
            return _fetch('GET', `/analytics/by-category?range=${range}`);
        },

        async getTrend(range = '6m') {
            if (USE_MOCK) return _mock([...MOCK.analytics.trend]);
            return _fetch('GET', `/analytics/trend?range=${range}`);
        },

        async getInsights() {
            if (USE_MOCK) return _mock([
                { id:1, text:'Entertainment spend is 32% above your monthly average.',   action:'View subscriptions', linkTo:'subscription' },
                { id:2, text:'You have R450 in potentially unused subscriptions.',        action:'Review',             linkTo:'subscription' },
                { id:3, text:"You're on track to hit your New Laptop goal by March 2026.",action:'View goal',          linkTo:'goals' },
            ], 600);
            return _fetch('GET', '/analytics/insights');
        },
    };

    /* ----------------------------------------------------------
       SUPPORT
    ---------------------------------------------------------- */

    const Support = {

        async submitContact(fields) {
            if (USE_MOCK) return _mock({ submitted: true }, 800);
            return _fetch('POST', '/support/contact', fields);
        },

        async getFaq(search = '', topic = '') {
            if (USE_MOCK) return _mock([], 300);
            const qs = new URLSearchParams({ search, topic }).toString();
            return _fetch('GET', `/support/faq?${qs}`);
        },
    };

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        Auth,
        Subscriptions,
        Wallet,
        Goals,
        Dependants,
        Notifications,
        Analytics,
        Support,
        // Expose mock flag for debugging
        get isMock() { return USE_MOCK; },
    });

})();
