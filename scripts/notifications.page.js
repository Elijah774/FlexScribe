/* =============================================================
   FlexScribe — Notifications Page (database-driven)
   Loads notifications from API.Notifications.getAll()
============================================================= */

window._pageContent = window._pageContent || {};
window._pageContent['notifications'] = `
                <div class="notif-panel-header">
                    <div class="notif-panel-tabs">
                        <button class="notif-tab-btn active" data-filter="all">All</button>
                        <button class="notif-tab-btn" data-filter="unread">Unread</button>
                        <button class="notif-tab-btn" data-filter="payments">Payments</button>
                        <button class="notif-tab-btn" data-filter="goals">Goals</button>
                    </div>
                    <button class="notif-mark-read-btn" id="notif-mark-all-read">Mark all as read</button>
                </div>
                <ul class="notif-full-list" id="notif-full-list">
                    <li class="notif-loading" style="padding:24px;text-align:center;color:var(--text-light);">Loading notifications...</li>
                </ul>
`;

// Called after page content is injected
window._initNotificationsFromAPI = async function() {
    const list = document.getElementById('notif-full-list');
    if (!list) return;

    if (typeof API === 'undefined') {
        list.innerHTML = '<li style="padding:24px;text-align:center;color:var(--text-light);">API not available.</li>';
        return;
    }

    try {
        const result = await API.Notifications.getAll();
        if (!result.success || !Array.isArray(result.data)) {
            list.innerHTML = '<li style="padding:24px;text-align:center;color:var(--text-light);">No notifications found.</li>';
            return;
        }

        const notifications = result.data;

        if (notifications.length === 0) {
            list.innerHTML = '<li style="padding:24px;text-align:center;color:var(--text-light);">No notifications yet.</li>';
            _updateNotifBadge();
            return;
        }

        list.innerHTML = notifications.map(function(n) {
            const isUnread = !n.isRead;
            const category = n.notificationType || 'general';
            const icon = _getNotifIcon(category);
            const timeAgo = _timeAgo(n.createdAt);

            return `
                <li class="notif-full-item ${isUnread ? 'unread' : ''}" data-notif-id="${n.notificationID}" data-category="${category}">
                    <div class="notif-full-icon ${category}">${icon}</div>
                    <div class="notif-full-content">
                        <p class="notif-full-title">${_escHtml(n.title)}</p>
                        <p class="notif-full-desc">${_escHtml(n.body || '')}</p>
                        <p class="notif-full-time">${timeAgo}</p>
                    </div>
                    ${isUnread ? '<span class="notif-full-dot"></span>' : ''}
                </li>
            `;
        }).join('');

        _updateNotifBadge();
    } catch (err) {
        console.error('Failed to load notifications:', err);
        list.innerHTML = '<li style="padding:24px;text-align:center;color:var(--text-light);">Failed to load notifications.</li>';
    }
};

function _getNotifIcon(type) {
    switch (type) {
        case 'payment':
            return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="2" y="7" width="20" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/></svg>';
        case 'goal':
            return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/></svg>';
        case 'score':
            return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5"/></svg>';
        case 'security':
            return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2"/></svg>';
        case 'dependant':
            return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg>';
        default:
            return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2"/></svg>';
    }
}

function _timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    const days = Math.floor(hours / 24);
    if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
    const weeks = Math.floor(days / 7);
    return weeks + (weeks === 1 ? ' week ago' : ' weeks ago');
}

function _escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
