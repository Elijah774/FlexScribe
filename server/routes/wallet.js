/* ===========================================================
   /api/wallet — Balance, transactions, add/withdraw/transfer
=========================================================== */
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { updateUserAnalytics } = require('../helpers/update-analytics');

const router = express.Router();
router.use(authenticateToken);

// GET /api/wallet
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT * FROM VirtualWallet WHERE subscriberID = @id
        `, { id: req.user.subscriberID });

        if (result.recordset.length === 0) return res.status(404).json({ error: 'Wallet not found' });
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/wallet/transactions
router.get('/transactions', async (req, res) => {
    try {
        const result = await query(`
            SELECT t.* FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @id
            ORDER BY t.transactionDate DESC
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/wallet/add-funds
router.post('/add-funds', async (req, res) => {
    try {
        const { amount, source } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

        // Get wallet
        const wallet = await query('SELECT walletID, balance FROM VirtualWallet WHERE subscriberID = @id', { id: req.user.subscriberID });
        if (wallet.recordset.length === 0) return res.status(404).json({ error: 'Wallet not found' });

        const w = wallet.recordset[0];
        const newBalance = parseFloat(w.balance) + parseFloat(amount);

        // Update balance
        await query('UPDATE VirtualWallet SET balance = @bal, lastTopUpDate = GETDATE() WHERE walletID = @wid', { bal: newBalance, wid: w.walletID });

        // Record transaction
        await query(`
            INSERT INTO WalletTransaction (walletID, transactionType, transactionAmount, runningBalance, description, category)
            VALUES (@wid, 'credit', @amount, @bal, @desc, 'deposit')
        `, { wid: w.walletID, amount, bal: newBalance, desc: 'Funds added via ' + (source || 'Bank Card') });

        res.json({ message: 'Funds added', balance: newBalance });
        updateUserAnalytics(req.user.subscriberID);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/wallet/withdraw
router.post('/withdraw', async (req, res) => {
    try {
        const { amount, destination } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

        const wallet = await query('SELECT walletID, balance FROM VirtualWallet WHERE subscriberID = @id', { id: req.user.subscriberID });
        if (wallet.recordset.length === 0) return res.status(404).json({ error: 'Wallet not found' });

        const w = wallet.recordset[0];
        if (parseFloat(w.balance) < parseFloat(amount)) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        const newBalance = parseFloat(w.balance) - parseFloat(amount);
        await query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid', { bal: newBalance, wid: w.walletID });

        await query(`
            INSERT INTO WalletTransaction (walletID, transactionType, transactionAmount, runningBalance, description, category)
            VALUES (@wid, 'debit', @amount, @bal, @desc, 'withdrawal')
        `, { wid: w.walletID, amount, bal: newBalance, desc: 'Withdrawal to ' + (destination || 'Bank Account') });

        res.json({ message: 'Withdrawal successful', balance: newBalance });
        updateUserAnalytics(req.user.subscriberID);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/wallet/transfer-to-goal
router.post('/transfer-to-goal', async (req, res) => {
    try {
        const { amount, goalID } = req.body;
        if (!amount || amount <= 0 || !goalID) return res.status(400).json({ error: 'Amount and goalID required' });

        const wallet = await query('SELECT walletID, balance FROM VirtualWallet WHERE subscriberID = @id', { id: req.user.subscriberID });
        const w = wallet.recordset[0];
        if (parseFloat(w.balance) < parseFloat(amount)) return res.status(400).json({ error: 'Insufficient balance' });

        const newBalance = parseFloat(w.balance) - parseFloat(amount);
        await query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid', { bal: newBalance, wid: w.walletID });

        // Add to goal
        await query('UPDATE FinancialGoal SET currentProgress = currentProgress + @amount, lastTopUpDate = GETDATE() WHERE goalID = @gid', { amount, gid: goalID });

        // Record contribution
        await query('INSERT INTO GoalContribution (goalID, amount, source) VALUES (@gid, @amt, @src)', { gid: goalID, amt: amount, src: 'wallet' });

        // Record transaction
        const goal = await query('SELECT goalName FROM FinancialGoal WHERE goalID = @gid', { gid: goalID });
        const goalName = goal.recordset[0]?.goalName || 'Goal';
        await query(`
            INSERT INTO WalletTransaction (walletID, goalID, transactionType, transactionAmount, runningBalance, description, category)
            VALUES (@wid, @gid, 'transfer', @amount, @bal, @desc, 'transfer')
        `, { wid: w.walletID, gid: goalID, amount, bal: newBalance, desc: 'Transfer to ' + goalName });

        res.json({ message: 'Transferred to goal', balance: newBalance });
        updateUserAnalytics(req.user.subscriberID);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
