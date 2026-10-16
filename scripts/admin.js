/* =============================================================
   FlexScribe Admin Panel — scripts/admin.js
   Live, database-driven admin dashboard. All data is fetched
   from the admin API (/api/admin/*), which is gated server-side
   to Admin users only. No mock data.
============================================================= */
'use strict';

/* ── API base + auth ── */
const ADMIN_API = (location.protocol === 'file:') ? 'http://localhost:3000/api' : '/api';

function _adminToken() {
    return sessionStorage.getItem('flexscribe_token') || '';
}

async function adminFetch(path) {
    const res = await fetch(ADMIN_API + path, {
        headers: { 'Authorization': 'Bearer ' + _adminToken() }
    });
    if (res.status === 401 || res.status === 403) {
        // Not an admin / not logged in → bounce to login.
        _adminError('You are not authorised to view the admin panel. Please sign in as an administrator.');
        setTimeout(() => { window.location.href = 'login.html'; }, 1800);
        throw new Error('unauthorised');
    }
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const json = await res.json();
    return json && json.data !== undefined ? json.data : json;
}

/* Live cache of fetched data (populated on load). */
const ADMIN = { dashboard: null, users: [], analytics: null, subscriptions: [], activity: [] };

/* ── Navigation ── */
function loadAdminPage(pageName) {
    document.querySelectorAll('.admin-panel').forEach(p => p.hidden = true);
    const target = document.getElementById('panel-' + pageName);
    if (target) target.hidden = false;

    document.getElementById('admin-page-title').textContent =
        pageName.charAt(0).toUpperCase() + pageName.slice(1);

    document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
    const active = document.querySelector('.admin-nav-item[data-page="' + pageName + '"]');
    if (active) active.classList.add('active');
}

document.querySelectorAll('.admin-nav-item[data-page]').forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        loadAdminPage(this.dataset.page);
    });
});

const _logoutBtn = document.getElementById('admin-logout');
if (_logoutBtn) _logoutBtn.addEventListener('click', function(e) {
    e.preventDefault();
    sessionStorage.removeItem('flexscribe_admin');
    sessionStorage.removeItem('flexscribe_token');
    window.location.href = '../landing.html';
});

