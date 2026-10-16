/* ===========================================================
   /api/admin — Admin dashboard data (real DB, read-only)
   -----------------------------------------------------------
   All routes require a valid JWT AND userType === 'Admin'
   (enforced by authenticateToken + requireAdmin mounted in
   server.js). Every figure here is computed from the live
   database — there is NO mock data.
=========================================================== */
'use strict';

const express = require('express');
const { query } = require('../db');

const router = express.Router();

/* Per-plan monthly price (ZAR) used for the revenue estimate.
   MainMember.planType is one of Free / Premium / Business. */
const PLAN_PRICE = { Free: 0, Premium: 299, Business: 499 };

/* Category → colour map for the analytics breakdown (UI-side). */
const CATEGORY_COLORS = {
    Entertainment: '#FF7A29', Music: '#6FDB8F', Shopping: '#94969D',
    Productivity: '#A77CFF', Education: '#FFB65C', Utilities: '#5BC8FF',
    Fitness: '#6FDB8F', News: '#A3ABB8', Gaming: '#E36565', Health: '#6FDB8F',
    AI: '#A77CFF', Other: '#E36565'
};

/** Normalise a billing amount to its monthly-equivalent value. */
function _monthly(amount, cycle) {
    const a = parseFloat(amount) || 0;
    switch (cycle) {
        case 'weekly':    return a * 52 / 12;
        case 'quarterly': return a / 3;
        case 'yearly':    return a / 12;
        default:          return a;
    }
}

/* ----------------------------------------------------------
   GET /api/admin/dashboard
   Stat cards + recent users + 7-day activity + revenue by plan.
---------------------------------------------------------- */
router.get('/dashboard', async (req, res) => {
    try {
        // Total + recent users (exclude admins + dependants from the member count).
        const totalRes = await query(
            "SELECT COUNT(*) AS n FROM Subscriber WHERE userType NOT IN ('Admin')"
        );
        const totalUsers = totalRes.recordset[0].n || 0;

        // "Active" = had a wallet transaction in the last 30 days (derived,
        // since there is no status/lastLogin column).
        const activeRes = await query(`
            SELECT COUNT(DISTINCT w.subscriberID) AS n
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE t.transactionDate >= DATEADD(DAY, -30, GETDATE())
        `);
        const activeUsers = activeRes.recordset[0].n || 0;

        // Active subscriptions across the platform.
        const subsRes = await query(
            "SELECT COUNT(*) AS n FROM Subscription WHERE subStatus = 'active'"
        );
        const activeSubscriptions = subsRes.recordset[0].n || 0;

        // Monthly revenue from active subscriptions (monthly-normalised).
        const revRes = await query(`
            SELECT ISNULL(SUM(
                CASE billingCycle
                    WHEN 'weekly' THEN billingAmount * 52 / 12
                    WHEN 'quarterly' THEN billingAmount / 3
                    WHEN 'yearly' THEN billingAmount / 12
                    ELSE billingAmount
                END), 0) AS total
            FROM Subscription WHERE subStatus = 'active'
        `);
        const monthlyRevenue = Math.round(parseFloat(revRes.recordset[0].total) || 0);

        // Recent users (last 5).
        const recentRes = await query(`
            SELECT TOP 5 s.subscriberID, s.firstName, s.lastName, s.email, s.createdAt,
                   ISNULL(m.planType, 'Free') AS planType
            FROM Subscriber s
            LEFT JOIN MainMember m ON m.mainMemberID = s.subscriberID
            WHERE s.userType NOT IN ('Admin')
            ORDER BY s.createdAt DESC
        `);
        const recentUsers = recentRes.recordset.map(r => ({
            name: `${r.firstName} ${r.lastName}`.trim(),
            email: r.email,
            plan: (r.planType || 'Free').toLowerCase(),
            joined: r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : ''
        }));

        // 7-day activity: transaction count per day (last 7 days).
        const actRes = await query(`
            SELECT CAST(t.transactionDate AS DATE) AS d, COUNT(*) AS n
            FROM WalletTransaction t
            WHERE t.transactionDate >= DATEADD(DAY, -6, CAST(GETDATE() AS DATE))
            GROUP BY CAST(t.transactionDate AS DATE)
        `);
        const actMap = {};
        actRes.recordset.forEach(r => { actMap[new Date(r.d).toISOString().slice(0, 10)] = r.n; });
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const activity = [];
        for (let i = 6; i >= 0; i--) {
            const dt = new Date(); dt.setDate(dt.getDate() - i);
            const key = dt.toISOString().slice(0, 10);
            activity.push({ day: dayNames[dt.getDay()], value: actMap[key] || 0 });
        }

        // Revenue by plan.
        const planRes = await query(`
            SELECT ISNULL(planType, 'Free') AS planType, COUNT(*) AS n
            FROM MainMember GROUP BY planType
        `);
        const revenueByPlan = planRes.recordset.map(r => ({
            plan: r.planType,
            users: r.n,
            revenue: (r.n || 0) * (PLAN_PRICE[r.planType] || 0)
        }));

        res.json({
            success: true,
            data: {
                totalUsers,
                activeUsers,
                activeSubscriptions,
                monthlyRevenue,
                recentUsers,
                activity,
                revenueByPlan
            }
        });
    } catch (err) {
        console.error('GET /api/admin/dashboard error:', err.message);
        res.status(500).json({ success: false, error: 'Could not load admin dashboard.' });
    }
});

