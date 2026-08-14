/* =============================================================
   FlexScribe Admin Panel — scripts/admin.js
   Handles navigation, renders mock data, search/filter.
============================================================= */
'use strict';

/* ── Mock Data ── */
const ADMIN_DATA = {
    users: [
        { id: 1, name: 'Sarah Mitchell', email: 'sarah.m@gmail.com',     plan: 'professional', status: 'active',   joined: '2024-01-15', subs: 6, goals: 3, spent: 2890 },
        { id: 2, name: 'John Dlamini',   email: 'john.d@outlook.com',    plan: 'family',       status: 'active',   joined: '2024-02-01', subs: 4, goals: 2, spent: 1540 },
        { id: 3, name: 'Lisa Khumalo',   email: 'lisa.k@gmail.com',      plan: 'professional', status: 'active',   joined: '2024-03-10', subs: 5, goals: 4, spent: 3200 },
        { id: 4, name: 'Tom Williams',   email: 'tom.w@gmail.com',       plan: 'individual',   status: 'inactive', joined: '2024-04-05', subs: 2, goals: 1, spent: 450 },
        { id: 5, name: 'Amanda Nkosi',   email: 'amanda.n@hotmail.com',  plan: 'family',       status: 'active',   joined: '2024-05-20', subs: 7, goals: 5, spent: 4100 },
        { id: 6, name: 'Mike Roberts',   email: 'mike.r@yahoo.com',      plan: 'individual',   status: 'active',   joined: '2024-06-12', subs: 3, goals: 2, spent: 890 },
        { id: 7, name: 'Zanele Moyo',    email: 'zanele.m@gmail.com',    plan: 'professional', status: 'active',   joined: '2024-07-08', subs: 8, goals: 3, spent: 2670 },
        { id: 8, name: 'David Chen',     email: 'david.c@gmail.com',     plan: 'individual',   status: 'active',   joined: '2024-08-22', subs: 4, goals: 1, spent: 720 },
        { id: 9, name: 'Priya Patel',    email: 'priya.p@outlook.com',   plan: 'professional', status: 'active',   joined: '2024-09-14', subs: 6, goals: 4, spent: 3450 },
        { id: 10, name: 'James Fourie',  email: 'james.f@gmail.com',     plan: 'family',       status: 'inactive', joined: '2024-10-03', subs: 5, goals: 2, spent: 1890 },
        { id: 11, name: 'Nomsa Sithole', email: 'nomsa.s@gmail.com',     plan: 'individual',   status: 'active',   joined: '2025-01-10', subs: 2, goals: 1, spent: 340 },
        { id: 12, name: 'Ryan October',  email: 'ryan.o@hotmail.com',    plan: 'professional', status: 'active',   joined: '2025-02-18', subs: 9, goals: 5, spent: 4800 },
    ],

    subscriptions: [
        { name: 'Netflix',        users: 89,  revenue: 17711, category: 'Entertainment' },
        { name: 'Spotify',        users: 72,  revenue: 4319,  category: 'Music' },
        { name: 'Disney+',        users: 45,  revenue: 4005,  category: 'Entertainment' },
        { name: 'YouTube Premium',users: 38,  revenue: 3002,  category: 'Entertainment' },
        { name: 'Amazon Prime',   users: 34,  revenue: 3366,  category: 'Shopping' },
        { name: 'Microsoft 365',  users: 28,  revenue: 2772,  category: 'Productivity' },
        { name: 'ChatGPT Plus',   users: 22,  revenue: 6600,  category: 'Productivity' },
        { name: 'Apple Music',    users: 19,  revenue: 1710,  category: 'Music' },
    ],

    auditLogs: [
        { time: 'Today, 10:42',      user: 'Admin',          action: 'login',    detail: 'Admin login from Chrome, Windows' },
        { time: 'Today, 09:15',      user: 'Sarah Mitchell', action: 'create',   detail: 'Created goal "Holiday Savings"' },
        { time: 'Today, 08:30',      user: 'John Dlamini',   action: 'update',   detail: 'Added dependant Grace Dlamini' },
        { time: 'Yesterday, 16:45',  user: 'Lisa Khumalo',   action: 'update',   detail: 'Updated Netflix subscription to R219' },
        { time: 'Yesterday, 14:20',  user: 'Tom Williams',   action: 'login',    detail: 'Login from Safari, iPhone' },
        { time: 'Yesterday, 11:05',  user: 'Amanda Nkosi',   action: 'create',   detail: 'Added subscription ChatGPT Plus' },
        { time: '2 days ago',        user: 'Mike Roberts',   action: 'delete',   detail: 'Deleted subscription Disney+' },
        { time: '2 days ago',        user: 'Zanele Moyo',    action: 'register', detail: 'New account registered' },
        { time: '3 days ago',        user: 'David Chen',     action: 'update',   detail: 'Changed plan from Individual to Professional' },
        { time: '3 days ago',        user: 'Priya Patel',    action: 'create',   detail: 'Created goal "New Car Fund"' },
    ],

    activity: [
        { day: 'Mon', value: 42 },
        { day: 'Tue', value: 58 },
        { day: 'Wed', value: 35 },
        { day: 'Thu', value: 71 },
        { day: 'Fri', value: 63 },
        { day: 'Sat', value: 29 },
        { day: 'Sun', value: 18 },
    ],

    categories: [
        { name: 'Entertainment', amount: 48500, pct: 38, color: '#FF8A34' },
        { name: 'Music',         amount: 22100, pct: 17, color: '#B9F15B' },
        { name: 'Shopping',      amount: 18900, pct: 15, color: '#3B82F6' },
        { name: 'Productivity',  amount: 15400, pct: 12, color: '#A77CFF' },
        { name: 'Utilities',     amount: 12200, pct: 10, color: '#FACC15' },
        { name: 'Other',         amount: 10300, pct: 8,  color: '#F87171' },
    ]
};

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

