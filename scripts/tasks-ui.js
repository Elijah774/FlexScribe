/* ===========================================================
   tasks-ui.js — Dependant Tasks tab controller

   Dependants can VIEW their assigned tasks and COMPLETE eligible
   ones. They cannot create, edit, delete, or change reward /
   recurrence — those controls are intentionally absent. The
   backend is the source of truth and enforces every rule
   (ownership, eligibility, daily-date, reward funding); this UI
   simply reflects it and surfaces the server's messages.
=========================================================== */
'use strict';

const TasksUI = (() => {

    let _tasks = [];
    let _filter = 'all';
    let _bound = false;
    let _loading = false;

    function init() {
        _bindOnce();
        _load();
    }

    function _bindOnce() {
        if (_bound) return;
        _bound = true;

        const filters = document.getElementById('tasks-filters');
        if (filters) {
            filters.addEventListener('click', (e) => {
                const btn = e.target.closest('.tasks-filter-btn');
                if (!btn) return;
                document.querySelectorAll('.tasks-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _filter = btn.dataset.filter || 'all';
                _render();
            });
        }

        const refresh = document.getElementById('tasks-refresh');
        if (refresh) refresh.addEventListener('click', () => _load());

        // Delegated complete action.
        const list = document.getElementById('tasks-list');
        if (list) {
            list.addEventListener('click', (e) => {
                const btn = e.target.closest('.task-complete-btn');
                if (btn) _complete(btn.dataset.taskId, btn);
            });
        }
    }

    function _load() {
        if (_loading) return;
        _loading = true;
        const list = document.getElementById('tasks-list');
        if (list) list.innerHTML = '<div class="tasks-empty">Loading your tasks…</div>';

        if (typeof API === 'undefined' || !API.Me) {
            if (list) list.innerHTML = '<div class="tasks-empty">Unable to load tasks right now.</div>';
            _loading = false;
            return;
        }

        API.Me.getTasks().then((res) => {
            _loading = false;
            if (res && res.success && Array.isArray(res.data)) {
                _tasks = res.data;
                _render();
            } else {
                if (list) list.innerHTML = '<div class="tasks-empty">' + _esc((res && res.error) || 'Could not load your tasks.') + '</div>';
            }
        }).catch(() => {
            _loading = false;
            if (list) list.innerHTML = '<div class="tasks-empty">Network error. Please try again.</div>';
        });
    }

    /** Derive a display status, marking past-due incomplete tasks overdue. */
    function _displayStatus(t) {
        if (t.taskStatus === 'completed' || t.taskStatus === 'cancelled') return t.taskStatus;
        if (t.dueDate) {
            const due = String(t.dueDate).slice(0, 10);
            if (due < _todayISO() && t.taskStatus !== 'completed') return 'overdue';
        }
        return t.taskStatus || 'pending';
    }

    function _render() {
        const list = document.getElementById('tasks-list');
        if (!list) return;

        let rows = _tasks.slice();
        if (_filter === 'pending') {
            rows = rows.filter(t => ['pending', 'in_progress'].includes(_displayStatus(t)));
        } else if (_filter === 'overdue') {
            rows = rows.filter(t => _displayStatus(t) === 'overdue');
        } else if (_filter === 'completed') {
            rows = rows.filter(t => _displayStatus(t) === 'completed');
        }

        if (rows.length === 0) {
            list.innerHTML = '<div class="tasks-empty">No tasks to show.</div>';
            return;
        }

        list.innerHTML = rows.map(_card).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function _card(t) {
        const status = _displayStatus(t);
        const reward = parseFloat(t.reward) || 0;
        const recurring = t.recurring === true || t.recurring === 1;
        const cycle = recurring ? (t.recurrenceCycle || 'recurring') : '';

        // A task is completable when it is not already completed/cancelled.
        const completable = status !== 'completed' && status !== 'cancelled';

        const badge = `<span class="task-badge badge-${status}">${_statusLabel(status)}</span>`;
        const recBadge = recurring ? `<span class="task-recurring">${_cap(cycle)}</span>` : '';

        // Only render a description row when there actually is one.
        const descHtml = (t.description && String(t.description).trim())
            ? `<p class="task-desc">${_esc(t.description)}</p>` : '';

        const meta = [];
        meta.push(`<span>Due: <b>${t.dueDate ? _fmtDate(t.dueDate) : 'No due date'}</b></span>`);
        if (reward > 0) meta.push(`<span>Reward: <b class="task-reward">R${reward.toFixed(2)}</b></span>`);
        if (status === 'completed' && t.completedAt) {
            meta.push(`<span>Completed: <b>${_fmtDateTime(t.completedAt)}</b></span>`);
            if (reward > 0) {
                meta.push(`<span>Reward: <b>${(t.taskRewardPaid === true || t.taskRewardPaid === 1) ? 'Paid' : 'Not paid'}</b></span>`);
            }
        }

        let actions;
        if (status === 'completed') {
            actions = `<span class="task-done-flag"><i data-lucide="check-circle"></i> Completed</span>`;
        } else if (completable) {
            actions = `<button class="task-complete-btn" data-task-id="${t.dependantTaskID}">
                <i data-lucide="check"></i> Mark complete</button>`;
        } else {
            actions = '';
        }

        return `
        <div class="task-card ${status === 'completed' ? 'task--completed' : ''}" data-task-id="${t.dependantTaskID}">
            <div class="task-main">
                <div class="task-title-row">
                    <span class="task-name">${_esc(t.taskName)}</span>
                    ${badge}${recBadge}
                </div>
                ${descHtml}
                <div class="task-meta">${meta.join('')}</div>
            </div>
            <div class="task-actions">
                ${actions}
                <div class="task-inline-msg" id="task-msg-${t.dependantTaskID}" hidden></div>
            </div>
        </div>`;
    }

    function _complete(taskId, btn) {
        if (!taskId) return;
        const msgEl = document.getElementById('task-msg-' + taskId);
        if (btn) { btn.disabled = true; }
        if (msgEl) { msgEl.hidden = true; msgEl.textContent = ''; }

        API.Me.completeTask(taskId).then((res) => {
            if (res && res.success) {
                if (window.UIUtils) {
                    const paid = res.data && res.data.rewardCharged ? ` Reward of R${Number(res.data.rewardCharged).toFixed(2)} earned.` : '';
                    UIUtils.toast('Task completed.' + paid, 'success');
                }
                _load(); // refresh so status + any new recurring occurrence show
            } else {
                // Surface the server's exact message (daily-date rule,
                // insufficient funds, ownership, etc.).
                const err = (res && res.error) || 'This task could not be completed.';
                if (msgEl) { msgEl.textContent = err; msgEl.className = 'task-inline-msg err'; msgEl.hidden = false; }
                if (window.UIUtils) UIUtils.toast(err, 'error');
                if (btn) btn.disabled = false;
            }
        }).catch(() => {
            if (msgEl) { msgEl.textContent = 'Network error. Please try again.'; msgEl.className = 'task-inline-msg err'; msgEl.hidden = false; }
            if (btn) btn.disabled = false;
        });
    }

    /* ---- helpers ---- */
    function _statusLabel(s) {
        return { pending: 'Pending', in_progress: 'In progress', completed: 'Completed', overdue: 'Overdue', cancelled: 'Cancelled' }[s] || _cap(s);
    }
    function _cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
    function _todayISO() {
        const d = new Date();
        const p = n => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    function _fmtDate(v) {
        const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
        if (isNaN(d)) return String(v);
        return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function _fmtDateTime(v) {
        const d = new Date(v);
        if (isNaN(d)) return String(v);
        return d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
    }
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return { init };
})();

if (typeof window !== 'undefined') window.TasksUI = TasksUI;
