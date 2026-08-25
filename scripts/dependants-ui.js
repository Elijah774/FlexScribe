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
    let _taskSortBy = 'dueDate';
    let _taskSortOrder = 'asc';
    let _editingTaskId = null; // null = add mode, string = edit mode
    let _taskSearchQuery = '';

    /* ----------------------------------------------------------
       SELECTORS (cached after init)
    ---------------------------------------------------------- */
    let $panel, $grid;
    let $addModal, $addForm, $addError;
    let $editModal, $editForm, $editError;
    let $taskModal, $taskForm, $taskError;
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
        $editModal = document.getElementById('dep-edit-modal');
        $editForm  = document.getElementById('dep-edit-form');
        $editError = document.getElementById('dep-edit-error');
        $taskModal = document.getElementById('dep-task-modal');
        $taskForm  = document.getElementById('dep-task-form');
        $taskError = document.getElementById('dep-task-error');
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

        // Load from API
        DependantsStore.loadFromAPI().then(function() {
            render();
        }).catch(function(err) {
            console.error('Dependants load error:', err);
            render();
        });
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

        // ── Edit Modal ──
        document.getElementById('dep-edit-close').addEventListener('click', () => {
            _showConfirm('Are you sure you want to cancel editing this dependant?', () => closeEditModal(), 'Confirm', 'Confirm Cancellation');
        });
        document.getElementById('dep-edit-cancel').addEventListener('click', () => {
            _showConfirm('Are you sure you want to cancel editing this dependant?', () => closeEditModal(), 'Confirm', 'Confirm Cancellation');
        });
        $editModal.addEventListener('click', (e) => {
            if (e.target === $editModal) _showConfirm('Are you sure you want to cancel editing this dependant?', () => closeEditModal(), 'Confirm', 'Confirm Cancellation');
        });
        $editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            _showConfirm('Save changes to this dependant?', () => _handleEditSave(), 'Confirm', 'Confirm Changes');
        });

        // ── Task Modal ──
        document.getElementById('dep-task-modal-close').addEventListener('click', () => {
            _showConfirm('Are you sure you want to cancel editing this task?', () => closeTaskModal(), 'Confirm', 'Confirm Cancellation');
        });
        document.getElementById('dep-task-cancel').addEventListener('click', () => {
            _showConfirm('Are you sure you want to cancel editing this task?', () => closeTaskModal(), 'Confirm', 'Confirm Cancellation');
        });
        $taskModal.addEventListener('click', (e) => {
            if (e.target === $taskModal) _showConfirm('Are you sure you want to cancel editing this task?', () => closeTaskModal(), 'Confirm', 'Confirm Cancellation');
        });
        $taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Validate before confirming
            const task = document.getElementById('dep-task-name').value.trim();
            const dueDate = document.getElementById('dep-task-due').value;
            const reward = parseFloat(document.getElementById('dep-task-reward').value) || 0;

            $taskError.textContent = '';
            if (!task) { $taskError.textContent = 'Please enter a task name.'; return; }
            if (!dueDate) { $taskError.textContent = 'Please select a due date.'; return; }

            // Prevent past due dates — only today or future dates are allowed
            const today = new Date().toISOString().split('T')[0];
            if (dueDate < today) { $taskError.textContent = 'Due date cannot be in the past. Please select today or a future date.'; return; }

            if (!reward || reward <= 0) { $taskError.textContent = 'Please enter a reward amount.'; return; }

            const label = _editingTaskId ? 'Save changes to this task?' : 'Add this task?';
            const title = _editingTaskId ? 'Confirm Changes' : 'Confirm Add';
            _showConfirm(label, () => _handleTaskSave(), 'Confirm', title);
        });

        // Toggle recurring frequency field visibility
        document.getElementById('dep-task-recurring').addEventListener('change', (e) => {
            document.getElementById('dep-task-frequency-field').hidden = !e.target.checked;
        });

        // ── Task Add Button (in drawer) ──
        document.getElementById('dep-tasks-add-btn').addEventListener('click', () => {
            if (!_drawerDepId) return;
            openTaskModal();
        });

        // ── Task Search ──
        document.getElementById('dep-tasks-search-input').addEventListener('input', (e) => {
            _taskSearchQuery = e.target.value.trim().toLowerCase();
            _renderTasks();
        });

        // ── Task Sort Buttons ──
        document.querySelectorAll('.dep-tasks-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sort = btn.dataset.sort;
                if (_taskSortBy === sort) {
                    _taskSortOrder = _taskSortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    _taskSortBy = sort;
                    _taskSortOrder = 'asc';
                }
                _updateSortUI();
                _renderTasks();
            });
        });

        // ── Task Sort Order Toggle ──
        document.getElementById('dep-tasks-order-btn').addEventListener('click', () => {
            _taskSortOrder = _taskSortOrder === 'asc' ? 'desc' : 'asc';
            _updateSortUI();
            _renderTasks();
        });

        // ── Task List (delegated click for edit/delete/complete) ──
        document.getElementById('dep-drawer-tasks-list').addEventListener('click', (e) => {
            const completeBtn = e.target.closest('.dep-task-complete-btn');
            if (completeBtn) {
                DependantsStore.completeTask(_drawerDepId, completeBtn.dataset.taskId);
                _renderTasks();
                _showToast('Task marked as complete!', 'success');
                return;
            }
            const undoBtn = e.target.closest('.dep-task-undo-btn');
            if (undoBtn) {
                DependantsStore.uncompleteTask(_drawerDepId, undoBtn.dataset.taskId);
                _renderTasks();
                _showToast('Task marked as pending.', 'info');
                return;
            }
            const editBtn = e.target.closest('.dep-task-edit-btn');
            if (editBtn) {
                openTaskModal(editBtn.dataset.taskId);
                return;
            }
            const deleteBtn = e.target.closest('.dep-task-delete-btn');
            if (deleteBtn) {
                _showConfirm('Are you sure you want to delete this task?', () => {
                    DependantsStore.removeTask(_drawerDepId, deleteBtn.dataset.taskId);
                    _renderTasks();
                });
            }
        });

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

        document.getElementById('dep-drawer-edit-btn').addEventListener('click', () => {
            if (!_drawerDepId) return;
            openEditModal(_drawerDepId);
        });

        document.getElementById('dep-drawer-delete-btn').addEventListener('click', () => {
            if (!_drawerDepId) return;
            _showConfirm('Are you sure you want to remove this dependant? This cannot be undone.', () => {
                DependantsStore.remove(_drawerDepId);
                closeDrawer();
            });
        });

        // ── Confirm Modal ──
        _bindConfirmModal();
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
                <span class="dep-card-relationship">${dep.relationship}${dep.age ? ' · ' + dep.age + ' yrs' : ''}</span>
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
        document.getElementById('dep-add-firstname').focus();
    }

    function closeAddModal() {
        $addModal.hidden = true;
        $addForm.reset();
        $addError.textContent = '';
    }

    function _handleAddSave() {
        const firstName = document.getElementById('dep-add-firstname').value.trim();
        const lastName = document.getElementById('dep-add-lastname').value.trim();
        const email = document.getElementById('dep-add-email').value.trim();
        const relationship = document.getElementById('dep-add-relationship').value;
        const dob = document.getElementById('dep-add-dob').value;
        const allowance = parseFloat(document.getElementById('dep-add-allowance').value) || 0;
        const spendingLimit = parseFloat(document.getElementById('dep-add-spending-limit').value) || 0;

        if (!firstName) { $addError.textContent = 'Please enter a first name.'; return; }
        if (!lastName) { $addError.textContent = 'Please enter a last name.'; return; }
        if (!email) { $addError.textContent = 'Please enter an email.'; return; }
        if (!email.includes('@')) { $addError.textContent = 'Please enter a valid email.'; return; }
        if (!relationship) { $addError.textContent = 'Please select a relationship.'; return; }
        if (!dob) { $addError.textContent = 'Please enter a date of birth.'; return; }
        if (dob.split('-')[0].length > 4) { $addError.textContent = 'Please enter a valid year (4 digits).'; return; }

        const name = firstName + ' ' + lastName;
        try {
            DependantsStore.add({ name, email, relationship, dob, allowance, spendingLimit });
            closeAddModal();
            _showToast('Dependant added successfully!', 'success');
        } catch (err) {
            $addError.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       EDIT DEPENDANT MODAL
    ---------------------------------------------------------- */
    function openEditModal(depId) {
        const dep = DependantsStore.getById(depId || _drawerDepId);
        if (!dep) return;

        _drawerDepId = dep.id;

        // Split name into first/last for the form
        var nameParts = (dep.name || '').trim().split(/\s+/);
        var depFirstName = nameParts[0] || '';
        var depLastName = nameParts.slice(1).join(' ') || '';

        // Pre-fill form with current values
        document.getElementById('dep-edit-firstname').value = depFirstName;
        document.getElementById('dep-edit-lastname').value = depLastName;
        document.getElementById('dep-edit-email').value = dep.email;
        document.getElementById('dep-edit-relationship').value = dep.relationship;
        document.getElementById('dep-edit-dob').value = dep.dateOfBirth || '';
        document.getElementById('dep-edit-allowance').value = dep.allowance;
        document.getElementById('dep-edit-spending-limit').value = dep.spendingLimit;
        $editError.textContent = '';

        $editModal.hidden = false;
        document.getElementById('dep-edit-firstname').focus();
    }

    function closeEditModal() {
        $editModal.hidden = true;
        $editForm.reset();
        $editError.textContent = '';
    }

    function _handleEditSave() {
        const firstName = document.getElementById('dep-edit-firstname').value.trim();
        const lastName = document.getElementById('dep-edit-lastname').value.trim();
        const email = document.getElementById('dep-edit-email').value.trim();
        const relationship = document.getElementById('dep-edit-relationship').value;
        const dob = document.getElementById('dep-edit-dob').value;
        const allowance = parseFloat(document.getElementById('dep-edit-allowance').value) || 0;
        const spendingLimit = parseFloat(document.getElementById('dep-edit-spending-limit').value) || 0;

        if (!firstName) { $editError.textContent = 'Please enter a first name.'; return; }
        if (!lastName) { $editError.textContent = 'Please enter a last name.'; return; }
        if (!email) { $editError.textContent = 'Please enter an email.'; return; }
        if (!email.includes('@')) { $editError.textContent = 'Please enter a valid email.'; return; }
        if (!dob) { $editError.textContent = 'Please enter a date of birth.'; return; }
        if (dob.split('-')[0].length > 4) { $editError.textContent = 'Please enter a valid year (4 digits).'; return; }

        const name = firstName + ' ' + lastName;
        try {
            DependantsStore.edit(_drawerDepId, { name, email, relationship, dob, allowance, spendingLimit });
            closeEditModal();
            _showToast('Dependant updated successfully!', 'success');

            // Refresh drawer if still open
            if (!$drawer.hidden) openDrawer(_drawerDepId);
        } catch (err) {
            $editError.textContent = err.message;
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

        // Dependant Information section
        document.getElementById('dep-info-name').textContent = dep.name || '—';
        document.getElementById('dep-info-email').textContent = dep.email || '—';
        document.getElementById('dep-info-relationship').textContent = dep.relationship || '—';
        document.getElementById('dep-info-dob').textContent = dep.dateOfBirth ? DependantsStore.fmtDate(dep.dateOfBirth) + (dep.age ? ' (' + dep.age + ' yrs)' : '') : '—';
        document.getElementById('dep-info-allowance').textContent = DependantsStore.fmtCurrency(dep.allowance || 0);
        document.getElementById('dep-info-spending-limit').textContent = DependantsStore.fmtCurrency(dep.spendingLimit || 0);

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

        // Reset search and render tasks
        _taskSearchQuery = '';
        const searchInput = document.getElementById('dep-tasks-search-input');
        if (searchInput) searchInput.value = '';
        _renderTasks();
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
       TASKS — SORT UI
    ---------------------------------------------------------- */
    function _updateSortUI() {
        const arrow = _taskSortOrder === 'asc' ? '↑' : '↓';
        document.querySelectorAll('.dep-tasks-sort-btn').forEach(b => {
            b.classList.remove('dep-tasks-sort-btn--active');
            const arrowEl = b.querySelector('.dep-sort-arrow');
            if (arrowEl) arrowEl.remove();
        });
        const activeBtn = document.querySelector(`.dep-tasks-sort-btn[data-sort="${_taskSortBy}"]`);
        if (activeBtn) {
            activeBtn.classList.add('dep-tasks-sort-btn--active');
            activeBtn.insertAdjacentHTML('beforeend', ` <span class="dep-sort-arrow">${arrow}</span>`);
        }
    }

    /* ----------------------------------------------------------
       TASKS — RENDER
    ---------------------------------------------------------- */
    function _renderTasks() {
        const $tasksList = document.getElementById('dep-drawer-tasks-list');
        if (!_drawerDepId || !$tasksList) return;

        let tasks = DependantsStore.getTasks(_drawerDepId, _taskSortBy, _taskSortOrder);

        // Filter by search query
        if (_taskSearchQuery) {
            tasks = tasks.filter(t => {
                const name = (t.task || '').toLowerCase();
                const desc = (t.description || '').toLowerCase();
                return name.includes(_taskSearchQuery) || desc.includes(_taskSearchQuery);
            });
        }

        if (tasks.length === 0) {
            $tasksList.innerHTML = _taskSearchQuery
                ? '<li class="dep-tasks-empty">No tasks match your search.</li>'
                : '<li class="dep-tasks-empty">No tasks assigned yet.</li>';
            return;
        }

        $tasksList.innerHTML = tasks.map(t => {
            const statusClass = `dep-task-status--${t.status}`;
            const freqLabel = t.recurring && t.frequency ? t.frequency : '';
            const recurringBadge = t.recurring ? `<span class="dep-task-recurring-badge">${freqLabel || 'Recurring'}</span>` : '';
            const dueLabel = t.dueDate ? DependantsStore.fmtDate(t.dueDate) : 'No due date';
            const showComplete = t.status !== 'complete' && t.status !== 'completed';
            const showUndo = t.status === 'complete' || t.status === 'completed';

            return `
            <li class="dep-task-item">
                <div class="dep-task-top">
                    <div class="dep-task-title-wrap">
                        <span class="dep-task-name">${t.task}</span>
                        ${t.description ? `<span class="dep-task-desc">${t.description}</span>` : ''}
                    </div>
                    <div class="dep-task-actions">
                        ${showComplete ? `<button class="dep-task-complete-btn" data-task-id="${t.id}" aria-label="Mark complete" title="Mark Complete">
                            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>` : ''}
                        ${showUndo ? `<button class="dep-task-undo-btn" data-task-id="${t.id}" aria-label="Undo completion" title="Undo Complete">
                            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3v5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>` : ''}
                        <button class="dep-task-edit-btn" data-task-id="${t.id}" aria-label="Edit task" title="Edit">
                            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                        <button class="dep-task-delete-btn" data-task-id="${t.id}" aria-label="Delete task" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                    </div>
                </div>
                <div class="dep-task-bottom">
                    <div class="dep-task-details">
                        <span class="dep-task-due"><strong>Due:</strong> ${dueLabel}</span>
                        <span class="dep-task-reward"><strong>Reward:</strong> ${DependantsStore.fmtCurrency(t.reward)}</span>
                        <span class="dep-task-status-line"><strong>Status:</strong> <span class="dep-task-status ${statusClass}">${t.status}</span></span>
                    </div>
                    <div class="dep-task-badges">
                        ${recurringBadge}
                    </div>
                </div>
            </li>`;
        }).join('');
    }

    /* ----------------------------------------------------------
       TASK MODAL (Add / Edit)
    ---------------------------------------------------------- */
    function openTaskModal(taskId) {
        _editingTaskId = taskId || null;
        $taskForm.reset();
        $taskError.textContent = '';
        document.getElementById('dep-task-frequency-field').hidden = true;

        // Restrict due date to today or later
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dep-task-due').setAttribute('min', today);

        if (_editingTaskId) {
            // Edit mode — pre-fill
            const dep = DependantsStore.getById(_drawerDepId);
            const task = (dep.tasks || []).find(t => t.id === _editingTaskId);
            if (!task) return;

            document.getElementById('dep-task-modal-title').textContent = 'Edit Task';
            document.getElementById('dep-task-submit-btn').textContent = 'Save Changes';
            document.getElementById('dep-task-name').value = task.task;
            document.getElementById('dep-task-desc').value = task.description || '';
            document.getElementById('dep-task-due').value = task.dueDate || '';
            document.getElementById('dep-task-reward').value = task.reward;
            document.getElementById('dep-task-recurring').checked = task.recurring;
            if (task.recurring) {
                document.getElementById('dep-task-frequency-field').hidden = false;
                document.getElementById('dep-task-frequency').value = task.frequency || 'weekly';
            }
        } else {
            // Add mode
            document.getElementById('dep-task-modal-title').textContent = 'Add Task';
            document.getElementById('dep-task-submit-btn').textContent = 'Add Task';
        }

        $taskModal.hidden = false;
        document.getElementById('dep-task-name').focus();
    }

    function closeTaskModal() {
        $taskModal.hidden = true;
        $taskForm.reset();
        $taskError.textContent = '';
        _editingTaskId = null;
    }

    function _handleTaskSave() {
        const task = document.getElementById('dep-task-name').value.trim();
        const description = document.getElementById('dep-task-desc').value.trim();
        const dueDate = document.getElementById('dep-task-due').value;
        const reward = parseFloat(document.getElementById('dep-task-reward').value) || 0;
        const recurring = document.getElementById('dep-task-recurring').checked;
        const frequency = recurring ? document.getElementById('dep-task-frequency').value : null;

        if (!task) { $taskError.textContent = 'Please enter a task name.'; return; }
        if (!dueDate) { $taskError.textContent = 'Please select a due date.'; return; }
        if (dueDate.split('-')[0].length > 4) { $taskError.textContent = 'Please enter a valid year (4 digits).'; return; }

        // Prevent past due dates — only today or future dates are allowed
        const today = new Date().toISOString().split('T')[0];
        if (dueDate < today) { $taskError.textContent = 'Due date cannot be in the past. Please select today or a future date.'; return; }

        if (!reward || reward <= 0) { $taskError.textContent = 'Please enter a reward amount.'; return; }

        try {
            if (_editingTaskId) {
                DependantsStore.editTask(_drawerDepId, _editingTaskId, { task, description, dueDate, reward, recurring, frequency });
                _showToast('Task updated successfully!', 'success');
            } else {
                DependantsStore.addTask(_drawerDepId, { task, description, dueDate, reward, recurring, frequency });
                _showToast('Task added successfully!', 'success');
            }
            closeTaskModal();
            _renderTasks();
        } catch (err) {
            $taskError.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */
    let _confirmCallback = null;

    function _showConfirm(message, onConfirm, btnLabel, title) {
        const $modal = document.getElementById('dep-confirm-modal');
        document.getElementById('dep-confirm-title').textContent = title || 'Confirm Delete';
        document.getElementById('dep-confirm-message').textContent = message;
        const $okBtn = document.getElementById('dep-confirm-ok');
        $okBtn.textContent = btnLabel || 'Delete';
        $okBtn.className = 'danger-btn dep-modal-btn';
        _confirmCallback = onConfirm;
        $modal.hidden = false;
    }

    function _closeConfirm() {
        const $modal = document.getElementById('dep-confirm-modal');
        $modal.hidden = true;
        _confirmCallback = null;
    }

    function _bindConfirmModal() {
        document.getElementById('dep-confirm-close').addEventListener('click', _closeConfirm);
        document.getElementById('dep-confirm-cancel').addEventListener('click', _closeConfirm);
        document.getElementById('dep-confirm-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('dep-confirm-modal')) _closeConfirm();
        });
        document.getElementById('dep-confirm-ok').addEventListener('click', () => {
            if (_confirmCallback) _confirmCallback();
            _closeConfirm();
        });
    }
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
        openEditModal,
        closeEditModal,
        openTaskModal,
        closeTaskModal,
        openSendModal,
        closeSendModal,
        openDrawer,
        closeDrawer,
    });

})();