document.getElementById('admin-logout').addEventListener('click', function(e) {
    e.preventDefault();
    sessionStorage.removeItem('flexscribe_admin');
    sessionStorage.removeItem('flexscribe_token');
    window.location.href = '../landing.html';
});

/* ── Helpers ── */
function initials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase();
}

function formatRand(amount) {
    return 'R' + amount.toLocaleString('en-ZA');
}

/* ── Render Dashboard ── */
function renderDashboard() {
    var users = ADMIN_DATA.users;
    var activeUsers = users.filter(u => u.status === 'active').length;
    var totalRevenue = users.length * 249; // avg plan price
    var totalSubs = ADMIN_DATA.subscriptions.reduce((sum, s) => sum + s.users, 0);

    // Stats
    document.getElementById('stats-row').innerHTML =
        statCard('users', 'orange', users.length, 'Total Users', '+3 this month') +
        statCard('user-check', 'green', activeUsers, 'Active Users', Math.round(activeUsers/users.length*100) + '% active') +
        statCard('repeat', 'purple', totalSubs, 'Active Subscriptions', 'Across all users') +
        statCard('banknote', 'blue', formatRand(totalRevenue), 'Monthly Revenue', 'All plans combined');

    // Recent users table
    var recent = users.slice(-5).reverse();
    var rows = recent.map(u =>
        '<tr><td><div class="admin-user-cell"><div class="admin-avatar">' + initials(u.name) + '</div><div><div class="admin-user-name">' + u.name + '</div><div class="admin-user-email">' + u.email + '</div></div></div></td>' +
        '<td><span class="admin-badge ' + u.plan + '">' + u.plan + '</span></td>' +
        '<td><span class="admin-badge ' + u.status + '">' + u.status + '</span></td>' +
        '<td>' + u.joined + '</td></tr>'
    ).join('');
    document.getElementById('recent-users-table').innerHTML =
        '<table class="admin-table"><thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Joined</th></tr></thead><tbody>' + rows + '</tbody></table>';

    // Activity chart
    var max = Math.max(...ADMIN_DATA.activity.map(d => d.value));
    var bars = ADMIN_DATA.activity.map(d =>
        '<div class="admin-chart-bar" style="height:' + (d.value/max*100) + '%"><span class="admin-chart-bar-value">' + d.value + '</span><span class="admin-chart-bar-label">' + d.day + '</span></div>'
    ).join('');
    document.getElementById('activity-chart').innerHTML = bars;

    // Revenue cards
    var indivCount = users.filter(u => u.plan === 'individual').length;
    var proCount = users.filter(u => u.plan === 'professional').length;
    var famCount = users.filter(u => u.plan === 'family').length;
    document.getElementById('revenue-cards').innerHTML =
        '<div class="admin-revenue-card"><div class="admin-revenue-value">' + formatRand(indivCount * 149) + '</div><div class="admin-revenue-label">Individual (' + indivCount + ' users)</div></div>' +
        '<div class="admin-revenue-card"><div class="admin-revenue-value">' + formatRand(proCount * 299) + '</div><div class="admin-revenue-label">Professional (' + proCount + ' users)</div></div>' +
        '<div class="admin-revenue-card"><div class="admin-revenue-value">' + formatRand(famCount * 499) + '</div><div class="admin-revenue-label">Family (' + famCount + ' users)</div></div>';
}

