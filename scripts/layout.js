/* ===========================================================
   THEME TOGGLE
   The app is dark by default — no class needed on <body>.
   Clicking the toggle switches to light mode by adding
   body.light-mode, which overrides the :root dark tokens.
   Preference persists to localStorage as "light" or "dark".
=========================================================== */

const themeToggle = document.getElementById("theme-toggle");

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("light-mode");

        localStorage.setItem(
            "theme",
            document.body.classList.contains("light-mode") ? "light" : "dark"
        );
    });
}

// Restore saved preference on load
// Default is dark, so only act when user explicitly chose light
if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-mode");
}

// One-time migration: old code stored "dark" and added dark-mode class.
// Remove any stale dark-mode class so it doesn't interfere.
document.body.classList.remove("dark-mode");

/* ===========================================================
   HEADER DROPDOWNS — notifications + user profile menu
=========================================================== */

document.addEventListener('DOMContentLoaded', () => {
    initNotifDropdown();
    initUserDropdown();
});

function initNotifDropdown() {
    const btn = document.getElementById('notif-btn');
    const menu = document.getElementById('notif-menu');
    const badge = document.getElementById('notif-badge');
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllMenus(menu);
        menu.hidden = !menu.hidden;

        // Clear unread badge once opened
        if (!menu.hidden && badge) badge.classList.add('is-hidden');
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', () => (menu.hidden = true));
}

function initUserDropdown() {
    const chip = document.getElementById('user-chip');
    const menu = document.getElementById('user-menu');
    if (!chip || !menu) return;

    chip.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllMenus(menu);
        menu.hidden = !menu.hidden;
        chip.classList.toggle('is-open', !menu.hidden);
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', () => {
        menu.hidden = true;
        chip.classList.remove('is-open');
    });
}

function closeAllMenus(except) {
    document.querySelectorAll('.dropdown-menu').forEach((m) => {
        if (m !== except) m.hidden = true;
    });
}

/* ===========================================================
   PAGE ROUTING — shows/hides pre-embedded panels,
   updates titles/headings, and toggles the active nav item.
   Loads page content from separate .html files using
   XMLHttpRequest which works with file:// protocol.
=========================================================== */

function _getDashboardGreeting() {
    const profile = JSON.parse(localStorage.getItem('flexscribe_profile') || 'null');
    const name = profile?.nickname || profile?.fullName?.split(' ')[0] || 'User';
    return name + "'s Dashboard";
}

const pageTitles = {
    dashboard:     { title: _getDashboardGreeting(), heading: "", sub: "" },
    wallet:        { title: "Wallet",         heading: "Wallet",                sub: "Manage your balance, virtual card and transactions." },
    'wallet-deposit':  { title: "Top Up",   heading: "Top Up",   sub: "Add money to your FlexScribe wallet." },
    'wallet-withdraw': { title: "Withdraw", heading: "Withdraw", sub: "Transfer funds to your bank account." },
    subscription:  { title: "Subscriptions", heading: "Subscriptions",         sub: "Manage and track all your recurring subscriptions." },
    goals:         { title: "Goals",          heading: "Goals",                 sub: "Set targets and watch your savings grow." },
    analytics:     { title: "Analytics",      heading: "Analytics",             sub: "Interactive charts powered by your wallet activity." },
    timeline:      { title: "Timeline",       heading: "Billing Timeline",      sub: "Visualise money flowing out of your wallet for the next 30 days." },
    tasks:         { title: "Tasks",          heading: "Tasks",                 sub: "View and complete the tasks assigned to you." },
    dependants:    { title: "Dependants",     heading: "Dependants",            sub: "Manage family members and their allocations." },
    notifications: { title: "Notifications", heading: "Notifications",         sub: "Stay on top of upcoming payments and alerts." },
    reports:       { title: "Reports",        heading: "Reports",               sub: "View, compile and analyse your financial reports with AI-powered insights." },
    settings:      { title: "Settings",       heading: "Settings",               sub: "Customize your experience and manage your account." }
};

