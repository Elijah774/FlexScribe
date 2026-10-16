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
    const AVATAR_COLORS = ['blue', 'purple', 'green', 'orange', 'pink', 'teal', 'amber', 'red', 'indigo', 'cyan'];

    /**
     * Pick an avatar colour for a dependant. The colour is derived from the
     * dependant's stable identity (id, falling back to name) rather than their
     * position in the list, so each person always keeps the SAME colour and
     * reordering/adding others never changes it. A simple string hash spreads
     * identities across the palette for good visual separation.
     */
    function _avatarColor(key) {
        const str = String(key == null ? '' : key);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) | 0;
        }
        return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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

        // Constrain the DOB calendars to past dates only (max = yesterday),
        // so future dates are greyed out/unselectable in the native picker.
        // Done here (on panel load) so it applies before either modal opens.
        _applyDobMax();

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

        // Show/hide the custom relationship field + live-clear errors.
        _wireFormInteractions('add');

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
            // Validate first — only ask for confirmation once the form is valid.
            const result = _validateDependantForm('edit');
            if (!result.ok) return;
            _showConfirm('Save changes to this dependant?', () => _handleEditSave(), 'Confirm', 'Confirm Changes');
        });

        // Show/hide the custom relationship field + live-clear errors.
        _wireFormInteractions('edit');

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
                const depId = _drawerDepId;
                const taskId = completeBtn.dataset.taskId;

                // ── Daily recurring tasks: block completion unless today is
                //    the due date. Mirrors the authoritative server rule so
                //    the user gets instant feedback and no needless request.
                //    The message is shown inline beneath the task (not a toast).
                const guard = _dailyCompletionGuard(depId, taskId);
                if (!guard.allowed) {
                    _showTaskMessage(taskId, guard.message);
                    return;
                }

                // Prevent double-clicks from firing two completion requests.
                completeBtn.disabled = true;
                Promise.resolve(DependantsStore.completeTask(depId, taskId))
                    .then(function(result) {
                        // Server is authoritative: if it rejected the completion
                        // (e.g. a stale client clock), surface its message inline
                        // and leave the task unchanged.
                        if (result && result.success === false) {
                            if (_drawerDepId === depId) _renderTasks();
                            _showTaskMessage(taskId, result.error || 'This task could not be completed.');
                        } else {
                            _showToast('Task marked as complete!', 'success');
                            // Re-render so the completed occurrence and any newly
                            // generated occurrence both appear.
                            if (_drawerDepId === depId) _renderTasks();
                            // Refresh the activity panel so the completed task
                            // shows up there immediately.
                            if (DependantsStore.getActivity) {
                                DependantsStore.getActivity(depId).then(function(activity) {
                                    if (_drawerDepId === depId) _renderActivity(activity);
                                });
                            }
                        }
                    });
                return;
            }
            const undoBtn = e.target.closest('.dep-task-undo-btn');
            if (undoBtn) {
                const depId = _drawerDepId;
                Promise.resolve(DependantsStore.uncompleteTask(depId, undoBtn.dataset.taskId))
                    .then(function() {
                        if (_drawerDepId === depId) _renderTasks();
                    });
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
            const colorClass = _avatarColor(dep.id || dep.name);
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
       FIELD-LEVEL VALIDATION HELPERS

       Each form field has a matching <span class="dep-field-error">
       with id "<fieldId>-error". These helpers show/clear the
       inline message and toggle the .is-invalid border highlight.
    ---------------------------------------------------------- */
    function _setFieldError(fieldId, message) {
        const $input = document.getElementById(fieldId);
        const $err = document.getElementById(fieldId + '-error');
        if ($err) {
            $err.textContent = message || '';
            $err.classList.toggle('is-visible', !!message);
        }
        if ($input) $input.classList.toggle('is-invalid', !!message);
    }

    function _clearFieldError(fieldId) {
        _setFieldError(fieldId, '');
    }

    /**
     * Set the max selectable date on both DOB pickers to yesterday so the
     * native calendar greys out today and all future dates. Falls back to a
     * plain yesterday calculation if the shared Validators isn't loaded.
     */
    function _applyDobMax() {
        let maxDate;
        if (typeof Validators !== 'undefined' && Validators.yesterdayISO) {
            maxDate = Validators.yesterdayISO();
        } else {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            const pad = n => (n < 10 ? '0' : '') + n;
            maxDate = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        }
        ['dep-add-dob', 'dep-edit-dob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.setAttribute('max', maxDate);
        });
    }

    /** Clear every inline + summary error for a modal ('add' | 'edit'). */
    function _clearAllErrors(prefix) {
        ['firstname', 'lastname', 'email', 'relationship', 'relationship-other', 'dob', 'allowance', 'spending-limit']
            .forEach(f => _clearFieldError('dep-' + prefix + '-' + f));
        const $summary = document.getElementById('dep-' + prefix + '-error');
        if ($summary) $summary.textContent = '';
    }

    /**
     * Show or hide the custom "Please specify relationship" field based
     * on the current relationship selection. When hidden, its value and
     * any error are cleared so stale data is never submitted.
     */
    function _syncOtherRelationship(prefix) {
        const sel = document.getElementById('dep-' + prefix + '-relationship');
        const row = document.getElementById('dep-' + prefix + '-other-row');
        const input = document.getElementById('dep-' + prefix + '-relationship-other');
        if (!sel || !row) return;

        const isOther = sel.value === 'Other';
        row.hidden = !isOther;
        if (!isOther && input) {
            input.value = '';
            _clearFieldError('dep-' + prefix + '-relationship-other');
        }
    }

    /**
     * Shared field validation for the add/edit dependant forms.
     * Returns { ok, name, email, relationship, dob, allowance, spendingLimit }.
     * On failure it populates inline errors, focuses the first bad field
     * and returns { ok: false }.
     */
    function _validateDependantForm(prefix) {
        _clearAllErrors(prefix);

        const firstName = document.getElementById('dep-' + prefix + '-firstname').value.trim();
        const lastName = document.getElementById('dep-' + prefix + '-lastname').value.trim();
        const emailRaw = document.getElementById('dep-' + prefix + '-email').value;
        const relationship = document.getElementById('dep-' + prefix + '-relationship').value;
        const otherInput = document.getElementById('dep-' + prefix + '-relationship-other');
        const dob = document.getElementById('dep-' + prefix + '-dob').value;
        const allowanceRaw = document.getElementById('dep-' + prefix + '-allowance').value;
        const spendingRaw = document.getElementById('dep-' + prefix + '-spending-limit').value;

        let firstBad = null;
        function fail(fieldId, message) {
            _setFieldError(fieldId, message);
            if (!firstBad) firstBad = fieldId;
        }

        if (!firstName) fail('dep-' + prefix + '-firstname', 'Please enter a first name.');
        if (!lastName) fail('dep-' + prefix + '-lastname', 'Please enter a last name.');

        const emailResult = Validators.validateEmail(emailRaw);
        if (!emailResult.valid) fail('dep-' + prefix + '-email', emailResult.message);

        if (!relationship) {
            fail('dep-' + prefix + '-relationship', 'Please select a relationship.');
        }

        // Custom relationship when "Other" is selected.
        let finalRelationship = relationship;
        if (relationship === 'Other') {
            const custom = (otherInput ? otherInput.value : '').trim();
            if (!custom) {
                fail('dep-' + prefix + '-relationship-other', 'Please specify the relationship.');
            } else {
                finalRelationship = custom;
            }
        }

        const dobResult = Validators.validateDateOfBirth(dob);
        if (!dobResult.valid) fail('dep-' + prefix + '-dob', dobResult.message);

        // Allowance / spending limit — optional per existing business rules,
        // but any value entered must be a valid monetary amount.
        const allowanceResult = Validators.validateAmount(allowanceRaw, { required: false });
        if (!allowanceResult.valid) fail('dep-' + prefix + '-allowance', allowanceResult.message);

        const spendingResult = Validators.validateAmount(spendingRaw, { required: false });
        if (!spendingResult.valid) fail('dep-' + prefix + '-spending-limit', spendingResult.message);

        if (firstBad) {
            const $focus = document.getElementById(firstBad);
            if ($focus) $focus.focus();
            return { ok: false };
        }

        return {
            ok: true,
            name: firstName + ' ' + lastName,
            email: emailResult.value,
            relationship: finalRelationship,
            dob: dobResult.value,
            allowance: allowanceResult.value,
            spendingLimit: spendingResult.value
        };
    }

    /**
     * Wires the interactive behaviour for an add/edit dependant form:
     * toggling the custom "Other" relationship field and clearing a
     * field's inline error as soon as the user starts correcting it.
     */
    function _wireFormInteractions(prefix) {
        const sel = document.getElementById('dep-' + prefix + '-relationship');
        if (sel) {
            sel.addEventListener('change', () => {
                _syncOtherRelationship(prefix);
                _clearFieldError('dep-' + prefix + '-relationship');
            });
        }

        ['firstname', 'lastname', 'email', 'relationship-other', 'dob', 'allowance', 'spending-limit']
            .forEach(f => {
                const el = document.getElementById('dep-' + prefix + '-' + f);
                if (el) el.addEventListener('input', () => _clearFieldError('dep-' + prefix + '-' + f));
            });
    }

    /* ----------------------------------------------------------
       ADD DEPENDANT MODAL
    ---------------------------------------------------------- */
    function openAddModal() {
        $addForm.reset();
        _clearAllErrors('add');
        _syncOtherRelationship('add');
        // Restrict the date picker to yesterday or earlier (no today/future).
        document.getElementById('dep-add-dob').setAttribute('max', Validators.yesterdayISO());
        $addModal.hidden = false;
        document.getElementById('dep-add-firstname').focus();
    }

    function closeAddModal() {
        $addModal.hidden = true;
        $addForm.reset();
        _clearAllErrors('add');
        _syncOtherRelationship('add');
    }

    function _handleAddSave() {
        const result = _validateDependantForm('add');
        if (!result.ok) return;

        try {
            DependantsStore.add({
                name: result.name,
                email: result.email,
                relationship: result.relationship,
                dob: result.dob,
                allowance: result.allowance,
                spendingLimit: result.spendingLimit
            });
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

        // Relationship may be a standard option or a custom "Other" value.
        const $rel = document.getElementById('dep-edit-relationship');
        const $relOther = document.getElementById('dep-edit-relationship-other');
        const STANDARD = DependantsStore.RELATIONSHIPS; // ['Son',...,'Other']
        if (dep.relationship && STANDARD.indexOf(dep.relationship) === -1) {
            // Custom relationship saved previously → select Other and fill it.
            $rel.value = 'Other';
            if ($relOther) $relOther.value = dep.relationship;
        } else {
            $rel.value = dep.relationship || '';
            if ($relOther) $relOther.value = '';
        }

        document.getElementById('dep-edit-dob').value = dep.dateOfBirth || '';
        document.getElementById('dep-edit-allowance').value = (dep.allowance != null ? dep.allowance : '');
        document.getElementById('dep-edit-spending-limit').value = (dep.spendingLimit != null ? dep.spendingLimit : '');

        _clearAllErrors('edit');
        _syncOtherRelationship('edit');

        // Restrict the date picker to yesterday or earlier (no today/future).
        document.getElementById('dep-edit-dob').setAttribute('max', Validators.yesterdayISO());

        $editModal.hidden = false;
        document.getElementById('dep-edit-firstname').focus();
    }

    function closeEditModal() {
        $editModal.hidden = true;
        $editForm.reset();
        _clearAllErrors('edit');
        _syncOtherRelationship('edit');
    }

    function _handleEditSave() {
        const result = _validateDependantForm('edit');
        if (!result.ok) return;

        try {
            DependantsStore.edit(_drawerDepId, {
                name: result.name,
                email: result.email,
                relationship: result.relationship,
                dob: result.dob,
                allowance: result.allowance,
                spendingLimit: result.spendingLimit
            });
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

        const depId = _drawerDepId;
        let promise;
        try {
            promise = DependantsStore.sendAllowance(depId, amount, frequency);
        } catch (err) {
            $sendError.textContent = err.message;
            return;
        }

        Promise.resolve(promise).then(function(result) {
            if (result && result.success === false) {
                $sendError.textContent = result.error || 'Failed to send allowance.';
                return;
            }
            closeSendModal();
            _showToast('Allowance sent successfully!', 'success');

            // Data (incl. new activity) is now reloaded — refresh the drawer.
            if (!$drawer.hidden) openDrawer(depId);
        }).catch(function(err) {
            $sendError.textContent = (err && err.message) || 'Failed to send allowance.';
        });
    }

    /* ----------------------------------------------------------
       DETAIL DRAWER
    ---------------------------------------------------------- */
    /** Render the activity list (most recent first). */
    function _renderActivity(activity) {
        const $actList = document.getElementById('dep-drawer-activity-list');
        if (!$actList) return;
        const items = Array.isArray(activity) ? activity : [];
        if (items.length === 0) {
            $actList.innerHTML = '<li style="color:var(--text-light);font-size:13px;padding:8px 0;">No activity yet.</li>';
            return;
        }
        $actList.innerHTML = [...items].reverse().map(a => {
            const isTask = a.type === 'task';
            // Sign follows the money direction from the dependant's view:
            // 'out' (debit) = -, otherwise (+). Fall back to legacy type when
            // direction isn't provided.
            const isOut = a.direction ? (a.direction === 'out') : (a.type === 'spend');
            const prefix = isOut ? '-' : '+';
            const amountClass = isOut
                ? 'dep-activity-amount--spend'
                : (isTask ? 'dep-activity-amount--task' : '');
            const amountLabel = `${prefix}${DependantsStore.fmtCurrency(a.amount)}`;
            return `
            <li class="dep-activity-item">
                <div class="dep-activity-info">
                    <span class="dep-activity-desc">${a.description}</span>
                    <span class="dep-activity-date">${DependantsStore.fmtDate(a.date)}</span>
                </div>
                <span class="dep-activity-amount ${amountClass}">${amountLabel}</span>
            </li>`;
        }).join('');
    }

    function openDrawer(id) {
        const dep = DependantsStore.getById(id);
        if (!dep) return;
        _drawerDepId = id;

        // Header — colour keyed on identity so the drawer matches the card.
        const colorClass = _avatarColor(dep.id || dep.name);
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

        // Activity list — render what we have, then refresh from the API so
        // newly sent allowances show up without depending on a bulk reload.
        _renderActivity(dep.activity || []);
        if (DependantsStore.getActivity) {
            DependantsStore.getActivity(id).then(function(activity) {
                // Only update if this drawer is still the one open.
                if (_drawerDepId === id) _renderActivity(activity);
            });
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
       TASKS — DAILY COMPLETION GUARD
       Daily recurring tasks may only be completed on their exact due
       date. Returns { allowed, message } mirroring the server rule so
       the UI can block early/late completion with instant feedback.
    ---------------------------------------------------------- */
    function _localTodayISO() {
        const d = new Date();
        const pad = n => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function _dailyCompletionGuard(depId, taskId) {
        const dep = DependantsStore.getById(depId);
        const task = dep && (dep.tasks || []).find(t => t.id === taskId);
        if (!task) return { allowed: true, message: '' };

        // Only applies to DAILY recurring tasks that have a due date.
        if (!task.recurring || task.frequency !== 'daily' || !task.dueDate) {
            return { allowed: true, message: '' };
        }

        const dueISO = String(task.dueDate).slice(0, 10);
        const todayISO = _localTodayISO();
        if (dueISO === todayISO) return { allowed: true, message: '' };

        const overdue = todayISO > dueISO;
        const message = overdue
            ? 'This task can only be completed on its scheduled due date as it is a daily recurring task. The task is overdue and cannot be marked as complete.'
            : 'This task can only be completed on its scheduled due date as it is a daily recurring task. Its scheduled date has not yet arrived, therefore cannot be marked as complete today.';
        return { allowed: false, message: message, overdue: overdue };
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
            <li class="dep-task-item" data-task-id="${t.id}">
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
                <p class="dep-task-msg" data-task-msg="${t.id}" role="alert" hidden></p>
            </li>`;
        }).join('');
    }

    /**
     * Show a neat inline message beneath a specific task row (used for the
     * daily-completion restriction instead of a toast). Replaces any message
     * currently shown on another row so only one is visible at a time.
     * @param {string} taskId
     * @param {string} message
     */
    function _showTaskMessage(taskId, message) {
        const $list = document.getElementById('dep-drawer-tasks-list');
        if (!$list) return;
        // Clear any other inline messages first.
        $list.querySelectorAll('.dep-task-msg').forEach(el => {
            el.hidden = true;
            el.textContent = '';
            el.classList.remove('is-visible');
        });
        const $msg = $list.querySelector('.dep-task-msg[data-task-msg="' + taskId + '"]');
        if (!$msg) return;
        $msg.textContent = message;
        $msg.hidden = false;
        // Next frame so the transition plays on re-show.
        requestAnimationFrame(() => $msg.classList.add('is-visible'));
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

        // ── Wallet funding pre-check (immediate feedback) ──
        // The reward is paid from the main member's available wallet balance
        // when the task is completed. Refuse up front if the current available
        // balance cannot cover this reward. The backend validates again and is
        // authoritative; this is just a fast, friendly guardrail. For recurring
        // tasks we validate the single initial occurrence, never a series.
        _checkRewardAffordable(reward).then(function(ok) {
            if (!ok.affordable) {
                $taskError.textContent = INSUFFICIENT_FUNDS_MSG;
                return;
            }
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
        });
    }

    // Friendly message mirrored from the backend (server is authoritative).
    const INSUFFICIENT_FUNDS_MSG =
        "Insufficient wallet funds. Your available balance is not enough to cover this task's reward. Please upload funds to your wallet or reduce the reward amount.";

    /**
     * Resolve whether the main member's available wallet balance can cover a
     * reward. Fails open (affordable:true) if the wallet can't be read, since
     * the backend will still enforce the real check.
     * @param {number} reward
     * @returns {Promise<{affordable:boolean, available:number}>}
     */
    function _checkRewardAffordable(reward) {
        if (!reward || reward <= 0) return Promise.resolve({ affordable: true, available: 0 });
        if (typeof API === 'undefined' || !API.Wallet || !API.Wallet.get) {
            return Promise.resolve({ affordable: true, available: 0 });
        }
        return API.Wallet.get().then(function(result) {
            if (!result || result.success === false || !result.data) {
                return { affordable: true, available: 0 }; // fail open; backend enforces
            }
            const w = result.data;
            const available = (w.available != null ? w.available : (w.balance != null ? w.balance : 0));
            const avail = parseFloat(available) || 0;
            return { affordable: avail >= reward, available: avail };
        }).catch(function() {
            return { affordable: true, available: 0 }; // fail open; backend enforces
        });
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
