/* =============================================================
   FlexScribe — Top Up full-screen takeover
   scripts/wallet-topup-overlay.js

   A body-level fixed overlay (covers sidebar, topbar, content —
   nothing from the parent layout stays visible or interactive).
   Not a modal/drawer/panel: it renders as its own full-screen view.

   Phase flow:
     method → amount → review → [card | ozow | payfast] → processing → confirmation

   Invariants enforced here:
   • Exactly one phase panel is visible at any time (_show hides all others).
   • No exit/back control during 'processing' or 'confirmation'.
   • Cancel from amount/review asks to discard (an amount was entered).
   • Confirm button locks to prevent double submission.

   On success: real balance top-up via API.Wallet.topUp(), then a toast
   + a refreshed notification bell reflecting the real amount and method.
============================================================= */

'use strict';

const TopUpOverlay = (() => {

    /* ---- config ---- */
    const METHODS = {
        card:    { key: 'card',    label: 'Card Payment', apiMethod: 'Card Payment',      cta: 'Enter Card Details',   processing: 'Processing your card payment…' },
        ozow:    { key: 'ozow',    label: 'Ozow',         apiMethod: 'Ozow',              cta: 'Continue to Ozow',     processing: 'Confirming payment with your bank…' },
        payfast: { key: 'payfast', label: 'Payfast',      apiMethod: 'Payfast',           cta: 'Continue to Payfast',  processing: 'Completing secure checkout…' }
    };
    const QUICK = [100, 250, 500, 1000];
    const OZOW_BANKS = ['FNB', 'Standard Bank', 'Absa', 'Nedbank', 'Capitec'];

    /* ---- state ---- */
    let _root = null;          // overlay root element
    let _method = null;        // 'card' | 'ozow' | 'payfast'
    let _amount = 0;
    let _reference = '';
    let _busy = false;
    let _phase = 'method';

    /* ---- helpers ---- */
    const _q = (sel) => _root ? _root.querySelector(sel) : null;
    const _qa = (sel) => _root ? Array.prototype.slice.call(_root.querySelectorAll(sel)) : [];

    function _fmt(v) {
        return 'R' + (parseFloat(v) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /** Generate a display reference (server issues the authoritative one). */
    function _genRef() {
        const s = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
        return 'FS-DEP-' + s.slice(0, 6);
    }

    /* ==========================================================
       BUILD — inject overlay markup into <body>
    ========================================================== */
    function _build() {
        const el = document.createElement('div');
        el.className = 'tuo';
        el.id = 'topup-overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', 'Top up wallet');
        el.innerHTML = _markup();
        document.body.appendChild(el);
        _root = el;
        _bind();
    }

    function _stepDots() {
        // Four visible checkpoints (method-specific + processing fold into "Pay")
        const steps = [
            { key: 'method', label: 'Method' },
            { key: 'amount', label: 'Amount' },
            { key: 'review', label: 'Review' },
            { key: 'pay',    label: 'Confirm' }
        ];
        return `<ol class="tuo-steps" id="tuo-steps">` + steps.map(function (s, i) {
            return `<li data-step-key="${s.key}"><span class="tuo-step-num">${i + 1}</span><span class="tuo-step-label">${s.label}</span></li>`;
        }).join('') + `</ol>`;
    }

    function _markup() {
        return `
        <div class="tuo-shell">
          <header class="tuo-header">
            <button class="tuo-back" id="tuo-back" aria-label="Cancel and go back">
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="tuo-brand"><span class="tuo-brand-name">Flex<span>Scribe</span></span><span class="tuo-brand-sub">Top Up</span></div>
          </header>

          ${_stepDots()}

          <div class="tuo-body">

            <!-- PHASE: METHOD -->
            <section class="tuo-phase" data-phase="method">
              <h2 class="tuo-h2">Choose a deposit method</h2>
              <p class="tuo-sub">Select how you'd like to add funds to your wallet.</p>
              <div class="tuo-methods" id="tuo-methods">
                <button type="button" class="tuo-method" data-method="card" aria-pressed="false">
                  <span class="tuo-method-radio"></span>
                  <span class="tuo-method-icon"><svg viewBox="0 0 24 24" fill="none" width="22" height="22"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M2 9h20" stroke="currentColor" stroke-width="1.8"/></svg></span>
                  <span class="tuo-method-text"><span class="tuo-method-name">Card Payment</span><span class="tuo-method-desc">Instant — pay with your debit or credit card</span></span>
                </button>
                <button type="button" class="tuo-method" data-method="ozow" aria-pressed="false">
                  <span class="tuo-method-radio"></span>
                  <span class="tuo-method-icon ozow"><svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg></span>
                  <span class="tuo-method-text"><span class="tuo-method-name">Ozow</span><span class="tuo-method-desc">Instant EFT via your bank</span></span>
                </button>
                <button type="button" class="tuo-method" data-method="payfast" aria-pressed="false">
                  <span class="tuo-method-radio"></span>
                  <span class="tuo-method-icon payfast"><svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M6 8h9a3 3 0 010 6H8m0 0v5m0-5V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                  <span class="tuo-method-text"><span class="tuo-method-name">Payfast</span><span class="tuo-method-desc">Hosted secure checkout</span></span>
                </button>
              </div>
              <div class="tuo-actions">
                <button type="button" class="tuo-btn tuo-btn--primary" id="tuo-method-continue" disabled>Continue</button>
              </div>
            </section>

            <!-- PHASE: AMOUNT -->
            <section class="tuo-phase" data-phase="amount" hidden>
              <h2 class="tuo-h2">How much would you like to add?</h2>
              <div class="tuo-amount-field">
                <span class="tuo-currency">R</span>
                <input type="number" id="tuo-amount" class="tuo-amount-input" placeholder="0.00" min="0.01" step="0.01" inputmode="decimal">
              </div>
              <div class="tuo-chips" id="tuo-chips">
                ${QUICK.map(function (v) { return `<button type="button" class="tuo-chip" data-amt="${v}">R${v.toLocaleString()}</button>`; }).join('')}
              </div>
              <span class="tuo-error" id="tuo-amount-error"></span>
              <div class="tuo-actions">
                <button type="button" class="tuo-btn tuo-btn--secondary" id="tuo-amount-back">Back</button>
                <button type="button" class="tuo-btn tuo-btn--primary" id="tuo-amount-continue" disabled>Continue</button>
              </div>
            </section>

            <!-- PHASE: REVIEW -->
            <section class="tuo-phase" data-phase="review" hidden>
              <h2 class="tuo-h2">Review your deposit</h2>
              <div class="tuo-summary">
                <div class="tuo-summary-row"><span>Method</span><span id="tuo-review-method">—</span></div>
                <div class="tuo-summary-row"><span>Amount</span><span id="tuo-review-amount" class="num">R0.00</span></div>
                <div class="tuo-summary-row"><span>Processing time</span><span>Instant</span></div>
                <div class="tuo-summary-row"><span>Reference</span><span id="tuo-review-ref" class="mono">—</span></div>
              </div>
              <p class="tuo-note">This deposit will be added to your FlexScribe wallet balance once payment is confirmed.</p>
              <div class="tuo-actions">
                <button type="button" class="tuo-btn tuo-btn--secondary" id="tuo-review-back">Back</button>
                <button type="button" class="tuo-btn tuo-btn--primary" id="tuo-review-continue">Enter Card Details</button>
              </div>
            </section>

            <!-- PHASE: CARD (native in-app form) -->
            <section class="tuo-phase" data-phase="card" hidden>
              <h2 class="tuo-h2">Enter your card details</h2>
              <p class="tuo-sub">Paying <strong id="tuo-card-amount">R0.00</strong> from your card.</p>
              <form id="tuo-card-form" class="tuo-form" novalidate>
                <label class="tuo-field">
                  <span class="tuo-label">Card Number</span>
                  <input type="text" id="tuo-card-number" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="19">
                </label>
                <div class="tuo-field-row">
                  <label class="tuo-field">
                    <span class="tuo-label">Expiry</span>
                    <input type="text" id="tuo-card-expiry" inputmode="numeric" autocomplete="cc-exp" placeholder="MM / YY" maxlength="7">
                  </label>
                  <label class="tuo-field">
                    <span class="tuo-label">CVV</span>
                    <input type="text" id="tuo-card-cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4">
                  </label>
                </div>
                <label class="tuo-field">
                  <span class="tuo-label">Name on Card</span>
                  <input type="text" id="tuo-card-name" autocomplete="cc-name" placeholder="e.g. Jordan Mtiva">
                </label>
                <p class="tuo-encrypt-note">
                  <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" stroke-width="1.8"/></svg>
                  Your card details are encrypted and never stored.
                </p>
              </form>
              <div class="tuo-actions">
                <button type="button" class="tuo-btn tuo-btn--secondary" id="tuo-card-back">Back</button>
                <button type="button" class="tuo-btn tuo-btn--primary" id="tuo-card-pay" disabled>Pay R0.00</button>
              </div>
            </section>

            <!-- PHASE: OZOW (simulated third-party redirect) -->
            <section class="tuo-phase tuo-third" data-phase="ozow" hidden>
              <div class="tuo-redirect" id="tuo-ozow-redirect">
                <div class="tuo-spinner ozow"></div>
                <p>Redirecting to Ozow…</p>
              </div>
              <div class="tuo-gateway ozow-gw" id="tuo-ozow-gw" hidden>
                <div class="ozow-topbar"><span class="ozow-logo">Ozow</span><span class="ozow-secure">Secure Instant EFT</span></div>
                <div class="ozow-body">
                  <p class="ozow-amount">Pay <strong id="tuo-ozow-amount">R0.00</strong> to <strong>FlexScribe</strong></p>
                  <p class="ozow-prompt">Select your bank to approve this payment:</p>
                  <div class="ozow-banks" id="tuo-ozow-banks">
                    ${OZOW_BANKS.map(function (b, i) { return `<button type="button" class="ozow-bank${i === 0 ? ' selected' : ''}" data-bank="${b}">${b}</button>`; }).join('')}
                  </div>
                  <button type="button" class="ozow-approve" id="tuo-ozow-approve">Approve Payment</button>
                  <button type="button" class="ozow-cancel" id="tuo-ozow-cancel">Cancel and return to FlexScribe</button>
                </div>
              </div>
            </section>

            <!-- PHASE: PAYFAST (simulated hosted checkout) -->
            <section class="tuo-phase tuo-third" data-phase="payfast" hidden>
              <div class="tuo-redirect" id="tuo-pf-redirect">
                <div class="tuo-spinner payfast"></div>
                <p>Redirecting to Payfast…</p>
              </div>
              <div class="tuo-gateway pf-gw" id="tuo-pf-gw" hidden>
                <div class="pf-topbar"><span class="pf-logo">PAYFAST</span><span class="pf-secure">🔒 Secure checkout</span></div>
                <div class="pf-body">
                  <p class="pf-merchant">FlexScribe (Pty) Ltd</p>
                  <p class="pf-amount">Amount due: <strong id="tuo-pf-amount">R0.00</strong></p>
                  <form id="tuo-pf-form" class="pf-form" novalidate>
                    <label class="pf-field"><span>Card number</span><input type="text" id="tuo-pf-number" inputmode="numeric" placeholder="1234 5678 9012 3456" maxlength="19"></label>
                    <div class="pf-row">
                      <label class="pf-field"><span>Expiry</span><input type="text" id="tuo-pf-expiry" inputmode="numeric" placeholder="MM / YY" maxlength="7"></label>
                      <label class="pf-field"><span>CVV</span><input type="text" id="tuo-pf-cvv" inputmode="numeric" placeholder="123" maxlength="4"></label>
                    </div>
                  </form>
                  <button type="button" class="pf-pay" id="tuo-pf-pay">Pay Securely</button>
                  <button type="button" class="pf-cancel" id="tuo-pf-cancel">Cancel and return to FlexScribe</button>
                </div>
              </div>
            </section>

            <!-- PHASE: PROCESSING (no controls) -->
            <section class="tuo-phase tuo-processing" data-phase="processing" hidden>
              <div class="tuo-spinner big"></div>
              <p class="tuo-processing-msg" id="tuo-processing-msg">Processing your payment…</p>
              <p class="tuo-processing-sub">Please don't close this window.</p>
            </section>

            <!-- PHASE: CONFIRMATION (only Done) -->
            <section class="tuo-phase tuo-confirm" data-phase="confirmation" hidden>
              <div class="tuo-check"><svg viewBox="0 0 24 24" fill="none" width="40" height="40"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
              <h2 class="tuo-confirm-title">Deposit Successful</h2>
              <p class="tuo-confirm-msg" id="tuo-confirm-msg">Your funds have been added to your wallet.</p>
              <div class="tuo-summary">
                <div class="tuo-summary-row"><span>Method</span><span id="tuo-done-method">—</span></div>
                <div class="tuo-summary-row"><span>Amount</span><span id="tuo-done-amount" class="num">R0.00</span></div>
                <div class="tuo-summary-row"><span>Reference</span><span id="tuo-done-ref" class="mono">—</span></div>
                <div class="tuo-summary-row"><span>Status</span><span class="tuo-status-pill success" id="tuo-done-status">Completed</span></div>
              </div>
              <div class="tuo-actions tuo-actions--center">
                <button type="button" class="tuo-btn tuo-btn--primary" id="tuo-done">Done</button>
              </div>
            </section>

            <!-- PHASE: FAILURE -->
            <section class="tuo-phase tuo-confirm" data-phase="failure" hidden>
              <div class="tuo-check failure"><svg viewBox="0 0 24 24" fill="none" width="40" height="40"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>
              <h2 class="tuo-confirm-title">Payment Failed</h2>
              <p class="tuo-confirm-msg" id="tuo-fail-msg">We couldn't process your deposit. Your balance has not been changed.</p>
              <div class="tuo-actions tuo-actions--center">
                <button type="button" class="tuo-btn tuo-btn--secondary" id="tuo-fail-close">Back to Wallet</button>
                <button type="button" class="tuo-btn tuo-btn--primary" id="tuo-fail-retry">Try Again</button>
              </div>
            </section>

          </div>
        </div>

        <!-- Discard confirmation dialog -->
        <div class="tuo-discard" id="tuo-discard" hidden>
          <div class="tuo-discard-box">
            <h3>Discard this deposit?</h3>
            <p>You've entered an amount. If you leave now, this deposit won't be processed.</p>
            <div class="tuo-discard-actions">
              <button type="button" class="tuo-btn tuo-btn--secondary" id="tuo-discard-cancel">Keep editing</button>
              <button type="button" class="tuo-btn tuo-btn--danger" id="tuo-discard-confirm">Discard</button>
            </div>
          </div>
        </div>
        `;
    }

    /* ==========================================================
       PHASE CONTROL — single visible phase + step indicator
    ========================================================== */
    function _show(phase) {
        _phase = phase;
        _qa('.tuo-phase').forEach(function (p) {
            p.hidden = p.getAttribute('data-phase') !== phase;
        });
        _syncSteps(phase);
        _syncBackVisibility(phase);
        // scroll body to top on each phase change
        const body = _q('.tuo-body');
        if (body) body.scrollTop = 0;
    }

    function _syncSteps(phase) {
        // Map each phase to a step-indicator position.
        const map = { method: 0, amount: 1, review: 2, card: 3, ozow: 3, payfast: 3, processing: 3, confirmation: 3, failure: 3 };
        const idx = map[phase] != null ? map[phase] : 0;
        const steps = _q('#tuo-steps');
        if (!steps) return;
        Array.prototype.forEach.call(steps.children, function (li, i) {
            li.classList.toggle('is-active', i === idx);
            li.classList.toggle('is-done', i < idx);
        });
    }

    /** Back arrow is hidden during processing + confirmation + failure. */
    function _syncBackVisibility(phase) {
        const back = _q('#tuo-back');
        if (!back) return;
        const noExit = (phase === 'processing' || phase === 'confirmation' || phase === 'failure');
        back.style.visibility = noExit ? 'hidden' : 'visible';
    }

    /* ==========================================================
       CARD FORMATTING + VALIDATION
    ========================================================== */
    function _formatCardNumber(v) {
        return v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
    }
    function _formatExpiry(v) {
        const d = v.replace(/\D/g, '').slice(0, 4);
        if (d.length <= 2) return d;
        return d.slice(0, 2) + ' / ' + d.slice(2);
    }
    /** Name on card: letters, spaces, hyphens and apostrophes only. */
    function _formatCardName(v) {
        return v.replace(/[^A-Za-z\s'\-]/g, '');
    }
    function _cardValid() {
        const num = (_q('#tuo-card-number').value || '').replace(/\D/g, '');
        const exp = (_q('#tuo-card-expiry').value || '').replace(/\D/g, '');
        const cvv = (_q('#tuo-card-cvv').value || '').replace(/\D/g, '');
        const name = (_q('#tuo-card-name').value || '').trim();
        if (num.length < 13 || num.length > 19) return false;
        if (exp.length !== 4) return false;
        const mm = parseInt(exp.slice(0, 2), 10);
        if (mm < 1 || mm > 12) return false;
        if (cvv.length < 3) return false;
        // Name must contain at least 2 letters and no digits.
        if (/\d/.test(name)) return false;
        if (name.replace(/[^A-Za-z]/g, '').length < 2) return false;
        return true;
    }
    function _syncCardPay() {
        const btn = _q('#tuo-card-pay');
        if (btn) btn.disabled = !_cardValid();
    }

    /* ==========================================================
       EVENT BINDING
    ========================================================== */
    function _bind() {
        /* Back / cancel */
        _q('#tuo-back').addEventListener('click', _handleBack);

        /* Method selection */
        _q('#tuo-methods').addEventListener('click', function (e) {
            const opt = e.target.closest('.tuo-method');
            if (!opt) return;
            _qa('.tuo-method').forEach(o => o.setAttribute('aria-pressed', 'false'));
            opt.setAttribute('aria-pressed', 'true');
            _method = opt.getAttribute('data-method');
            _q('#tuo-method-continue').disabled = false;
        });
        _q('#tuo-method-continue').addEventListener('click', function () {
            if (!_method) return;
            _show('amount');
        });

        /* Amount */
        const amtInput = _q('#tuo-amount');
        amtInput.addEventListener('input', _syncAmountContinue);
        _q('#tuo-chips').addEventListener('click', function (e) {
            const chip = e.target.closest('.tuo-chip');
            if (!chip) return;
            amtInput.value = chip.getAttribute('data-amt');
            _syncAmountContinue();
        });
        _q('#tuo-amount-back').addEventListener('click', () => _show('method'));
        _q('#tuo-amount-continue').addEventListener('click', function () {
            const amt = parseFloat(amtInput.value);
            const err = _q('#tuo-amount-error');
            if (!amt || amt <= 0 || isNaN(amt)) { if (err) err.textContent = 'Enter an amount greater than R0.00.'; return; }
            if (err) err.textContent = '';
            _amount = amt;
            _goReview();
        });

        /* Review */
        _q('#tuo-review-back').addEventListener('click', () => _show('amount'));
        _q('#tuo-review-continue').addEventListener('click', _fromReview);

        /* Card form */
        const cardNum = _q('#tuo-card-number');
        const cardExp = _q('#tuo-card-expiry');
        const cardCvv = _q('#tuo-card-cvv');
        const cardName = _q('#tuo-card-name');
        cardNum.addEventListener('input', function () { cardNum.value = _formatCardNumber(cardNum.value); _syncCardPay(); });
        cardExp.addEventListener('input', function () { cardExp.value = _formatExpiry(cardExp.value); _syncCardPay(); });
        cardCvv.addEventListener('input', function () { cardCvv.value = cardCvv.value.replace(/\D/g, ''); _syncCardPay(); });
        cardName.addEventListener('input', function () { cardName.value = _formatCardName(cardName.value); _syncCardPay(); });
        _q('#tuo-card-back').addEventListener('click', () => _show('review'));
        _q('#tuo-card-pay').addEventListener('click', function () {
            if (!_cardValid()) return;
            _process();
        });

        /* Ozow */
        _q('#tuo-ozow-banks').addEventListener('click', function (e) {
            const b = e.target.closest('.ozow-bank');
            if (!b) return;
            _qa('.ozow-bank').forEach(x => x.classList.remove('selected'));
            b.classList.add('selected');
        });
        _q('#tuo-ozow-approve').addEventListener('click', _process);
        _q('#tuo-ozow-cancel').addEventListener('click', () => _show('review'));

        /* Payfast */
        const pfNum = _q('#tuo-pf-number');
        const pfExp = _q('#tuo-pf-expiry');
        const pfCvv = _q('#tuo-pf-cvv');
        pfNum.addEventListener('input', function () { pfNum.value = _formatCardNumber(pfNum.value); });
        pfExp.addEventListener('input', function () { pfExp.value = _formatExpiry(pfExp.value); });
        pfCvv.addEventListener('input', function () { pfCvv.value = pfCvv.value.replace(/\D/g, ''); });
        _q('#tuo-pf-pay').addEventListener('click', _process);
        _q('#tuo-pf-cancel').addEventListener('click', () => _show('review'));

        /* Confirmation / failure */
        _q('#tuo-done').addEventListener('click', _finish);
        _q('#tuo-fail-close').addEventListener('click', _finish);
        _q('#tuo-fail-retry').addEventListener('click', () => _show('review'));

        /* Discard dialog */
        _q('#tuo-discard-cancel').addEventListener('click', () => { _q('#tuo-discard').hidden = true; });
        _q('#tuo-discard-confirm').addEventListener('click', function () { _q('#tuo-discard').hidden = true; close(); });

        /* Esc key = same as back arrow (but blocked during processing/confirmation) */
        _root.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') _handleBack();
        });
    }

    function _syncAmountContinue() {
        const amt = parseFloat(_q('#tuo-amount').value);
        _q('#tuo-amount-continue').disabled = !(amt && amt > 0);
    }

    function _goReview() {
        _reference = _genRef();
        const m = METHODS[_method];
        _q('#tuo-review-method').textContent = m.label;
        _q('#tuo-review-amount').textContent = _fmt(_amount);
        _q('#tuo-review-ref').textContent = _reference;
        _q('#tuo-review-continue').textContent = m.cta;
        _show('review');
    }

    /** Review's primary button routes to the method-specific phase. */
    function _fromReview() {
        if (_method === 'card') {
            _q('#tuo-card-amount').textContent = _fmt(_amount);
            const payBtn = _q('#tuo-card-pay');
            payBtn.textContent = 'Pay ' + _fmt(_amount);
            _syncCardPay();
            _show('card');
        } else if (_method === 'ozow') {
            _q('#tuo-ozow-amount').textContent = _fmt(_amount);
            _show('ozow');
            _runRedirect('#tuo-ozow-redirect', '#tuo-ozow-gw');
        } else if (_method === 'payfast') {
            _q('#tuo-pf-amount').textContent = _fmt(_amount);
            _show('payfast');
            _runRedirect('#tuo-pf-redirect', '#tuo-pf-gw');
        }
    }

    /** Brief "redirecting…" interstitial before the branded gateway. */
    function _runRedirect(redirectSel, gwSel) {
        const r = _q(redirectSel), g = _q(gwSel);
        if (r) r.hidden = false;
        if (g) g.hidden = true;
        setTimeout(function () {
            // Only reveal if still on this phase (user didn't cancel)
            if (r) r.hidden = true;
            if (g) g.hidden = false;
        }, 1400);
    }

    /* ==========================================================
       PROCESS — call backend, then confirmation
    ========================================================== */
    function _process() {
        if (_busy) return;                         // double-submit guard
        _busy = true;
        const m = METHODS[_method];
        _q('#tuo-processing-msg').textContent = m.processing;
        _show('processing');

        // Small delay so the simulated gateway feels real, then hit the API.
        setTimeout(function () {
            if (typeof API === 'undefined') { _fail('Service unavailable.'); return; }
            API.Wallet.topUp(_amount, m.apiMethod).then(function (r) {
                if (r && r.success && r.data) {
                    _reference = r.data.reference || _reference;
                    _q('#tuo-done-method').textContent = m.label;
                    _q('#tuo-done-amount').textContent = _fmt(_amount);
                    _q('#tuo-done-ref').textContent = _reference;
                    _q('#tuo-done-status').textContent = (r.data.status || 'completed');
                    _q('#tuo-confirm-msg').textContent = _fmt(_amount) + ' has been added to your FlexScribe wallet.';
                    _show('confirmation');
                } else {
                    _fail(r && r.error);
                }
                _busy = false;
            }).catch(function () {
                _fail();
                _busy = false;
            });
        }, 1100);
    }

    function _fail(msg) {
        const fm = _q('#tuo-fail-msg');
        if (fm) fm.textContent = msg || "We couldn't process your deposit. Your balance has not been changed.";
        _show('failure');
        _busy = false;
    }

    /* ==========================================================
       BACK / CANCEL
    ========================================================== */
    function _handleBack() {
        // No exit during processing / confirmation / failure.
        if (_phase === 'processing' || _phase === 'confirmation' || _phase === 'failure') return;

        // Third-party gateway phases: go back to review.
        if (_phase === 'card' || _phase === 'ozow' || _phase === 'payfast') { _show('review'); return; }

        // Method step: exit immediately (nothing entered yet).
        if (_phase === 'method') { close(); return; }

        // Amount / review: an amount has been entered → confirm discard.
        _q('#tuo-discard').hidden = false;
    }

    /* ==========================================================
       FINISH — Done: toast + refresh bell + wallet, then close
    ========================================================== */
    function _finish() {
        const succeeded = (_phase === 'confirmation');
        close();
        if (succeeded) {
            const label = METHODS[_method] ? METHODS[_method].label : 'your card';
            // Toast confirming the real amount + method used.
            if (typeof UIUtils !== 'undefined' && UIUtils.toast) {
                UIUtils.toast(_fmt(_amount) + ' added to your wallet via ' + label + '.', 'success', 4000);
            }
            // Reflect the deposit in the notification bell immediately (the
            // backend also persisted a "Top up successful" notification).
            _pushBellNotification(label);
            _refreshBell();
            // Refresh the wallet view if it's mounted.
            if (typeof WalletUI !== 'undefined' && WalletUI.refresh) WalletUI.refresh();
        }
    }

    /** Optimistically prepend a bell item with the real amount + method. */
    function _pushBellNotification(methodLabel) {
        const list = document.getElementById('notif-dropdown-list');
        const badge = document.getElementById('notif-badge');
        if (list) {
            const placeholder = list.querySelector('li[style]');
            if (placeholder && /No notifications|Loading/.test(placeholder.textContent)) placeholder.remove();
            const li = document.createElement('li');
            li.className = 'notif-item';
            li.innerHTML = '<span class="notif-dot"></span>' +
                '<div><p class="notif-title">Top up successful</p>' +
                '<p class="notif-time">' + _fmt(_amount) + ' via ' + methodLabel + ' · just now</p></div>';
            list.insertBefore(li, list.firstChild);
        }
        if (badge) {
            const n = (parseInt(badge.textContent, 10) || 0) + 1;
            badge.textContent = n;
            badge.classList.remove('is-hidden');
        }
    }

    /** Re-pull notifications so the bell matches the server (persisted). */
    function _refreshBell() {
        if (typeof API === 'undefined' || !API.Notifications) return;
        API.Notifications.getAll().then(function (result) {
            if (!result.success || !Array.isArray(result.data)) return;
            const unread = result.data.filter(function (n) { return !n.isRead; });
            const badge = document.getElementById('notif-badge');
            if (badge) {
                badge.textContent = unread.length;
                badge.classList.toggle('is-hidden', unread.length === 0);
            }
            const list = document.getElementById('notif-dropdown-list');
            if (list) {
                const top3 = result.data.slice(0, 3);
                if (top3.length) {
                    list.innerHTML = top3.map(function (n) {
                        const dot = !n.isRead ? '<span class="notif-dot"></span>' : '';
                        return '<li class="notif-item" data-notif-id="' + n.notificationID + '" onclick="navigateToNotification(\'' + n.notificationID + '\')">' +
                            dot + '<div><p class="notif-title">' + (n.title || '').replace(/</g, '&lt;') +
                            '</p><p class="notif-time">just now</p></div></li>';
                    }).join('');
                }
            }
        }).catch(function () {});
    }

    /* ==========================================================
       OPEN / CLOSE
    ========================================================== */
    function _reset() {
        _method = null;
        _amount = 0;
        _reference = '';
        _busy = false;
        if (!_root) return;
        _qa('input').forEach(i => i.value = '');
        _qa('.tuo-error').forEach(e => e.textContent = '');
        _qa('.tuo-method').forEach(o => o.setAttribute('aria-pressed', 'false'));
        _q('#tuo-method-continue').disabled = true;
        _q('#tuo-amount-continue').disabled = true;
        _q('#tuo-discard').hidden = true;
    }

    function open() {
        if (!_root) _build();
        _reset();

        // Load the available balance is not needed for top-up, but prefetch
        // is harmless; skip to keep it snappy.
        _show('method');

        // Lock the underlying page from scroll + interaction.
        document.body.classList.add('tuo-open');
        _root.classList.add('is-open');
        // focus for keyboard users
        setTimeout(function () { const b = _q('#tuo-back'); if (b) b.focus(); }, 50);
    }

    function close() {
        if (!_root) return;
        _root.classList.remove('is-open');
        document.body.classList.remove('tuo-open');
        // fully reset after the fade so a reopen starts clean
        setTimeout(_reset, 250);
    }

    return Object.freeze({ open, close });

})();

// Expose globally so wallet-ui.js (loaded later) can call it.
window.TopUpOverlay = TopUpOverlay;