// Maps page names to their .html file (relative to pages/ folder)
const pageFiles = {
    dashboard:     'dashboard.html',
    wallet:        'wallet.html',
    subscription:  'subscription.html',
    goals:         'goals.html',
    analytics:     'analytics.html',
    timeline:      'timeline.html',
    tasks:         'tasks.html',
    dependants:    'dependants.html',
    notifications: 'notifications.html',
    reports:       'reports.html',
    settings:      'settings.html'
};

// Cache loaded pages so we don't reload on revisit
const _pageCache = {};

function _loadPageContent(pageName, panel, callback) {
    // If already loaded, just callback
    if (panel.dataset.loaded === 'true') {
        callback();
        return;
    }

    // Content is pre-registered by page script files via window._pageContent
    if (window._pageContent && window._pageContent[pageName]) {
        panel.innerHTML = window._pageContent[pageName];
        panel.dataset.loaded = 'true';
        callback();
        return;
    }

    // Fallback: try synchronous XHR (works on some browsers with file://)
    const file = pageFiles[pageName];
    if (!file) {
        callback();
        return;
    }

    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', file, false);
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) {
            const html = xhr.responseText;
            if (html && html.trim().length > 0) {
                panel.innerHTML = html;
                panel.dataset.loaded = 'true';
            }
        }
    } catch (e) {
        console.warn('Could not load ' + file + ' — page content not available.');
    }
    callback();
}

function loadPage(pageName) {
    // Hide every panel, show the requested one
    document.querySelectorAll('.page-panel').forEach(panel => panel.hidden = true);
    const target = document.getElementById(`panel-${pageName}`);
    if (target) target.hidden = false;

    // Update heading text
    const info = pageTitles[pageName];
    if (info) {
        const titleEl  = document.querySelector('.page-title');
        const headEl   = document.querySelector('.page-heading-title');
        const subEl    = document.querySelector('.page-heading-subtext');
        if (titleEl) titleEl.textContent  = info.title;
        if (headEl)  headEl.textContent   = info.heading;
        if (subEl)   subEl.textContent    = info.sub;

        // Always hide the page-heading section — title is shown in the top header bar
        const headingSection = document.querySelector('.page-heading');
        if (headingSection) {
            headingSection.hidden = true;
        }
    }

    // Swap active nav highlight
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (activeItem) activeItem.classList.add('active');

    // The Withdraw wizard renders as a full-tab takeover (covers the
    // sidebar + topbar); every other page keeps the dashboard shell.
    document.body.classList.toggle('withdraw-fullscreen', pageName === 'wallet-withdraw');


    // Load content from external file then init the page
    _loadPageContent(pageName, target, function () {
        // Re-render Lucide icons that may be inside the newly shown panel
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Page-specific init hooks
        if (pageName === 'dashboard' && typeof DashboardUI !== 'undefined') {
            DashboardUI.init();
        }

        if (pageName === 'subscription' && typeof SubscriptionsUI !== 'undefined') {
            SubscriptionsUI.init();
        }

        if (pageName === 'wallet' && typeof WalletUI !== 'undefined') {
            WalletUI.init();
            // Dependant-only Request Funds card (no-op for main members).
            if (typeof RequestFundsUI !== 'undefined') RequestFundsUI.mount();
        }

        if (pageName === 'wallet-deposit' && typeof WalletDepositUI !== 'undefined') {
            WalletDepositUI.init();
        }

        if (pageName === 'wallet-withdraw' && typeof WalletWithdrawUI !== 'undefined') {
            WalletWithdrawUI.init();
        }

        if (pageName === 'goals' && typeof GoalsUI !== 'undefined') {
            GoalsUI.init();
        }

        if (pageName === 'analytics' && typeof AnalyticsUI !== 'undefined') {
            AnalyticsUI.init();
        }

        if (pageName === 'reports' && typeof ReportsUI !== 'undefined') {
            ReportsUI.init();
        }

        if (pageName === 'timeline' && typeof TimelineUI !== 'undefined') {
            TimelineUI.init();
        }

        if (pageName === 'dependants' && typeof DependantsUI !== 'undefined') {
            DependantsUI.init();
        }

        if (pageName === 'tasks' && typeof TasksUI !== 'undefined') {
            TasksUI.init();
        }

        if (pageName === 'notifications') {
            _initNotificationsPanel();
        }

        if (pageName === 'settings') {
            _initSettingsPanel();
        }

        // ── Scribe Score side-effects per page ──
        _scribeScorePageHook(pageName);

        // ── Prevent past dates on all future-dated calendar inputs ──
        _enforceFutureDates();
    });
}

