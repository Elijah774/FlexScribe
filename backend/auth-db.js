/* =============================================================
   FlexScribe — Auth Database Service
   backend/auth-db.js

   Integration layer that connects AuthSQL statements to the
   existing API module (scripts/api.js). When DB_ENABLED is true,
   these methods execute real queries against FlexScribeDB via
   the Spring Boot backend (/api/auth). When false, they fall
   back to mock data (current behaviour).

   This file references: backend/auth-sql.js (AuthSQL)
   This file is consumed by: scripts/api.js (API.Auth)
============================================================= */

'use strict';

const AuthDB = (() => {

    /* ----------------------------------------------------------
       CONFIGURATION
       Set DB_ENABLED to true once the backend API is available.
    ---------------------------------------------------------- */
    const DB_ENABLED = false;
    const API_BASE   = 'http://localhost:8080/api/auth';

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    /**
     * Get the current auth token from session storage.
     */
    function _token() {
        return sessionStorage.getItem('flexscribe_token') || '';
    }

    /**
     * Generic fetch wrapper for API calls.
     * @param {string} endpoint
     * @param {Object} options - fetch options
     * @returns {Promise<Object>}
     */
    async function _request(endpoint, options = {}) {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${_token()}`
            },
            ...options
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(err.message || `HTTP ${res.status}`);
        }

        return res.json();
    }

    /* ==========================================================
       ── REGISTRATION ──
       Each method maps to SQL statements from AuthSQL.
    ========================================================== */

    /**
     * Register a new user (creates Subscriber + MainMember + Wallet).
     * SQL: AuthSQL.CHECK_EMAIL_EXISTS       (check duplicate)
     *      AuthSQL.INSERT_SUBSCRIBER        (step 1)
     *      AuthSQL.INSERT_MAIN_MEMBER       (step 2)
     *      AuthSQL.INSERT_WALLET_FOR_NEW_USER (step 3)
     * Params: @firstName, @lastName, @email, @passwordHash, @phone, @marketingOptIn
     */
    async function register({ firstName, lastName, email, password, phone, marketingOptIn }) {
        if (!DB_ENABLED) return null; // fallback to mock

        return _request('/register', {
            method: 'POST',
            body: JSON.stringify({
                firstName,
                lastName,
                email,
                password,
                phone: phone || null,
                marketingOptIn: marketingOptIn || false
            })
        });
    }

    /**
     * Check if an email is already registered.
     * SQL: AuthSQL.CHECK_EMAIL_EXISTS
     * Params: @email
     */
    async function checkEmailExists(email) {
        if (!DB_ENABLED) return null;

        return _request('/check-email', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    /* ==========================================================
       ── LOGIN ──
    ========================================================== */

    /**
     * Authenticate a user with email and password.
     * SQL: AuthSQL.GET_USER_BY_EMAIL (retrieve user + verify hash)
     * Params: @email
     */
    async function login(email, password) {
        if (!DB_ENABLED) return null;

        const response = await _request('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        // Store token on successful login
        if (response && response.token) {
            sessionStorage.setItem('flexscribe_token', response.token);
        }

        return response;
    }

    /**
     * Get current user profile (from token).
     * SQL: AuthSQL.GET_USER_BY_ID
     * Params: @subscriberID (extracted from JWT)
     */
    async function getProfile() {
        if (!DB_ENABLED) return null;

        return _request('/profile', {
            method: 'GET'
        });
    }

    /* ==========================================================
       ── PROFILE EDITING ──
    ========================================================== */

    /**
     * Update user profile details (name, phone, avatar).
     * SQL: AuthSQL.UPDATE_SUBSCRIBER_PROFILE
     * Params: @subscriberID, @firstName, @lastName, @preferredName, @phone, @avatarUrl
     */
    async function updateProfile({ firstName, lastName, preferredName, phone, avatarUrl }) {
        if (!DB_ENABLED) return null;

        return _request('/profile', {
            method: 'PUT',
            body: JSON.stringify({
                firstName,
                lastName,
                preferredName: preferredName || null,
                phone: phone || null,
                avatarUrl: avatarUrl || null
            })
        });
    }

    /**
     * Update user email address.
     * SQL: AuthSQL.UPDATE_SUBSCRIBER_EMAIL
     * Params: @subscriberID, @currentEmail, @newEmail
     */
    async function updateEmail(currentEmail, newEmail) {
        if (!DB_ENABLED) return null;

        return _request('/profile/email', {
            method: 'PATCH',
            body: JSON.stringify({ currentEmail, newEmail })
        });
    }

    /**
     * Update user password.
     * SQL: AuthSQL.UPDATE_SUBSCRIBER_PASSWORD
     * Params: @subscriberID, @newPasswordHash
     */
    async function updatePassword(currentPassword, newPassword) {
        if (!DB_ENABLED) return null;

        return _request('/profile/password', {
            method: 'PATCH',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    }

    /**
     * Update marketing opt-in preference.
     * SQL: AuthSQL.UPDATE_MARKETING_OPTIN
     * Params: @subscriberID, @marketingOptIn
     */
    async function updateMarketingOptIn(marketingOptIn) {
        if (!DB_ENABLED) return null;

        return _request('/profile/marketing', {
            method: 'PATCH',
            body: JSON.stringify({ marketingOptIn })
        });
    }

    /**
     * Update main member financial details (income, plan).
     * SQL: AuthSQL.UPDATE_MAIN_MEMBER_DETAILS
     * Params: @subscriberID, @monthlyIncome, @planType
     */
    async function updateFinancialDetails({ monthlyIncome, planType }) {
        if (!DB_ENABLED) return null;

        return _request('/profile/financial', {
            method: 'PATCH',
            body: JSON.stringify({ monthlyIncome, planType })
        });
    }

    /* ==========================================================
       ── ACCOUNT DELETION ──
    ========================================================== */

    /**
     * Delete user account and all associated data.
     * SQL (executed in order):
     *   AuthSQL.DELETE_USER_NOTIFICATIONS        (step 1)
     *   AuthSQL.DELETE_USER_WALLET_TRANSACTIONS  (step 2)
     *   AuthSQL.DELETE_USER_WALLET               (step 3)
     *   AuthSQL.DELETE_USER_GOAL_CONTRIBUTIONS   (step 4)
     *   AuthSQL.DELETE_USER_GOALS                (step 5)
     *   AuthSQL.DELETE_USER_PAYMENT_SCHEDULES    (step 6)
     *   AuthSQL.DELETE_USER_SUBSCRIPTIONS        (step 7)
     *   AuthSQL.DELETE_USER_SCRIBE_SCORES        (step 8)
     *   AuthSQL.DELETE_USER_DEPENDANT_TASKS      (step 9)
     *   AuthSQL.DELETE_USER_DEPENDANTS           (step 10)
     *   AuthSQL.DELETE_MAIN_MEMBER               (step 11)
     *   AuthSQL.DELETE_SUBSCRIBER                (step 12)
     * Params: @subscriberID
     */
    async function deleteAccount(password) {
        if (!DB_ENABLED) return null;

        const response = await _request('/account', {
            method: 'DELETE',
            body: JSON.stringify({ password })
        });

        // Clear session on successful deletion
        sessionStorage.removeItem('flexscribe_token');

        return response;
    }

    /* ==========================================================
       ── SUPPLEMENTARY ──
    ========================================================== */

    /**
     * Get user's scribe score history.
     * SQL: AuthSQL.GET_SCRIBE_SCORES
     * Params: @subscriberID
     */
    async function getScribeScores() {
        if (!DB_ENABLED) return null;

        return _request('/scribe-scores', {
            method: 'GET'
        });
    }

    /**
     * Get user's current plan info.
     * SQL: AuthSQL.GET_USER_PLAN
     * Params: @subscriberID
     */
    async function getUserPlan() {
        if (!DB_ENABLED) return null;

        return _request('/plan', {
            method: 'GET'
        });
    }

    /**
     * Logout — clear session.
     */
    async function logout() {
        if (!DB_ENABLED) return null;

        try {
            await _request('/logout', { method: 'POST' });
        } catch { /* ignore logout errors */ }

        sessionStorage.removeItem('flexscribe_token');
    }

    /* ==========================================================
       ── UTILITY ──
    ========================================================== */

    /**
     * Check if database integration is active.
     */
    function isEnabled() {
        return DB_ENABLED;
    }

    /* ==========================================================
       PUBLIC API
    ========================================================== */
    return Object.freeze({
        isEnabled,

        // Registration
        register,
        checkEmailExists,

        // Login
        login,
        getProfile,

        // Profile editing
        updateProfile,
        updateEmail,
        updatePassword,
        updateMarketingOptIn,
        updateFinancialDetails,

        // Account deletion
        deleteAccount,

        // Supplementary
        getScribeScores,
        getUserPlan,
        logout,
    });

})();
