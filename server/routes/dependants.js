/* ===========================================================
   /api/dependants — Manage dependant accounts
=========================================================== */
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/dependants
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT d.*, s.firstName, s.lastName, s.email, s.avatarUrl
            FROM Dependant d
            JOIN Subscriber s ON d.dependantID = s.subscriberID
            WHERE d.mainMemberID = @id
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/dependants
router.post('/', async (req, res) => {
    try {
        const { firstName, lastName, email, relationship, allowance, spendingLimit } = req.body;
        if (!firstName || !email) return res.status(400).json({ error: 'Name and email are required' });

        // Create subscriber record for dependant
        const passwordHash = await bcrypt.hash('temp_' + Date.now(), 10);
        const sub = await query(`
            INSERT INTO Subscriber (firstName, lastName, email, passwordHash, userType)
            OUTPUT INSERTED.subscriberID
            VALUES (@fn, @ln, @email, @hash, 'Dependant')
        `, { fn: firstName, ln: lastName || '', email, hash: passwordHash });

        const depID = sub.recordset[0].subscriberID;

        // Create dependant record
        await query(`
            INSERT INTO Dependant (dependantID, mainMemberID, relationship, allowance, spendingLimit)
            VALUES (@did, @mid, @rel, @allowance, @limit)
        `, { did: depID, mid: req.user.subscriberID, rel: relationship || null, allowance: allowance || 0, limit: spendingLimit || null });

        res.status(201).json({ message: 'Dependant added', dependantID: depID });
    } catch (err) {
        if (err.message.includes('UQ_Subscriber_Email')) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dependants/:id
router.put('/:id', async (req, res) => {
    try {
        const { relationship, allowance, spendingLimit, status } = req.body;
        await query(`
            UPDATE Dependant SET
                relationship = ISNULL(@rel, relationship),
                allowance = ISNULL(@allowance, allowance),
                spendingLimit = @limit,
                status = ISNULL(@status, status)
            WHERE dependantID = @did AND mainMemberID = @mid
        `, { did: parseInt(req.params.id), mid: req.user.subscriberID, rel: relationship, allowance, limit: spendingLimit || null, status });

        res.json({ message: 'Dependant updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/dependants/:id
router.delete('/:id', async (req, res) => {
    try {
        await query('DELETE FROM Dependant WHERE dependantID = @did AND mainMemberID = @mid', { did: parseInt(req.params.id), mid: req.user.subscriberID });
        res.json({ message: 'Dependant removed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/dependants/:id/send-allowance
router.post('/:id/send-allowance', async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

        // Debit from main member's wallet
        const wallet = await query('SELECT walletID, balance FROM VirtualWallet WHERE subscriberID = @id', { id: req.user.subscriberID });
        if (wallet.recordset.length === 0) return res.status(404).json({ error: 'Wallet not found' });

        const w = wallet.recordset[0];
        if (parseFloat(w.balance) < parseFloat(amount)) return res.status(400).json({ error: 'Insufficient balance' });

        const newBalance = parseFloat(w.balance) - parseFloat(amount);
        await query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid', { bal: newBalance, wid: w.walletID });

        // Record transaction
        await query(`
            INSERT INTO WalletTransaction (walletID, dependantID, transactionType, transactionAmount, runningBalance, description, category)
            VALUES (@wid, @did, 'debit', @amount, @bal, @desc, 'dependant')
        `, { wid: w.walletID, did: parseInt(req.params.id), amount, bal: newBalance, desc: 'Allowance sent' });

        res.json({ message: 'Allowance sent', balance: newBalance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
