window._pageContent = window._pageContent || {};
window._pageContent['wallet'] = `
<div class="wal2">
  <!-- ════════════ LEFT COLUMN (3fr) ════════════ -->
  <div class="wal2-left">

    <!-- Low-funds warning -->
    <div class="wal2-warning" id="wallet-funds-warning" hidden>
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="wal2-warning-txt">
        <p class="wal2-warning-title">Your balance won't cover your subscriptions</p>
        <p class="wal2-warning-msg" id="wallet-funds-warning-msg">Add funds to cover your upcoming subscription payments.</p>
      </div>
      <button class="wal2-warning-btn" id="wallet-warning-add-btn">Add Funds</button>
    </div>

    <!-- Row of 3 stat cards -->
    <div class="wal2-stats">
      <div class="wal2-stat">
        <div class="wal2-stat-chip green">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <p class="wal2-stat-label">Total Balance</p>
        <p class="wal2-stat-value num" id="wallet-hero-balance">R0.00</p>
        <p class="wal2-stat-delta" id="wal2-balance-delta">Available to spend</p>
      </div>
      <div class="wal2-stat">
        <div class="wal2-stat-chip orange">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <p class="wal2-stat-label">Total Subscriptions</p>
        <p class="wal2-stat-value num" id="wallet-stat-subs-total">R0.00</p>
        <p class="wal2-stat-delta" id="wal2-subs-delta">per month</p>
      </div>
      <div class="wal2-stat">
        <div class="wal2-stat-chip blue">
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <p class="wal2-stat-label">Total Pending</p>
        <p class="wal2-stat-value num" id="wallet-stat-pending-in">R0.00</p>
        <p class="wal2-stat-delta" id="wal2-pending-delta">Clearing soon</p>
      </div>
    </div>

    <!-- Trend chart -->
    <div class="wal2-card wal2-trend">
      <div class="wal2-trend-head">
        <div class="wal2-seg" id="wal2-metric-seg" role="tablist" aria-label="Metric">
          <button class="wal2-seg-btn active" data-metric="income">Income</button>
          <button class="wal2-seg-btn" data-metric="expenses">Expenses</button>
          <button class="wal2-seg-btn" data-metric="savings">Savings</button>
        </div>
        <div class="wal2-seg wal2-seg--sub" id="wal2-period-seg" role="tablist" aria-label="Period">
          <button class="wal2-pd-btn" data-period="weekly">Weekly</button>
          <button class="wal2-pd-btn active" data-period="monthly">Monthly</button>
          <button class="wal2-pd-btn" data-period="yearly">Yearly</button>
        </div>
      </div>
      <div class="wal2-trend-meta">
        <p class="wal2-trend-total num" id="wal2-trend-total">R0.00</p>
        <p class="wal2-trend-sub" id="wal2-trend-sub">Monthly income</p>
      </div>
      <div class="wal2-chart" id="wal2-chart" aria-hidden="true"></div>
    </div>

    <!-- Transaction history -->
    <div class="wal2-card wal2-history">
      <div class="wal2-card-head">
        <h3 class="wal2-card-title">Transaction History</h3>
        <select id="wallet-history-filter" class="wal2-filter" aria-label="Filter transactions">
          <option value="">All types</option>
          <option value="credit">Deposits</option>
          <option value="transfer_in">Received</option>
          <option value="transfer_out">Sent</option>
          <option value="withdrawal">Withdrawals</option>
          <option value="transfer">Goal transfers</option>
        </select>
      </div>
      <ul class="wal2-txn-list" id="wallet-activity-list"></ul>
      <div class="wal2-history-footer" id="wallet-activity-footer" hidden>
        <button class="wal2-more-btn" id="wallet-history-more">Load more</button>
      </div>
    </div>
  </div>

  <!-- ════════════ RIGHT COLUMN (1fr) ════════════ -->
  <div class="wal2-right">

    <!-- See card details row -->
    <div class="wal2-cardrow">
      <span class="wal2-cardrow-label">Card details</span>
      <button class="wal2-reveal-btn" id="wallet-card-reveal" aria-pressed="false">
        <svg class="wal2-eye-open" viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
        <svg class="wal2-eye-off" viewBox="0 0 24 24" fill="none" width="16" height="16" hidden><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span id="wallet-card-reveal-label">View</span>
      </button>
    </div>

    <!-- Virtual card -->
    <div class="wal2-flexcard" id="wal2-flexcard">
      <div class="wal2-fc-top">
        <span class="wal2-fc-brand">FlexScribe</span>
        <svg class="wal2-fc-wifi" viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M8.5 16.5a5 5 0 010-9M5 19a9 9 0 010-14M12 16.5a5 5 0 000-9M15.5 19a9 9 0 000-14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <div class="wal2-fc-chip">
        <svg viewBox="0 0 50 40" width="34" height="27"><rect x="1" y="1" width="48" height="38" rx="5" fill="url(#wcg)" stroke="#C9A23B" stroke-width="1"/><line x1="1" y1="14" x2="49" y2="14" stroke="#B8912E" stroke-width="0.8"/><line x1="1" y1="26" x2="49" y2="26" stroke="#B8912E" stroke-width="0.8"/><line x1="17" y1="1" x2="17" y2="40" stroke="#B8912E" stroke-width="0.8"/><line x1="33" y1="1" x2="33" y2="40" stroke="#B8912E" stroke-width="0.8"/><defs><linearGradient id="wcg" x1="0" y1="0" x2="50" y2="40"><stop offset="0%" stop-color="#E8D078"/><stop offset="50%" stop-color="#F0E4A0"/><stop offset="100%" stop-color="#C8A83E"/></linearGradient></defs></svg>
      </div>
      <p class="wal2-fc-number mono" id="wallet-card-number">•••• •••• •••• ••••</p>
      <div class="wal2-fc-bottom">
        <div><span class="wal2-fc-cap">Card Holder</span><p class="wal2-fc-val" id="wallet-card-name">CARD HOLDER</p></div>
        <div><span class="wal2-fc-cap">Expires</span><p class="wal2-fc-val num" id="wallet-card-exp">09/27</p></div>
        <svg class="wal2-fc-visa" viewBox="0 0 80 26" width="46" height="15"><text x="0" y="22" font-family="Arial,sans-serif" font-size="26" font-weight="bold" font-style="italic" fill="#FFF">VISA</text></svg>
      </div>
    </div>

    <!-- Quick actions -->
    <div class="wal2-card wal2-qa">
      <h4 class="wal2-card-title">Quick Actions</h4>
      <div class="wal2-qa-grid">
        <button class="wal2-qa-btn" id="wallet-btn-add">
          <span class="wal2-qa-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
          <span>Top up</span>
        </button>
        <button class="wal2-qa-btn" id="wallet-btn-send-user">
          <span class="wal2-qa-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span>Transfer</span>
        </button>
        <button class="wal2-qa-btn" id="wallet-btn-withdraw">
          <span class="wal2-qa-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span>Withdraw</span>
        </button>
      </div>
    </div>

    <!-- Upcoming payments -->
    <div class="wal2-card wal2-upcoming">
      <div class="wal2-card-head">
        <h4 class="wal2-card-title">Upcoming Payments</h4>
        <button class="wal2-link" onclick="loadPage('timeline')">View all →</button>
      </div>
      <div class="wal2-up-list" id="wal2-upcoming-list"></div>
    </div>
  </div>
</div>

<!-- Hidden goal-transfer + dependant entry points (kept for existing modals) -->
<div style="display:none">
  <button id="wallet-btn-transfer" aria-hidden="true"></button>
  <button id="wallet-btn-send" aria-hidden="true"></button>
</div>
`;
