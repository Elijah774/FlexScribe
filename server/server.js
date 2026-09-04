/* ===========================================================
   server.js — FlexScribe Express API
   Serves the frontend and provides REST endpoints for
   subscriptions, wallet, goals, dependants, notifications.
=========================================================== */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from project root
app.use(express.static(path.join(__dirname, '..')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/dependants', require('./routes/dependants'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/bank-statements', require('./routes/bank-statements'));

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await getPool();
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// SPA fallback — serve landing page for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'landing.html'));
});

// Start
app.listen(PORT, async () => {
    try {
        await getPool();

        // Auto-migrate: ensure avatarUrl can store data URIs
        try {
            const { query } = require('./db');
            await query("IF COL_LENGTH('Subscriber', 'avatarUrl') IS NOT NULL ALTER TABLE Subscriber ALTER COLUMN avatarUrl VARCHAR(MAX) NULL");
        } catch (e) { /* ignore if already done */ }

        console.log(`\nFlexScribe API running on http://localhost:${PORT}`);
        console.log(`Frontend: http://localhost:${PORT}/landing.html`);
        console.log(`App:      http://localhost:${PORT}/pages/MASTER.html\n`);
    } catch (err) {
        console.error('Database connection failed:', err.message);
        console.log('Server running without database. Check your SQL Server.\n');
    }
});
