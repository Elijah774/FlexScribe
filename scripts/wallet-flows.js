/* =============================================================
   FlexScribe — Wallet full-page flows
   scripts/wallet-flows.js

   Two standalone 4-step wizards rendered as SPA pages:
     • WalletDepositUI  → page 'wallet-deposit'  (Top Up)
     • WalletWithdrawUI → page 'wallet-withdraw'

   Steps: 1 Method/Account → 2 Amount → 3 Review → 4 Confirmation.
   State is client-side (no reloads). Back within steps returns to
   the previous step; the top-left arrow on step 1 exits to Wallet.
   Balances always come from the backend (never trusted locally).
============================================================= */

'use strict';

/* ---------- shared helpers ---------- */
const _WZD = {
    el: (id) => document.getElementById(id),
    fmt(v) { return 'R' + (parseFloat(v) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    escape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    /** Show a step section + sync the step indicator. */
    show(rootId, stepsId, step) {
        const root = document.getElementById(rootId);
        if (!root) return;
        root.querySelectorAll('.wzd-panel').forEach(function (p) {
            p.hidden = p.getAttribute('data-step') !== String(step);
        });
        const steps = document.getElementById(stepsId);
        if (steps) {
            // processing/failure sit at the review position (3)
            let n = parseInt(step, 10);
            if (step === 'processing' || step === 'failure') n = 3;
            steps.setAttribute('data-active', String(n));
            steps.querySelectorAll('li').forEach(function (li) {
                const s = parseInt(li.getAttribute('data-step'), 10);
                li.classList.toggle('is-active', s === n);
                li.classList.toggle('is-done', s < n);
            });
        }
    },
    bindChips(scope) {
        (scope || document).querySelectorAll('.wzd-chips').forEach(function (grp) {
            const targetId = grp.getAttribute('data-target');
            grp.querySelectorAll('.wzd-chip[data-amt]').forEach(function (chip) {
                chip.addEventListener('click', function () {
                    const inp = document.getElementById(targetId);
                    if (inp) { inp.value = chip.getAttribute('data-amt'); inp.dispatchEvent(new Event('input')); }
                });
            });
        });
    }
};

/* =============================================================
   DEPOSIT (Top Up)
============================================================= */
const WalletDepositUI = (() => {
    const ROOT = 'wzd-deposit';
    const STEPS = 'wzd-dep-steps';
    let _available = 0;
    let _method = 'Bank Transfer';
    let _busy = false;

    function _loadBalance() {
        if (typeof API === 'undefined') return Promise.resolve();
        return API.Wallet.get().then(function (r) {
            if (r.success && r.data) {
                _available = parseFloat(r.data.available != null ? r.data.available : r.data.balance) || 0;
            }
            const a = _WZD.el('wzd-dep-available');
            if (a) a.textContent = 'Available Balance: ' + _WZD.fmt(_available);
        }).catch(function () {});
    }

    function _validAmount() {
        const amt = parseFloat(_WZD.el('wzd-dep-amount').value);
        return amt && amt > 0 && !isNaN(amt);
    }

    function _syncContinue() {
        const btn = _WZD.el('wzd-dep-amount-continue');
        if (btn) btn.disabled = !_validAmount();
    }

    function init() {
        _busy = false;
        _method = 'Bank Transfer';
        // reset inputs
        const amt = _WZD.el('wzd-dep-amount');
        if (amt) amt.value = '';
        const err = _WZD.el('wzd-dep-amount-error');
        if (err) err.textContent = '';
        // reset method radios
        document.querySelectorAll('#wzd-dep-methods .wzd-option').forEach(function (o) {
            o.setAttribute('aria-pressed', o.getAttribute('data-method') === 'Bank Transfer' ? 'true' : 'false');
        });
        _WZD.show(ROOT, STEPS, 1);
        _bind();
        _loadBalance();
    }

    let _bound = false;
    function _bind() {
        if (_bound) return; _bound = true;

        _WZD.bindChips(_WZD.el(ROOT));

        // Method selection
        const methods = _WZD.el('wzd-dep-methods');
        if (methods) methods.addEventListener('click', function (e) {
            const opt = e.target.closest('.wzd-option');
            if (!opt || opt.disabled) return;
            methods.querySelectorAll('.wzd-option').forEach(o => o.setAttribute('aria-pressed', 'false'));
            opt.setAttribute('aria-pressed', 'true');
            _method = opt.getAttribute('data-method') || 'Bank Transfer';
        });

        // Back arrow (step 1 exits to wallet)
        const back = _WZD.el('wzd-dep-back');
        if (back) back.addEventListener('click', function () {
            const active = _WZD.el(STEPS).getAttribute('data-active');
            if (active === '1') { loadPage('wallet'); }
            else if (active === '2') { _WZD.show(ROOT, STEPS, 1); }
            else if (active === '3') { _WZD.show(ROOT, STEPS, 2); }
            else { loadPage('wallet'); }
        });

        // Step nav
        _WZD.el('wzd-dep-method-continue').addEventListener('click', function () {
            _loadBalance();
            _WZD.show(ROOT, STEPS, 2);
            _syncContinue();
        });
        const amtInput = _WZD.el('wzd-dep-amount');
        if (amtInput) amtInput.addEventListener('input', _syncContinue);
        _WZD.el('wzd-dep-amount-back').addEventListener('click', () => _WZD.show(ROOT, STEPS, 1));
        _WZD.el('wzd-dep-amount-continue').addEventListener('click', function () {
            const err = _WZD.el('wzd-dep-amount-error');
            if (!_validAmount()) { if (err) err.textContent = 'Enter a valid amount greater than R0.00.'; return; }
            if (err) err.textContent = '';
            const amount = parseFloat(amtInput.value);
            _WZD.el('wzd-dep-review-method').textContent = _method;
            _WZD.el('wzd-dep-review-amount').textContent = _WZD.fmt(amount);
            _WZD.el('wzd-dep-review-ref').textContent = 'Generating on confirm';
            _WZD.show(ROOT, STEPS, 3);
        });
        _WZD.el('wzd-dep-review-back').addEventListener('click', () => _WZD.show(ROOT, STEPS, 2));
        _WZD.el('wzd-dep-confirm').addEventListener('click', _confirm);
        _WZD.el('wzd-dep-done').addEventListener('click', () => loadPage('wallet'));
        _WZD.el('wzd-dep-retry').addEventListener('click', () => _WZD.show(ROOT, STEPS, 2));
        _WZD.el('wzd-dep-fail-close').addEventListener('click', () => loadPage('wallet'));
    }

    function _confirm() {
        if (_busy) return;                     // duplicate-submit guard
        const amount = parseFloat(_WZD.el('wzd-dep-amount').value);
        if (!amount || amount <= 0) return;
        _busy = true;
        _WZD.show(ROOT, STEPS, 'processing');

        API.Wallet.topUp(amount, _method).then(function (r) {
            if (r.success && r.data) {
                _WZD.el('wzd-dep-confirm-msg').textContent =
                    _WZD.fmt(amount) + ' has been added to your FlexScribe wallet.';
                _WZD.el('wzd-dep-done-ref').textContent = r.data.reference || '—';
                _WZD.el('wzd-dep-done-amount').textContent = _WZD.fmt(amount);
                _WZD.el('wzd-dep-done-status').textContent = (r.data.status || 'completed');
                _WZD.show(ROOT, STEPS, 4);
            } else {
                const fm = _WZD.el('wzd-dep-fail-msg');
                if (fm) fm.textContent = r.error || "We couldn't add the funds. Your balance has not been changed.";
                _WZD.show(ROOT, STEPS, 'failure');
            }
            _busy = false;
        }).catch(function () {
            _WZD.show(ROOT, STEPS, 'failure');
            _busy = false;
        });
    }

    return Object.freeze({ init });
})();

/* =============================================================
   WITHDRAW
============================================================= */
const WalletWithdrawUI = (() => {
    const ROOT = 'wzd-withdraw';
    const STEPS = 'wzd-wdl-steps';
    let _available = 0;
    let _dest = null;          // { destinationID, label }
    let _busy = false;

    function _loadBalance() {
        if (typeof API === 'undefined') return Promise.resolve();
        return API.Wallet.get().then(function (r) {
            if (r.success && r.data) {
                _available = parseFloat(r.data.available != null ? r.data.available : r.data.balance) || 0;
            }
            const big = _WZD.el('wzd-wdl-available-big');
            if (big) big.textContent = _WZD.fmt(_available);
            const a = _WZD.el('wzd-wdl-available');
            if (a) a.textContent = 'Available: ' + _WZD.fmt(_available);
        }).catch(function () {});
    }

    function _loadAccounts() {
        const list = _WZD.el('wzd-wdl-accounts');
        if (!list || typeof API === 'undefined') return;
        list.innerHTML = '<p class="wzd-subheading">Loading accounts…</p>';
        API.Wallet.getDestinations().then(function (r) {
            const dests = (r.success && Array.isArray(r.data)) ? r.data : [];
            if (!dests.length) {
                list.innerHTML = '<p class="wzd-subheading">No saved bank accounts yet.</p>';
                return;
            }
            list.innerHTML = dests.map(function (d) {
                return `<button type="button" class="wzd-option" data-dest="${d.destinationID}" data-label="${_WZD.escape(d.label)}">
                    <span class="wzd-option-radio"></span>
                    <span class="wzd-option-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 21V10M18 21V10M10 21V10M14 21V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    <span class="wzd-option-text"><span class="wzd-option-title">${_WZD.escape(d.bankName)}</span><span class="wzd-option-desc">${_WZD.escape(d.accountMask)}</span></span>
                    ${d.isDefault ? '<span class="wzd-badge">Default</span>' : ''}
                </button>`;
            }).join('');
            list.querySelectorAll('.wzd-option').forEach(function (opt) {
                opt.addEventListener('click', function () {
                    list.querySelectorAll('.wzd-option').forEach(o => o.setAttribute('aria-pressed', 'false'));
                    opt.setAttribute('aria-pressed', 'true');
                    _dest = { destinationID: parseInt(opt.getAttribute('data-dest'), 10), label: opt.getAttribute('data-label') };
                    const c = _WZD.el('wzd-wdl-account-continue');
                    if (c) c.disabled = false;
                });
            });
        }).catch(function () {
            list.innerHTML = '<p class="wzd-subheading">Could not load bank accounts.</p>';
        });
    }

    function _validAmount() {
        const amt = parseFloat(_WZD.el('wzd-wdl-amount').value);
        return amt && amt > 0 && !isNaN(amt) && amt <= _available;
    }

    function _syncAmount() {
        const amt = parseFloat(_WZD.el('wzd-wdl-amount').value) || 0;
        const recv = _WZD.el('wzd-wdl-receive');
        if (recv) recv.textContent = _WZD.fmt(amt);
        const btn = _WZD.el('wzd-wdl-amount-continue');
        if (btn) btn.disabled = !_validAmount();
    }

    function init() {
        _busy = false;
        _dest = null;
        const amt = _WZD.el('wzd-wdl-amount');
        if (amt) amt.value = '';
        const c = _WZD.el('wzd-wdl-account-continue');
        if (c) c.disabled = true;
        // reset the add-account form + its fields
        _WZD.el(ROOT) && _WZD.el(ROOT).querySelectorAll('#wzd-wdl-addform input, #wzd-wdl-addform select').forEach(function (f) { f.value = ''; });
        _toggleAddForm(false);
        _WZD.show(ROOT, STEPS, 1);
        _bind();
        _loadBalance();
        _loadAccounts();
    }

    let _bound = false;
    function _bind() {
        if (_bound) return; _bound = true;

        _WZD.bindChips(_WZD.el(ROOT));

        const back = _WZD.el('wzd-wdl-back');
        if (back) back.addEventListener('click', function () {
            const active = _WZD.el(STEPS).getAttribute('data-active');
            if (active === '1') { loadPage('wallet'); }
            else if (active === '2') { _WZD.show(ROOT, STEPS, 1); }
            else if (active === '3') { _WZD.show(ROOT, STEPS, 2); }
            else { loadPage('wallet'); }
        });

        _WZD.el('wzd-wdl-account-continue').addEventListener('click', function () {
            _loadBalance();
            _WZD.show(ROOT, STEPS, 2);
            _syncAmount();
        });

        /* Add-new-bank-account form */
        _WZD.el('wzd-wdl-add-account').addEventListener('click', function () { _toggleAddForm(true); });
        _WZD.el('wzd-nb-cancel').addEventListener('click', function () { _toggleAddForm(false); });
        _WZD.el('wzd-nb-save').addEventListener('click', _saveNewAccount);
        // Digits-only for account number + branch code
        const nbNum = _WZD.el('wzd-nb-number');
        const nbBranch = _WZD.el('wzd-nb-branch');
        if (nbNum) nbNum.addEventListener('input', function () { nbNum.value = nbNum.value.replace(/\D/g, ''); });
        if (nbBranch) nbBranch.addEventListener('input', function () { nbBranch.value = nbBranch.value.replace(/\D/g, ''); });
        const amtInput = _WZD.el('wzd-wdl-amount');
        if (amtInput) amtInput.addEventListener('input', _syncAmount);
        _WZD.el('wzd-wdl-amount-back').addEventListener('click', () => _WZD.show(ROOT, STEPS, 1));
        _WZD.el('wzd-wdl-amount-continue').addEventListener('click', function () {
            const err = _WZD.el('wzd-wdl-amount-error');
            const amount = parseFloat(amtInput.value);
            if (!amount || amount <= 0) { if (err) err.textContent = 'Enter a valid amount greater than R0.00.'; return; }
            if (amount > _available) { if (err) err.textContent = 'The amount exceeds your available balance.'; return; }
            if (err) err.textContent = '';
            _WZD.el('wzd-wdl-review-dest').textContent = _dest ? _dest.label : '—';
            _WZD.el('wzd-wdl-review-amount').textContent = _WZD.fmt(amount);
            _WZD.el('wzd-wdl-review-total').textContent = _WZD.fmt(amount);
            _WZD.show(ROOT, STEPS, 3);
        });
        _WZD.el('wzd-wdl-review-back').addEventListener('click', () => _WZD.show(ROOT, STEPS, 2));
        _WZD.el('wzd-wdl-confirm').addEventListener('click', _confirm);
        _WZD.el('wzd-wdl-done').addEventListener('click', () => loadPage('wallet'));
        _WZD.el('wzd-wdl-retry').addEventListener('click', () => _WZD.show(ROOT, STEPS, 2));
        _WZD.el('wzd-wdl-fail-close').addEventListener('click', () => loadPage('wallet'));
    }

    /** Show/hide the inline add-account form and toggle the account list/CTA. */
    function _toggleAddForm(show) {
        const form = _WZD.el('wzd-wdl-addform');
        const addBtn = _WZD.el('wzd-wdl-add-account');
        const list = _WZD.el('wzd-wdl-accounts');
        const actions = _WZD.el('wzd-wdl-account-actions');
        if (form) form.hidden = !show;
        if (addBtn) addBtn.style.display = show ? 'none' : '';
        if (list) list.style.display = show ? 'none' : '';
        if (actions) actions.style.display = show ? 'none' : '';
        const err = _WZD.el('wzd-nb-error');
        if (err) err.textContent = '';
    }

    /** Validate the new-account form, then use it as the withdrawal destination. */
    function _saveNewAccount() {
        const bank   = _WZD.el('wzd-nb-bank').value;
        const holder = (_WZD.el('wzd-nb-holder').value || '').trim();
        const number = (_WZD.el('wzd-nb-number').value || '').replace(/\D/g, '');
        const type   = _WZD.el('wzd-nb-type').value;
        const branch = (_WZD.el('wzd-nb-branch').value || '').replace(/\D/g, '');
        const err = _WZD.el('wzd-nb-error');

        if (!bank) { if (err) err.textContent = 'Select your bank.'; return; }
        if (holder.replace(/[^A-Za-z]/g, '').length < 2 || /\d/.test(holder)) {
            if (err) err.textContent = 'Enter a valid account holder name.'; return;
        }
        if (number.length < 6 || number.length > 18) { if (err) err.textContent = 'Enter a valid account number.'; return; }
        if (!type) { if (err) err.textContent = 'Select an account type.'; return; }
        if (branch.length < 4 || branch.length > 8) { if (err) err.textContent = 'Enter a valid branch code.'; return; }
        if (err) err.textContent = '';

        // Masked label, e.g. "FNB •••• 7890 (Savings)"
        const masked = '\u2022\u2022\u2022\u2022 ' + number.slice(-4);
        const label = bank + ' ' + masked;

        // No destinationID (not persisted) — the backend accepts a free-text
        // destination string, so we withdraw to this newly-entered account.
        _dest = { destinationID: null, label: label, destinationText: label + ' · ' + type };

        _toggleAddForm(false);

        // Reflect the new account as a selected option at the top of the list.
        const list = _WZD.el('wzd-wdl-accounts');
        if (list) {
            if (/No saved bank accounts|Loading|Could not load/.test(list.textContent)) list.innerHTML = '';
            list.querySelectorAll('.wzd-option').forEach(o => o.setAttribute('aria-pressed', 'false'));
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wzd-option';
            btn.setAttribute('aria-pressed', 'true');
            btn.setAttribute('data-label', label);
            btn.innerHTML = '<span class="wzd-option-radio"></span>' +
                '<span class="wzd-option-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 21V10M18 21V10M10 21V10M14 21V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
                '<span class="wzd-option-text"><span class="wzd-option-title">' + _WZD.escape(bank) + '</span><span class="wzd-option-desc">' + _WZD.escape(masked + ' · ' + type) + '</span></span>' +
                '<span class="wzd-badge">New</span>';
            btn.addEventListener('click', function () {
                list.querySelectorAll('.wzd-option').forEach(o => o.setAttribute('aria-pressed', 'false'));
                btn.setAttribute('aria-pressed', 'true');
                _dest = { destinationID: null, label: label, destinationText: label + ' · ' + type };
                const c = _WZD.el('wzd-wdl-account-continue');
                if (c) c.disabled = false;
            });
            list.insertBefore(btn, list.firstChild);
        }
        const c = _WZD.el('wzd-wdl-account-continue');
        if (c) c.disabled = false;
    }

    function _confirm() {
        if (_busy) return;                     // duplicate-submit guard
        const amount = parseFloat(_WZD.el('wzd-wdl-amount').value);
        if (!_dest || !amount || amount <= 0) return;
        _busy = true;
        _WZD.show(ROOT, STEPS, 'processing');

        // Saved account → destinationID; newly-entered account → free-text destination.
        const destText = (_dest.destinationID == null) ? (_dest.destinationText || _dest.label) : undefined;
        API.Wallet.withdraw(amount, destText, _dest.destinationID || undefined).then(function (r) {
            if (r.success && r.data) {
                _WZD.el('wzd-wdl-confirm-msg').textContent =
                    'Your ' + _WZD.fmt(amount) + ' withdrawal is being processed.';
                _WZD.el('wzd-wdl-done-ref').textContent = r.data.reference || '—';
                _WZD.el('wzd-wdl-done-dest').textContent = r.data.destination || _dest.label;
                _WZD.el('wzd-wdl-done-date').textContent = _fmtDate(new Date());
                _WZD.show(ROOT, STEPS, 4);
            } else {
                const fm = _WZD.el('wzd-wdl-fail-msg');
                if (fm) fm.textContent = r.error || 'The withdrawal could not be completed. Your balance has not been changed.';
                _WZD.show(ROOT, STEPS, 'failure');
            }
            _busy = false;
        }).catch(function () {
            _WZD.show(ROOT, STEPS, 'failure');
            _busy = false;
        });
    }

    function _fmtDate(d) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    return Object.freeze({ init });
})();
