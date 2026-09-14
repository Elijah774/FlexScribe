window._pageContent = window._pageContent || {};
window._pageContent['wallet-deposit'] = `
<div class="wzd" id="wzd-deposit">
  <!-- Top bar: back arrow + title -->
  <div class="wzd-topbar">
    <button class="wzd-back" id="wzd-dep-back" aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <h2 class="wzd-title">Top Up Wallet</h2>
  </div>

  <!-- Step indicator -->
  <ol class="wzd-steps" id="wzd-dep-steps" data-active="1">
    <li data-step="1"><span class="wzd-step-num">1</span><span class="wzd-step-label">Method</span></li>
    <li data-step="2"><span class="wzd-step-num">2</span><span class="wzd-step-label">Amount</span></li>
    <li data-step="3"><span class="wzd-step-num">3</span><span class="wzd-step-label">Review</span></li>
    <li data-step="4"><span class="wzd-step-num">4</span><span class="wzd-step-label">Done</span></li>
  </ol>

  <div class="wzd-body">
    <!-- STEP 1: Method -->
    <section class="wzd-panel" data-step="1">
      <h3 class="wzd-heading">Deposit Method</h3>
      <p class="wzd-subheading">Choose how you'd like to add funds.</p>
      <div class="wzd-options" id="wzd-dep-methods">
        <button type="button" class="wzd-option" data-method="Bank Transfer" aria-pressed="true">
          <span class="wzd-option-radio"></span>
          <span class="wzd-option-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 21V10M18 21V10M10 21V10M14 21V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span class="wzd-option-text"><span class="wzd-option-title">Bank Transfer</span><span class="wzd-option-desc">Reflects within a few minutes</span></span>
        </button>
        <button type="button" class="wzd-option is-disabled" data-method="Card" disabled aria-disabled="true">
          <span class="wzd-option-radio"></span>
          <span class="wzd-option-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18" stroke="currentColor" stroke-width="1.8"/></svg></span>
          <span class="wzd-option-text"><span class="wzd-option-title">Card Payment</span><span class="wzd-option-desc">Instant top up with a saved card</span></span>
          <span class="wzd-badge muted">Coming soon</span>
        </button>
        <button type="button" class="wzd-option is-disabled" data-method="EFT" disabled aria-disabled="true">
          <span class="wzd-option-radio"></span>
          <span class="wzd-option-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M4 7h16v10H4zM4 11h16M8 15h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <span class="wzd-option-text"><span class="wzd-option-title">EFT / Instant Transfer</span><span class="wzd-option-desc">Real-time electronic funds transfer</span></span>
          <span class="wzd-badge muted">Coming soon</span>
        </button>
      </div>
      <div class="wzd-actions">
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-dep-method-continue">Continue</button>
      </div>
    </section>

    <!-- STEP 2: Amount -->
    <section class="wzd-panel" data-step="2" hidden>
      <h3 class="wzd-heading">Add Funds to Your Wallet</h3>
      <p class="wzd-subheading" id="wzd-dep-available">Available Balance: R0.00</p>
      <div class="wzd-amount-field">
        <span class="wzd-currency">R</span>
        <input type="number" id="wzd-dep-amount" class="wzd-amount-input" placeholder="0.00" min="0.01" step="0.01" inputmode="decimal">
      </div>
      <div class="wzd-chips" data-target="wzd-dep-amount">
        <button type="button" class="wzd-chip" data-amt="100">R100</button>
        <button type="button" class="wzd-chip" data-amt="250">R250</button>
        <button type="button" class="wzd-chip" data-amt="500">R500</button>
        <button type="button" class="wzd-chip" data-amt="1000">R1,000</button>
      </div>
      <span class="wzd-error" id="wzd-dep-amount-error"></span>
      <div class="wzd-actions">
        <button type="button" class="wzd-btn wzd-btn--secondary" id="wzd-dep-amount-back">Back</button>
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-dep-amount-continue" disabled>Continue</button>
      </div>
    </section>

    <!-- STEP 3: Review -->
    <section class="wzd-panel" data-step="3" hidden>
      <h3 class="wzd-heading">Review Deposit</h3>
      <div class="wzd-summary">
        <div class="wzd-summary-row"><span>Deposit Method</span><span id="wzd-dep-review-method">—</span></div>
        <div class="wzd-summary-row"><span>Amount</span><span id="wzd-dep-review-amount" class="num">R0.00</span></div>
        <div class="wzd-summary-row"><span>Processing Time</span><span>A few minutes</span></div>
        <div class="wzd-summary-row"><span>Reference</span><span id="wzd-dep-review-ref" class="mono">—</span></div>
      </div>
      <p class="wzd-info">Funds will reflect in your wallet once the transfer is confirmed.</p>
      <span class="wzd-error" id="wzd-dep-review-error"></span>
      <div class="wzd-actions">
        <button type="button" class="wzd-btn wzd-btn--secondary" id="wzd-dep-review-back">Back</button>
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-dep-confirm">Confirm Deposit</button>
      </div>
    </section>

    <!-- Processing overlay (inline) -->
    <section class="wzd-panel wzd-processing" data-step="processing" hidden>
      <div class="wzd-spinner" aria-hidden="true"></div>
      <p class="wzd-processing-msg">Submitting your deposit…</p>
    </section>

    <!-- STEP 4: Confirmation -->
    <section class="wzd-panel wzd-confirm" data-step="4" hidden>
      <div class="wzd-check">
        <svg viewBox="0 0 24 24" fill="none" width="40" height="40"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h3 class="wzd-confirm-title">Deposit Submitted</h3>
      <p class="wzd-confirm-msg" id="wzd-dep-confirm-msg">Your funds are being added to your wallet.</p>
      <div class="wzd-summary">
        <div class="wzd-summary-row"><span>Reference</span><span id="wzd-dep-done-ref" class="mono">—</span></div>
        <div class="wzd-summary-row"><span>Amount</span><span id="wzd-dep-done-amount" class="num">R0.00</span></div>
        <div class="wzd-summary-row"><span>Status</span><span class="wzd-status-badge success" id="wzd-dep-done-status">Completed</span></div>
      </div>
      <div class="wzd-actions wzd-actions--center">
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-dep-done">Done</button>
      </div>
    </section>

    <!-- Failure -->
    <section class="wzd-panel wzd-confirm" data-step="failure" hidden>
      <div class="wzd-check failure">
        <svg viewBox="0 0 24 24" fill="none" width="40" height="40"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      </div>
      <h3 class="wzd-confirm-title">Deposit Failed</h3>
      <p class="wzd-confirm-msg" id="wzd-dep-fail-msg">We couldn't add the funds. Your balance has not been changed.</p>
      <div class="wzd-actions wzd-actions--center">
        <button type="button" class="wzd-btn wzd-btn--secondary" id="wzd-dep-fail-close">Back to Wallet</button>
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-dep-retry">Try Again</button>
      </div>
    </section>
  </div>
</div>
`;