/* ===========================================================
   Date-picker guard — future-dated fields can't be in the past
   Sets min = today on billing / target / due-date calendar
   inputs so the native date picker blocks past dates. Date-of-
   birth fields are intentionally excluded (those are past dates).
=========================================================== */
function _todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // local, not UTC
    return d.toISOString().slice(0, 10);
}
function _enforceFutureDates(root) {
    const today = _todayISO();
    // Explicit future-date field IDs across the app.
    const ids = ['sub-modal-date', 'rec-add-date', 'goals-modal-date', 'dep-task-due'];
    (root || document).querySelectorAll(
        ids.map(id => '#' + id).join(',')
    ).forEach(el => { el.min = today; });
}
// Expose so modals opened outside page-load can re-apply it.
window._enforceFutureDates = _enforceFutureDates;

/* ===========================================================
   Scribe Score per-page hook
   - Records genuine "review" actions (analytics / upcoming
     payments) when the user actually opens those pages. The
     backend decides eligibility & awards at most once/period.
   - Shows at most one contextual tip for the page.
   The score cache is invalidated after a review award so the
   dashboard and the next tip reflect the new state.
=========================================================== */
function _scribeScorePageHook(pageName) {
    if (typeof API === 'undefined' || !API.Score) return;

    function refreshScoreUI(delta, toast) {
        try { if (window.ScribeTips) ScribeTips.invalidate(); } catch (e) {}
        try {
            if (window.ScribeScore) ScribeScore.refresh(delta ? { delta: delta, toast: toast } : {});
        } catch (e) {}
    }

    if (pageName === 'analytics') {
        API.Score.reviewAnalytics().then(function (res) {
            if (res && res.success && res.data && res.data.applied) {
                refreshScoreUI(res.data.delta, 'Reviewed monthly analytics');
            }
        }).catch(function () {});
    } else if (pageName === 'timeline') {
        API.Score.reviewUpcoming().then(function (res) {
            if (res && res.success && res.data && res.data.applied) {
                refreshScoreUI(res.data.delta, 'Reviewed upcoming payments');
            }
        }).catch(function () {});
    }

    // One contextual tip per page — always shows guidance on how to earn
    // points (eligible action, else informational, else a neutral card).
    if (window.ScribeTips) {
        // Let any review-award above settle so the tip reflects fresh state.
        setTimeout(function () {
            ScribeTips.showForPage(pageName);
        }, pageName === 'analytics' || pageName === 'timeline' ? 350 : 0);
    }
}

/* ===========================================================
   ROLE-BASED ACCESS CONTROL
   Roles come from the authenticated account's userType, which is
   set server-side at login (never trusted from the client). The
   backend independently enforces every restriction; this layer is
   purely a UX convenience that hides what the user cannot use.

   Dependant main navigation is restricted to EXACTLY five tabs,
   in this order:
       Dashboard, Wallet, Subscriptions, Timeline, Tasks
   Shared chrome (Settings, Sign out, profile menu, notifications)
   stays available to everyone.

   Main members keep every tab (Tasks is hidden for them — tasks are
   managed from the Dependants page).
=========================================================== */

// Pages a DEPENDANT may reach via the main nav (data-page keys).
const DEPENDANT_NAV = ['dashboard', 'wallet', 'subscription', 'timeline', 'tasks'];
// Shared items always allowed regardless of role. (Notifications is NOT shared
// — dependants are restricted to their five nav tabs and must not see it.)
const SHARED_PAGES = ['settings', 'signout'];
// The Tasks tab is a dependant-only main-nav item.
const DEPENDANT_ONLY_PAGES = ['tasks'];

function _normRole(t) {
    return (t === 'Dependant' || t === 'dependant') ? 'dependant' : 'main';
}

/** Current role from cached profile (set during _initHeader / login). */
function getUserRole() {
    try {
        const profile = JSON.parse(localStorage.getItem('flexscribe_profile') || 'null');
        if (profile && profile.userType) return _normRole(profile.userType);
    } catch (e) { /* ignore */ }
    return _normRole(sessionStorage.getItem('flexscribe_role'));
}

