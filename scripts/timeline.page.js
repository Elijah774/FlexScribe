window._pageContent = window._pageContent || {};
window._pageContent['timeline'] = `
<div class="tl-container">
    <div class="tl-header">
        <h2 class="tl-title">Billing Calendar</h2>
        <div class="tl-month-selector">
            <button class="tl-nav-btn" id="tl-prev-month"><svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <select class="tl-month-select" id="tl-month-select"></select>
            <button class="tl-nav-btn" id="tl-next-month"><svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
    </div>
    <div class="tl-calendar">
        <div class="tl-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
        <div class="tl-days" id="tl-days-grid"></div>
    </div>
    <div class="tl-legend">
        <span class="tl-legend-item"><span class="tl-legend-dot tl-dot-due"></span> Payment Due</span>
        <span class="tl-legend-item"><span class="tl-legend-dot tl-dot-renew"></span> Auto-Renewal</span>
        <span class="tl-legend-item"><span class="tl-legend-dot tl-dot-today"></span> Today</span>
    </div>
    <div class="tl-details" id="tl-details">
        <p class="tl-details-placeholder">Click on a highlighted day to see subscription details.</p>
    </div>
</div>

<style>
.tl-container { max-width: 100%; }
.tl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.tl-title { font-size: 20px; font-weight: 700; color: var(--text); }
.tl-month-selector { display: flex; align-items: center; gap: 8px; }
.tl-nav-btn { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px; cursor: pointer; color: var(--text-light); display: flex; align-items: center; transition: all 0.15s; }
.tl-nav-btn:hover { border-color: var(--orange); color: var(--orange); }
.tl-month-select { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 9px 16px; color: var(--text); font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; min-width: 160px; text-align: center; }
.tl-month-select:focus { outline: none; border-color: var(--orange); }
.tl-calendar { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
.tl-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 12px; font-weight: 600; color: var(--text-light); text-transform: uppercase; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.tl-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.tl-day { position: relative; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 10px; font-size: 13px; color: var(--text); cursor: default; transition: all 0.15s; max-width: 42px; max-height: 42px; padding: 4px; }
.tl-day.empty { visibility: hidden; }
.tl-day.today { background: var(--hover); font-weight: 700; box-shadow: inset 0 0 0 2px var(--orange); }
.tl-day.has-event { cursor: pointer; }
.tl-day.has-event:hover { background: var(--hover); }
.tl-day.has-due { background: rgba(255, 138, 52, 0.12); }
.tl-day.has-renew { background: rgba(167, 124, 255, 0.12); }
.tl-day.has-due.has-renew { background: linear-gradient(135deg, rgba(255,138,52,0.12), rgba(167,124,255,0.12)); }
.tl-day-num { font-size: 14px; font-weight: 500; }
.tl-day-dots { display: flex; gap: 3px; margin-top: 4px; position: absolute; bottom: 4px; }
.tl-day-dot { width: 5px; height: 5px; border-radius: 50%; }
.tl-dot-due { background: var(--orange); }
.tl-dot-renew { background: var(--purple); }
.tl-dot-today { background: var(--green); }
.tl-legend { display: flex; gap: 20px; margin-bottom: 16px; flex-wrap: wrap; }
.tl-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-light); }
.tl-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
.tl-details { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; min-height: 80px; }
.tl-details-placeholder { color: var(--text-light); font-size: 13px; text-align: center; padding: 16px; }
.tl-detail-header { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 12px; }
.tl-detail-list { display: flex; flex-direction: column; gap: 8px; }
.tl-detail-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--hover); border-radius: 10px; }
.tl-detail-name { font-size: 13px; font-weight: 600; color: var(--text); }
.tl-detail-amount { font-size: 14px; font-weight: 700; color: var(--orange); }
.tl-detail-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
.tl-badge-due { background: rgba(255,138,52,0.15); color: var(--orange); }
.tl-badge-renew { background: rgba(167,124,255,0.15); color: var(--purple); }
</style>
`;
