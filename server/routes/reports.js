/* ===========================================================
   /api/reports — Compile & list financial reports
   /api/bank-statements — Upload & parse bank statements
=========================================================== */
const express = require('express');
const multer = require('multer');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════
// POST /api/reports/compile — Generate a financial report
// ══════════════════════════════════════════════════════════════
router.post('/compile', async (req, res) => {
    try {
        const { period, reportType } = req.body;
        const subID = req.user.subscriberID;

        // Determine date range
        let endDate = new Date();
        let startDate = new Date();
        switch (period) {
            case 'Last Month': startDate.setMonth(startDate.getMonth() - 1); startDate.setDate(1); endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0); break;
            case 'Last 3 Months': startDate.setMonth(startDate.getMonth() - 3); break;
            case 'Last 6 Months': startDate.setMonth(startDate.getMonth() - 6); break;
            case 'This Year': startDate = new Date(endDate.getFullYear(), 0, 1); break;
            default: startDate.setDate(1); // This Month
        }
        const startStr = startDate.toISOString().slice(0, 10);
        const endStr = endDate.toISOString().slice(0, 10);

        // Wallet balance
        const walletResult = await query('SELECT walletID, balance FROM VirtualWallet WHERE subscriberID = @id', { id: subID });
        const balance = walletResult.recordset.length > 0 ? walletResult.recordset[0].balance : 0;
        const walletID = walletResult.recordset.length > 0 ? walletResult.recordset[0].walletID : null;

        // Subscription cost
        const subResult = await query('SELECT ISNULL(SUM(billingAmount), 0) AS total FROM Subscription WHERE subscriberID = @id AND subStatus = \'active\'', { id: subID });
        const totalSubCost = subResult.recordset[0].total || 0;

        // Transactions in date range
        let totalWithdrawals = 0, totalIncome = 0, transactions = [];
        if (walletID) {
            const txResult = await query(`
                SELECT transactionType, transactionAmount, transactionDate, description, category
                FROM WalletTransaction
                WHERE walletID = @wid AND transactionDate BETWEEN @start AND @end
                ORDER BY transactionDate DESC
            `, { wid: walletID, start: startStr, end: endStr });
            txResult.recordset.forEach(t => {
                if (t.transactionType === 'credit') totalIncome += (parseFloat(t.transactionAmount) || 0);
                else totalWithdrawals += (parseFloat(t.transactionAmount) || 0);
                transactions.push({ type: t.transactionType, amount: parseFloat(t.transactionAmount) || 0, date: t.transactionDate ? new Date(t.transactionDate).toISOString().slice(0, 10) : '', description: t.description || '', category: t.category || '' });
            });
        }
        const savings = totalIncome - totalWithdrawals;

        // Goals progress
        const goalsResult = await query('SELECT goalName, targetAmount, currentProgress FROM FinancialGoal WHERE subscriberID = @id', { id: subID });
        const goals = goalsResult.recordset.map(g => ({ name: g.goalName, target: parseFloat(g.targetAmount) || 0, saved: parseFloat(g.currentProgress) || 0, pct: g.targetAmount > 0 ? Math.round((g.currentProgress / g.targetAmount) * 100) : 0 }));

        // Categories
        const catResult = await query(`
            SELECT sc.categoryName, SUM(s.billingAmount) AS total
            FROM Subscription s JOIN SubscriptionCategory sc ON s.categoryID = sc.categoryID
            WHERE s.subscriberID = @id AND s.subStatus = 'active'
            GROUP BY sc.categoryName ORDER BY total DESC
        `, { id: subID });
        const categories = catResult.recordset.map(c => ({ category: c.categoryName, amount: parseFloat(c.total) || 0 }));

        // ScribeScore
        const scoreResult = await query('SELECT TOP 1 scoreValue FROM ScribeScore WHERE subscriberID = @id ORDER BY generatedAt DESC', { id: subID });
        const scribeScore = scoreResult.recordset.length > 0 ? scoreResult.recordset[0].scoreValue : 0;

        // Risk level
        let riskLevel = 'low';
        if (totalIncome > 0) { const sr = savings / totalIncome; if (sr < 0) riskLevel = 'high'; else if (sr < 0.1) riskLevel = 'medium'; }
        else if (totalWithdrawals > 0) riskLevel = 'high';

        // Store the report in FinancialReport table
        // Ensure MainMember record exists
        const mmCheck = await query('SELECT mainMemberID FROM MainMember WHERE mainMemberID = @id', { id: subID });
        if (mmCheck.recordset.length === 0) await query('INSERT INTO MainMember (mainMemberID) VALUES (@id)', { id: subID });

        const insertResult = await query(`
            INSERT INTO FinancialReport (mainMemberID, startDate, endDate, totalSubscriptionCost, totalWithdrawals, remainingBalance, riskLevel, income, expenses, savings, riskFlagStatus, createdAt)
            OUTPUT INSERTED.reportID
            VALUES (@id, @start, @end, @subCost, @withdrawals, @balance, @risk, @income, @expenses, @savings, @risk, GETDATE())
        `, { id: subID, start: startStr, end: endStr, subCost: totalSubCost, withdrawals: totalWithdrawals, balance: balance, risk: riskLevel, income: totalIncome, expenses: totalWithdrawals, savings: savings });

        const reportID = insertResult.recordset[0].reportID;

        res.status(201).json({
            success: true,
            data: {
                reportID,
                period: { start: startStr, end: endStr },
                reportType: reportType || 'Detailed',
                walletBalance: parseFloat(balance) || 0,
                totalSubscriptionCost: parseFloat(totalSubCost) || 0,
                totalWithdrawals,
                totalIncome,
                savings,
                riskLevel,
                scribeScore,
                goals,
                categories,
                transactions: transactions.slice(0, 50),
                transactionCount: transactions.length
            }
        });
    } catch (error) {
        console.error('Compile report error:', error);
        res.status(500).json({ success: false, message: 'Could not compile report: ' + error.message });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /api/reports — List generated reports
// ══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT reportID, startDate, endDate, totalSubscriptionCost, totalWithdrawals, remainingBalance, riskLevel, income, expenses, savings
            FROM FinancialReport WHERE mainMemberID = @id ORDER BY endDate DESC
        `, { id: req.user.subscriberID });
        const data = result.recordset.map(r => ({
            id: r.reportID,
            startDate: r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : '',
            endDate: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : '',
            totalSubscriptionCost: parseFloat(r.totalSubscriptionCost) || 0,
            totalWithdrawals: parseFloat(r.totalWithdrawals) || 0,
            balance: parseFloat(r.remainingBalance) || 0,
            riskLevel: r.riskLevel || 'low',
            income: parseFloat(r.income) || 0,
            expenses: parseFloat(r.expenses) || 0,
            savings: parseFloat(r.savings) || 0
        }));
        res.json({ success: true, data });
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ success: false, message: 'Could not retrieve reports' });
    }
});

module.exports = router;