/* ----------------------------------------------------------
   GET /api/admin/users
   Per-user rows: plan, subs count, goals count, spent, joined.
---------------------------------------------------------- */
router.get('/users', async (req, res) => {
    try {
        const result = await query(`
            SELECT s.subscriberID, s.firstName, s.lastName, s.email, s.createdAt,
                   ISNULL(m.planType, 'Free') AS planType,
                   (SELECT COUNT(*) FROM Subscription sub WHERE sub.subscriberID = s.subscriberID) AS subs,
                   (SELECT COUNT(*) FROM FinancialGoal g WHERE g.subscriberID = s.subscriberID) AS goals,
                   ISNULL((
                       SELECT SUM(t.transactionAmount)
                       FROM WalletTransaction t
                       JOIN VirtualWallet w ON t.walletID = w.walletID
                       WHERE w.subscriberID = s.subscriberID
                         AND t.transactionType IN ('debit', 'transfer')
                   ), 0) AS spent,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM WalletTransaction t2
                       JOIN VirtualWallet w2 ON t2.walletID = w2.walletID
                       WHERE w2.subscriberID = s.subscriberID
                         AND t2.transactionDate >= DATEADD(DAY, -30, GETDATE())
                   ) THEN 'active' ELSE 'inactive' END AS status
            FROM Subscriber s
            LEFT JOIN MainMember m ON m.mainMemberID = s.subscriberID
            WHERE s.userType NOT IN ('Admin')
            ORDER BY s.createdAt DESC
        `);
        const users = result.recordset.map(r => ({
            id: r.subscriberID,
            name: `${r.firstName} ${r.lastName}`.trim(),
            email: r.email,
            plan: (r.planType || 'Free').toLowerCase(),
            status: r.status,
            subs: r.subs || 0,
            goals: r.goals || 0,
            spent: Math.round(parseFloat(r.spent) || 0),
            joined: r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : ''
        }));
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('GET /api/admin/users error:', err.message);
        res.status(500).json({ success: false, error: 'Could not load users.' });
    }
});

