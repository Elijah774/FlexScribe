/* ===========================================================
   /api/analytics — Spending analytics computed from real DB
=========================================================== */
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

/* -----------------------------------------------------------
   Spending definition — "Option A: true spending"
   Money that is actually consumed (not saved or moved):
     • Allowances sent to dependants   (category 'dependant')
     • Task rewards paid               (category 'task-reward')
     • Subscription payments           (category 'subscription')
   Deliberately excludes goal transfers, user transfers and
   withdrawals (money retained). Anchored on the purpose
   `category` tag, which is the stable classifier. The
   predicate below is shared by /summary (Total Spent) and
   /spending-breakdown so the two always reconcile.
----------------------------------------------------------- */
// SQL fragment restricting rows to spending outflows by purpose category.
// Only counts completed (or legacy NULL-status) transactions so pending/failed
// items don't inflate totals. Shared by /summary (Total Spent) and
// /spending-breakdown so the two always reconcile.
const SPENDING_PREDICATE = `
    t.category IN ('dependant', 'task-reward', 'subscription')
    AND (t.status = 'completed' OR t.status IS NULL)
`;

// Friendly labels for each spending category code.
const SPENDING_LABELS = {
    'dependant':    'Allowances',
    'task-reward':  'Task Rewards',
    'subscription': 'Subscriptions'
};

