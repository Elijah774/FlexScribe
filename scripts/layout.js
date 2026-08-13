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
    const name = profile?.nickname || profile?.fullName?.split(' ')[0] || 'Sarah';
    return 'Welcome, ' + name + ' \u{1F44B}';
}

const pageTitles = {
    dashboard:     { title: _getDashboardGreeting(), heading: "", sub: "" },
    wallet:        { title: "Wallet",         heading: "Wallet",                sub: "Manage your balance, virtual card and transactions." },
    subscription:  { title: "Subscriptions", heading: "Subscriptions",         sub: "Manage and track all your recurring subscriptions." },
    goals:         { title: "Goals",          heading: "Goals",                 sub: "Set targets and watch your savings grow." },
    analytics:     { title: "Analytics",      heading: "Analytics",             sub: "Interactive charts powered by your wallet activity." },
    timeline:      { title: "Timeline",       heading: "Billing Timeline",      sub: "Visualise money flowing out of your wallet for the next 30 days." },
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

        if (pageName === 'dependants' && typeof DependantsUI !== 'undefined') {
            DependantsUI.init();
        }

        if (pageName === 'notifications') {
            _initNotificationsPanel();
        }

        if (pageName === 'settings') {
            _initSettingsPanel();
        }
    });
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        if (page === 'signout') {
            window.location.href = 'signout.html';
            return;
        }
        loadPage(page);
    });
});

// Show dashboard by default on first load
loadPage('dashboard');

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
    // Tab filtering
    const tabs = document.querySelectorAll('.notif-tab-btn');
    const items = document.querySelectorAll('.notif-full-item');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const filter = tab.dataset.filter;

            items.forEach(item => {
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
            document.querySelectorAll('.notif-full-item.unread').forEach(item => item.classList.remove('unread'));
            _updateNotifBadge();
            // Also clear dots in dropdown
            document.querySelectorAll('#notif-dropdown-list .notif-dot').forEach(dot => dot.style.display = 'none');
        });
    }

    // Click on notification item to mark as read
    items.forEach(item => {
        item.addEventListener('click', () => {
            item.classList.remove('unread');
            _updateNotifBadge();
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
    const accent = localStorage.getItem(ACCENT_KEY) || '#FF8A34';
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
    if (savedAccent && savedAccent !== '#FF8A34') {
        _applyAccent(savedAccent);
    }
})();

// Load user profile name into header chip on page load
(function() {
    const profile = JSON.parse(localStorage.getItem('flexscribe_profile') || 'null');
    if (profile) {
        const nickname = profile.nickname || profile.fullName?.split(' ')[0] || 'Sarah';
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