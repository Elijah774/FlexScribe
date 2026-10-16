/* ===========================================================
   request-funds-ui.js
   Dependant-only "Request Funds" card injected into the Wallet tab.

   Behaviour (mirrors the backend, which is authoritative):
   - Only dependants see anything here.
   - The feature is shown ONLY when the main member has enabled it for
     THIS dependant (checked live against the backend on each wallet open,
     never a cached value).
   - When disabled, a clear message is shown and no form is rendered.
   - Submitting creates a genuine fund REQUEST (no money moves). Amounts
     are validated (positive, 2dp, <= R100,000) before sending; the backend
     re-validates and re-checks permission.
=========================================================== */
'use strict';

const RequestFundsUI = (() => {

    function _isDependant() {
        try {
            const p = JSON.parse(localStorage.getItem('flexscribe_profile') || 'null');
            const t = (p && p.userType) || sessionStorage.getItem('flexscribe_role');
            return t === 'Dependant' || t === 'dependant';
        } catch (e) { return false; }
    }

    /** Called after the wallet panel renders. No-op for main members. */
    function mount() {
        if (!_isDependant()) return;
        const left = document.querySelector('#panel-wallet .wal2-left');
        if (!left) return;
        if (document.getElementById('rf-card')) return; // already mounted

        const card = document.createElement('div');
        card.id = 'rf-card';
        card.className = 'wal2-warning';
        card.style.cssText = 'display:block;background:var(--card,#1b1b1f);border:1px solid var(--border,#2a2a30);border-radius:14px;padding:16px 18px;margin-bottom:16px;';
        card.innerHTML = '<p style="margin:0;color:var(--text-light,#9aa0a6);font-size:13px">Checking Request Funds availability…</p>';
        left.insertBefore(card, left.firstChild);

        if (typeof API === 'undefined' || !API.Me) { card.remove(); return; }

        API.Me.requestFundsStatus().then((res) => {
            const enabled = res && res.success && res.data && res.data.enabled;
            if (!enabled) {
                card.innerHTML =
                    '<p style="margin:0 0 4px;font-weight:600;color:var(--text,#fff);font-size:14px">Request Funds</p>'
                    + '<p style="margin:0;color:var(--text-light,#9aa0a6);font-size:13px">'
                    + 'Your main member has not enabled the Request Funds feature for your account. '
                    + 'Please contact them if you need additional funds.</p>';
                return;
            }
            _renderForm(card);
        }).catch(() => { card.remove(); });
    }

    function _renderForm(card) {
        card.innerHTML =
            '<p style="margin:0 0 10px;font-weight:600;color:var(--text,#fff);font-size:15px">Request Funds</p>'
            + '<div style="display:flex;flex-direction:column;gap:10px">'
            + '  <div>'
            + '    <label style="display:block;font-size:12.5px;color:var(--text-light,#9aa0a6);margin-bottom:4px">Amount (R)</label>'
            + '    <input id="rf-amount" type="text" inputmode="decimal" placeholder="0.00" '
            + '      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid var(--border,#2a2a30);background:var(--bg,#121214);color:var(--text,#fff);font-size:14px">'
            + '    <div id="rf-amount-err" style="color:#ff6b6b;font-size:12px;min-height:15px;margin-top:4px"></div>'
            + '  </div>'
            + '  <div>'
            + '    <label style="display:block;font-size:12.5px;color:var(--text-light,#9aa0a6);margin-bottom:4px">Reason (optional)</label>'
            + '    <input id="rf-reason" type="text" maxlength="300" placeholder="e.g. School supplies" '
            + '      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid var(--border,#2a2a30);background:var(--bg,#121214);color:var(--text,#fff);font-size:14px">'
            + '  </div>'
            + '  <button id="rf-submit" style="align-self:flex-start;background:var(--orange,#FF7A29);color:#fff;border:none;border-radius:9px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer">Submit request</button>'
            + '  <div id="rf-msg" style="font-size:12.5px"></div>'
            + '</div>';

        const amountEl = card.querySelector('#rf-amount');
        const reasonEl = card.querySelector('#rf-reason');
        const errEl = card.querySelector('#rf-amount-err');
        const msgEl = card.querySelector('#rf-msg');
        const btn = card.querySelector('#rf-submit');

        amountEl.addEventListener('input', () => { errEl.textContent = ''; });

        btn.addEventListener('click', () => {
            errEl.textContent = ''; msgEl.textContent = ''; msgEl.style.color = '';

            // Front-end validation mirrors the shared validators + backend.
            const v = window.Validators
                ? Validators.validateAmount(amountEl.value, { required: true })
                : { valid: !!parseFloat(amountEl.value), value: parseFloat(amountEl.value), message: 'Enter a valid amount.' };
            if (!v.valid) { errEl.textContent = v.message; return; }
            if (!(v.value > 0)) { errEl.textContent = 'Please enter an amount greater than zero.'; return; }

            btn.disabled = true; btn.textContent = 'Submitting…';
            API.Me.requestFunds(v.value, reasonEl.value.trim() || undefined).then((res) => {
                btn.disabled = false; btn.textContent = 'Submit request';
                if (res && res.success) {
                    msgEl.style.color = '#46d17a';
                    msgEl.textContent = 'Request sent to your main member.';
                    amountEl.value = ''; reasonEl.value = '';
                    if (window.UIUtils) UIUtils.toast('Fund request submitted.', 'success');
                } else {
                    const err = (res && res.error) || 'Could not submit your request.';
                    msgEl.style.color = '#ff6b6b';
                    msgEl.textContent = err;
                    if (window.UIUtils) UIUtils.toast(err, 'error');
                }
            }).catch(() => {
                btn.disabled = false; btn.textContent = 'Submit request';
                msgEl.style.color = '#ff6b6b';
                msgEl.textContent = 'Network error. Please try again.';
            });
        });
    }

    return { mount };
})();

if (typeof window !== 'undefined') window.RequestFundsUI = RequestFundsUI;