/* ── Helpers ── */
function initials(name) {
    return (name || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
}
function formatRand(amount) {
    return 'R' + (parseFloat(amount) || 0).toLocaleString('en-ZA');
}
function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function statCard(icon, color, value, label, change) {
    return '<div class="admin-stat-card"><div class="admin-stat-icon ' + color + '"><i data-lucide="' + icon + '"></i></div><div class="admin-stat-info"><span class="admin-stat-label">' + _esc(label) + '</span><span class="admin-stat-value">' + _esc(value) + '</span><span class="admin-stat-change up">' + _esc(change) + '</span></div></div>';
}
function _setLoading(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div style="padding:20px;color:var(--text-light,#94969D);font-size:13px;">Loading…</div>';
}
function _adminError(msg) {
    if (typeof UIUtils !== 'undefined' && UIUtils.toast) UIUtils.toast(msg, 'error');
    else console.error(msg);
}
/* Prettier label for a plan value (Free/Premium/Business, or legacy). */
function _planLabel(plan) {
    if (!plan) return 'Free';
    return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/* ── Render Dashboard ── */
function renderDashboard() {
    const d = ADMIN.dashboard;
    if (!d) return;

    const statsRow = document.getElementById('stats-row');
    if (statsRow) {
        const pctActive = d.totalUsers > 0 ? Math.round(d.activeUsers / d.totalUsers * 100) : 0;
        statsRow.innerHTML =
            statCard('users', 'orange', d.totalUsers, 'Total Users', 'Registered members') +
            statCard('user-check', 'green', d.activeUsers, 'Active Users', pctActive + '% active (30d)') +
            statCard('repeat', 'purple', d.activeSubscriptions, 'Active Subscriptions', 'Across all users') +
            statCard('banknote', 'blue', formatRand(d.monthlyRevenue), 'Monthly Revenue', 'Active subscriptions');
    }

    const recentTable = document.getElementById('recent-users-table');
    if (recentTable) {
        const rows = (d.recentUsers || []).map(u =>
            '<tr><td><div class="admin-user-cell"><div class="admin-avatar">' + _esc(initials(u.name)) + '</div><div><div class="admin-user-name">' + _esc(u.name) + '</div><div class="admin-user-email">' + _esc(u.email) + '</div></div></div></td>' +
            '<td><span class="admin-badge ' + _esc(u.plan) + '">' + _esc(_planLabel(u.plan)) + '</span></td>' +
            '<td>' + _esc(u.joined) + '</td></tr>'
        ).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-light);padding:20px;">No users yet.</td></tr>';
        recentTable.innerHTML =
            '<table class="admin-table"><thead><tr><th>User</th><th>Plan</th><th>Joined</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    const chart = document.getElementById('activity-chart');
    if (chart) {
        const act = d.activity || [];
        const max = Math.max(1, ...act.map(x => x.value));
        chart.innerHTML = act.map(x =>
            '<div class="admin-chart-bar" style="height:' + (x.value / max * 100) + '%"><span class="admin-chart-bar-value">' + x.value + '</span><span class="admin-chart-bar-label">' + _esc(x.day) + '</span></div>'
        ).join('');
    }

    const revCards = document.getElementById('revenue-cards');
    if (revCards) {
        revCards.innerHTML = (d.revenueByPlan || []).map(p =>
            '<div class="admin-revenue-card"><div class="admin-revenue-value">' + formatRand(p.revenue) + '</div><div class="admin-revenue-label">' + _esc(_planLabel(p.plan)) + ' (' + p.users + ' users)</div></div>'
        ).join('') || '<div style="color:var(--text-light);font-size:13px;padding:10px;">No plan data.</div>';
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ── Render Users ── */
function renderUsers() {
    const users = ADMIN.users || [];
    const search = (document.getElementById('user-search')?.value || '').toLowerCase();
    const planFilter = document.getElementById('filter-plan')?.value || 'all';
    const statusFilter = document.getElementById('filter-status')?.value || 'all';

    const filtered = users.filter(u => {
        const matchSearch = u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
        const matchPlan = planFilter === 'all' || u.plan === planFilter.toLowerCase();
        const matchStatus = statusFilter === 'all' || u.status === statusFilter;
        return matchSearch && matchPlan && matchStatus;
    });

    const countEl = document.getElementById('user-count');
    if (countEl) countEl.textContent = filtered.length + ' users';

    const rows = filtered.map(u =>
        '<tr><td><div class="admin-user-cell"><div class="admin-avatar">' + _esc(initials(u.name)) + '</div><div><div class="admin-user-name">' + _esc(u.name) + '</div><div class="admin-user-email">' + _esc(u.email) + '</div></div></div></td>' +
        '<td><span class="admin-badge ' + _esc(u.plan) + '">' + _esc(_planLabel(u.plan)) + '</span></td>' +
        '<td><span class="admin-badge ' + _esc(u.status) + '">' + _esc(u.status) + '</span></td>' +
        '<td>' + u.subs + '</td>' +
        '<td>' + u.goals + '</td>' +
        '<td>' + formatRand(u.spent) + '</td>' +
        '<td>' + _esc(u.joined) + '</td></tr>'
    ).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:20px;">No users match.</td></tr>';

    const table = document.getElementById('users-table');
    if (table) table.innerHTML =
        '<table class="admin-table"><thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Subs</th><th>Goals</th><th>Spent</th><th>Joined</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ── Render Analytics ── */
function renderAnalytics() {
    const a = ADMIN.analytics;
    if (!a) return;

    const statsEl = document.getElementById('analytics-stats');
    if (statsEl) {
        statsEl.innerHTML =
            statCard('banknote', 'orange', formatRand(a.totalSpent), 'Total Spent (All Users)', 'All time') +
            statCard('target', 'green', a.goals.total, 'Total Goals', 'Across platform') +
            statCard('trending-up', 'purple', formatRand(a.avgSpent), 'Avg Spend per User', 'Per member') +
            statCard('users', 'blue', a.totalUsers, 'Total Accounts', 'Registered members');
    }

    const catEl = document.getElementById('category-breakdown');
    if (catEl) {
        catEl.innerHTML = (a.categories || []).map(c =>
            '<div class="admin-cat-row"><span class="admin-cat-dot" style="background:' + c.color + '"></span><span class="admin-cat-name">' + _esc(c.name) + '</span><div class="admin-cat-bar-wrap"><div class="admin-cat-bar" style="width:' + c.pct + '%;background:' + c.color + '"></div></div><span class="admin-cat-value">' + formatRand(c.amount) + '</span></div>'
        ).join('') || '<div style="color:var(--text-light);font-size:13px;padding:10px;">No subscription spend yet.</div>';
    }

    const goalsEl = document.getElementById('goals-stats');
    if (goalsEl) {
        const g = a.goals;
        goalsEl.innerHTML =
            '<div class="admin-goal-stat"><div class="admin-goal-stat-value">' + g.total + '</div><div class="admin-goal-stat-label">Total Goals</div></div>' +
            '<div class="admin-goal-stat"><div class="admin-goal-stat-value">' + g.completed + '</div><div class="admin-goal-stat-label">Completed</div></div>' +
            '<div class="admin-goal-stat"><div class="admin-goal-stat-value">' + g.inProgress + '</div><div class="admin-goal-stat-label">In Progress</div></div>' +
            '<div class="admin-goal-stat"><div class="admin-goal-stat-value">' + formatRand(g.totalSaved) + '</div><div class="admin-goal-stat-label">Total Saved</div></div>';
    }

    const topSubs = document.getElementById('top-subs-table');
    if (topSubs) {
        const rows = (ADMIN.subscriptions || []).slice(0, 8).map(s =>
            '<tr><td>' + _esc(s.name) + '</td><td>' + _esc(s.category) + '</td><td>' + s.users + '</td><td>' + formatRand(s.revenue) + '</td></tr>'
        ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:20px;">No subscriptions yet.</td></tr>';
        topSubs.innerHTML =
            '<table class="admin-table"><thead><tr><th>Service</th><th>Category</th><th>Users</th><th>Monthly Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    const growthEl = document.getElementById('growth-chart');
    if (growthEl) {
        const growth = a.growth || [];
        const maxV = Math.max(1, ...growth.map(x => x.value));
        growthEl.innerHTML = growth.map(x =>
            '<div class="admin-chart-bar" style="height:' + (x.value / maxV * 100) + '%"><span class="admin-chart-bar-value">' + x.value + '</span><span class="admin-chart-bar-label">' + _esc(x.month) + '</span></div>'
        ).join('');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ── Render Subscriptions ── */
function renderSubscriptions() {
    const subs = ADMIN.subscriptions || [];
    const totalUsers = subs.reduce((s, x) => s + x.users, 0);
    const totalRev = subs.reduce((s, x) => s + x.revenue, 0);

    const statsEl = document.getElementById('subs-stats');
    if (statsEl) {
        statsEl.innerHTML =
            statCard('repeat', 'orange', subs.length, 'Unique Services', 'Being tracked') +
            statCard('users', 'green', totalUsers, 'Active Subscriptions', 'Across all users') +
            statCard('banknote', 'blue', formatRand(totalRev), 'Monthly Revenue', 'From all subscriptions');
    }

    const table = document.getElementById('all-subs-table');
    if (table) {
        const rows = subs.map(s =>
            '<tr><td><strong>' + _esc(s.name) + '</strong></td><td>' + _esc(s.category) + '</td><td>' + s.users + ' users</td><td>' + formatRand(s.revenue) + '/mo</td></tr>'
        ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:20px;">No subscriptions yet.</td></tr>';
        table.innerHTML =
            '<table class="admin-table"><thead><tr><th>Service</th><th>Category</th><th>Users</th><th>Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ── Render Audit / Activity ── */
function renderAudit() {
    let logs = ADMIN.activity || [];
    const actionFilter = document.getElementById('filter-audit-action')?.value || 'all';
    if (actionFilter !== 'all') logs = logs.filter(l => l.action === actionFilter);

    const rows = logs.map(l =>
        '<tr><td style="white-space:nowrap;color:var(--text-light);font-size:12px">' + _esc(l.time) + '</td><td>' + _esc(l.user) + '</td><td><span class="admin-action-badge ' + _esc(l.action) + '">' + _esc(l.action) + '</span></td><td>' + _esc(l.detail) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:20px;">No recent activity.</td></tr>';

    const table = document.getElementById('audit-table');
    if (table) table.innerHTML =
        '<table class="admin-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ── Init: fetch everything from the DB, then render ── */
document.addEventListener('DOMContentLoaded', async function() {
    // Quick client guard (server still enforces the real gate).
    if (!_adminToken()) {
        _adminError('Please sign in as an administrator.');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }

    ['stats-row', 'recent-users-table', 'activity-chart', 'revenue-cards',
     'users-table', 'analytics-stats', 'category-breakdown', 'goals-stats',
     'top-subs-table', 'growth-chart', 'subs-stats', 'all-subs-table', 'audit-table'
    ].forEach(_setLoading);

    try {
        const [dashboard, users, analytics, subscriptions, activity] = await Promise.all([
            adminFetch('/admin/dashboard'),
            adminFetch('/admin/users'),
            adminFetch('/admin/analytics'),
            adminFetch('/admin/subscriptions'),
            adminFetch('/admin/activity')
        ]);
        ADMIN.dashboard = dashboard;
        ADMIN.users = users || [];
        ADMIN.analytics = analytics;
        ADMIN.subscriptions = subscriptions || [];
        ADMIN.activity = activity || [];

        renderDashboard();
        renderUsers();
        renderAnalytics();
        renderSubscriptions();
        renderAudit();

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        if (err && err.message !== 'unauthorised') {
            _adminError('Could not load admin data. Is the server running?');
            console.error('Admin load error:', err);
        }
        return;
    }

    // Search & filter events (operate on the already-fetched data).
    document.getElementById('user-search')?.addEventListener('input', renderUsers);
    document.getElementById('filter-plan')?.addEventListener('change', renderUsers);
    document.getElementById('filter-status')?.addEventListener('change', renderUsers);
    document.getElementById('filter-audit-action')?.addEventListener('change', renderAudit);
});
