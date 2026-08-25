/* ===========================================================
   /api/analytics — Spending analytics computed from real DB
=========================================================== */
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/analytics/summary?range=30d|90d|6m|12m
router.get('/summary', async (req, res) => {
    try {
        const days = _rangeToDays(req.query.range || '30d');
        const sid = req.user.subscriberID;

        // Total spent (debits from wallet in the period)
        const spent = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS totalSpent
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid
              AND t.transactionType IN ('debit', 'transfer')
              AND t.transactionDate >= DATEADD(DAY, -@days, GETDATE())
        `, { sid, days });

        // Total income (credits to wallet in the period)
        const income = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS totalIncome
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid
              AND t.transactionType = 'credit'
              AND t.transactionDate >= DATEADD(DAY, -@days, GETDATE())
        `, { sid, days });

        // Subscription monthly cost
        const subs = await query(`
            SELECT ISNULL(SUM(
                CASE billingCycle
                    WHEN 'weekly' THEN billingAmount * 4.33
                    WHEN 'monthly' THEN billingAmount
                    WHEN 'quarterly' THEN billingAmount / 3
                    WHEN 'yearly' THEN billingAmount / 12
                    ELSE billingAmount
                END
            ), 0) AS monthlyCost
            FROM Subscription
            WHERE subscriberID = @sid AND subStatus = 'active'
        `, { sid });

        // Active subscriptions count
        const subCount = await query(`
            SELECT COUNT(*) AS cnt FROM Subscription WHERE subscriberID = @sid AND subStatus = 'active'
        `, { sid });

        // Goals progress
        const goals = await query(`
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN goalStatus = 'completed' THEN 1 ELSE 0 END) AS completed,
                   ISNULL(SUM(currentProgress), 0) AS totalSaved,
                   ISNULL(SUM(targetAmount), 0) AS totalTarget
            FROM FinancialGoal WHERE subscriberID = @sid
        `, { sid });

        const totalSpent = parseFloat(spent.recordset[0].totalSpent);
        const totalIncome = parseFloat(income.recordset[0].totalIncome);
        const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalSpent) / totalIncome) * 100) : 0;

        const goalsData = goals.recordset[0];
        const goalProgressRate = parseFloat(goalsData.totalTarget) > 0
            ? Math.round((parseFloat(goalsData.totalSaved) / parseFloat(goalsData.totalTarget)) * 100)
            : 0;

        res.json({
            totalSpent,
            totalIncome,
            savingsRate,
            goalProgressRate,
            monthlyCost: parseFloat(subs.recordset[0].monthlyCost),
            activeSubscriptions: subCount.recordset[0].cnt,
            goals: goalsData
        });
    } catch (err) {
        console.error('Analytics summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/by-category?range=30d
router.get('/by-category', async (req, res) => {
    try {
        const sid = req.user.subscriberID;

        // Subscription spending by category
        const result = await query(`
            SELECT c.categoryName AS category,
                   SUM(
                       CASE s.billingCycle
                           WHEN 'weekly' THEN s.billingAmount * 4.33
                           WHEN 'monthly' THEN s.billingAmount
                           WHEN 'quarterly' THEN s.billingAmount / 3
                           WHEN 'yearly' THEN s.billingAmount / 12
                           ELSE s.billingAmount
                       END
                   ) AS monthlyAmount,
                   COUNT(*) AS count
            FROM Subscription s
            JOIN SubscriptionCategory c ON s.categoryID = c.categoryID
            WHERE s.subscriberID = @sid AND s.subStatus = 'active'
            GROUP BY c.categoryName
            ORDER BY monthlyAmount DESC
        `, { sid });

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/trend?range=6m
router.get('/trend', async (req, res) => {
    try {
        const sid = req.user.subscriberID;
        const months = req.query.range === '12m' ? 12 : 6;

        // Monthly spending trend from wallet transactions
        const result = await query(`
            SELECT
                FORMAT(t.transactionDate, 'yyyy-MM') AS month,
                SUM(CASE WHEN t.transactionType IN ('debit', 'transfer') THEN t.transactionAmount ELSE 0 END) AS spent,
                SUM(CASE WHEN t.transactionType = 'credit' THEN t.transactionAmount ELSE 0 END) AS income
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid
              AND t.transactionDate >= DATEADD(MONTH, -@months, GETDATE())
            GROUP BY FORMAT(t.transactionDate, 'yyyy-MM')
            ORDER BY month ASC
        `, { sid, months });

        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/insights
router.get('/insights', async (req, res) => {
    try {
        const sid = req.user.subscriberID;
        const insights = [];

        // Check for unused subscriptions (paused)
        const paused = await query(`
            SELECT COUNT(*) AS cnt FROM Subscription WHERE subscriberID = @sid AND subStatus = 'paused'
        `, { sid });
        if (paused.recordset[0].cnt > 0) {
            insights.push({
                type: 'tip',
                message: `You have ${paused.recordset[0].cnt} paused subscription(s). Consider cancelling them to save money.`
            });
        }

        // Goals progress insight
        const activeGoals = await query(`
            SELECT goalName, currentProgress, targetAmount
            FROM FinancialGoal WHERE subscriberID = @sid AND goalStatus = 'active'
        `, { sid });
        activeGoals.recordset.forEach(g => {
            const pct = parseFloat(g.targetAmount) > 0 ? Math.round((parseFloat(g.currentProgress) / parseFloat(g.targetAmount)) * 100) : 0;
            if (pct >= 75) {
                insights.push({ type: 'milestone', message: `Your "${g.goalName}" goal is ${pct}% complete! Almost there.` });
            }
        });

        // Wallet balance check
        const wallet = await query(`
            SELECT balance FROM VirtualWallet WHERE subscriberID = @sid
        `, { sid });
        if (wallet.recordset.length > 0 && parseFloat(wallet.recordset[0].balance) <= 0) {
            insights.push({ type: 'warning', message: 'Your wallet balance is empty. Consider adding funds.' });
        }

        res.json(insights);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function _rangeToDays(range) {
    switch (range) {
        case '7d': return 7;
        case '30d': return 30;
        case '90d': return 90;
        case '6m': return 180;
        case '12m': return 365;
        default: return 30;
    }
}

module.exports = router;
