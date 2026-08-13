/* =============================================================
   FlexScribe — Global Search
   scripts/search.js

   Searches across subscriptions, wallet transactions, goals,
   and dependants. Shows results in a dropdown under the header
   search bar. Clicking a result navigates to the relevant page.
============================================================= */

'use strict';

const GlobalSearch = (() => {

    let _input;
    let _dropdown;
    let _debounceTimer;

    function init() {
        _input = document.getElementById('global-search');
        if (!_input) return;

        // Create dropdown container
        _dropdown = document.createElement('div');
        _dropdown.className = 'search-dropdown';
        _dropdown.id = 'search-dropdown';
        _dropdown.hidden = true;
        _input.parentElement.appendChild(_dropdown);

        // Events
        _input.addEventListener('input', _onInput);
        _input.addEventListener('focus', _onFocus);
        _input.addEventListener('keydown', _onKeydown);
        document.addEventListener('click', _onClickOutside);
    }

    /* ----------------------------------------------------------
       EVENT HANDLERS
    ---------------------------------------------------------- */

    function _onInput() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            const query = _input.value.trim().toLowerCase();
            if (query.length < 2) {
                _hide();
                return;
            }
            const results = _search(query);
            _render(results, query);
        }, 200);
    }

    function _onFocus() {
        const query = _input.value.trim().toLowerCase();
        if (query.length >= 2) {
            const results = _search(query);
            _render(results, query);
        }
    }

    function _onKeydown(e) {
        if (!_dropdown || _dropdown.hidden) return;

        const items = _dropdown.querySelectorAll('.search-result-item');
        let active = _dropdown.querySelector('.search-result-item.active');
        let idx = Array.from(items).indexOf(active);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (active) active.classList.remove('active');
            idx = (idx + 1) % items.length;
            items[idx].classList.add('active');
            items[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (active) active.classList.remove('active');
            idx = idx <= 0 ? items.length - 1 : idx - 1;
            items[idx].classList.add('active');
            items[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active) active.click();
        } else if (e.key === 'Escape') {
            _hide();
            _input.blur();
        }
    }

    function _onClickOutside(e) {
        if (!_input.parentElement.contains(e.target)) {
            _hide();
        }
    }

    /* ----------------------------------------------------------
       SEARCH ENGINE — queries all stores
    ---------------------------------------------------------- */

    function _search(query) {
        const results = [];

        // Search subscriptions
        if (typeof SubscriptionStore !== 'undefined') {
            const subs = SubscriptionStore.getAll();
            subs.forEach(sub => {
                const searchable = [sub.name, sub.category, sub.plan || ''].join(' ').toLowerCase();
                if (searchable.includes(query)) {
                    results.push({
                        type: 'subscription',
                        icon: _getSubIcon(sub),
                        title: sub.name,
                        subtitle: sub.category + ' · R' + (sub.amount || sub.monthlyCost || 0).toFixed(2) + '/mo',
                        page: 'subscription',
                        id: sub.id
                    });
                }
            });
        }

        // Search wallet transactions
        if (typeof WalletStore !== 'undefined') {
            const txns = WalletStore.getTransactions();
            txns.forEach(tx => {
                const searchable = [tx.description || '', tx.type || '', tx.category || ''].join(' ').toLowerCase();
                if (searchable.includes(query)) {
                    results.push({
                        type: 'transaction',
                        icon: '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18" stroke="currentColor" stroke-width="2"/></svg>',
                        title: tx.description || tx.type,
                        subtitle: 'Wallet · ' + (tx.amount >= 0 ? '+' : '') + 'R' + Math.abs(tx.amount).toFixed(2),
                        page: 'wallet',
                        id: tx.id
                    });
                }
            });
        }

        // Search goals
        if (typeof GoalStore !== 'undefined') {
            const goals = GoalStore.getAll();
            goals.forEach(goal => {
                const searchable = [goal.name, goal.category || ''].join(' ').toLowerCase();
                if (searchable.includes(query)) {
                    const pct = goal.target > 0 ? Math.round((goal.saved / goal.target) * 100) : 0;
                    results.push({
                        type: 'goal',
                        icon: '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/></svg>',
                        title: goal.name,
                        subtitle: 'Goal · ' + pct + '% complete',
                        page: 'goals',
                        id: goal.id
                    });
                }
            });
        }

        // Search dependants
        if (typeof DependantStore !== 'undefined') {
            const deps = DependantStore.getAll();
            deps.forEach(dep => {
                const searchable = [dep.name, dep.relationship || ''].join(' ').toLowerCase();
                if (searchable.includes(query)) {
                    results.push({
                        type: 'dependant',
                        icon: '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg>',
                        title: dep.name,
                        subtitle: 'Dependant · ' + (dep.relationship || 'Family'),
                        page: 'dependants',
                        id: dep.id
                    });
                }
            });
        }

        // Search pages/navigation
        const pages = [
            { name: 'Dashboard', page: 'dashboard', keywords: 'home overview' },
            { name: 'Wallet', page: 'wallet', keywords: 'balance funds money card' },
            { name: 'Subscriptions', page: 'subscription', keywords: 'subs recurring billing' },
            { name: 'Goals', page: 'goals', keywords: 'savings targets' },
            { name: 'Analytics', page: 'analytics', keywords: 'charts spending reports stats' },
            { name: 'Timeline', page: 'timeline', keywords: 'billing schedule calendar' },
            { name: 'Dependants', page: 'dependants', keywords: 'family members children' },
            { name: 'Notifications', page: 'notifications', keywords: 'alerts messages' },
            { name: 'Reports', page: 'reports', keywords: 'export pdf csv' },
            { name: 'Settings', page: 'settings', keywords: 'preferences theme account' },
        ];

        pages.forEach(p => {
            const searchable = (p.name + ' ' + p.keywords).toLowerCase();
            if (searchable.includes(query)) {
                results.push({
                    type: 'page',
                    icon: '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    title: p.name,
                    subtitle: 'Navigate to ' + p.name,
                    page: p.page,
                    id: null
                });
            }
        });

        return results.slice(0, 10); // Cap at 10 results
    }

    /* ----------------------------------------------------------
       RENDER
    ---------------------------------------------------------- */

    function _render(results, query) {
        if (results.length === 0) {
            _dropdown.innerHTML = '<div class="search-no-results">No results for "<strong>' + _escHtml(query) + '</strong>"</div>';
            _dropdown.hidden = false;
            return;
        }

        let html = '';
        let lastType = '';

        results.forEach((r, i) => {
            // Group header
            if (r.type !== lastType) {
                const label = _typeLabel(r.type);
                html += '<div class="search-group-label">' + label + '</div>';
                lastType = r.type;
            }

            html += '<div class="search-result-item' + (i === 0 ? ' active' : '') + '" data-page="' + r.page + '" data-id="' + (r.id || '') + '">';
            html += '  <span class="search-result-icon">' + r.icon + '</span>';
            html += '  <div class="search-result-text">';
            html += '    <span class="search-result-title">' + _highlight(r.title, query) + '</span>';
            html += '    <span class="search-result-subtitle">' + r.subtitle + '</span>';
            html += '  </div>';
            html += '  <span class="search-result-badge">' + _typeBadge(r.type) + '</span>';
            html += '</div>';
        });

        _dropdown.innerHTML = html;
        _dropdown.hidden = false;

        // Attach click listeners
        _dropdown.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                _hide();
                _input.value = '';
                if (typeof loadPage === 'function') loadPage(page);
            });
        });
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    function _hide() {
        if (_dropdown) _dropdown.hidden = true;
    }

    function _getSubIcon(sub) {
        if (sub.logoText) {
            return '<span class="search-sub-logo ' + (sub.logoClass || '') + '">' + sub.logoText + '</span>';
        }
        return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }

    function _typeLabel(type) {
        const labels = {
            subscription: 'Subscriptions',
            transaction: 'Transactions',
            goal: 'Goals',
            dependant: 'Dependants',
            page: 'Pages'
        };
        return labels[type] || type;
    }

    function _typeBadge(type) {
        const badges = {
            subscription: 'Sub',
            transaction: 'Wallet',
            goal: 'Goal',
            dependant: 'Family',
            page: 'Page'
        };
        return badges[type] || '';
    }

    function _highlight(text, query) {
        if (!text) return '';
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('(' + escaped + ')', 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    function _escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */

    return Object.freeze({ init });

})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => GlobalSearch.init());
