const themeToggle = document.getElementById("theme-toggle");

themeToggle.addEventListener("click", () => {

    document.body.classList.toggle("dark-mode");

    localStorage.setItem(
        "theme",
        document.body.classList.contains("dark-mode") ? "dark" : "light"
    );
});

if(localStorage.getItem("theme") === "dark"){
    document.body.classList.add("dark-mode");
}

const pageTitles = {
    dashboard: { title: "Dashboard", heading: "Welcome, INSERTNAME ", sub: "Good day, here's a snapshot of your money." },
    wallet: { title: "Wallet", heading: "Wallet", sub: "Manage your balance, virtual card and transactions." },
    subscription: { title: "Subscriptions\nManage and track all your recurring subscriptions."},
    goals: { title: "Goals", heading: "Goals", sub: "Set targets and watch your savings grow." },
    analytics: { title: "Analytics", heading: "Analytics", sub: "Interactive charts powered by your wallet activity." },
    timeline: { title: "Timeline", heading: "Billing Timeline", sub: "Virtualize money flowing out of your wallet for the next 30 days." },
    dependants: { title: "Dependants", heading: "Dependants", sub: "NUMBER OF dependants, AMOUNT allocated." },
    notifications: { title: "Notifications", heading: "Notifications", sub: "NUMBER OF unread of NUMBER." },
    reports: { title: "Reports", heading: "Reports", sub: "Monthly summary for MONTH YEAR." }

    // add the rest of your pages here
};

function loadPage(pageName) {
    fetch(`${pageName}.html`)
        .then(res => res.text())
        .then(html => {
            document.querySelector('.page-body').innerHTML = html;

            const info = pageTitles[pageName];
            document.querySelector('.page-title').textContent = info.title;
            document.querySelector('.page-heading-title').textContent = info.heading;
            document.querySelector('.page-heading-subtext').textContent = info.sub;

            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.querySelector(`.nav-item[data-page="${pageName}"]`).classList.add('active');
        });
    document.getElementById("page-style").href =
        `../styles/${pageName}.css`;
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        if (page === 'signout') {
            // handle sign out separately
            return;
        }
        loadPage(page);
    });
});

// load dashboard by default when MASTER.html first opens
loadPage('dashboard');