function statCard(icon, color, value, label, change) {
    return '<div class="admin-stat-card"><div class="admin-stat-icon ' + color + '"><i data-lucide="' + icon + '"></i></div><div class="admin-stat-info"><span class="admin-stat-label">' + label + '</span><span class="admin-stat-value">' + value + '</span><span class="admin-stat-change up">' + change + '</span></div></div>';
}

/* ── Render Users ── */
function renderUsers(filter) {
    var users = ADMIN_DATA.users;
    var search = (document.getElementById('user-search')?.value || '').toLowerCase();
    var planFilter = document.getElementById('filter-plan')?.value || 'all';
    var statusFilter = document.getElementById('filter-status')?.value || 'all';

    var filtered = users.filter(u => {
        var matchSearch = u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search);
        var matchPlan = planFilter === 'all' || u.plan === planFilter;
        var matchStatus = statusFilter === 'all' || u.status === statusFilter;
        return matchSearch && matchPlan && matchStatus;
    });

    document.getElementById('user-count').textContent = filtered.length + ' users';

    var rows = filtered.map(u =>
        '<tr><td><div class="admin-user-cell"><div class="admin-avatar">' + initials(u.name) + '</div><div><div class="admin-user-name">' + u.name + '</div><div class="admin-user-email">' + u.email + '</div></div></div></td>' +
        '<td><span class="admin-badge ' + u.plan + '">' + u.plan + '</span></td>' +
        '<td><span class="admin-badge ' + u.status + '">' + u.status + '</span></td>' +
        '<td>' + u.subs + '</td>' +
        '<td>' + u.goals + '</td>' +
        '<td>' + formatRand(u.spent) + '</td>' +
        '<td>' + u.joined + '</td></tr>'
    ).join('');

    document.getElementById('users-table').innerHTML =
        '<table class="admin-table"><thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Subs</th><th>Goals</th><th>Spent</th><th>Joined</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ── Render Analytics ── */
