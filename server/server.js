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

// ── Block public access to sensitive server-side files ──
// The static handler below serves the whole project root, which would
// otherwise expose secrets over HTTP (the dev email log with invitation
// tokens, .env credentials, SQL migrations, the .git directory).
//
// IMPORTANT: the browser frontend legitimately loads client-side store
// scripts from /backend/*.js (DependantsStore, WalletStore, etc.), so we do
// NOT block the whole backend/ folder — only genuinely sensitive FILE TYPES
// and the server source folder, by extension/name. Deny these BEFORE
// express.static can serve them.
const BLOCKED_PATH_RE = /(^\/server\/)|(^\/\.git(\/|$))|(\.env($|\.))|(\.log$)|(\.sql$)|(\.sqlite\d?$)/i;
app.use((req, res, next) => {
    // Never block the API itself.
    if (req.path.startsWith('/api/')) return next();
    if (BLOCKED_PATH_RE.test(req.path)) {
        return res.status(404).send('Not found');
    }
    next();
});

// Serve static frontend files from project root
app.use(express.static(path.join(__dirname, '..')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/dependants', require('./routes/dependants'));
app.use('/api/me', require('./routes/me'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/bank-statements', require('./routes/bank-statements'));
app.use('/api/score', require('./routes/score'));

// Admin API — JWT + Admin role required for every route.
const { authenticateToken, requireAdmin } = require('./middleware/auth');
app.use('/api/admin', authenticateToken, requireAdmin, require('./routes/admin'));

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

/** Find this machine's first non-internal IPv4 address (for the LAN URL). */
function _lanIP() {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

// Start — bind 0.0.0.0 explicitly so other devices on the LAN can connect.
app.listen(PORT, '0.0.0.0', async () => {
    try {
        await getPool();

        // Auto-migrate: ensure avatarUrl can store data URIs
        try {
            const { query } = require('./db');
            await query("IF COL_LENGTH('Subscriber', 'avatarUrl') IS NOT NULL ALTER TABLE Subscriber ALTER COLUMN avatarUrl VARCHAR(MAX) NULL");
        } catch (e) { /* ignore if already done */ }

        const lan = _lanIP();
        console.log(`\nFlexScribe API running on port ${PORT} (all interfaces)`);
        console.log(`  On this PC:        http://localhost:${PORT}/pages/MASTER.html`);
        console.log(`  On other devices:  http://${lan}:${PORT}/pages/MASTER.html`);
        console.log(`  API health check:  http://${lan}:${PORT}/api/health\n`);

        // Start the notification scheduler (billing + reminders + summaries).
        // Guarded by DISABLE_SCHEDULER so tests / tooling can run the API
        // without the background cron firing. Only starts once the DB is up.
        if (process.env.DISABLE_SCHEDULER === 'true') {
            console.log('[scheduler] disabled via DISABLE_SCHEDULER=true');
        } else {
            try {
                require('./services/scheduler').start();
            } catch (e) {
                console.error('[scheduler] failed to start:', e.message);
            }
        }
    } catch (err) {
        console.error('Database connection failed:', err.message);
        console.log('Server running without database. Check your SQL Server.\n');
        console.log('[scheduler] not started (no database connection).');
    }
});