// GET /api/analytics/summary?range=thisMonth|lastMonth|last3Months (legacy: 30d|90d|6m|12m)
router.get('/summary', async (req, res) => {
    try {
        const sid = req.user.subscriberID;
        const { startSql, endSql } = _rangeToWindow(req.query.range);

        // Total spent — "true spending" (money consumed): allowances sent,
        // task rewards paid, and subscription payments. Excludes goal transfers,
        // user transfers and withdrawals (money retained, not spent). Scoped to
        // the window [start, end): inclusive of start, exclusive of end.
        // Window bounds are SQL expressions on GETDATE() so they share the DB
        // clock with transactionDate. Uses the same predicate as
        // /spending-breakdown so the two reconcile.
        const spent = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS totalSpent
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid
              AND ${SPENDING_PREDICATE}
              AND t.transactionDate >= ${startSql}
              AND t.transactionDate < ${endSql}
        `, { sid });

        // Total income (credits to wallet within the window)
        const income = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS totalIncome
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid
              AND t.transactionType = 'credit'
              AND t.transactionDate >= ${startSql}
              AND t.transactionDate < ${endSql}
        `, { sid });

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

        // Goals progress
        const goals = await query(`
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN goalStatus = 'completed' THEN 1 ELSE 0 END) AS completed,
                   ISNULL(SUM(currentProgress), 0) AS totalSaved,
                   ISNULL(SUM(targetAmount), 0) AS totalTarget
            FROM FinancialGoal WHERE subscriberID = @sid
        `, { sid });

        // Wallet balance (for the savings-buffer / runway factor).
        const walletRes = await query(
            'SELECT ISNULL(balance, 0) AS balance FROM VirtualWallet WHERE subscriberID = @sid',
            { sid }
        );
        const balance = walletRes.recordset.length ? parseFloat(walletRes.recordset[0].balance) : 0;

        // Broader income basis for the risk factors — top-ups AND money
        // received from other users, over the selected window. Using only
        // 'credit' here made the ratio factors collapse to 0 for anyone who
        // doesn't top up heavily, so we include 'transfer_in' too (mirrors how
        // the wallet trends endpoint defines income).
        const riskIncomeRes = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS inc
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid
              AND t.transactionType IN ('credit', 'transfer_in')
              AND t.transactionDate >= ${startSql}
              AND t.transactionDate < ${endSql}
        `, { sid });
        const riskIncome = parseFloat(riskIncomeRes.recordset[0].inc);

        const totalSpent = parseFloat(spent.recordset[0].totalSpent);
        const totalIncome = parseFloat(income.recordset[0].totalIncome);
        const monthlyCost = parseFloat(subs.recordset[0].monthlyCost);

        const goalsData = goals.recordset[0];
        const totalSaved = parseFloat(goalsData.totalSaved);
        const totalTarget = parseFloat(goalsData.totalTarget);
        const goalProgressRate = totalTarget > 0
            ? Math.round((totalSaved / totalTarget) * 100)
            : 0;

        // ── Risk factors — computed live (not read from stored ScribeScore,
        //    which can be stale/zero). Each is a 0–100 "health" sub-score; the
        //    risk is 100 minus their average. No-data cases default to 50
        //    ("unknown") so a brand-new user isn't shown as 0 or 100.
        const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

        const subscriptionPct = riskIncome > 0
            ? clamp((1 - (monthlyCost / riskIncome)) * 100)
            : (monthlyCost === 0 ? 100 : 50);

        const budgetPct = riskIncome > 0
            ? clamp((1 - (totalSpent / riskIncome)) * 100)
            : (totalSpent === 0 ? 100 : 50);

        const savingsPct = totalTarget > 0
            ? clamp((totalSaved / totalTarget) * 100)
            : 50;

        // Savings buffer (runway): how many months the wallet balance covers
        // at the current spend. 3+ months of cover = full marks.
        const RUNWAY_TARGET_MONTHS = 3;
        const bufferPct = totalSpent > 0
            ? clamp(((balance / totalSpent) / RUNWAY_TARGET_MONTHS) * 100)
            : (balance > 0 ? 100 : 50);

        const health = (subscriptionPct + budgetPct + savingsPct + bufferPct) / 4;
        const riskScore = clamp(100 - health);

        res.json({
            range: _rangeKey(req.query.range),
            totalSpent,
            totalIncome,
            goalProgressRate,
            riskScore,
            riskBreakdown: {
                subscriptionPct,
                budgetPct,
                savingsPct,
                bufferPct
            },
            monthlyCost,
            goals: goalsData
        });
    } catch (err) {
        console.error('Analytics summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analytics/spending-breakdown?range=thisMonth|lastMonth|last3Months
// "Where your money goes" — groups true-spending outflows (allowances, task
// rewards, subscriptions) by purpose within the selected window. The sum of the
// returned slices equals /summary's totalSpent for the same range.
router.get('/spending-breakdown', async (req, res) => {
    try {
        const sid = req.user.subscriberID;
        const { startSql, endSql } = _rangeToWindow(req.query.range);

        const result = await query(`
            SELECT t.category AS category,
                   ISNULL(SUM(t.transactionAmount), 0) AS amount,
                   COUNT(*) AS txns
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid
              AND ${SPENDING_PREDICATE}
              AND t.transactionDate >= ${startSql}
              AND t.transactionDate < ${endSql}
            GROUP BY t.category
            ORDER BY amount DESC
        `, { sid });

        const rows = result.recordset.map(r => ({
            category: r.category,
            label: SPENDING_LABELS[r.category] || 'Other',
            amount: parseFloat(r.amount) || 0,
            txns: r.txns
        }));

        const total = rows.reduce((s, r) => s + r.amount, 0);
        const breakdown = rows.map(r => ({
            ...r,
            pct: total > 0 ? Math.round((r.amount / total) * 100) : 0
        }));

        res.json({
            range: _rangeKey(req.query.range),
            total,
            breakdown
        });
    } catch (err) {
        console.error('Analytics spending-breakdown error:', err);
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

// Normalise an incoming range value to one of the canonical keys. Accepts the
// new calendar keys and the legacy day/month keys for backward compatibility.
function _rangeKey(range) {
    switch (range) {
        case 'thisMonth':
        case 'lastMonth':
        case 'last3Months':
            return range;
        // Legacy mappings
        case '90d':
        case '6m':
            return 'last3Months';
        case 'lastMonth30':
            return 'lastMonth';
        case '30d':
        case '7d':
        case '12m':
        default:
            return 'thisMonth';
    }
}

// Translate a range key into a concrete [start, end) date window, expressed as
// SQL expressions evaluated by SQL Server itself.
//
// IMPORTANT: these MUST be computed on the DB clock (GETDATE()), not with a JS
// `new Date()`. transactionDate is stored in SQL server-local time, so a JS
// window boundary (which the driver treats as UTC) would be offset by the
// server's timezone and silently exclude recent rows. Keeping start/end and
// the stored timestamps all on GETDATE() guarantees they line up.
//
//   thisMonth   → 1st of current month 00:00        ..  now
//   lastMonth   → 1st of previous month 00:00       ..  1st of current month 00:00
//   last3Months → 1st of the month two months ago   ..  now
//
// `startOfMonth(n)` = midnight on the 1st of the month `n` months before the
// current month, in SQL. Returns { start, end } as raw SQL expression strings.
function _rangeToWindow(range) {
    const key = _rangeKey(range);
    const startOfMonth = n =>
        `DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) - ${n}, 0)`;

    if (key === 'lastMonth') {
        return { startSql: startOfMonth(1), endSql: startOfMonth(0) };
    }
    if (key === 'last3Months') {
        return { startSql: startOfMonth(2), endSql: 'GETDATE()' };
    }
    // thisMonth (default)
    return { startSql: startOfMonth(0), endSql: 'GETDATE()' };
}

module.exports = router;
