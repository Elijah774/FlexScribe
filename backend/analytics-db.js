/* =============================================================
   FlexScribe — Analytics Database Service
   backend/analytics-db.js

   Integration layer that connects AnalyticsSQL statements to
   the AnalyticsUI. When DB_ENABLED is true, these methods
   execute real queries against FlexScribeDB via the Spring Boot
   backend (/api/analytics). When false, they fall back to the
   inline seed data in analytics-ui.js (current behaviour).

   This file references: backend/analytics-sql.js (AnalyticsSQL)
   This file is consumed by: scripts/analytics-ui.js (AnalyticsUI)
============================================================= */

'use strict';

const AnalyticsDB = (() => {

    /* ----------------------------------------------------------
       CONFIGURATION
       Set DB_ENABLED to true once the backend API is available.
    ---------------------------------------------------------- */
    const DB_ENABLED = false;
    const API_BASE   = 'http://localhost:8080/api/analytics';

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

    /**
     * Build query string params for date range.
     * @param {string} range - 'thisMonth' | 'lastMonth' | 'last3Months'
     * @returns {string} query string
     */
    function _buildRangeParams(range) {
        const now = new Date();
        let startDate, endDate;

        switch (range) {
            case 'lastMonth': {
                const firstOfCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(firstOfCurrent.getTime() - 1); // last day of prev month
                startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
                break;
            }
            case 'last3Months': {
                endDate = now;
                startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                break;
            }
            case 'thisMonth':
            default: {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = now;
                break;
            }
        }

        const fmt = (d) => d.toISOString().slice(0, 10);
        return `startDate=${fmt(startDate)}&endDate=${fmt(endDate)}`;
    }

    /* ==========================================================
       ── SUMMARY STATISTICS ──
    ========================================================== */

    /**
     * Get summary stats (total spent, income, savings rate).
     * SQL: AnalyticsSQL.GET_SUMMARY
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range - 'thisMonth' | 'lastMonth' | 'last3Months'
     */
    async function getSummary(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/summary?${_buildRangeParams(range)}`);
    }

    /* ==========================================================
       ── SPENDING BY CATEGORY ──
    ========================================================== */

    /**
     * Get spending breakdown by subscription category.
     * SQL: AnalyticsSQL.GET_SPENDING_BY_CATEGORY
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range
     */
    async function getSpendingByCategory(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/spending-by-category?${_buildRangeParams(range)}`);
    }

    /**
     * Get spending breakdown using transaction category field.
     * SQL: AnalyticsSQL.GET_SPENDING_BY_TRANSACTION_CATEGORY
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range
     */
    async function getSpendingByTransactionCategory(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/spending-by-txn-category?${_buildRangeParams(range)}`);
    }

    /* ==========================================================
       ── MONTHLY TRENDS ──
    ========================================================== */

    /**
     * Get monthly spending trend (last 6 months).
     * SQL: AnalyticsSQL.GET_MONTHLY_TREND
     * Params: @subscriberID, @trendStartDate, @endDate
     */
    async function getMonthlyTrend() {
        if (!DB_ENABLED) return null;

        return _request('/monthly-trend');
    }

    /**
     * Get monthly income trend (last 6 months).
     * SQL: AnalyticsSQL.GET_MONTHLY_INCOME_TREND
     * Params: @subscriberID, @trendStartDate, @endDate
     */
    async function getMonthlyIncomeTrend() {
        if (!DB_ENABLED) return null;

        return _request('/monthly-income-trend');
    }

    /* ==========================================================
       ── TOP MERCHANTS ──
    ========================================================== */

    /**
     * Get top merchants by total spend.
     * SQL: AnalyticsSQL.GET_TOP_MERCHANTS
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range
     */
    async function getTopMerchants(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/top-merchants?${_buildRangeParams(range)}`);
    }

    /* ==========================================================
       ── BUDGET VS ACTUAL ──
    ========================================================== */

    /**
     * Get actual spending per category for budget comparison.
     * SQL: AnalyticsSQL.GET_ACTUAL_SPENDING_PER_CATEGORY
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range
     */
    async function getBudgetVsActual(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/budget-vs-actual?${_buildRangeParams(range)}`);
    }

    /* ==========================================================
       ── SUBSCRIPTION ANALYTICS ──
    ========================================================== */

    /**
     * Get total active subscription costs.
     * SQL: AnalyticsSQL.GET_TOTAL_SUBSCRIPTION_COSTS
     * Params: @subscriberID
     */
    async function getSubscriptionCosts() {
        if (!DB_ENABLED) return null;

        return _request('/subscription-costs');
    }

    /**
     * Get subscription spending history per service.
     * SQL: AnalyticsSQL.GET_SUBSCRIPTION_SPENDING_HISTORY
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range
     */
    async function getSubscriptionHistory(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/subscription-history?${_buildRangeParams(range)}`);
    }

    /**
     * Get month-over-month spending comparison.
     * SQL: AnalyticsSQL.GET_MONTH_OVER_MONTH_COMPARISON
     * Params: @subscriberID, @currentMonthStart, @currentMonthEnd,
     *         @previousMonthStart, @previousMonthEnd
     */
    async function getMonthOverMonthComparison() {
        if (!DB_ENABLED) return null;

        return _request('/month-comparison');
    }

    /**
     * Get average daily spending.
     * SQL: AnalyticsSQL.GET_AVERAGE_DAILY_SPENDING
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range
     */
    async function getAverageDailySpending(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/average-daily?${_buildRangeParams(range)}`);
    }

    /**
     * Get transaction frequency breakdown.
     * SQL: AnalyticsSQL.GET_TRANSACTION_FREQUENCY
     * Params: @subscriberID, @startDate, @endDate
     * @param {string} range
     */
    async function getTransactionFrequency(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        return _request(`/transaction-frequency?${_buildRangeParams(range)}`);
    }

    /* ==========================================================
       ── GOAL ANALYTICS ──
    ========================================================== */

    /**
     * Get goal progress summary.
     * SQL: AnalyticsSQL.GET_GOAL_PROGRESS_SUMMARY
     * Params: @subscriberID
     */
    async function getGoalProgressSummary() {
        if (!DB_ENABLED) return null;

        return _request('/goal-progress');
    }

    /**
     * Get monthly goal contributions.
     * SQL: AnalyticsSQL.GET_MONTHLY_GOAL_CONTRIBUTIONS
     * Params: @subscriberID, @trendStartDate, @endDate
     */
    async function getMonthlyGoalContributions() {
        if (!DB_ENABLED) return null;

        return _request('/goal-contributions');
    }

    /* ==========================================================
       ── COMBINED FETCH (convenience) ──
       Fetches all data needed for the analytics panel in one go.
    ========================================================== */

    /**
     * Fetch all analytics data for a given range.
     * Returns null if DB is disabled (use seed data).
     * @param {string} range - 'thisMonth' | 'lastMonth' | 'last3Months'
     * @returns {Promise<Object|null>}
     */
    async function getFullAnalytics(range = 'thisMonth') {
        if (!DB_ENABLED) return null;

        try {
            const [summary, byCategory, monthlyTrend, topMerchants, budgetVsActual] = await Promise.all([
                getSummary(range),
                getSpendingByCategory(range),
                getMonthlyTrend(),
                getTopMerchants(range),
                getBudgetVsActual(range)
            ]);

            return {
                totalSpent: summary.totalSpent,
                totalIncome: summary.totalIncome,
                savingsRate: summary.savingsRate,
                byCategory: byCategory,
                monthlyTrend: monthlyTrend,
                topMerchants: topMerchants,
                budgets: budgetVsActual
            };
        } catch (err) {
            console.warn('AnalyticsDB: Failed to fetch analytics', err);
            return null;
        }
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

        // Summary
        getSummary,

        // Spending by category
        getSpendingByCategory,
        getSpendingByTransactionCategory,

        // Monthly trends
        getMonthlyTrend,
        getMonthlyIncomeTrend,

        // Top merchants
        getTopMerchants,

        // Budget vs actual
        getBudgetVsActual,

        // Subscription analytics
        getSubscriptionCosts,
        getSubscriptionHistory,
        getMonthOverMonthComparison,
        getAverageDailySpending,
        getTransactionFrequency,

        // Goal analytics
        getGoalProgressSummary,
        getMonthlyGoalContributions,

        // Combined fetch
        getFullAnalytics,
    });

})();
