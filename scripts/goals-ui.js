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
    let _goals = []; // loaded from API

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
            _bindGoalsConfirm();
            _initialized = true;
        }

        _loadGoalsFromAPI();
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
            var editId = _drawerGoalId;
            closeDrawer();
            setTimeout(() => openModal(editId), 300);
        });

        document.getElementById('goals-drawer-delete-btn').addEventListener('click', () => {
            _showGoalsConfirm('Are you sure you want to delete this goal? This cannot be undone.', function() {
                API.Goals.remove(_drawerGoalId).then(function(result) {
                    if (result.success) {
                        closeDrawer();
                        _loadGoalsFromAPI();
                    } else {
                        alert(result.error || 'Failed to delete goal.');
                    }
                }).catch(function() {
                    alert('Network error. Please try again.');
                });
            });
        });

        // Add Funds inside drawer
        document.getElementById('goals-drawer-addfunds-btn').addEventListener('click', _handleAddFunds);
    }

    /* ----------------------------------------------------------
       LOAD GOALS FROM BACKEND API
    ---------------------------------------------------------- */
    async function _loadGoalsFromAPI() {
        try {
            var result = await API.Goals.getAll();
            if (result.success && Array.isArray(result.data)) {
                _goals = result.data.map(function(g) {
                    return {
                        id: g.goalID || g.id,
                        name: g.goalName || g.name || '',
                        targetAmount: parseFloat(g.targetAmount) || 0,
                        savedAmount: parseFloat(g.currentProgress) || 0,
                        targetDate: g.deadline ? g.deadline.split('T')[0] : '',
                        category: g.category || 'Other',
                        imageUrl: g.imageUrl || '',
                        status: g.goalStatus === 'active' ? 'in_progress' : (g.goalStatus || 'in_progress'),
                        createdAt: g.createdAt ? g.createdAt.split('T')[0] : '',
                        contributions: g.contributions || []
                    };
                });
            } else {
                _goals = [];
            }
        } catch (err) {
            console.error('Failed to load goals from API:', err);
            _goals = [];
        }
        render();
        return _goals;
    }

    /** Get a goal by ID from the local cache */
    function _getGoalById(id) {
        return _goals.find(function(g) { return String(g.id) === String(id); }) || null;
    }

    /* ----------------------------------------------------------
       RENDER
    ---------------------------------------------------------- */
    function render() {
        _renderStats();
        _renderGrid();
    }

    function _renderStats() {
        var totalSaved = _goals.reduce(function(s, g) { return s + g.savedAmount; }, 0);
        var active = _goals.filter(function(g) { return g.status === 'in_progress'; }).length;
        var completed = _goals.filter(function(g) { return g.status === 'completed'; }).length;
        document.getElementById('goals-stat-total-saved').textContent = 'R' + totalSaved.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        document.getElementById('goals-stat-active').textContent = active;
        document.getElementById('goals-stat-completed').textContent = completed;
    }

    function _renderGrid() {
        var goals = _goals.slice();

        // Filter
        if (_filter === 'in_progress') goals = goals.filter(function(g) { return g.status === 'in_progress'; });
        else if (_filter === 'completed') goals = goals.filter(function(g) { return g.status === 'completed'; });

        var html = '';

        goals.forEach(function(goal) {
            var pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100)) : 0;
            var isComplete = goal.status === 'completed';
            var bannerBg = _getBannerColor(goal.category);

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
                        <span class="saved">R${goal.savedAmount.toFixed(2)}</span>
                        / R${goal.targetAmount.toFixed(2)}
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
            const goal = _getGoalById(_editingId);
            if (goal) {
                $modalTitle.textContent = 'Edit Goal';
                document.getElementById('goals-modal-name').value = goal.name;
                document.getElementById('goals-modal-target').value = goal.targetAmount;
                document.getElementById('goals-modal-date').value = goal.targetDate;
                document.getElementById('goals-modal-category').value = goal.category;
                document.getElementById('goals-modal-image').value = goal.imageUrl;
            } else {
                // Goal not in local cache — still open as edit, user can fill in values
                $modalTitle.textContent = 'Edit Goal';
            }
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
        if (!targetDate) { $modalError.textContent = 'Please select a target date.'; return; }
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var selectedDate = new Date(targetDate + 'T00:00:00');
        if (selectedDate < today) { $modalError.textContent = 'Target date cannot be in the past.'; return; }

        // Call the real backend API

        if (_editingId) {
            API.Goals.edit(_editingId, { goalName: name, targetAmount: targetAmount, deadline: targetDate }).then(function(result) {
                if (result.success) {
                    closeModal();
                    _loadGoalsFromAPI();
                } else {
                    $modalError.textContent = result.error || 'Failed to update goal.';
                }
            }).catch(function(err) {
                $modalError.textContent = 'Network error. Please try again.';
            });
        } else {
            API.Goals.add({ goalName: name, targetAmount: targetAmount, deadline: targetDate }).then(function(result) {
                if (result.success) {
                    closeModal();
                    _loadGoalsFromAPI();
                } else {
                    $modalError.textContent = result.error || 'Failed to create goal.';
                }
            }).catch(function(err) {
                $modalError.textContent = 'Network error. Please try again.';
            });
        }
    }

    /* ----------------------------------------------------------
       DRAWER — Goal Detail
    ---------------------------------------------------------- */
    function openDrawer(id) {
        const goal = _getGoalById(id);
        if (!goal) return;
        _drawerGoalId = id;

        // Header info
        document.getElementById('goals-drawer-name').textContent = goal.name;
        document.getElementById('goals-drawer-cat').textContent = goal.category;

        // Stats
        document.getElementById('goals-drawer-target').textContent = 'R' + goal.targetAmount.toFixed(2);
        document.getElementById('goals-drawer-saved').textContent = 'R' + goal.savedAmount.toFixed(2);
        document.getElementById('goals-drawer-remaining').textContent = 'R' + Math.max(0, goal.targetAmount - goal.savedAmount).toFixed(2);
        document.getElementById('goals-drawer-status').textContent = goal.status === 'completed' ? 'Completed' : 'In Progress';
        document.getElementById('goals-drawer-created').textContent = goal.createdAt || '—';
        document.getElementById('goals-drawer-deadline').textContent = goal.targetDate || '—';

        // Contribution history
        const $list = document.getElementById('goals-contribution-list');
        if (!goal.contributions || goal.contributions.length === 0) {
            $list.innerHTML = '<li style="color:var(--text-light);font-size:13px;padding:8px 0;">No contributions yet.</li>';
        } else {
            $list.innerHTML = [...goal.contributions].reverse().map(function(c) { return '<li class="goals-contribution-item"><div class="goals-contribution-info"><span class="goals-contribution-note">' + (c.note || 'Contribution') + '</span><span class="goals-contribution-date">' + (c.date || '') + '</span></div><span class="goals-contribution-amount">+R' + (c.amount || 0).toFixed(2) + '</span></li>'; }).join('');
        }

        // Forecast — simplified since we no longer have the local forecast function
        const $forecast = document.getElementById('goals-drawer-forecast');
        $forecast.hidden = true;

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
            API.Goals.contribute(_drawerGoalId, amount).then(function(result) {
                if (result.success) {
                    _loadGoalsFromAPI().then(function() {
                        openDrawer(_drawerGoalId);
                    });
                } else {
                    alert(result.error || 'Failed to add funds.');
                }
            }).catch(function() {
                alert('Network error. Please try again.');
            });
        } catch (err) {
            alert(err.message);
        }
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */
    function _getBannerColor(category) {
        const colors = {
            Travel:    'linear-gradient(135deg, #A77CFF 0%, #6D3FD4 100%)',
            Tech:      'linear-gradient(135deg, #A77CFF 0%, #6D3FD4 100%)',
            Education: 'linear-gradient(135deg, #FF9B6B 0%, #C56A2E 100%)',
            Emergency: 'linear-gradient(135deg, #E36565 0%, #B23A3A 100%)',
            Home:      'linear-gradient(135deg, #6FDB8F 0%, #3E9E5C 100%)',
            Vehicle:   'linear-gradient(135deg, #94969D 0%, #5C5E65 100%)',
            Other:     'linear-gradient(135deg, #5C5E65 0%, #2A2C31 100%)'
        };
        return colors[category] || colors.Other;
    }

    function _getCategoryIcon(category) {
        const icons = {
            Travel:    'T',
            Tech:      'Tc',
            Education: 'Ed',
            Emergency: 'Em',
            Home:      'H',
            Vehicle:   'V',
            Other:     'O'
        };
        return icons[category] || 'O';
    }

    /* ----------------------------------------------------------
       CONFIRM MODAL (styled popup instead of browser confirm())
    ---------------------------------------------------------- */
    let _goalsConfirmCallback = null;

    function _showGoalsConfirm(message, onConfirm) {
        var $modal = document.getElementById('goals-confirm-modal');
        document.getElementById('goals-confirm-message').textContent = message;
        _goalsConfirmCallback = onConfirm;
        $modal.hidden = false;
    }

    function _closeGoalsConfirm() {
        var $modal = document.getElementById('goals-confirm-modal');
        $modal.hidden = true;
        _goalsConfirmCallback = null;
    }

    function _bindGoalsConfirm() {
        document.getElementById('goals-confirm-close').addEventListener('click', _closeGoalsConfirm);
        document.getElementById('goals-confirm-cancel').addEventListener('click', _closeGoalsConfirm);
        document.getElementById('goals-confirm-ok').addEventListener('click', function() {
            if (_goalsConfirmCallback) _goalsConfirmCallback();
            _closeGoalsConfirm();
        });
        document.getElementById('goals-confirm-modal').addEventListener('click', function(e) {
            if (e.target === this) _closeGoalsConfirm();
        });
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