function isDependantRole() {
    return getUserRole() === 'dependant';
}

/** Show/hide nav items to match the current role. Idempotent. */
function applyAccessControl() {
    const dependant = isDependantRole();

    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        const page = item.getAttribute('data-page');
        const li = item.closest('li');
        if (!li) return;

        if (SHARED_PAGES.includes(page)) { li.style.display = ''; return; }

        if (dependant) {
            // Dependants: only the five allowed tabs are visible.
            li.style.display = DEPENDANT_NAV.includes(page) ? '' : 'none';
        } else {
            // Main members: everything except the dependant-only Tasks tab.
            li.style.display = DEPENDANT_ONLY_PAGES.includes(page) ? 'none' : '';
        }
    });
}

/** Whether the current role may open a given page (defence in depth). */
function canAccessPage(pageName) {
    if (SHARED_PAGES.includes(pageName) || pageName.startsWith('wallet-')) return true;
    if (isDependantRole()) return DEPENDANT_NAV.includes(pageName);
    // Main members cannot open the dependant-only Tasks page.
    return !DEPENDANT_ONLY_PAGES.includes(pageName);
}

// Re-applied again once the profile role is known (see _initHeader).
window.applyAccessControl = applyAccessControl;

// Apply on load (uses whatever role is cached; refreshed after profile load).
applyAccessControl();

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        if (page === 'signout') {
            showSignoutConfirm();
            return;
        }
        if (!canAccessPage(page)) return; // blocked by tier
        loadPage(page);
    });
});

// Show dashboard by default on first load
loadPage('dashboard');

// Load user info and notification count into header from API
(function _initHeader() {
    if (typeof API === 'undefined') return;

    // If no auth token exists, redirect to login
    if (!sessionStorage.getItem('flexscribe_token')) {
        window.location.href = 'login.html';
        return;
    }

    // Load user name
    API.Auth.getUser().then(function(result) {
        if (result.success && result.data) {
            var d = result.data;
            var fullName = ((d.firstName || '') + ' ' + (d.lastName || '')).trim();
            var shortName = d.preferredName || (d.firstName || 'User');
            var el = document.getElementById('header-user-name');
            if (el) el.textContent = shortName;
            var avatarEl = document.getElementById('header-user-avatar');
            if (avatarEl) avatarEl.alt = fullName;

            // Update dashboard greeting with real name
            var titleEl = document.querySelector('.page-title');
            if (titleEl && titleEl.textContent.includes('Dashboard')) {
                titleEl.textContent = shortName + "'s Dashboard";
            }
            pageTitles.dashboard.title = shortName + "'s Dashboard";

            // Cache profile for next load
            var cached = JSON.parse(localStorage.getItem('flexscribe_profile') || '{}');
            cached.fullName = fullName;
            cached.nickname = d.preferredName || d.firstName || '';
            cached.email = d.email || cached.email || '';
            cached.phone = d.phone || cached.phone || '';
            cached.userType = d.userType || cached.userType || 'MainMember';
            localStorage.setItem('flexscribe_profile', JSON.stringify(cached));
            sessionStorage.setItem('flexscribe_role', cached.userType);

            // Now that the real role is known, re-apply nav gating and make
            // sure a dependant is never left viewing a restricted page.
            try { applyAccessControl(); } catch (e) {}
            var current = document.querySelector('.nav-item.active');
            var currentPage = current ? current.getAttribute('data-page') : 'dashboard';
            if (!canAccessPage(currentPage)) loadPage('dashboard');
        }
    }).catch(function() {});

    // Load notification count and dropdown
    API.Notifications.getAll().then(function(result) {
        if (result.success && Array.isArray(result.data)) {
            var unread = result.data.filter(function(n) { return !n.isRead; });
            var badge = document.getElementById('notif-badge');
            if (badge) {
                badge.textContent = unread.length;
                badge.classList.toggle('is-hidden', unread.length === 0);
            }
            // Populate dropdown with latest 3
            var dropList = document.getElementById('notif-dropdown-list');
            if (dropList) {
                var top3 = result.data.slice(0, 3);
                if (top3.length === 0) {
                    dropList.innerHTML = '<li class="notif-item" style="padding:12px;color:var(--text-light);font-size:13px;">No notifications.</li>';
                } else {
                    dropList.innerHTML = top3.map(function(n) {
                        var dot = !n.isRead ? '<span class="notif-dot"></span>' : '';
                        var ago = _headerTimeAgo(n.createdAt);
                        return '<li class="notif-item" data-notif-id="' + n.notificationID + '" onclick="navigateToNotification(\'' + n.notificationID + '\')">' +
                            dot + '<div><p class="notif-title">' + (n.title || '').replace(/</g, '&lt;') + '</p><p class="notif-time">' + ago + '</p></div></li>';
                    }).join('');
                }
            }
        }
    }).catch(function() {});

    function _headerTimeAgo(dateStr) {
        if (!dateStr) return '';
        var now = new Date();
        var then = new Date(dateStr);
        var minutes = Math.floor((now - then) / 60000);
        if (minutes < 60) return minutes + 'm ago';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        var days = Math.floor(hours / 24);
        return days + 'd ago';
    }
})();

