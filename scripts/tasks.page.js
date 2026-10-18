/* ===========================================================
   tasks.page.js
   Dependant "Tasks" tab template. Registered into the SPA shell
   via window._pageContent['tasks']. Rendered by TasksUI (tasks-ui.js).
   Uses existing FlexScribe design tokens so it matches the app and
   stays responsive without a new stylesheet.
=========================================================== */
window._pageContent = window._pageContent || {};
window._pageContent['tasks'] = `
<div class="tasks-page">
    <div class="tasks-toolbar">
        <div class="tasks-filters" id="tasks-filters">
            <button class="tasks-filter-btn active" data-filter="all">All</button>
            <button class="tasks-filter-btn" data-filter="pending">To do</button>
            <button class="tasks-filter-btn" data-filter="overdue">Overdue</button>
            <button class="tasks-filter-btn" data-filter="completed">Completed</button>
        </div>
        <button class="tasks-refresh-btn" id="tasks-refresh" title="Refresh">
            <i data-lucide="refresh-cw"></i> Refresh
        </button>
    </div>

    <div id="tasks-list" class="tasks-list" aria-live="polite">
        <div class="tasks-empty">Loading your tasks…</div>
    </div>
</div>

<style>
.tasks-page { max-width: 820px; margin: 0 auto; padding: 4px 2px 32px; }
.tasks-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
.tasks-filters { display:flex; gap:8px; flex-wrap:wrap; }
.tasks-filter-btn {
    background: var(--card, #1b1b1f); color: var(--text-light, #9aa0a6);
    border:1px solid var(--border, #2a2a30); border-radius:999px;
    padding:7px 14px; font-size:13px; cursor:pointer; transition:all .15s;
}
.tasks-filter-btn:hover { color: var(--text, #fff); }
.tasks-filter-btn.active { background: var(--orange, #FF7A29); color:#fff; border-color: var(--orange, #FF7A29); }
.tasks-refresh-btn {
    display:inline-flex; align-items:center; gap:6px; background:transparent;
    color: var(--text-light, #9aa0a6); border:1px solid var(--border, #2a2a30);
    border-radius:8px; padding:7px 12px; font-size:13px; cursor:pointer;
}
.tasks-refresh-btn:hover { color: var(--text, #fff); }
.tasks-refresh-btn i { width:15px; height:15px; }

.tasks-list { display:flex; flex-direction:column; gap:12px; }
.tasks-empty { color: var(--text-light, #9aa0a6); text-align:center; padding:40px 12px; font-size:14px; }

.task-card {
    background: var(--card, #1b1b1f); border:1px solid var(--border, #2a2a30);
    border-radius:14px; padding:16px 18px; display:flex; gap:14px;
    align-items:flex-start; justify-content:space-between;
}
.task-card.task--completed { opacity:.72; }
.task-main { min-width:0; flex:1; }
.task-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.task-name { font-weight:600; font-size:15px; color: var(--text, #fff); word-break:break-word; }
.task-desc { margin:6px 0 0; font-size:13px; color: var(--text-light, #9aa0a6); word-break:break-word; }
.task-meta { display:flex; flex-direction:column; gap:7px; margin-top:12px; font-size:12.5px; color: var(--text-light, #9aa0a6); }
.task-meta span { display:flex; justify-content:space-between; gap:12px; padding-bottom:7px; border-bottom:1px solid var(--border, #24242a); }
.task-meta span:last-child { border-bottom:none; padding-bottom:0; }
.task-meta b { color: var(--text, #e8e8ea); font-weight:600; text-align:right; }
.task-reward { color: #35c759; font-weight:600; }

.task-badge { font-size:11px; font-weight:600; padding:3px 9px; border-radius:999px; white-space:nowrap; }
.badge-pending { background:#2a2f3a; color:#8ab4ff; }
.badge-in_progress { background:#2a2f3a; color:#8ab4ff; }
.badge-completed { background:#14341f; color:#46d17a; }
.badge-overdue { background:#3a2020; color:#ff6b6b; }
.badge-cancelled { background:#2a2a30; color:#9aa0a6; }
.task-recurring { background:#2a2630; color:#c08cff; font-size:11px; padding:3px 9px; border-radius:999px; }

.task-actions { display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
.task-complete-btn {
    display:inline-flex; align-items:center; gap:7px; background: var(--orange, #FF7A29);
    color:#fff; border:none; border-radius:9px; padding:9px 14px; font-size:13px;
    font-weight:600; cursor:pointer; white-space:nowrap;
}
.task-complete-btn:hover { filter:brightness(1.08); }
.task-complete-btn:disabled { opacity:.6; cursor:not-allowed; }
.task-complete-btn i { width:15px; height:15px; }
.task-done-flag { display:inline-flex; align-items:center; gap:6px; color:#46d17a; font-size:13px; font-weight:600; }
.task-done-flag i { width:15px; height:15px; }
.task-inline-msg { font-size:12px; margin-top:4px; max-width:220px; text-align:right; }
.task-inline-msg.err { color:#ff6b6b; }
.task-inline-msg.ok { color:#46d17a; }

@media (max-width: 560px) {
    .task-card { flex-direction:column; }
    .task-actions { flex-direction:row; align-items:center; align-self:stretch; justify-content:flex-end; }
    .task-inline-msg { text-align:left; max-width:none; }
}
</style>
`;
