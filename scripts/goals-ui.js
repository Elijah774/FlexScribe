/* =============================================================
   FlexScribe — Goals Panel UI
   scripts/goals-ui.js

   Responsibilities:
   • Renders goal cards, stats, filters
   • New Goal modal + Edit Goal modal
   • Goal detail drawer with contribution history
   • Add Funds quick action (reads wallet balance)
   • Progress bar animation on first view
   • Wires up all event listeners (idempotent init)
============================================================= */

'use strict';

const GoalsUI = (() => {

    /* ----------------------------------------------------------
       STATE
    ---------------------------------------------------------- */
    let _initialized = false;
    let _filter = 'all'; // 'all' | 'in_progress' | 'completed'
    let _editingId = null; // null = new goal, string = editing
    let _drawerGoalId = null;

    /* ----------------------------------------------------------
       SELECTORS (cached after init)
    ---------------------------------------------------------- */
    let $panel, $statsGrid, $filterBar, $grid;
    let $modal, $modalTitle, $modalForm, $modalError;
    let $drawerOverlay, $drawer;

    /* ----------------------------------------------------------
       INIT (idempotent — safe to call on every panel visit)
    ---------------------------------------------------------- */
    function init() {
        $panel = document.getElementById('panel-goals');
        if (!$panel) return;

        $statsGrid   = $panel.querySelector('.goals-stats');
        $filterBar   = $panel.querySelector('.goals-filter-bar');
        $grid        = $panel.querySelector('.goals-grid');
        $modal       = document.getElementById('goals-modal');
        $modalTitle  = document.getElementById('goals-modal-title');
        $modalForm   = document.getElementById('goals-modal-form');
        $modalError  = document.getElementById('goals-modal-error');
        $drawerOverlay = document.getElementById('goals-drawer-overlay');
        $drawer      = document.getElementById('goals-drawer');

        if (!_initialized) {
            _bindEvents();
            GoalsStore.onChange(() => render());
            _initialized = true;
        }

        render();
    }

    /* ----------------------------------------------------------
       EVENT BINDING
    ---------------------------------------------------------- */
    function _bindEvents() {
        // Filter buttons
        $filterBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.goals-filter-btn');
            if (!btn) return;
            _filter = btn.dataset.filter;
            $filterBar.querySelectorAll('.goals-filter-btn').forEach(b => b.classList.remove('filter-btn--active'));
            btn.classList.add('filter-btn--active');
            render();
        });

        // Grid click → open card or open add modal
        $grid.addEventListener('click', (e) => {
            const addCard = e.target.closest('.goal-card--add');
            if (addCard) { openModal(); return; }

            const card = e.target.closest('.goal-card[data-id]');
            if (card) openDrawer(card.dataset.id);
        });

        // Modal close
        document.getElementById('goals-modal-close').addEventListener('click', closeModal);
        document.getElementById('goals-modal-cancel').addEventListener('click', closeModal);
        $modal.addEventListener('click', (e) => { if (e.target === $modal) closeModal(); });

        // Modal form submit
        $modalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            _handleModalSave();
        });

        // Drawer close
        document.getElementById('goals-drawer-close').addEventListener('click', closeDrawer);
        $drawerOverlay.addEventListener('click', closeDrawer);

        // Drawer actions
        document.getElementById('goals-drawer-edit-btn').addEventListener('click', () => {
            closeDrawer();
            setTimeout(() => openModal(_drawerGoalId), 300);
        });

        document.getElementById('goals-drawer-delete-btn').addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this goal? This cannot be undone.')) {
                GoalsStore.remove(_drawerGoalId);
                closeDrawer();
            }
        });

        // Add Funds inside drawer
        document.getElementById('goals-drawer-addfunds-btn').addEventListener('click', _handleAddFunds);
    }

    /* ----------------------------------------------------------
       RENDER
    ---------------------------------------------------------- */
    function render() {
        _renderStats();
        _renderGrid();
    }

    function _renderStats() {
        const stats = GoalsStore.getStats();
        document.getElementById('goals-stat-total-saved').textContent = GoalsStore.fmtCurrency(stats.totalSaved);
        document.getElementById('goals-stat-active').textContent = stats.active;
        document.getElementById('goals-stat-completed').textContent = stats.completed;
    }

    function _renderGrid() {
        let goals = GoalsStore.getAll();

        // Filter
        if (_filter === 'in_progress') goals = goals.filter(g => g.status === 'in_progress');
        else if (_filter === 'completed') goals = goals.filter(g => g.status === 'completed');

        let html = '';

        goals.forEach(goal => {
            const pct = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));
            const isComplete = goal.status === 'completed';
            const bannerBg = _getBannerColor(goal.category);

            html += `
            <div class="goal-card" data-id="${goal.id}">
                <div class="goal-card-banner" style="background:${bannerBg}">
                    ${goal.imageUrl
                        ? `<img src="${goal.imageUrl}" alt="${goal.name}">`
                        : `<span class="goal-card-banner-placeholder">${_getCategoryIcon(goal.category)}</span>`
                    }
                </div>
                <div class="goal-card-body">
                    <p class="goal-card-title">${goal.name}</p>
                    <p class="goal-card-amounts">
                        <span class="saved">${GoalsStore.fmtCurrency(goal.savedAmount)}</span>
                        / ${GoalsStore.fmtCurrency(goal.targetAmount)}
                    </p>
                    <div class="goal-progress-wrap">
                        <div class="goal-progress-bar">
                            <div class="goal-progress-fill ${isComplete ? 'completed' : ''}"
                                 data-width="${pct}" style="width:0%"></div>
                        </div>
                        <div class="goal-progress-label">
                            <span class="goal-progress-pct ${isComplete ? 'completed' : ''}">${pct}%</span>
                            <span class="goal-category-badge" data-cat="${goal.category}">${goal.category}</span>
                        </div>
                    </div>
                </div>
            </div>`;
        });

        // + New Goal card
        html += `
        <div class="goal-card goal-card--add" role="button" aria-label="Add new goal">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span>New Goal</span>
        </div>`;

        $grid.innerHTML = html;

        // Trigger progress bar animations
        requestAnimationFrame(() => {
            $grid.querySelectorAll('.goal-progress-fill').forEach(bar => {
                const w = bar.dataset.width;
                bar.style.setProperty('--goal-fill-to', w + '%');
                bar.style.width = w + '%';
                bar.classList.add('animate');
            });
        });
    }

    /* ----------------------------------------------------------
       MODAL — New / Edit Goal
    ---------------------------------------------------------- */
    function openModal(editId) {
        _editingId = editId || null;
        $modalError.textContent = '';

        if (_editingId) {
            const goal = GoalsStore.getById(_editingId);
            if (!goal) return;
            $modalTitle.textContent = 'Edit Goal';
            document.getElementById('goals-modal-name').value = goal.name;
            document.getElementById('goals-modal-target').value = goal.targetAmount;
            document.getElementById('goals-modal-date').value = goal.targetDate;
            document.getElementById('goals-modal-category').value = goal.category;
            document.getElementById('goals-modal-image').value = goal.imageUrl;
        } else {
            $modalTitle.textContent = 'New Goal';
            $modalForm.reset();
        }

        $modal.hidden = false;
        document.getElementById('goals-modal-name').focus();
    }

    function closeModal() {
        $modal.hidden = true;
        _editingId = null;
        $modalForm.reset();
        $modalError.textContent = '';
    }

    function _handleModalSave() {
        const name = document.getElementById('goals-modal-name').value.trim();
        const targetAmount = parseFloat(document.getElementById('goals-modal-target').value);
        const targetDate = document.getElementById('goals-modal-date').value;
        const category = document.getElementById('goals-modal-category').value;
        const imageUrl = document.getElementById('goals-modal-image').value.trim();

        if (!name) { $modalError.textContent = 'Please enter a goal name.'; return; }
        if (!targetAmount || targetAmount <= 0) { $modalError.textContent = 'Please enter a valid target amount.'; return; }

        try {
            if (_editingId) {
                GoalsStore.edit(_editingId, { name, targetAmount, targetDate, category, imageUrl });
            } else {
                GoalsStore.add({ name, targetAmount, targetDate, category, imageUrl });
            }
            closeModal();
        } catch (err) {
            $modalError.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       DRAWER — Goal Detail
    ---------------------------------------------------------- */
    function openDrawer(id) {
        const goal = GoalsStore.getById(id);
        if (!goal) return;
        _drawerGoalId = id;

        // Header info
        document.getElementById('goals-drawer-name').textContent = goal.name;
        document.getElementById('goals-drawer-cat').textContent = goal.category;

        // Stats
        document.getElementById('goals-drawer-target').textContent = GoalsStore.fmtCurrency(goal.targetAmount);
        document.getElementById('goals-drawer-saved').textContent = GoalsStore.fmtCurrency(goal.savedAmount);
        document.getElementById('goals-drawer-remaining').textContent = GoalsStore.fmtCurrency(Math.max(0, goal.targetAmount - goal.savedAmount));
        document.getElementById('goals-drawer-status').textContent = goal.status === 'completed' ? 'Completed' : 'In Progress';
        document.getElementById('goals-drawer-created').textContent = GoalsStore.fmtDate(goal.createdAt);
        document.getElementById('goals-drawer-deadline').textContent = goal.targetDate ? GoalsStore.fmtDate(goal.targetDate) : '—';

        // Contribution history
        const $list = document.getElementById('goals-contribution-list');
        if (goal.contributions.length === 0) {
            $list.innerHTML = '<li style="color:var(--text-light);font-size:13px;padding:8px 0;">No contributions yet.</li>';
        } else {
            $list.innerHTML = [...goal.contributions].reverse().map(c => `
                <li class="goals-contribution-item">
                    <div class="goals-contribution-info">
                        <span class="goals-contribution-note">${c.note || 'Contribution'}</span>
                        <span class="goals-contribution-date">${GoalsStore.fmtDate(c.date)}</span>
                    </div>
                    <span class="goals-contribution-amount">+${GoalsStore.fmtCurrency(c.amount)}</span>
                </li>
            `).join('');
        }

        // Forecast
        const $forecast = document.getElementById('goals-drawer-forecast');
        const forecast = GoalsStore.getForecast(id);
        if (forecast) {
            $forecast.innerHTML = `At your current pace (<strong>${GoalsStore.fmtCurrency(forecast.avgMonthly)}/month</strong>), you'll reach this goal by <strong>${GoalsStore.fmtDate(forecast.forecastDate)}</strong>.`;
            $forecast.hidden = false;
        } else {
            $forecast.hidden = true;
        }

        // Wallet balance hint
        const $walletHint = document.getElementById('goals-drawer-wallet-hint');
        if (typeof WalletStore !== 'undefined') {
            const snap = WalletStore.getSnapshot();
            $walletHint.textContent = `Wallet balance: ${snap.fmtBalance}`;
        } else {
            $walletHint.textContent = '';
        }

        // Clear fund input
        document.getElementById('goals-drawer-fund-amount').value = '';

        $drawerOverlay.hidden = false;
        $drawer.hidden = false;
    }

    function closeDrawer() {
        $drawerOverlay.hidden = true;
        $drawer.hidden = true;
        _drawerGoalId = null;
    }

    /* ----------------------------------------------------------
       ADD FUNDS (inside drawer)
    ---------------------------------------------------------- */
    function _handleAddFunds() {
        const $input = document.getElementById('goals-drawer-fund-amount');
        const amount = parseFloat($input.value);
        if (!amount || amount <= 0) { $input.focus(); return; }

        try {
            GoalsStore.contribute(_drawerGoalId, amount, 'Quick fund from wallet');

            // Optionally debit wallet
            if (typeof WalletStore !== 'undefined') {
                try {
                    WalletStore.transferToGoal(amount, GoalsStore.getById(_drawerGoalId)?.name || 'Goal');
                } catch (e) {
                    // Wallet insufficient — still recorded as goal contribution
                    console.warn('Wallet debit skipped:', e.message);
                }
            }

            // Refresh drawer
            openDrawer(_drawerGoalId);
        } catch (err) {
            alert(err.message);
        }
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */
    function _getBannerColor(category) {
        const colors = {
            Travel:    'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
            Tech:      'linear-gradient(135deg, #A77CFF 0%, #7C3AED 100%)',
            Education: 'linear-gradient(135deg, #FACC15 0%, #EAB308 100%)',
            Emergency: 'linear-gradient(135deg, #F87171 0%, #DC2626 100%)',
            Home:      'linear-gradient(135deg, #B9F15B 0%, #65A30D 100%)',
            Vehicle:   'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)',
            Other:     'linear-gradient(135deg, #6B7280 0%, #374151 100%)'
        };
        return colors[category] || colors.Other;
    }

    function _getCategoryIcon(category) {
        const icons = {
            Travel:    '✈️',
            Tech:      '💻',
            Education: '📚',
            Emergency: '🚨',
            Home:      '🏠',
            Vehicle:   '🚗',
            Other:     '🎯'
        };
        return icons[category] || '🎯';
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        init,
        render,
        openModal,
        closeModal,
        openDrawer,
        closeDrawer,
    });

})();