// Navigate to notifications panel and highlight a specific notification
function navigateToNotification(notifId) {
    // Close the dropdown
    const menu = document.getElementById('notif-menu');
    if (menu) menu.hidden = true;

    // Navigate to notifications page
    loadPage('notifications');

    // Highlight the specific notification
    setTimeout(() => {
        // Remove any existing highlight
        document.querySelectorAll('.notif-full-item.highlighted').forEach(el => el.classList.remove('highlighted'));

        // Find and highlight the target notification
        const target = document.querySelector('#notif-full-list .notif-full-item[data-notif-id="' + notifId + '"]');
        if (target) {
            target.classList.add('highlighted');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Mark as read
            target.classList.remove('unread');

            // Remove highlight after 3 seconds
            setTimeout(() => target.classList.remove('highlighted'), 3000);
        }

        // Update badge count
        _updateNotifBadge();
    }, 100);
}

function _updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    const unreadCount = document.querySelectorAll('#notif-full-list .notif-full-item.unread').length;
    if (badge) {
        badge.textContent = unreadCount;
        badge.classList.toggle('is-hidden', unreadCount === 0);
    }
}

function _initNotificationsPanel() {
    // Load notifications from database
    if (typeof window._initNotificationsFromAPI === 'function') {
        window._initNotificationsFromAPI().then(function() {
            _bindNotifEvents();
        });
    } else {
        _bindNotifEvents();
    }
}

function _bindNotifEvents() {
    // Tab filtering
    const tabs = document.querySelectorAll('.notif-tab-btn');
    const getItems = () => document.querySelectorAll('.notif-full-item');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const filter = tab.dataset.filter;

            getItems().forEach(item => {
                if (filter === 'all') {
                    item.style.display = '';
                } else if (filter === 'unread') {
                    item.style.display = item.classList.contains('unread') ? '' : 'none';
                } else {
                    item.style.display = item.dataset.category === filter ? '' : 'none';
                }
            });
        });
    });

    // Mark all as read
    const markAllBtn = document.getElementById('notif-mark-all-read');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', () => {
            const hadUnread = document.querySelectorAll('.notif-full-item.unread').length > 0;
            if (!hadUnread) {
                if (window.UIUtils) UIUtils.toast('No unread notifications.', 'info');
                return;
            }
            document.querySelectorAll('.notif-full-item.unread').forEach(item => item.classList.remove('unread'));
            document.querySelectorAll('.notif-full-item .notif-full-dot').forEach(d => d.remove());
            _updateNotifBadge();
            document.querySelectorAll('#notif-dropdown-list .notif-dot').forEach(dot => dot.style.display = 'none');
            // Persist to database
            if (typeof API !== 'undefined') {
                API.Notifications.markAllRead().then(function (r) {
                    if (window.UIUtils) {
                        if (r && r.success !== false) UIUtils.toast('All notifications marked as read.', 'success');
                        else UIUtils.toast((r && r.error) || 'Could not mark all as read.', 'error');
                    }
                }).catch(function () {
                    if (window.UIUtils) UIUtils.toast('Network error. Please try again.', 'error');
                });
            }
        });
    }

    // Click on notification item to mark as read (ignore clicks on the delete btn)
    getItems().forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.notif-full-delete')) return;
            if (item.classList.contains('unread')) {
                item.classList.remove('unread');
                const dot = item.querySelector('.notif-full-dot');
                if (dot) dot.remove();
                _updateNotifBadge();
                // Persist to database
                const nid = item.dataset.notifId;
                if (nid && typeof API !== 'undefined') {
                    API.Notifications.markRead(nid).then(function (r) {
                        if (window.UIUtils && r && r.success === false) UIUtils.toast((r && r.error) || 'Could not update notification.', 'error');
                    }).catch(function () {});
                }
            }
        });
    });

    // Delete a notification
    getItems().forEach(item => {
        const delBtn = item.querySelector('.notif-full-delete');
        if (!delBtn) return;
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nid = item.dataset.notifId;
            if (!nid || typeof API === 'undefined' || !API.Notifications.remove) return;
            delBtn.disabled = true;
            API.Notifications.remove(nid).then(function (r) {
                if (r && r.success !== false) {
                    item.remove();
                    _updateNotifBadge();
                    if (window.UIUtils) UIUtils.toast('Notification deleted.', 'success');
                } else {
                    delBtn.disabled = false;
                    if (window.UIUtils) UIUtils.toast((r && r.error) || 'Could not delete notification.', 'error');
                }
            }).catch(function () {
                delBtn.disabled = false;
                if (window.UIUtils) UIUtils.toast('Network error. Please try again.', 'error');
            });
        });
    });
}

