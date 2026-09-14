/* =============================================================
   FlexScribe — API Module
   scripts/api.js

   Single source of truth for ALL backend communication.
============================================================= */

'use strict';

const API = (() => {

    /* ----------------------------------------------------------
       CONFIG
    ---------------------------------------------------------- */

    const USE_MOCK = false;  // Using real local SQL Server backend
    const BASE_URL = 'http://localhost:3000/api';


    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    function _token() {
        return sessionStorage.getItem('flexscribe_token') || '';
    }

    function _headers(extra = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extra
        };

        const token = _token();

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    function _ok(data) {
        return {
            success: true,
            data: data
        };
    }

    function _err(message, code = null) {
        return {
            success: false,
            error: message,
            code: code
        };
    }

    function _mock(data, ms = 300) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(_ok(data));
            }, ms);
        });
    }

    function _mockErr(message, ms = 300) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(_err(message));
            }, ms);
        });
    }

    async function _fetch(method, path, body = null) {

        try {

            const options = {
                method: method,
                headers: _headers()
            };

            if (body !== null) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(
                `${BASE_URL}${path}`,
                options
            );

            let json;

            try {
                json = await response.json();
            } catch (e) {
                return _err(
                    `Server returned invalid JSON. HTTP ${response.status}`,
                    response.status
                );
            }

            if (!response.ok) {

                return _err(
                    json.message ||
                    json.error ||
                    `HTTP ${response.status}`,
                    response.status
                );
            }

            return _ok(json);

        } catch (error) {

            console.error(
                `API ${method} ${path} failed:`,
                error
            );

            return _err(
                error.message || 'Network error'
            );
        }
    }


    /* ==========================================================
       AUTHENTICATION
    ========================================================== */

    const Auth = {

        async login(email, password) {

            if (USE_MOCK) {

                if (!email || !password) {
                    return _mockErr(
                        'Email and password are required.'
                    );
                }

                const token = 'mock-jwt-token';

                sessionStorage.setItem(
                    'flexscribe_token',
                    token
                );

                return _mock({
                    token: token,
                    user: {
                        id: 'usr_001',
                        name: 'Sarah M.',
                        email: email,
                        role: 'user'
                    }
                });
            }

            const result = await _fetch(
                'POST',
                '/auth/login',
                {
                    email: email,
                    password: password
                }
            );

            if (
                result.success &&
                result.data &&
                result.data.token
            ) {
                sessionStorage.setItem(
                    'flexscribe_token',
                    result.data.token
                );
            }

            return result;
        },


        async register(fields) {

            if (USE_MOCK) {

                if (
                    !fields.email ||
                    !fields.password
                ) {
                    return _mockErr(
                        'All required fields must be completed.'
                    );
                }

                if (
                    fields.password !==
                    fields.confirmPassword
                ) {
                    return _mockErr(
                        'Passwords do not match.'
                    );
                }

                const token =
                    'mock-token-' + Date.now();

                sessionStorage.setItem(
                    'flexscribe_token',
                    token
                );

                return _mock({
                    token: token,
                    user: {
                        id: 'usr_' + Date.now(),
                        name:
                            `${fields.firstName || ''} ${fields.lastName || ''}`
                                .trim(),
                        email: fields.email,
                        role: 'user'
                    }
                });
            }

            const result = await _fetch(
                'POST',
                '/auth/register',
                fields
            );

            if (
                result.success &&
                result.data &&
                result.data.token
            ) {
                sessionStorage.setItem(
                    'flexscribe_token',
                    result.data.token
                );
            }

            return result;
        },


        async checkEmail(email) {

            if (USE_MOCK) {
                return _mock({
                    exists: false
                });
            }

            return _fetch(
                'POST',
                '/auth/check-email',
                {
                    email: email
                }
            );
        },


        async getUser() {

            if (USE_MOCK) {

                return _mock({
                    id: 'usr_001',
                    name: 'Sarah M.',
                    email: 'sarah@flexscribe.app',
                    phone: '+27 71 234 5678',
                    plan: 'premium',
                    scribeScore: 1200,
                    avatarUrl: null
                });
            }

            return _fetch(
                'GET',
                '/auth/profile'
            );
        },


        async logout() {

            if (!USE_MOCK) {

                const result = await _fetch(
                    'POST',
                    '/auth/logout'
                );

                sessionStorage.removeItem(
                    'flexscribe_token'
                );

                sessionStorage.removeItem(
                    'flexscribe_admin'
                );

                return result;
            }

            sessionStorage.removeItem(
                'flexscribe_token'
            );

            sessionStorage.removeItem(
                'flexscribe_admin'
            );

            return _ok(null);
        },


        async forgotPassword(email) {

            if (USE_MOCK) {

                return _mock({
                    sent: true
                }, 500);
            }

            return _fetch(
                'POST',
                '/auth/forgot-password',
                {
                    email: email
                }
            );
        },


        async updateProfile(data) {

            if (USE_MOCK) {
                return _mock({ updated: true });
            }

            return _fetch(
                'PUT',
                '/auth/profile',
                data
            );
        }
    };


    /* ==========================================================
       SUBSCRIPTIONS
    ========================================================== */

    const Subscriptions = {

        async getAll() {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                '/subscriptions'
            );
        },


        async add(data) {

            if (USE_MOCK) {

                return _mock({
                    id: 'sub_' + Date.now(),
                    ...data
                });
            }

            return _fetch(
                'POST',
                '/subscriptions',
                data
            );
        },


        async edit(id, data) {

            if (USE_MOCK) {

                return _mock({
                    id: id,
                    ...data
                });
            }

            return _fetch(
                'PUT',
                `/subscriptions/${id}`,
                data
            );
        },


        async remove(id) {

            if (USE_MOCK) {

                return _mock({
                    deleted: true
                });
            }

            return _fetch(
                'DELETE',
                `/subscriptions/${id}`
            );
        },


        async toggle(id) {

            if (USE_MOCK) {

                return _mock({
                    id: id
                });
            }

            return _fetch(
                'PATCH',
                `/subscriptions/${id}/toggle`
            );
        },


        async getProviders(params = {}) {

            if (USE_MOCK) {
                return _mock([]);
            }

            const query =
                new URLSearchParams(params).toString();

            return _fetch(
                'GET',
                `/subscriptions/providers${query ? '?' + query : ''}`
            );
        }
    };


    /* ==========================================================
       WALLET
    ========================================================== */

    const Wallet = {

        async get() {

            if (USE_MOCK) {

                return _mock({
                    balanceCents: 0,
                    pendingInCents: 0,
                    pendingOutCents: 0,
                    currency: 'ZAR'
                });
            }

            return _fetch(
                'GET',
                '/wallet'
            );
        },


        async getHistory(range = '30d') {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                '/wallet/transactions'
            );
        },


        /**
         * Paginated / filtered transaction history.
         * @param {Object} opts { type, status, limit, offset }
         * Returns { success, data: { transactions, total, limit, offset } }
         */
        async getTransactions(opts = {}) {

            if (USE_MOCK) {
                return _mock({ transactions: [], total: 0, limit: 25, offset: 0 });
            }

            const qs = [];
            if (opts.type)   qs.push('type='   + encodeURIComponent(opts.type));
            if (opts.status) qs.push('status=' + encodeURIComponent(opts.status));
            if (opts.limit != null)  qs.push('limit='  + encodeURIComponent(opts.limit));
            if (opts.offset != null) qs.push('offset=' + encodeURIComponent(opts.offset));

            return _fetch(
                'GET',
                '/wallet/transactions' + (qs.length ? '?' + qs.join('&') : '')
            );
        },


        /** Single transaction detail (ownership-checked server-side). */
        async getTransaction(id) {

            if (USE_MOCK) {
                return _mock({});
            }

            return _fetch(
                'GET',
                '/wallet/transactions/' + encodeURIComponent(id)
            );
        },


        /** Trend chart data aggregated from real transactions. */
        async getTrends(opts = {}) {

            if (USE_MOCK) {
                return _mock({ labels: [], values: [], total: 0 });
            }

            const qs = [];
            if (opts.metric) qs.push('metric=' + encodeURIComponent(opts.metric));
            if (opts.period) qs.push('period=' + encodeURIComponent(opts.period));

            return _fetch(
                'GET',
                '/wallet/trends' + (qs.length ? '?' + qs.join('&') : '')
            );
        },


        /** Resolve a transfer recipient by email or exact name. */
        async resolveRecipient(identifier) {

            if (USE_MOCK) {
                return _mock({ subscriberID: 0, name: 'Mock User' });
            }

            return _fetch(
                'GET',
                '/wallet/recipients/' + encodeURIComponent(identifier)
            );
        },


        /** Simulated withdrawal destinations for the current user. */
        async getDestinations() {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                '/wallet/destinations'
            );
        },


        /**
         * Transfer available funds to another FlexScribe user.
         * @param {Object} opts { recipientUserID | recipient, amount, note }
         */
        async transferToUser(opts) {

            if (USE_MOCK) {
                return _mock({ reference: 'FS-TRF-000001', amount: opts.amount });
            }

            return _fetch(
                'POST',
                '/wallet/transfer',
                {
                    recipientUserID: opts.recipientUserID,
                    recipient: opts.recipient,
                    amount: opts.amount,
                    note: opts.note
                }
            );
        },


        async addFunds(
            amount,
            source = 'Bank Card'
        ) {

            if (USE_MOCK) {

                return _mock({
                    balanceCents: amount
                });
            }

            return _fetch(
                'POST',
                '/wallet/add-funds',
                {
                    amount: amount,
                    source: source
                }
            );
        },


        /** Top Up the wallet (canonical route; method is the funding source). */
        async topUp(amount, method = 'Bank Transfer') {

            if (USE_MOCK) {
                return _mock({ balance: amount, reference: 'FS-DEP-000001', status: 'completed' });
            }

            return _fetch(
                'POST',
                '/wallet/top-up',
                { amount: amount, method: method }
            );
        },


        /** Mark a pending withdrawal as settled (simulated clearing). */
        async settleWithdrawal(transactionID) {

            if (USE_MOCK) {
                return _mock({ status: 'completed' });
            }

            return _fetch(
                'POST',
                '/wallet/withdraw/' + encodeURIComponent(transactionID) + '/settle'
            );
        },


        async withdraw(
            amount,
            destination,
            destinationID
        ) {

            if (USE_MOCK) {

                return _mock({
                    balanceCents: 0
                });
            }

            return _fetch(
                'POST',
                '/wallet/withdraw',
                {
                    amount: amount,
                    destination: destination,
                    destinationID: destinationID
                }
            );
        },


        async transfer(
            amount,
            goalId
        ) {

            if (USE_MOCK) {

                return _mock({
                    transferred: true,
                    amount: amount
                });
            }

            return _fetch(
                'POST',
                '/wallet/transfer-to-goal',
                {
                    amount: amount,
                    goalID: goalId
                }
            );
        }
    };


    /* ==========================================================
       GOALS
    ========================================================== */

    const Goals = {

        async getAll() {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                '/goals'
            );
        },


        async add(data) {

            if (USE_MOCK) {

                return _mock({
                    id: 'gol_' + Date.now(),
                    savedCents: 0,
                    status: 'active',
                    ...data
                });
            }

            return _fetch(
                'POST',
                '/goals',
                data
            );
        },


        async edit(id, data) {

            if (USE_MOCK) {

                return _mock({
                    id: id,
                    ...data
                });
            }

            return _fetch(
                'PUT',
                `/goals/${id}`,
                data
            );
        },


        async remove(id) {

            if (USE_MOCK) {

                return _mock({
                    deleted: true
                });
            }

            return _fetch(
                'DELETE',
                `/goals/${id}`
            );
        },


        async contribute(
            id,
            amount
        ) {

            if (USE_MOCK) {

                return _mock({
                    id: id,
                    amount: amount
                });
            }

            return _fetch(
                'POST',
                `/goals/${id}/contribute`,
                {
                    amount: amount
                }
            );
        }
    };


    /* ==========================================================
       DEPENDANTS
    ========================================================== */

    const Dependants = {

        async getAll() {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                '/dependants'
            );
        },


        async add(data) {

            if (USE_MOCK) {

                return _mock({
                    id: 'dep_' + Date.now(),
                    status: 'invited',
                    allowanceCents: 0,
                    ...data
                });
            }

            return _fetch(
                'POST',
                '/dependants',
                data
            );
        },


        async edit(id, data) {

            if (USE_MOCK) {

                return _mock({
                    id: id,
                    ...data
                });
            }

            return _fetch(
                'PUT',
                `/dependants/${id}`,
                data
            );
        },


        async remove(id) {

            if (USE_MOCK) {

                return _mock({
                    deleted: true
                });
            }

            return _fetch(
                'DELETE',
                `/dependants/${id}`
            );
        },


        async sendAllowance(
            id,
            amount,
            recurrence = 'once'
        ) {

            if (USE_MOCK) {

                return _mock({
                    sent: true,
                    amount: amount
                });
            }

            return _fetch(
                'POST',
                `/dependants/${id}/send-allowance`,
                {
                    amount: amount,
                    recurrence: recurrence
                }
            );
        },


        async addTask(depId, data) {
            return _fetch('POST', `/dependants/${depId}/tasks`, data);
        },

        async editTask(depId, taskId, data) {
            return _fetch('PUT', `/dependants/${depId}/tasks/${taskId}`, data);
        },

        async deleteTask(depId, taskId) {
            return _fetch('DELETE', `/dependants/${depId}/tasks/${taskId}`);
        },

        async getTasks(depId) {
            return _fetch('GET', `/dependants/${depId}/tasks`);
        }
    };


    /* ==========================================================
       NOTIFICATIONS
    ========================================================== */

    const Notifications = {

        async getAll(filter = 'all') {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                '/notifications'
            );
        },


        async markRead(id) {

            if (USE_MOCK) {

                return _mock({
                    updated: true
                });
            }

            return _fetch(
                'PATCH',
                `/notifications/${id}/read`
            );
        },


        async markAllRead() {

            if (USE_MOCK) {

                return _mock({
                    updated: true
                });
            }

            return _fetch(
                'PATCH',
                '/notifications/mark-all-read'
            );
        },


        async unreadCount() {

            if (USE_MOCK) {
                return 0;
            }

            const result =
                await this.getAll('unread');

            if (
                result.success &&
                Array.isArray(result.data)
            ) {
                return result.data.length;
            }

            return 0;
        }
    };


    /* ==========================================================
       ANALYTICS
    ========================================================== */

    const Analytics = {

        async getSummary(
            range = '30d'
        ) {

            if (USE_MOCK) {

                return _mock({
                    totalSpentCents: 0,
                    totalIncomeCents: 0,
                    netSavingsRate: 0,
                    vsLastMonth: {
                        spent: 0,
                        income: 0
                    }
                });
            }

            return _fetch(
                'GET',
                `/analytics/summary?range=${encodeURIComponent(range)}`
            );
        },


        async getByCategory(
            range = '30d'
        ) {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                `/analytics/by-category?range=${encodeURIComponent(range)}`
            );
        },


        async getTrend(
            range = '6m'
        ) {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                `/analytics/trend?range=${encodeURIComponent(range)}`
            );
        },


        async getInsights() {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                '/analytics/insights'
            );
        }
    };


    /* ==========================================================
       SUPPORT
    ========================================================== */

    const Support = {

        async submitContact(fields) {

            if (USE_MOCK) {

                return _mock({
                    submitted: true
                });
            }

            return _fetch(
                'POST',
                '/support/contact',
                fields
            );
        },


        async getFaq(
            search = '',
            topic = ''
        ) {

            if (USE_MOCK) {
                return _mock([]);
            }

            const params =
                new URLSearchParams({
                    search: search,
                    topic: topic
                });

            return _fetch(
                'GET',
                `/support/faq?${params.toString()}`
            );
        }
    };

    /* ==========================================================
       REPORTS (compile financial report)
    ========================================================== */

    const Reports = {
        async compile(options) {
            return _fetch('POST', '/reports/compile', options);
        },
        async getAll() {
            return _fetch('GET', '/reports');
        }
    };

    /* ==========================================================
       BANK STATEMENTS
    ========================================================== */

    const BankStatements = {

        async upload(file) {
            if (typeof API === 'undefined') return _err('API not available');
            var formData = new FormData();
            formData.append('statement', file);
            try {
                var opts = {
                    method: 'POST',
                    headers: {},
                    body: formData
                };
                var tok = _token();
                if (tok) opts.headers['Authorization'] = 'Bearer ' + tok;
                var res = await fetch(BASE_URL + '/bank-statements/upload', opts);
                var contentType = res.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    return _err('Server error: endpoint not available. Make sure the server is running and dependencies are installed (run npm install in the server folder).', res.status);
                }
                var json = await res.json();
                if (!res.ok) return _err(json.message || 'Upload failed', res.status);
                return _ok(json);
            } catch (e) {
                return _err(e.message || 'Network error');
            }
        },

        async getReport() {
            if (USE_MOCK) return _mock(null);
            return _fetch('GET', '/bank-statements/report');
        }
    };


    /* ==========================================================
       PUBLIC API
    ========================================================== */

    return Object.freeze({

        Auth,
        Subscriptions,
        Wallet,
        Goals,
        Dependants,
        Notifications,
        Analytics,
        Support,
        BankStatements,
        Reports,

        get isMock() {
            return USE_MOCK;
        },

        get baseUrl() {
            return BASE_URL;
        }
    });

})();