/* ----------------------------------------------------------
   GET /api/admin/analytics
   Spend-by-category, goals stats, monthly user growth.
---------------------------------------------------------- */
router.get('/analytics', async (req, res) => {
    try {
        // Spend by subscription category (monthly-normalised, active subs).
        const catRes = await query(`
            SELECT c.categoryName,
                   SUM(CASE s.billingCycle
                        WHEN 'weekly' THEN s.billingAmount * 52 / 12
                        WHEN 'quarterly' THEN s.billingAmount / 3
                        WHEN 'yearly' THEN s.billingAmount / 12
                        ELSE s.billingAmount END) AS amount
            FROM Subscription s
            JOIN SubscriptionCategory c ON s.categoryID = c.categoryID
            WHERE s.subStatus = 'active'
            GROUP BY c.categoryName
            ORDER BY amount DESC
        `);
        const catRows = catRes.recordset.map(r => ({
            name: r.categoryName,
            amount: Math.round(parseFloat(r.amount) || 0)
        }));
        const catTotal = catRows.reduce((s, c) => s + c.amount, 0);
        const categories = catRows.map(c => ({
            name: c.name,
            amount: c.amount,
            pct: catTotal > 0 ? Math.round((c.amount / catTotal) * 100) : 0,
            color: CATEGORY_COLORS[c.name] || CATEGORY_COLORS.Other
        }));

        // Goals stats.
        const goalsRes = await query(`
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN goalStatus = 'completed' THEN 1 ELSE 0 END) AS completed,
                   SUM(CASE WHEN goalStatus = 'active' THEN 1 ELSE 0 END) AS inProgress,
                   ISNULL(SUM(currentProgress), 0) AS totalSaved
            FROM FinancialGoal
        `);
        const g = goalsRes.recordset[0];
        const goals = {
            total: g.total || 0,
            completed: g.completed || 0,
            inProgress: g.inProgress || 0,
            totalSaved: Math.round(parseFloat(g.totalSaved) || 0)
        };

        // Platform spend + averages.
        const spendRes = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS totalSpent
            FROM WalletTransaction t
            WHERE t.transactionType IN ('debit', 'transfer')
        `);
        const totalSpent = Math.round(parseFloat(spendRes.recordset[0].totalSpent) || 0);
        const userCountRes = await query("SELECT COUNT(*) AS n FROM Subscriber WHERE userType NOT IN ('Admin')");
        const totalUsers = userCountRes.recordset[0].n || 0;
        const avgSpent = totalUsers > 0 ? Math.round(totalSpent / totalUsers) : 0;

        // Monthly user growth (last 6 months).
        const growthRes = await query(`
            SELECT FORMAT(createdAt, 'yyyy-MM') AS ym, COUNT(*) AS n
            FROM Subscriber
            WHERE userType NOT IN ('Admin')
              AND createdAt >= DATEADD(MONTH, -5, CAST(GETDATE() AS DATE))
            GROUP BY FORMAT(createdAt, 'yyyy-MM')
        `);
        const growthMap = {};
        growthRes.recordset.forEach(r => { growthMap[r.ym] = r.n; });
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const growth = [];
        let cumulative = Math.max(0, totalUsers - growthRes.recordset.reduce((s, r) => s + r.n, 0));
        for (let i = 5; i >= 0; i--) {
            const dt = new Date(); dt.setMonth(dt.getMonth() - i);
            const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            cumulative += (growthMap[ym] || 0);
            growth.push({ month: monthNames[dt.getMonth()], value: cumulative });
        }

        res.json({
            success: true,
            data: { categories, goals, totalSpent, avgSpent, totalUsers, growth }
        });
    } catch (err) {
        console.error('GET /api/admin/analytics error:', err.message);
        res.status(500).json({ success: false, error: 'Could not load analytics.' });
    }
});

/* ----------------------------------------------------------
   GET /api/admin/subscriptions
   Top services by #users + monthly revenue.
---------------------------------------------------------- */
router.get('/subscriptions', async (req, res) => {
    try {
        const result = await query(`
            SELECT s.serviceName, c.categoryName,
                   COUNT(*) AS users,
                   SUM(CASE s.billingCycle
                        WHEN 'weekly' THEN s.billingAmount * 52 / 12
                        WHEN 'quarterly' THEN s.billingAmount / 3
                        WHEN 'yearly' THEN s.billingAmount / 12
                        ELSE s.billingAmount END) AS revenue
            FROM Subscription s
            JOIN SubscriptionCategory c ON s.categoryID = c.categoryID
            WHERE s.subStatus = 'active'
            GROUP BY s.serviceName, c.categoryName
            ORDER BY users DESC, revenue DESC
        `);
        const subscriptions = result.recordset.map(r => ({
            name: r.serviceName,
            category: r.categoryName,
            users: r.users || 0,
            revenue: Math.round(parseFloat(r.revenue) || 0)
        }));
        res.json({ success: true, data: subscriptions });
    } catch (err) {
        console.error('GET /api/admin/subscriptions error:', err.message);
        res.status(500).json({ success: false, error: 'Could not load subscriptions.' });
    }
});

/* ----------------------------------------------------------
   GET /api/admin/activity
   Recent activity feed derived from real events (there is no
   dedicated audit table). UNION of: new registrations, new
   subscriptions, new goals, and wallet transactions.
---------------------------------------------------------- */
router.get('/activity', async (req, res) => {
    try {
        const result = await query(`
            SELECT TOP 40 * FROM (
                SELECT s.createdAt AS ts, (s.firstName + ' ' + s.lastName) AS userName,
                       'register' AS action, 'New account registered' AS detail
                FROM Subscriber s WHERE s.userType NOT IN ('Admin')

                UNION ALL
                SELECT sub.createdAt, (s.firstName + ' ' + s.lastName),
                       'create', ('Added subscription ' + sub.serviceName)
                FROM Subscription sub
                JOIN Subscriber s ON s.subscriberID = sub.subscriberID

                UNION ALL
                SELECT g.createdAt, (s.firstName + ' ' + s.lastName),
                       'create', ('Created goal "' + g.goalName + '"')
                FROM FinancialGoal g
                JOIN Subscriber s ON s.subscriberID = g.subscriberID

                UNION ALL
                SELECT t.transactionDate, (s.firstName + ' ' + s.lastName),
                       'update', ISNULL(t.description, (t.transactionType + ' transaction'))
                FROM WalletTransaction t
                JOIN VirtualWallet w ON t.walletID = w.walletID
                JOIN Subscriber s ON s.subscriberID = w.subscriberID
            ) feed
            ORDER BY ts DESC
        `);
        const logs = result.recordset.map(r => ({
            time: r.ts ? new Date(r.ts).toISOString().replace('T', ' ').slice(0, 16) : '',
            user: (r.userName || '').trim() || 'User',
            action: r.action,
            detail: r.detail || ''
        }));
        res.json({ success: true, data: logs });
    } catch (err) {
        console.error('GET /api/admin/activity error:', err.message);
        res.status(500).json({ success: false, error: 'Could not load activity.' });
    }
});

module.exports = router;