let _settingsInitialized = false;

function _applyAccent(color) {
    // Apply to both html and body so it works regardless of light/dark mode
    const targets = [document.documentElement, document.body];
    targets.forEach(el => {
        el.style.setProperty('--orange', color);
        el.style.setProperty('--orange-hover', _lightenColor(color, 20));
        el.style.setProperty('--orange-tint', color + '1F');
        el.style.setProperty('--orange-glow', color + '33');
    });
}

function _lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
    const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
    const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
    return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function _initSettingsPanel() {
    const SETTINGS_KEY = 'flexscribe_settings';
    const ACCENT_KEY = 'flexscribe_dashboard_accent';

    const settingsDefaults = { notifications: { payments: true, goals: true, weekly: false }, security: { twoFactor: false } };

    function loadSettings() {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') || JSON.parse(JSON.stringify(settingsDefaults));
    }
    function saveSettings(data) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); }

    const settings = loadSettings();

    // Theme
    const theme = localStorage.getItem('theme') || 'dark';
    document.querySelectorAll('.settings-theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));

    // Accent
    const accent = localStorage.getItem(ACCENT_KEY) || '#FF7A29';
    document.querySelectorAll('.settings-accent').forEach(s => s.classList.toggle('active', s.dataset.color === accent));

    // Notifications
    document.getElementById('settings-notif-payments').checked = settings.notifications?.payments ?? true;
    document.getElementById('settings-notif-goals').checked = settings.notifications?.goals ?? true;
    document.getElementById('settings-notif-weekly').checked = settings.notifications?.weekly ?? false;
    document.getElementById('settings-2fa').checked = settings.security?.twoFactor ?? false;

    if (_settingsInitialized) return;
    _settingsInitialized = true;

    // Theme buttons
    document.querySelectorAll('.settings-theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            localStorage.setItem('theme', btn.dataset.theme);
            document.body.classList.toggle('light-mode', btn.dataset.theme === 'light');
            document.body.classList.remove('dark-mode');
            document.querySelectorAll('.settings-theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === btn.dataset.theme));
            if (typeof UIUtils !== 'undefined') UIUtils.toast('Theme updated!', 'success');
        });
    });

    // Accent swatches
    document.querySelectorAll('.settings-accent').forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.dataset.color;
            localStorage.setItem(ACCENT_KEY, color);
            _applyAccent(color);
            document.querySelectorAll('.settings-accent').forEach(s => s.classList.toggle('active', s.dataset.color === color));
            if (typeof UIUtils !== 'undefined') UIUtils.toast('Accent color updated!', 'success');
        });
    });

    // Notification toggles
    ['settings-notif-payments', 'settings-notif-goals', 'settings-notif-weekly'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const s = loadSettings();
            s.notifications = {
                payments: document.getElementById('settings-notif-payments').checked,
                goals: document.getElementById('settings-notif-goals').checked,
                weekly: document.getElementById('settings-notif-weekly').checked
            };
            saveSettings(s);
            const statusEl = document.getElementById('settings-save-status');
            if (statusEl) { statusEl.textContent = '✓ Saved'; setTimeout(() => statusEl.textContent = '', 2000); }
        });
    });

    // 2FA toggle
    document.getElementById('settings-2fa').addEventListener('change', (e) => {
        const s = loadSettings();
        s.security = s.security || {};
        s.security.twoFactor = e.target.checked;
        saveSettings(s);
        if (typeof UIUtils !== 'undefined') UIUtils.toast('Two-factor ' + (e.target.checked ? 'enabled' : 'disabled'), 'success');
    });

    // Change password
    document.getElementById('settings-change-pw-btn').addEventListener('click', () => {
        const curr = document.getElementById('settings-current-pw').value;
        const newPw = document.getElementById('settings-new-pw').value;
        const conf = document.getElementById('settings-confirm-pw').value;
        const err = document.getElementById('settings-pw-error');
        if (!curr || !newPw || !conf) { err.textContent = 'Please fill all fields.'; return; }
        if (newPw !== conf) { err.textContent = 'Passwords do not match.'; return; }
        if (newPw.length < 6) { err.textContent = 'Minimum 6 characters.'; return; }
        err.textContent = '';
        document.getElementById('settings-current-pw').value = '';
        document.getElementById('settings-new-pw').value = '';
        document.getElementById('settings-confirm-pw').value = '';
        if (typeof UIUtils !== 'undefined') UIUtils.toast('Password updated!', 'success');
    });

    // Export
    document.getElementById('settings-export-btn').addEventListener('click', () => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); data[k] = localStorage.getItem(k); }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'flexscribe-export.json';
        a.click();
        URL.revokeObjectURL(a.href);
        if (typeof UIUtils !== 'undefined') UIUtils.toast('Data exported!', 'success');
    });

    // Clear data
    document.getElementById('settings-clear-btn').addEventListener('click', () => {
        if (!confirm('Clear all FlexScribe data? This cannot be undone.')) return;
        Object.keys(localStorage).filter(k => k.startsWith('flexscribe_')).forEach(k => localStorage.removeItem(k));
        if (typeof UIUtils !== 'undefined') UIUtils.toast('All data cleared!', 'success');
        setTimeout(() => location.reload(), 1500);
    });

    // Delete account
    document.getElementById('settings-delete-btn').addEventListener('click', () => {
        const el = document.getElementById('settings-delete-confirm');
        el.hidden = !el.hidden;
    });
    document.getElementById('settings-delete-input').addEventListener('input', (e) => {
        document.getElementById('settings-delete-final').disabled = e.target.value.trim() !== 'DELETE';
    });
    document.getElementById('settings-delete-final').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
}

// Initialize Profile Panel
if (typeof ProfilePanel !== 'undefined') ProfilePanel.init();

// Apply saved accent on page load (works with both themes)
(function() {
    const savedAccent = localStorage.getItem('flexscribe_dashboard_accent');
    if (savedAccent && savedAccent !== '#FF7A29') {
        _applyAccent(savedAccent);
    }
})();

// Load user profile name into header chip on page load
(function() {
    const profile = JSON.parse(localStorage.getItem('flexscribe_profile') || 'null');
    if (profile) {
        const nickname = profile.nickname || profile.fullName?.split(' ')[0] || 'User';
        const lastName = profile.fullName?.split(' ')[1] || '';
        const chipName = nickname + ' ' + lastName.charAt(0) + '.';
        const chip = document.querySelector('#user-chip span');
        if (chip) chip.textContent = chipName;
    }

    // Apply saved avatar to header chip
    const savedAvatar = localStorage.getItem('flexscribe_profile_avatar');
    if (savedAvatar) {
        const chipImg = document.querySelector('#user-chip img');
        if (chipImg) chipImg.src = savedAvatar;
    }
})();