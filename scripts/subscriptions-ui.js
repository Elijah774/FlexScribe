/* =============================================================
   FlexScribe — Subscriptions UI Layer
   scripts/subscriptions-ui.js

   Consumes SubscriptionStore (backend/subscriptions.js) and
   drives all DOM updates for the subscriptions panel:
   • Stat card re-render
   • Subscription list render (add / edit / delete / toggle)
   • Donut chart + legend re-render
   • Upcoming payments re-render
   • Add / Edit modal open-close-submit
   • Detail drawer open-close
   • Row kebab menus
   • Sort + filter toolbar
   • CSV export
   • FAB + header "+ Add" button
   • Toast notifications
============================================================= */

'use strict';

const SubscriptionsUI = (() => {

    /* ----------------------------------------------------------
       STATE
    ---------------------------------------------------------- */
    let _editingId   = null;   // id of sub currently in edit modal
    let _detailId    = null;   // id of sub in detail drawer
    let _sortKey     = 'date';
    let _sortDir     = 'asc';
    let _filterCat   = 'all';
    let _filterStatus = 'all'; // 'all' | 'active' | 'paused'

    /* ----------------------------------------------------------
       DOM REFS  (resolved once on init)
    ---------------------------------------------------------- */
    let $;  // shorthand querySelector inside panel

    function _q(sel)  { return document.querySelector(sel); }
    function _qa(sel) { return document.querySelectorAll(sel); }

    /* ----------------------------------------------------------
       TOAST — delegates to UIUtils.toast (global utility)
    ---------------------------------------------------------- */
    function toast(msg, type = 'success') {
        if (typeof UIUtils !== 'undefined') {
            UIUtils.toast(msg, type);
        } else {
            // Fallback if ui-utils.js not loaded yet
            console.info(`[Toast:${type}] ${msg}`);
        }
    }

    /* ----------------------------------------------------------
       LOGO HELPER
    ---------------------------------------------------------- */
    const LOGO_CLASSES = ['netflix','spotify','disney','prime','youtube','apple','google','microsoft','default'];

    function _logoHtml(sub) {
        const cls = LOGO_CLASSES.includes(sub.logoClass) ? sub.logoClass : 'default';
        const letter = sub.logoText || sub.name.charAt(0).toUpperCase();
        return `<span class="sub-logo ${cls}" aria-hidden="true">${letter}</span>`;
    }

    function _payLogoHtml(sub) {
        const cls = LOGO_CLASSES.includes(sub.logoClass) ? sub.logoClass : 'default';
        const letter = sub.logoText || sub.name.charAt(0).toUpperCase();
        return `<span class="pay-logo ${cls}" aria-hidden="true">${letter}</span>`;
    }

    /* ----------------------------------------------------------
       STAT CARDS
    ---------------------------------------------------------- */
    function _renderStats(stats) {
        const map = {
            'sub-stat-active':   stats.activeCount,
            'sub-stat-monthly':  stats.fmtMonthly,
            'sub-stat-annual':   stats.fmtAnnual,
            'sub-stat-savings':  stats.fmtSavings,
        };
        for (const [id, val] of Object.entries(map)) {
            const el = _q(`#${id}`);
            if (el) el.textContent = val;
        }
    }

    /* ----------------------------------------------------------
       DONUT CHART + LEGEND
    ---------------------------------------------------------- */
    const CIRCUMFERENCE = 2 * Math.PI * 72; // r=72

    function _renderDonut(stats) {
        const svg    = _q('#sub-donut-svg');
        const legend = _q('#sub-donut-legend');
        const center = _q('#sub-donut-value');
        if (!svg || !legend) return;

        if (center) center.textContent = stats.fmtMonthly;

        // Remove existing dynamic slices
        svg.querySelectorAll('.donut-slice').forEach(el => el.remove());

        let offset = 0;
        stats.byCategory.forEach(slice => {
            const dash = (slice.pct / 100) * CIRCUMFERENCE;
            const gap  = CIRCUMFERENCE - dash;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '100');
            circle.setAttribute('cy', '100');
            circle.setAttribute('r', '72');
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', slice.color);
            circle.setAttribute('stroke-width', '30');
            circle.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${gap.toFixed(1)}`);
            circle.setAttribute('stroke-dashoffset', (-offset).toFixed(1));
            circle.setAttribute('transform', 'rotate(-90 100 100)');
            circle.classList.add('donut-slice');
            svg.appendChild(circle);
            offset += dash;
        });

        // Legend
        legend.innerHTML = stats.byCategory.map(slice => `
            <li>
                <span class="dot" style="background:${slice.color}"></span>
                <span class="leg-name">${slice.category}</span>
                <span class="leg-pct">${slice.pct}%</span>
            </li>`).join('');
    }

    /* ----------------------------------------------------------
       UPCOMING PAYMENTS LIST
    ---------------------------------------------------------- */
    function _renderUpcoming(stats) {
        const list = _q('#sub-upcoming-list');
        if (!list) return;

        if (!stats.upcoming.length) {
            list.innerHTML = `<li class="sub-empty-row">No payments in the next 30 days</li>`;
            return;
        }

        list.innerHTML = stats.upcoming.map(s => {
            const days = SubscriptionStore.daysUntil(s.nextPaymentDate);
            const label = days === 0 ? 'Today'
                        : days === 1 ? 'Tomorrow'
                        : `${SubscriptionStore.fmtDate(s.nextPaymentDate)}`;
            const urgent = days <= 3 ? 'pay-date--urgent' : '';
            return `
            <li class="pay-row">
                ${_payLogoHtml(s)}
                <div class="pay-info">
                    <p class="pay-title">${_esc(s.name)}</p>
                    <p class="pay-sub">${_esc(s.category)}</p>
                </div>
                <div class="pay-amount-col">
                    <p class="pay-price">${SubscriptionStore.fmtCurrency(s.amount)}</p>
                    <p class="pay-date ${urgent}">${label}</p>
                </div>
            </li>`;
        }).join('');
    }

    /* ----------------------------------------------------------
       SUBSCRIPTION LIST
    ---------------------------------------------------------- */
    function _getFiltered(all) {
        return all.filter(s => {
            const catOk    = _filterCat === 'all' || s.category === _filterCat;
            const statusOk = _filterStatus === 'all'
                           || (_filterStatus === 'active' && s.active)
                           || (_filterStatus === 'paused' && !s.active);
            return catOk && statusOk;
        });
    }

    function _renderList(stats) {
        const list = _q('#sub-list');
        if (!list) return;

        const filtered = _getFiltered(stats.all);

        if (!filtered.length) {
            list.innerHTML = `
                <li class="sub-empty-state">
                    <svg viewBox="0 0 48 48" fill="none"><rect x="8" y="14" width="32" height="22" rx="4" stroke="currentColor" stroke-width="2"/><path d="M16 14V10a8 8 0 0116 0v4" stroke="currentColor" stroke-width="2"/></svg>
                    <p>No subscriptions found</p>
                    <button class="primary-btn" onclick="SubscriptionsUI.openAddModal()">Add your first subscription</button>
                </li>`;
            return;
        }

        list.innerHTML = filtered.map(s => {
            const days = SubscriptionStore.daysUntil(s.nextPaymentDate);
            const dateLabel = s.nextPaymentDate ? SubscriptionStore.fmtDate(s.nextPaymentDate) : '—';
            const urgentClass = (days !== null && days <= 3 && s.active) ? 'sub-date--urgent' : '';
            const cycleLabel = s.billingCycle.charAt(0).toUpperCase() + s.billingCycle.slice(1);

            return `
            <li class="sub-row" data-id="${s.id}">
                ${_logoHtml(s)}
                <div class="sub-info">
                    <p class="sub-title">${_esc(s.name)}</p>
                    <p class="sub-sub">${SubscriptionStore.fmtCurrency(s.amount)} / ${cycleLabel.toLowerCase()} &bull; ${_esc(s.category)}</p>
                </div>
                <p class="sub-date ${urgentClass}">${dateLabel}</p>
                <label class="switch" aria-label="Toggle ${_esc(s.name)}">
                    <input type="checkbox" ${s.active ? 'checked' : ''}
                           onchange="SubscriptionsUI.handleToggle('${s.id}')">
                    <span class="switch-track"></span>
                </label>
                <div class="sub-menu-wrap">
                    <button class="icon-btn sub-menu-btn" aria-label="More options for ${_esc(s.name)}"
                            onclick="SubscriptionsUI.openRowMenu(event,'${s.id}')">
                        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5"  r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
                    </button>
                    <div class="dropdown-menu sub-menu" id="sub-menu-${s.id}" hidden>
                        <button class="dropdown-menu-item" onclick="SubscriptionsUI.openDetailDrawer('${s.id}')">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
                            View Details
                        </button>
                        <button class="dropdown-menu-item" onclick="SubscriptionsUI.openEditModal('${s.id}')">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            Edit
                        </button>
                        <button class="dropdown-menu-item danger" onclick="SubscriptionsUI.handleDelete('${s.id}')">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            Delete
                        </button>
                    </div>
                </div>
            </li>`;
        }).join('');

        // Re-render lucide icons inside newly created rows
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /* ----------------------------------------------------------
       FULL RE-RENDER  (called by SubscriptionStore.onChange)
    ---------------------------------------------------------- */
    function render(stats) {
        _renderStats(stats);
        _renderDonut(stats);
        _renderUpcoming(stats);
        _renderList(stats);
        _updateSortUI();
        _updateFilterUI();
    }

    /* ----------------------------------------------------------
       ROW KEBAB MENU
    ---------------------------------------------------------- */
    function openRowMenu(e, id) {
        e.stopPropagation();
        // Close all other open menus first
        _qa('.sub-menu:not([hidden])').forEach(m => {
            if (m.id !== `sub-menu-${id}`) m.hidden = true;
        });
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = !menu.hidden;
    }

    /* Close menus on outside click */
    function _bindGlobalClose() {
        document.addEventListener('click', () => {
            _qa('.sub-menu').forEach(m => m.hidden = true);
            _q('#sub-more-menu') && (_q('#sub-more-menu').hidden = true);
        });
    }

    /* ----------------------------------------------------------
       TOGGLE
    ---------------------------------------------------------- */
    function handleToggle(id) {
        const sub = SubscriptionStore.toggle(id);
        if (sub) {
            toast(`${sub.name} ${sub.active ? 'activated' : 'paused'}.`);
        }
    }

    /* ----------------------------------------------------------
       DELETE
    ---------------------------------------------------------- */
    function handleDelete(id) {
        const sub = SubscriptionStore.getById(id);
        if (!sub) return;

        // Close any open menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        // Confirm dialog using the custom confirm modal
        openConfirmModal(
            `Delete "${sub.name}"?`,
            'This will permanently remove it from your subscriptions.',
            () => {
                SubscriptionStore.remove(id);
                toast(`"${sub.name}" deleted.`);
            }
        );
    }

    /* ----------------------------------------------------------
       SORT
    ---------------------------------------------------------- */
    function handleSort(key) {
        if (_sortKey === key) {
            _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            _sortKey = key;
            _sortDir = 'asc';
        }
        SubscriptionStore.sort(_sortKey, _sortDir);
    }

    function _updateSortUI() {
        _qa('.sort-btn').forEach(btn => {
            const key = btn.dataset.sort;
            btn.classList.toggle('sort-btn--active', key === _sortKey);
            btn.querySelector('.sort-arrow')?.classList.toggle('sort-arrow--desc', key === _sortKey && _sortDir === 'desc');
        });
    }

    /* ----------------------------------------------------------
       FILTER
    ---------------------------------------------------------- */
    function handleFilterCat(cat) {
        _filterCat = cat;
        render(SubscriptionStore.getStats());
    }

    function handleFilterStatus(status) {
        _filterStatus = status;
        render(SubscriptionStore.getStats());
    }

    function _updateFilterUI() {
        _qa('.filter-cat-btn').forEach(btn => {
            btn.classList.toggle('filter-btn--active', btn.dataset.cat === _filterCat);
        });
        _qa('.filter-status-btn').forEach(btn => {
            btn.classList.toggle('filter-btn--active', btn.dataset.status === _filterStatus);
        });
    }

    /* ----------------------------------------------------------
       ADD / EDIT MODAL
    ---------------------------------------------------------- */
    function openAddModal() {
        _editingId = null;
        _populateModal(null);
        _openModal();
    }

    function openEditModal(id) {
        // Close row menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        _editingId = id;
        _populateModal(SubscriptionStore.getById(id));
        _openModal();
    }

    function _openModal() {
        const modal = _q('#sub-modal');
        if (!modal) return;
        modal.hidden = false;
        modal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));
        _q('#sub-modal-name')?.focus();
    }

    function closeModal() {
        const modal = _q('#sub-modal');
        if (!modal) return;
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', () => {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        }, { once: true });
        _clearModalErrors();
    }

    function _populateModal(sub) {
        const title = _q('#sub-modal-title');
        if (title) title.textContent = sub ? 'Edit Subscription' : 'Add Subscription';

        _q('#sub-modal-name').value           = sub?.name            || '';
        _q('#sub-modal-amount').value         = sub?.amount          || '';
        _q('#sub-modal-category').value       = sub?.category        || 'Entertainment';
        _q('#sub-modal-cycle').value          = sub?.billingCycle    || 'monthly';
        _q('#sub-modal-date').value           = sub?.nextPaymentDate || '';
        _q('#sub-modal-notes').value          = sub?.notes           || '';
        _q('#sub-modal-logoclass').value      = sub?.logoClass       || 'default';
        _clearModalErrors();
    }

    function _clearModalErrors() {
        _qa('.sub-modal-field-error').forEach(el => el.textContent = '');
        _qa('.sub-modal-field--error').forEach(el => el.classList.remove('sub-modal-field--error'));
    }

    function _setFieldError(fieldId, msg) {
        const input = _q(`#${fieldId}`);
        const err   = _q(`#${fieldId}-error`);
        if (input) input.closest('.sub-modal-field')?.classList.add('sub-modal-field--error');
        if (err)   err.textContent = msg;
    }

    function handleModalSubmit(e) {
        e.preventDefault();
        _clearModalErrors();

        const fields = {
            name:            _q('#sub-modal-name').value.trim(),
            amount:          _q('#sub-modal-amount').value,
            category:        _q('#sub-modal-category').value,
            billingCycle:    _q('#sub-modal-cycle').value,
            nextPaymentDate: _q('#sub-modal-date').value,
            notes:           _q('#sub-modal-notes').value,
            logoClass:       _q('#sub-modal-logoclass').value,
        };

        // Auto-derive logoText from first letter
        fields.logoText = fields.name.charAt(0).toUpperCase();

        let valid = true;
        if (!fields.name) {
            _setFieldError('sub-modal-name', 'Name is required.');
            valid = false;
        }
        if (!fields.amount || parseFloat(fields.amount) <= 0) {
            _setFieldError('sub-modal-amount', 'Enter a valid amount greater than 0.');
            valid = false;
        }
        if (!valid) return;

        try {
            if (_editingId) {
                SubscriptionStore.edit(_editingId, fields);
                toast('Subscription updated.');
            } else {
                SubscriptionStore.add(fields);
                toast('Subscription added.');
            }
            closeModal();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    /* ----------------------------------------------------------
       DETAIL DRAWER
    ---------------------------------------------------------- */
    function openDetailDrawer(id) {
        // Close row menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        _detailId = id;
        _renderDrawer(SubscriptionStore.getById(id));

        const drawer = _q('#sub-drawer');
        const overlay = _q('#sub-drawer-overlay');
        if (!drawer) return;
        drawer.hidden = false;
        overlay && (overlay.hidden = false);
        requestAnimationFrame(() => {
            drawer.classList.add('sub-drawer--open');
            overlay?.classList.add('sub-drawer-overlay--visible');
        });
    }

    function closeDrawer() {
        const drawer  = _q('#sub-drawer');
        const overlay = _q('#sub-drawer-overlay');
        if (!drawer) return;
        drawer.classList.remove('sub-drawer--open');
        overlay?.classList.remove('sub-drawer-overlay--visible');
        drawer.addEventListener('transitionend', () => {
            drawer.hidden = true;
            overlay && (overlay.hidden = true);
        }, { once: true });
        _detailId = null;
    }

    function _renderDrawer(sub) {
        if (!sub) return;
        const days  = SubscriptionStore.daysUntil(sub.nextPaymentDate);
        const urgent = days !== null && days <= 3 && sub.active;

        _q('#drawer-logo').innerHTML    = _logoHtml(sub);
        _q('#drawer-name').textContent  = sub.name;
        _q('#drawer-cat').textContent   = sub.category;
        _q('#drawer-amount').textContent = SubscriptionStore.fmtCurrency(sub.amount);
        _q('#drawer-cycle').textContent  = sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1);
        _q('#drawer-date').textContent   = SubscriptionStore.fmtDate(sub.nextPaymentDate);
        _q('#drawer-date').className     = urgent ? 'drawer-value drawer-value--urgent' : 'drawer-value';
        _q('#drawer-status').textContent = sub.active ? 'Active' : 'Paused';
        _q('#drawer-status').className   = `drawer-badge drawer-badge--${sub.active ? 'active' : 'paused'}`;
        _q('#drawer-notes').textContent  = sub.notes || 'No notes added.';
        _q('#drawer-created').textContent = SubscriptionStore.fmtDate(sub.createdAt);

        // Monthly equivalent if not already monthly
        const monthly = sub.billingCycle !== 'monthly'
            ? ` (≈ ${SubscriptionStore.fmtCurrency(sub.amount / (sub.billingCycle === 'yearly' ? 12 : sub.billingCycle === 'quarterly' ? 3 : 0.25))} / mo)`
            : '';
        _q('#drawer-monthly-equiv').textContent = monthly;

        // Wire drawer action buttons
        _q('#drawer-edit-btn').onclick   = () => { closeDrawer(); openEditModal(sub.id); };
        _q('#drawer-delete-btn').onclick = () => { closeDrawer(); handleDelete(sub.id); };
        _q('#drawer-toggle-btn').textContent = sub.active ? 'Pause Subscription' : 'Reactivate';
        _q('#drawer-toggle-btn').onclick = () => {
            handleToggle(sub.id);
            closeDrawer();
        };
    }

    /* ----------------------------------------------------------
       CONFIRM MODAL
    ---------------------------------------------------------- */
    function openConfirmModal(title, body, onConfirm) {
        const modal = _q('#sub-confirm-modal');
        if (!modal) { if (confirm(`${title}\n${body}`)) onConfirm(); return; }
        _q('#sub-confirm-title').textContent = title;
        _q('#sub-confirm-body').textContent  = body;
        _q('#sub-confirm-ok').onclick = () => { closeConfirmModal(); onConfirm(); };
        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));
    }

    function closeConfirmModal() {
        const modal = _q('#sub-confirm-modal');
        if (!modal) return;
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', () => modal.hidden = true, { once: true });
    }

    /* ----------------------------------------------------------
       TOOLBAR DROPDOWN (sort/export)
    ---------------------------------------------------------- */
    function toggleMoreMenu(e) {
        e.stopPropagation();
        const menu = _q('#sub-more-menu');
        if (menu) menu.hidden = !menu.hidden;
    }

    /* ----------------------------------------------------------
       ESCAPE HELPER
    ---------------------------------------------------------- */
    function _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ----------------------------------------------------------
       KEYBOARD: close modal/drawer on Escape
    ---------------------------------------------------------- */
    function _bindKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (!_q('#sub-modal')?.hidden)         closeModal();
                else if (!_q('#sub-drawer')?.hidden)   closeDrawer();
                else if (!_q('#sub-confirm-modal')?.hidden) closeConfirmModal();
            }
        });
    }

    /* ----------------------------------------------------------
       INIT  — called once when the subscription panel is shown
    ---------------------------------------------------------- */
    function init() {
        // Avoid double-init
        if (document.body.dataset.subUiInit === '1') {
            render(SubscriptionStore.getStats());
            return;
        }
        document.body.dataset.subUiInit = '1';

        // Subscribe to store changes
        SubscriptionStore.onChange(render);

        // Wire static buttons
        const addBtn  = _q('#add-sub-btn');
        const addFab  = _q('#sub-fab');
        const moreBtn = _q('#sub-more-btn');
        const form    = _q('#sub-modal-form');
        const modalClose     = _q('#sub-modal-close');
        const drawerClose    = _q('#sub-drawer-close');
        const drawerOverlay  = _q('#sub-drawer-overlay');
        const confirmCancel  = _q('#sub-confirm-cancel');
        const exportBtn      = _q('#sub-export-btn');

        addBtn?.addEventListener('click', openAddModal);
        addFab?.addEventListener('click', openAddModal);
        moreBtn?.addEventListener('click', toggleMoreMenu);
        form?.addEventListener('submit', handleModalSubmit);
        modalClose?.addEventListener('click', closeModal);
        drawerClose?.addEventListener('click', closeDrawer);
        drawerOverlay?.addEventListener('click', closeDrawer);
        confirmCancel?.addEventListener('click', closeConfirmModal);
        exportBtn?.addEventListener('click', () => { SubscriptionStore.exportCSV(); toast('Exported to CSV.'); });

        // Sort buttons
        _qa('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => handleSort(btn.dataset.sort));
        });

        // Filter buttons
        _qa('.filter-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFilterCat(btn.dataset.cat));
        });
        _qa('.filter-status-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFilterStatus(btn.dataset.status));
        });

        // Close modal on backdrop click
        _q('#sub-modal')?.addEventListener('click', e => {
            if (e.target.id === 'sub-modal') closeModal();
        });

        _bindGlobalClose();
        _bindKeyboard();

        // Initial render
        render(SubscriptionStore.getStats());
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        init,
        render,
        openAddModal,
        openEditModal,
        openDetailDrawer,
        closeModal,
        closeDrawer,
        closeConfirmModal,
        handleToggle,
        handleDelete,
        handleSort,
        handleFilterCat,
        handleFilterStatus,
        openRowMenu,
        handleModalSubmit,
        toggleMoreMenu,
    });

})();
