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
   Using embedded panels instead of fetch() so the app works
   when opened directly as a file:// URL (no server needed).
=========================================================== */

const pageTitles = {
    dashboard:     { title: "Dashboard",     heading: "Welcome, Sarah",        sub: "Good day, here's a snapshot of your money." },
    wallet:        { title: "Wallet",         heading: "Wallet",                sub: "Manage your balance, virtual card and transactions." },
    subscription:  { title: "Subscriptions", heading: "Subscriptions",         sub: "Manage and track all your recurring subscriptions." },
    goals:         { title: "Goals",          heading: "Goals",                 sub: "Set targets and watch your savings grow." },
    analytics:     { title: "Analytics",      heading: "Analytics",             sub: "Interactive charts powered by your wallet activity." },
    timeline:      { title: "Timeline",       heading: "Billing Timeline",      sub: "Visualise money flowing out of your wallet for the next 30 days." },
    dependants:    { title: "Dependants",     heading: "Dependants",            sub: "Manage family members and their allocations." },
    notifications: { title: "Notifications", heading: "Notifications",         sub: "Stay on top of upcoming payments and alerts." },
    reports:       { title: "Reports",        heading: "Reports",               sub: "Monthly summary and spending breakdown." }
};

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
    }

    // Swap active nav highlight
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Re-render Lucide icons that may be inside the newly shown panel
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Page-specific init hooks
    if (pageName === 'subscription' && typeof SubscriptionsUI !== 'undefined') {
        // init() is idempotent — safe to call on every visit.
        // First call wires all event listeners + does initial render.
        // Subsequent calls just re-render from the live store.
        SubscriptionsUI.init();
    }
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