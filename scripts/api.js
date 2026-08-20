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

    const USE_MOCK = false;
    const BASE_URL = 'http://localhost:5000';


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

            return json;

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
                    scribeScore: 560,
                    scribePoints: 1200,
                    avatarUrl: null
                });
            }

            return _fetch(
                'GET',
                '/auth/me'
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
                'PATCH',
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
                'POST',
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
                '/wallet/balance'
            );
        },


        async getHistory(range = '30d') {

            if (USE_MOCK) {
                return _mock([]);
            }

            return _fetch(
                'GET',
                `/wallet/history?range=${encodeURIComponent(range)}`
            );
        },


        async addFunds(
            amountCents,
            sourceId = 'default'
        ) {

            if (USE_MOCK) {

                return _mock({
                    balanceCents: amountCents
                });
            }

            return _fetch(
                'POST',
                '/wallet/add-funds',
                {
                    amountCents: amountCents,
                    sourceId: sourceId
                }
            );
        },


        async withdraw(
            amountCents,
            destinationId
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
                    amountCents: amountCents,
                    destinationId: destinationId
                }
            );
        },


        async transfer(
            amountCents,
            goalId
        ) {

            if (USE_MOCK) {

                return _mock({
                    transferred: true,
                    amountCents: amountCents
                });
            }

            return _fetch(
                'POST',
                '/wallet/transfer',
                {
                    amountCents: amountCents,
                    goalId: goalId
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
                'PATCH',
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
            amountCents
        ) {

            if (USE_MOCK) {

                return _mock({
                    id: id,
                    amountCents: amountCents
                });
            }

            return _fetch(
                'POST',
                `/goals/${id}/contribute`,
                {
                    amountCents: amountCents
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
                'PATCH',
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
            amountCents,
            recurrence = 'once'
        ) {

            if (USE_MOCK) {

                return _mock({
                    sent: true,
                    amountCents: amountCents
                });
            }

            return _fetch(
                'POST',
                `/dependants/${id}/allowance`,
                {
                    amountCents: amountCents,
                    recurrence: recurrence
                }
            );
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
                `/notifications?filter=${encodeURIComponent(filter)}`
            );
        },


        async markRead(id) {

            if (USE_MOCK) {

                return _mock({
                    updated: true
                });
            }

            return _fetch(
                'POST',
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
                'POST',
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

        get isMock() {
            return USE_MOCK;
        },

        get baseUrl() {
            return BASE_URL;
        }
    });

})();