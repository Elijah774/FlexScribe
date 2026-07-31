/* =============================================================
   FlexScribe — Dependants Panel UI
   scripts/dependants-ui.js

   Responsibilities:
   • Renders dependant card grid with seed data
   • Add Dependant modal with validation
   • Detail drawer with permissions & activity
   • Send Allowance modal with wallet integration
   • Status badge management
   • Wires up all event listeners (idempotent init)
============================================================= */

'use strict';

const DependantsUI = (() => {

    /* ----------------------------------------------------------
       STATE
    ---------------------------------------------------------- */
    let _initialized = false;
    let _drawerDepId = null;

    /* ----------------------------------------------------------
       SELECTORS (cached after init)
    ---------------------------------------------------------- */
    let $panel, $grid;
    let $addModal, $addForm, $addError;
    let $sendModal, $sendForm, $sendError, $sendDepName;
    let $drawerOverlay, $drawer;

    /* ----------------------------------------------------------
       AVATAR COLORS (rotate based on index)
    ---------------------------------------------------------- */
    const AVATAR_COLORS = ['blue', 'purple', 'green', 'orange', 'pink', 'teal'];

    function _avatarColor(index) {
        return AVATAR_COLORS[index % AVATAR_COLORS.length];
    }

    /* ----------------------------------------------------------
       INIT (idempotent — safe to call on every panel visit)
    ---------------------------------------------------------- */
    function init() {
        $panel = document.getElementById('panel-dependants');
        if (!$panel) return;

        $grid = $panel.querySelector('.dep-grid');
        $addModal = document.getElementById('dep-add-modal');
        $addForm  = document.getElementById('dep-add-form');
        $addError = document.getElementById('dep-add-error');
        $sendModal   = document.getElementById('dep-send-modal');
        $sendForm    = document.getElementById('dep-send-form');
        $sendError   = document.getElementById('dep-send-error');
        $sendDepName = document.getElementById('dep-send-dep-name');
        $drawerOverlay = document.getElementById('dep-drawer-overlay');
        $drawer = document.getElementById('dep-drawer');

        if (!_initialized) {
            _bindEvents();
            DependantsStore.onChange(() => render());
            _initialized = true;
        }

        render();
    }

    /* ----------------------------------------------------------
       EVENT BINDING
    ---------------------------------------------------------- */
    function _bindEvents() {
        // Grid click → open drawer or add modal
        $grid.addEventListener('click', (e) => {
            const addCard = e.target.closest('.dep-card--add');
            if (addCard) { openAddModal(); return; }

            const card = e.target.closest('.dep-card[data-id]');
            if (card) openDrawer(card.dataset.id);
        });

        // ── Add Modal ──
        document.getElementById('dep-add-close').addEventListener('click', closeAddModal);
        document.getElementById('dep-add-cancel').addEventListener('click', closeAddModal);
        $addModal.addEventListener('click', (e) => { if (e.target === $addModal) closeAddModal(); });
        $addForm.addEventListener('submit', (e) => { e.preventDefault(); _handleAddSave(); });

        // ── Send Allowance Modal ──
        document.getElementById('dep-send-close').addEventListener('click', closeSendModal);
        document.getElementById('dep-send-cancel').addEventListener('click', closeSendModal);
        $sendModal.addEventListener('click', (e) => { if (e.target === $sendModal) closeSendModal(); });
        $sendForm.addEventListener('submit', (e) => { e.preventDefault(); _handleSendAllowance(); });

        // ── Drawer ──
        document.getElementById('dep-drawer-close').addEventListener('click', closeDrawer);
        $drawerOverlay.addEventListener('click', closeDrawer);

        document.getElementById('dep-drawer-send-btn').addEventListener('click', () => {
            if (!_drawerDepId) return;
            openSendModal(_drawerDepId);
        });

        document.getElementById('dep-drawer-delete-btn').addEventListener('click', () => {
            if (!_drawerDepId) return;
            if (confirm('Are you sure you want to remove this dependant? This cannot be undone.')) {
                DependantsStore.remove(_drawerDepId);
                closeDrawer();
            }
        });
    }

    /* ----------------------------------------------------------
       RENDER
    ---------------------------------------------------------- */
    function render() {
        _renderGrid();
    }

    function _renderGrid() {
        const deps = DependantsStore.getAll();
        let html = '';

        deps.forEach((dep, idx) => {
            const colorClass = _avatarColor(idx);
            const statusClass = `dep-status-badge--${dep.status}`;

            html += `
            <div class="dep-card" data-id="${dep.id}">
                <div class="dep-avatar dep-avatar--${colorClass}">${dep.avatar}</div>
                <p class="dep-card-name">${dep.name}</p>
                <span class="dep-card-relationship">${dep.relationship}</span>
                <p class="dep-card-allowance">Allowance: <strong>${DependantsStore.fmtCurrency(dep.allowance)}</strong>/mo</p>
                <span class="dep-status-badge ${statusClass}">${dep.status}</span>
            </div>`;
        });

        // + Add Dependant card
        html += `
        <div class="dep-card dep-card--add" role="button" aria-label="Add new dependant">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span>Add Dependant</span>
        </div>`;

        $grid.innerHTML = html;
    }

    /* ----------------------------------------------------------
       ADD DEPENDANT MODAL
    ---------------------------------------------------------- */
    function openAddModal() {
        $addForm.reset();
        $addError.textContent = '';
        $addModal.hidden = false;
        document.getElementById('dep-add-name').focus();
    }

    function closeAddModal() {
        $addModal.hidden = true;
        $addForm.reset();
        $addError.textContent = '';
    }

    function _handleAddSave() {
        const name = document.getElementById('dep-add-name').value.trim();
        const email = document.getElementById('dep-add-email').value.trim();
        const relationship = document.getElementById('dep-add-relationship').value;
        const allowance = parseFloat(document.getElementById('dep-add-allowance').value) || 0;
        const spendingLimit = parseFloat(document.getElementById('dep-add-spending-limit').value) || 0;

        if (!name) { $addError.textContent = 'Please enter a name.'; return; }
        if (!email) { $addError.textContent = 'Please enter an email.'; return; }
        if (!email.includes('@')) { $addError.textContent = 'Please enter a valid email.'; return; }

        try {
            DependantsStore.add({ name, email, relationship, allowance, spendingLimit });
            closeAddModal();
            _showToast('Dependant added successfully!', 'success');
        } catch (err) {
            $addError.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       SEND ALLOWANCE MODAL
    ---------------------------------------------------------- */
    function openSendModal(depId) {
        const dep = DependantsStore.getById(depId);
        if (!dep) return;

        _drawerDepId = depId;
        $sendForm.reset();
        $sendError.textContent = '';
        $sendDepName.textContent = dep.name;

        // Pre-fill amount with dependant's usual allowance
        document.getElementById('dep-send-amount').value = dep.allowance;

        $sendModal.hidden = false;
        document.getElementById('dep-send-amount').focus();
    }

    function closeSendModal() {
        $sendModal.hidden = true;
        $sendForm.reset();
        $sendError.textContent = '';
    }

    function _handleSendAllowance() {
        const amount = parseFloat(document.getElementById('dep-send-amount').value);
        const frequency = document.getElementById('dep-send-frequency').value;

        if (!amount || amount <= 0) { $sendError.textContent = 'Please enter a valid amount.'; return; }

        try {
            DependantsStore.sendAllowance(_drawerDepId, amount, frequency);
            closeSendModal();
            _showToast('Allowance sent successfully!', 'success');

            // Refresh drawer if still open
            if (!$drawer.hidden) openDrawer(_drawerDepId);
        } catch (err) {
            $sendError.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       DETAIL DRAWER
    ---------------------------------------------------------- */
    function openDrawer(id) {
        const dep = DependantsStore.getById(id);
        if (!dep) return;
        _drawerDepId = id;

        // Header
        const idx = DependantsStore.getAll().findIndex(d => d.id === id);
        const colorClass = _avatarColor(idx >= 0 ? idx : 0);
        document.getElementById('dep-drawer-avatar').className = `dep-avatar dep-avatar--${colorClass}`;
        document.getElementById('dep-drawer-avatar').textContent = dep.avatar;
        document.getElementById('dep-drawer-name').textContent = dep.name;
        document.getElementById('dep-drawer-rel').textContent = dep.relationship;

        // Status
        const $status = document.getElementById('dep-drawer-status');
        $status.textContent = dep.status;
        $status.className = `dep-status-badge dep-status-badge--${dep.status}`;

        // Permissions
        document.getElementById('dep-perm-spend').checked = dep.permissions.canSpend;
        document.getElementById('dep-perm-view-wallet').checked = dep.permissions.canViewWallet;
        document.getElementById('dep-perm-request').checked = dep.permissions.canRequestFunds;

        // Wire permission toggles
        _wirePermissionToggle('dep-perm-spend', 'canSpend');
        _wirePermissionToggle('dep-perm-view-wallet', 'canViewWallet');
        _wirePermissionToggle('dep-perm-request', 'canRequestFunds');

        // Activity list
        const $actList = document.getElementById('dep-drawer-activity-list');
        if (dep.activity.length === 0) {
            $actList.innerHTML = '<li style="color:var(--text-light);font-size:13px;padding:8px 0;">No activity yet.</li>';
        } else {
            $actList.innerHTML = [...dep.activity].reverse().map(a => {
                const amountClass = a.type === 'spend' ? 'dep-activity-amount--spend' : '';
                const prefix = a.type === 'spend' ? '-' : '+';
                return `
                <li class="dep-activity-item">
                    <div class="dep-activity-info">
                        <span class="dep-activity-desc">${a.description}</span>
                        <span class="dep-activity-date">${DependantsStore.fmtDate(a.date)}</span>
                    </div>
                    <span class="dep-activity-amount ${amountClass}">${prefix}${DependantsStore.fmtCurrency(a.amount)}</span>
                </li>`;
            }).join('');
        }

        $drawerOverlay.hidden = false;
        $drawer.hidden = false;
    }

    function closeDrawer() {
        $drawerOverlay.hidden = true;
        $drawer.hidden = true;
        _drawerDepId = null;
    }

    function _wirePermissionToggle(checkboxId, permKey) {
        const $cb = document.getElementById(checkboxId);
        // Remove old listener by cloning
        const $new = $cb.cloneNode(true);
        $cb.parentNode.replaceChild($new, $cb);
        $new.addEventListener('change', () => {
            if (!_drawerDepId) return;
            DependantsStore.updatePermissions(_drawerDepId, { [permKey]: $new.checked });
        });
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */
    function _showToast(message, type) {
        // Use shared toast utility if available
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else if (typeof UIUtils !== 'undefined' && UIUtils.toast) {
            UIUtils.toast(message, type);
        } else {
            // Fallback: simple inline toast
            const el = document.createElement('div');
            el.textContent = message;
            el.style.cssText = `
                position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
                background:var(--card);border:1px solid var(--border);color:var(--text);
                padding:12px 24px;border-radius:10px;font-size:14px;z-index:9999;
                animation:fadeIn 200ms ease;
            `;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 3000);
        }
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        init,
        render,
        openAddModal,
        closeAddModal,
        openSendModal,
        closeSendModal,
        openDrawer,
        closeDrawer,
    });

})();
