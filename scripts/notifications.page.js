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
                        <button class="notif-tab-btn" data-filter="subscriptions">Subscriptions</button>
                        <button class="notif-tab-btn" data-filter="payments">Payments</button>
                        <button class="notif-tab-btn" data-filter="goals">Goals</button>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="secondary-btn" id="notif-generate-reminders-btn" style="font-size:12px;padding:6px 12px;display:flex;align-items:center;gap:6px;">
                            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M4 4v5h5M20 20v-5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9a9 9 0 0114.5-5.5M20 15a9 9 0 01-14.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            Generate Reminders
                        </button>
                        <button class="notif-mark-read-btn" id="notif-mark-all-read">Mark all as read</button>
                    </div>
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
            const rawType  = (n.notificationType || '').toUpperCase();
            const category = _typeToCategory(rawType);   // maps DB type → tab filter value
            const icon     = _getNotifIcon(rawType);
            const timeAgo  = _timeAgo(n.createdAt);

            return `
                <li class="notif-full-item ${isUnread ? 'unread' : ''}"
                    data-notif-id="${n.notificationID}"
                    data-category="${category}">
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

/* -----------------------------------------------------------
   Maps DB notification type → tab filter category string
----------------------------------------------------------- */
function _typeToCategory(type) {
    // Subscription events
    if ([
        'SUBSCRIPTION_ADDED', 'SUBSCRIPTION_UPDATED',
        'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PAUSED',
        'SUBSCRIPTION_RENEWAL_REMINDER'
    ].includes(type)) return 'subscriptions';

    // Payment events
    if ([
        'PAYMENT_SUCCESS', 'PAYMENT_FAILED',
        'UPCOMING_PAYMENT', 'LOW_BALANCE', 'INSUFFICIENT_FUNDS'
    ].includes(type)) return 'payments';

    // Goal events
    if (['GOAL_PROGRESS', 'GOAL_COMPLETED'].includes(type)) return 'goals';

    return 'general';
}

/* -----------------------------------------------------------
   Returns an inline SVG icon for a given notification type
----------------------------------------------------------- */
function _getNotifIcon(type) {
    // Subscription icons
    if ([
        'SUBSCRIPTION_ADDED', 'SUBSCRIPTION_UPDATED',
        'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PAUSED',
        'SUBSCRIPTION_RENEWAL_REMINDER'
    ].includes(type)) {
        return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M17 1l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 23l-4-4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }

    // Payment icons
    if (['PAYMENT_SUCCESS', 'UPCOMING_PAYMENT'].includes(type)) {
        return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="2" y="7" width="20" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/></svg>';
    }
    if (type === 'PAYMENT_FAILED') {
        return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="2" y="7" width="20" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/><path d="M9 14l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (['LOW_BALANCE', 'INSUFFICIENT_FUNDS'].includes(type)) {
        return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M12 9v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/></svg>';
    }

    // Goal icons
    if (['GOAL_PROGRESS', 'GOAL_COMPLETED'].includes(type)) {
        return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/></svg>';
    }

    // Default bell
    return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2"/></svg>';
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