function renderAnalytics() {
    var users = ADMIN_DATA.users;
    var totalSpent = users.reduce((s, u) => s + u.spent, 0);
    var totalGoals = users.reduce((s, u) => s + u.goals, 0);
    var avgSpent = Math.round(totalSpent / users.length);

    document.getElementById('analytics-stats').innerHTML =
        statCard('banknote', 'orange', formatRand(totalSpent), 'Total Spent (All Users)', 'This month') +
        statCard('target', 'green', totalGoals, 'Total Goals', 'Across platform') +
        statCard('trending-up', 'purple', formatRand(avgSpent), 'Avg Spend per User', 'Monthly average') +
        statCard('users', 'blue', users.length, 'Total Accounts', activeCount(users) + ' active');

    // Categories
    var catHTML = ADMIN_DATA.categories.map(c =>
        '<div class="admin-cat-row"><span class="admin-cat-dot" style="background:' + c.color + '"></span><span class="admin-cat-name">' + c.name + '</span><div class="admin-cat-bar-wrap"><div class="admin-cat-bar" style="width:' + c.pct + '%;background:' + c.color + '"></div></div><span class="admin-cat-value">' + formatRand(c.amount) + '</span></div>'
    ).join('');
    document.getElementById('category-breakdown').innerHTML = catHTML;

    // Goals
    var completed = 12;
    var inProgress = totalGoals - completed;
    document.getElementById('goals-stats').innerHTML =
        '<div class="admin-goal-stat"><div class="admin-goal-stat-value">' + totalGoals + '</div><div class="admin-goal-stat-label">Total Goals</div></div>' +
        '<div class="admin-goal-stat"><div class="admin-goal-stat-value">' + completed + '</div><div class="admin-goal-stat-label">Completed</div></div>' +
        '<div class="admin-goal-stat"><div class="admin-goal-stat-value">' + inProgress + '</div><div class="admin-goal-stat-label">In Progress</div></div>' +
        '<div class="admin-goal-stat"><div class="admin-goal-stat-value">R142,500</div><div class="admin-goal-stat-label">Total Saved</div></div>';

    // Top subs
    var subsRows = ADMIN_DATA.subscriptions.map(s =>
        '<tr><td>' + s.name + '</td><td>' + s.category + '</td><td>' + s.users + '</td><td>' + formatRand(s.revenue) + '</td></tr>'
    ).join('');
    document.getElementById('top-subs-table').innerHTML =
        '<table class="admin-table"><thead><tr><th>Service</th><th>Category</th><th>Users</th><th>Monthly Revenue</th></tr></thead><tbody>' + subsRows + '</tbody></table>';

    // Growth chart
    var months = ['Jan','Feb','Mar','Apr','May','Jun'];
    var values = [82, 97, 110, 125, 138, 153];
    var maxV = Math.max(...values);
    var growthBars = months.map((m, i) =>
        '<div class="admin-chart-bar" style="height:' + (values[i]/maxV*100) + '%"><span class="admin-chart-bar-value">' + values[i] + '</span><span class="admin-chart-bar-label">' + m + '</span></div>'
    ).join('');
    document.getElementById('growth-chart').innerHTML = growthBars;
}

function activeCount(users) { return users.filter(u => u.status === 'active').length; }

/* ── Render Subscriptions ── */
function renderSubscriptions() {
    var totalUsers = ADMIN_DATA.subscriptions.reduce((s, sub) => s + sub.users, 0);
    var totalRev = ADMIN_DATA.subscriptions.reduce((s, sub) => s + sub.revenue, 0);

    document.getElementById('subs-stats').innerHTML =
        statCard('repeat', 'orange', ADMIN_DATA.subscriptions.length, 'Unique Services', 'Being tracked') +
        statCard('users', 'green', totalUsers, 'Active Subscriptions', 'Across all users') +
        statCard('banknote', 'blue', formatRand(totalRev), 'Monthly Revenue', 'From all subscriptions');

    var rows = ADMIN_DATA.subscriptions.map(s =>
        '<tr><td><strong>' + s.name + '</strong></td><td>' + s.category + '</td><td>' + s.users + ' users</td><td>' + formatRand(s.revenue) + '/mo</td></tr>'
    ).join('');
    document.getElementById('all-subs-table').innerHTML =
        '<table class="admin-table"><thead><tr><th>Service</th><th>Category</th><th>Users</th><th>Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ── Render Audit Logs ── */
function renderAudit(filter) {
    var logs = ADMIN_DATA.auditLogs;
    var actionFilter = document.getElementById('filter-audit-action')?.value || 'all';

    if (actionFilter !== 'all') {
        logs = logs.filter(l => l.action === actionFilter);
    }

    var rows = logs.map(l =>
        '<tr><td style="white-space:nowrap;color:var(--text-light);font-size:12px">' + l.time + '</td><td>' + l.user + '</td><td><span class="admin-action-badge ' + l.action + '">' + l.action + '</span></td><td>' + l.detail + '</td></tr>'
    ).join('');
    document.getElementById('audit-table').innerHTML =
        '<table class="admin-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', function() {
    renderDashboard();
    renderUsers();
    renderAnalytics();
    renderSubscriptions();
    renderAudit();

    // Re-render lucide icons after dynamic content
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Search & filter events
    document.getElementById('user-search')?.addEventListener('input', renderUsers);
    document.getElementById('filter-plan')?.addEventListener('change', renderUsers);
    document.getElementById('filter-status')?.addEventListener('change', renderUsers);
    document.getElementById('filter-audit-action')?.addEventListener('change', renderAudit);
});
