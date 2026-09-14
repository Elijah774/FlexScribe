window._pageContent = window._pageContent || {};
window._pageContent['wallet-withdraw'] = `
<div class="wzd" id="wzd-withdraw">
  <!-- Top bar: back arrow + title -->
  <div class="wzd-topbar">
    <button class="wzd-back" id="wzd-wdl-back" aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <h2 class="wzd-title">Withdraw Funds</h2>
  </div>

  <!-- Step indicator -->
  <ol class="wzd-steps" id="wzd-wdl-steps" data-active="1">
    <li data-step="1"><span class="wzd-step-num">1</span><span class="wzd-step-label">Account</span></li>
    <li data-step="2"><span class="wzd-step-num">2</span><span class="wzd-step-label">Amount</span></li>
    <li data-step="3"><span class="wzd-step-num">3</span><span class="wzd-step-label">Review</span></li>
    <li data-step="4"><span class="wzd-step-num">4</span><span class="wzd-step-label">Done</span></li>
  </ol>

  <div class="wzd-body">
    <!-- STEP 1: Withdrawal details -->
    <section class="wzd-panel" data-step="1">
      <div class="wzd-balance-card">
        <span class="wzd-balance-label">Available to Withdraw</span>
        <span class="wzd-balance-value num" id="wzd-wdl-available-big">R0.00</span>
      </div>
      <h3 class="wzd-heading">Select Bank Account</h3>
      <div class="wzd-options" id="wzd-wdl-accounts">
        <p class="wzd-subheading">Loading accounts…</p>
      </div>
      <button type="button" class="wzd-add-account" id="wzd-wdl-add-account">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        Add New Bank Account
      </button>

      <!-- Inline add-account form (hidden until "Add New Bank Account") -->
      <form id="wzd-wdl-addform" class="wzd-addform" hidden novalidate>
        <label class="wzd-field">
          <span class="wzd-label">Bank</span>
          <select id="wzd-nb-bank">
            <option value="">Select your bank</option>
            <option>FNB</option>
            <option>Standard Bank</option>
            <option>Absa</option>
            <option>Nedbank</option>
            <option>Capitec</option>
            <option>Investec</option>
            <option>African Bank</option>
            <option>TymeBank</option>
            <option>Discovery Bank</option>
          </select>
        </label>
        <label class="wzd-field">
          <span class="wzd-label">Account Holder Name</span>
          <input type="text" id="wzd-nb-holder" placeholder="e.g. Jordan Mtiva" autocomplete="off">
        </label>
        <label class="wzd-field">
          <span class="wzd-label">Account Number</span>
          <input type="text" id="wzd-nb-number" inputmode="numeric" placeholder="e.g. 1234567890" maxlength="18" autocomplete="off">
        </label>
        <div class="wzd-field-row">
          <label class="wzd-field">
            <span class="wzd-label">Account Type</span>
            <select id="wzd-nb-type">
              <option value="">Select type</option>
              <option>Cheque / Current</option>
              <option>Savings</option>
            </select>
          </label>
          <label class="wzd-field">
            <span class="wzd-label">Branch Code</span>
            <input type="text" id="wzd-nb-branch" inputmode="numeric" placeholder="e.g. 250655" maxlength="8" autocomplete="off">
          </label>
        </div>
        <span class="wzd-error" id="wzd-nb-error"></span>
        <div class="wzd-actions">
          <button type="button" class="wzd-btn wzd-btn--secondary" id="wzd-nb-cancel">Cancel</button>
          <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-nb-save">Save Account</button>
        </div>
      </form>

      <span class="wzd-error" id="wzd-wdl-account-error"></span>
      <div class="wzd-actions" id="wzd-wdl-account-actions">
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-wdl-account-continue" disabled>Continue</button>
      </div>
    </section>

    <!-- STEP 2: Amount -->
    <section class="wzd-panel" data-step="2" hidden>
      <h3 class="wzd-heading">Enter Amount</h3>
      <p class="wzd-subheading" id="wzd-wdl-available">Available: R0.00</p>
      <div class="wzd-amount-field">
        <span class="wzd-currency">R</span>
        <input type="number" id="wzd-wdl-amount" class="wzd-amount-input" placeholder="0.00" min="0.01" step="0.01" inputmode="decimal">
      </div>
      <div class="wzd-chips" data-target="wzd-wdl-amount">
        <button type="button" class="wzd-chip" data-amt="500">R500</button>
        <button type="button" class="wzd-chip" data-amt="1000">R1,000</button>
        <button type="button" class="wzd-chip" data-amt="2000">R2,000</button>
        <button type="button" class="wzd-chip" data-amt="5000">R5,000</button>
      </div>
      <div class="wzd-fee-box">
        <div class="wzd-summary-row"><span>Fee</span><span class="num">R0.00</span></div>
        <div class="wzd-summary-row"><span>You will receive</span><span class="num" id="wzd-wdl-receive">R0.00</span></div>
      </div>
      <span class="wzd-error" id="wzd-wdl-amount-error"></span>
      <div class="wzd-actions">
        <button type="button" class="wzd-btn wzd-btn--secondary" id="wzd-wdl-amount-back">Back</button>
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-wdl-amount-continue" disabled>Continue</button>
      </div>
    </section>

    <!-- STEP 3: Review -->
    <section class="wzd-panel" data-step="3" hidden>
      <h3 class="wzd-heading">Review Withdrawal</h3>
      <div class="wzd-summary">
        <div class="wzd-summary-row"><span>Bank Account</span><span id="wzd-wdl-review-dest">—</span></div>
        <div class="wzd-summary-row"><span>Amount</span><span id="wzd-wdl-review-amount" class="num">R0.00</span></div>
        <div class="wzd-summary-row"><span>Fee</span><span class="num">R0.00</span></div>
        <div class="wzd-summary-row wzd-summary-total"><span>Total</span><span id="wzd-wdl-review-total" class="num">R0.00</span></div>
        <div class="wzd-summary-row"><span>Status</span><span class="wzd-status-badge pending">Pending</span></div>
      </div>
      <p class="wzd-info">Withdrawals are processed within 1–2 business days.</p>
      <span class="wzd-error" id="wzd-wdl-review-error"></span>
      <div class="wzd-actions">
        <button type="button" class="wzd-btn wzd-btn--secondary" id="wzd-wdl-review-back">Back</button>
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-wdl-confirm">Confirm Withdrawal</button>
      </div>
    </section>

    <!-- Processing -->
    <section class="wzd-panel wzd-processing" data-step="processing" hidden>
      <div class="wzd-spinner" aria-hidden="true"></div>
      <p class="wzd-processing-msg">Submitting your withdrawal…</p>
    </section>

    <!-- STEP 4: Confirmation -->
    <section class="wzd-panel wzd-confirm" data-step="4" hidden>
      <div class="wzd-check">
        <svg viewBox="0 0 24 24" fill="none" width="40" height="40"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h3 class="wzd-confirm-title">Withdrawal Submitted</h3>
      <p class="wzd-confirm-msg" id="wzd-wdl-confirm-msg">Your withdrawal is being processed and will arrive within 1–2 business days.</p>
      <div class="wzd-summary">
        <div class="wzd-summary-row"><span>Reference</span><span id="wzd-wdl-done-ref" class="mono">—</span></div>
        <div class="wzd-summary-row"><span>Destination</span><span id="wzd-wdl-done-dest">—</span></div>
        <div class="wzd-summary-row"><span>Date</span><span id="wzd-wdl-done-date">—</span></div>
        <div class="wzd-summary-row"><span>Status</span><span class="wzd-status-badge pending">Pending</span></div>
      </div>
      <div class="wzd-actions wzd-actions--center">
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-wdl-done">Done</button>
      </div>
    </section>

    <!-- Failure -->
    <section class="wzd-panel wzd-confirm" data-step="failure" hidden>
      <div class="wzd-check failure">
        <svg viewBox="0 0 24 24" fill="none" width="40" height="40"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      </div>
      <h3 class="wzd-confirm-title">Withdrawal Failed</h3>
      <p class="wzd-confirm-msg" id="wzd-wdl-fail-msg">The withdrawal could not be completed. Your balance has not been changed.</p>
      <div class="wzd-actions wzd-actions--center">
        <button type="button" class="wzd-btn wzd-btn--secondary" id="wzd-wdl-fail-close">Back to Wallet</button>
        <button type="button" class="wzd-btn wzd-btn--primary" id="wzd-wdl-retry">Try Again</button>
      </div>
    </section>
  </div>
</div>
`;
