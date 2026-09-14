/* =============================================================
   FlexScribe — Wallet Panel UI
   scripts/wallet-ui.js

   Responsibilities:
   • Renders the merchant wallet: hero card, stats
     (available / pending / total), quick actions, transaction
     history (clickable, filterable, paginated)
   • Add Funds, Withdraw, Transfer-to-Goal, Send-to-Dependant,
     and the merchant flows: Transfer-to-User + Withdraw (with
     recipient resolution and review → confirm → result steps)
   • Transaction detail modal
   • All balances come from the backend (never trusted locally);
     after every mutation we reload from the API.
============================================================= */

'use strict';

const WalletUI = (() => {

    let _initialized = false;

    // Merchant balances (server truth)
    let _available = 0;
    let _pending = 0;
    let _total = 0;

    // History paging/filter state
    let _historyOffset = 0;
    let _historyLimit = 8;
    let _historyType = '';
    let _historyTotal = 0;
    let _historyRows = [];

    // Transfer-to-user flow state
    let _resolvedRecipient = null;
    let _uxferBusy = false;
    let _wdlBusy = false;
    let _wdlDestinations = [];

    // Trend chart state
    let _metric = 'income';       // income | expenses | savings
    let _period = 'monthly';      // weekly | monthly | yearly
    let _cardRevealed = false;
    let _fullCardNumber = null;   // real digits once known (from API)

    const _el = (id) => document.getElementById(id);

    /* ----------------------------------------------------------
       FORMATTING
    ---------------------------------------------------------- */
    function _fmt(val) {
        return 'R' + (parseFloat(val) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function _fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso).split('T')[0] || '—';
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    function _initial(name) {
        return (name || '?').trim().charAt(0).toUpperCase() || '?';
    }

    /* Human labels for merchant transaction types */
    const TYPE_LABEL = {
        credit: 'Deposit',
        debit: 'Payment',
        transfer: 'Goal transfer',
        refund: 'Refund',
        payment: 'Payment received',
        transfer_in: 'Received',
        transfer_out: 'Sent',
        withdrawal: 'Withdrawal',
        adjustment: 'Adjustment'
    };

    function _isCredit(type) {
        return type === 'credit' || type === 'transfer_in' || type === 'payment' || type === 'refund';
    }

    /* ----------------------------------------------------------
       LOAD balances from backend (server truth)
    ---------------------------------------------------------- */
    function _loadBalances() {
        if (typeof API === 'undefined') return Promise.resolve();
        return API.Wallet.get().then(function (result) {
            if (result.success && result.data) {
                const d = result.data;
                _available = parseFloat(d.available != null ? d.available : d.balance) || 0;
                _pending = parseFloat(d.pending != null ? d.pending : d.pendingIn) || 0;
                _total = parseFloat(d.total != null ? d.total : (_available + _pending)) || 0;

                if (d.cardNumber) {
                    _fullCardNumber = String(d.cardNumber);
                }
            }
            _renderBalances();
            _renderCardNumber();
            _renderChart();
        }).catch(function () { _renderBalances(); _renderChart(); });
    }

    function _renderBalances() {
        // Total Balance
        const balEl = _el('wallet-hero-balance');
        if (balEl) balEl.textContent = _fmt(_total);
        // Total Pending
        const pendEl = _el('wallet-stat-pending-in');
        if (pendEl) pendEl.textContent = _fmt(_pending);
        const pendDelta = _el('wal2-pending-delta');
        if (pendDelta) pendDelta.textContent = _pending > 0 ? 'Clearing soon' : 'Nothing pending';

        // Card holder name from profile
        const cardNameEl = _el('wallet-card-name');
        if (cardNameEl) {
            const profile = JSON.parse(localStorage.getItem('flexscribe_profile') || 'null');
            let displayName = 'CARD HOLDER';
            if (profile && (profile.fullName || profile.nickname)) {
                displayName = (profile.fullName || profile.nickname).toUpperCase();
            }
            cardNameEl.textContent = displayName;
        }

        _renderSubscriptionTotal(_available);
    }

    /** Render the card number respecting the reveal toggle. */
    function _renderCardNumber() {
        const numEl = _el('wallet-card-number');
        if (!numEl) return;
        const cn = _fullCardNumber;
        if (!cn) { numEl.textContent = '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022'; return; }
        if (_cardRevealed) {
            numEl.textContent = cn.replace(/(.{4})/g, '$1 ').trim();
        } else {
            numEl.textContent = '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ' + cn.slice(-4);
        }
    }

    /* ----------------------------------------------------------
       SUBSCRIPTION TOTAL + LOW-FUNDS WARNING
    ---------------------------------------------------------- */
    function _monthlyEquivalent(amount, cycle) {
        const amt = parseFloat(amount) || 0;
        switch (cycle) {
            case 'weekly':    return amt * 52 / 12;
            case 'quarterly': return amt / 3;
            case 'yearly':    return amt / 12;
            default:          return amt;
        }
    }

    function _renderSubscriptionTotal(balance) {
        if (typeof API === 'undefined') return;
        API.Subscriptions.getAll().then(function (result) {
            if (!result.success || !Array.isArray(result.data)) return;

            const total = result.data.reduce(function (sum, s) {
                const status = s.subStatus || s.status;
                if (status && status !== 'active') return sum;
                return sum + _monthlyEquivalent(s.billingAmount != null ? s.billingAmount : s.amount, s.billingCycle || s.cycle);
            }, 0);

            const totalEl = _el('wallet-stat-subs-total');
            if (totalEl) totalEl.textContent = _fmt(total);
            const subsDelta = _el('wal2-subs-delta');
            if (subsDelta) subsDelta.textContent = 'per month';

            const warning = _el('wallet-funds-warning');
            const msg = _el('wallet-funds-warning-msg');
            const bal = parseFloat(balance) || 0;
            if (warning) {
                if (total > 0 && bal < total) {
                    const shortfall = total - bal;
                    if (msg) {
                        msg.textContent = 'Your subscriptions total ' + _fmt(total) +
                            ' but your balance is ' + _fmt(bal) + '. Add at least ' +
                            _fmt(shortfall) + ' to cover them.';
                    }
                    warning.hidden = false;
                } else {
                    warning.hidden = true;
                }
            }
        }).catch(function () {});
    }

    /* ----------------------------------------------------------
       TRANSACTION HISTORY (filter + paginate + clickable)
    ---------------------------------------------------------- */
    function _loadHistory(reset) {
        if (typeof API === 'undefined') return Promise.resolve();
        if (reset) { _historyOffset = 0; _historyRows = []; }

        return API.Wallet.getTransactions({
            type: _historyType || undefined,
            limit: _historyLimit,
            offset: _historyOffset
        }).then(function (result) {
            if (result.success && result.data) {
                // Backend returns { transactions, total, limit, offset }
                const payload = result.data;
                const rows = Array.isArray(payload) ? payload : (payload.transactions || []);
                _historyTotal = Array.isArray(payload) ? rows.length : (payload.total || rows.length);
                _historyRows = reset ? rows : _historyRows.concat(rows);
            }
            _renderHistory();
        }).catch(function () { _renderHistory(); });
    }

    function _renderHistory() {
        const list = _el('wallet-activity-list');
        if (!list) return;

        if (_historyRows.length === 0) {
            list.innerHTML = '<li class="wal2-txn-empty">No transactions yet.</li>';
        } else {
            list.innerHTML = _historyRows.map(function (tx) {
                const credit = _isCredit(tx.type);
                const icon = credit ? '\u2193' : '\u2191';
                const sign = credit ? '+' : '-';
                // Withdrawals render in red; other debits stay neutral white.
                const cls = credit ? 'credit' : (tx.type === 'withdrawal' ? 'withdrawal' : 'debit');
                const statusBadge = (tx.status && tx.status !== 'completed')
                    ? `<span class="wal2-txn-status ${tx.status}">${tx.status}</span>` : '';
                return `
                    <li>
                        <button type="button" class="wal2-txn-item" data-txid="${tx.transactionID}">
                            <div class="wal2-txn-icon ${cls}">${icon}</div>
                            <div class="wal2-txn-info">
                                <p class="wal2-txn-name">${_escape(tx.description || TYPE_LABEL[tx.type] || 'Transaction')}${statusBadge}</p>
                                <p class="wal2-txn-date">${_fmtDate(tx.date)}</p>
                            </div>
                            <span class="wal2-txn-amt num ${cls}">${sign}${_fmt(tx.amount)}</span>
                        </button>
                    </li>`;
            }).join('');

            list.querySelectorAll('.wal2-txn-item').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    _openTxDetail(parseInt(btn.getAttribute('data-txid'), 10));
                });
            });
        }

        const footer = _el('wallet-activity-footer');
        if (footer) {
            const more = _historyRows.length < _historyTotal;
            footer.hidden = !more;
        }
    }

    function _escape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ----------------------------------------------------------
       TRANSACTION DETAIL MODAL
    ---------------------------------------------------------- */
    function _openTxDetail(txID) {
        if (!txID || typeof API === 'undefined') return;
        _openModal('wallet-tx-detail-modal');

        const linesEl = _el('wallet-detail-lines');
        const amtEl = _el('wallet-detail-amount');
        const statusEl = _el('wallet-detail-status');
        if (amtEl) amtEl.textContent = '…';
        if (statusEl) { statusEl.textContent = ''; statusEl.className = 'wallet-detail-status'; }
        if (linesEl) linesEl.innerHTML = '';

        API.Wallet.getTransaction(txID).then(function (result) {
            if (!result.success || !result.data) {
                if (amtEl) amtEl.textContent = '—';
                if (linesEl) linesEl.innerHTML = '<li><span class="wallet-detail-key">Error</span><span class="wallet-detail-val">Could not load transaction</span></li>';
                return;
            }
            const tx = result.data;
            const credit = _isCredit(tx.type);
            if (amtEl) amtEl.textContent = (credit ? '+' : '-') + _fmt(tx.amount);
            if (statusEl) {
                statusEl.textContent = tx.status || 'completed';
                statusEl.className = 'wallet-detail-status ' + (tx.status || 'completed');
            }

            const rows = [];
            const push = (k, v, mono) => { if (v != null && v !== '') rows.push({ k, v, mono }); };
            push('Type', TYPE_LABEL[tx.type] || tx.type);
            push('Reference', tx.reference, true);
            push('Description', tx.description);
            if (tx.type === 'transfer_out') push('To', tx.recipientName);
            if (tx.type === 'transfer_in') push('From', tx.senderName);
            push('Balance before', tx.balanceBefore != null ? _fmt(tx.balanceBefore) : null);
            push('Balance after', tx.balanceAfter != null ? _fmt(tx.balanceAfter) : null);
            push('Date', _fmtDate(tx.completedAt || tx.date));
            if (tx.status === 'failed' && tx.failureReason) push('Failure reason', tx.failureReason);

            if (linesEl) {
                linesEl.innerHTML = rows.map(function (r) {
                    return `<li><span class="wallet-detail-key">${_escape(r.k)}</span><span class="wallet-detail-val ${r.mono ? 'mono' : ''}">${_escape(r.v)}</span></li>`;
                }).join('');
            }
        }).catch(function () {
            if (amtEl) amtEl.textContent = '—';
        });
    }

    /* ----------------------------------------------------------
       MODALS — generic open/close + step switching
    ---------------------------------------------------------- */
    function _openModal(id) {
        const modal = _el(id);
        if (modal) modal.hidden = false;
    }

    function _closeModal(id) {
        const modal = _el(id);
        if (modal) {
            modal.hidden = true;
            modal.querySelectorAll('input').forEach(inp => inp.value = '');
            modal.querySelectorAll('.field-error').forEach(e => e.textContent = '');
        }
    }

    /** Show one step inside a multi-step modal + sync the stepper. */
    function _showStep(modalId, step) {
        const modal = _el(modalId);
        if (!modal) return;
        modal.querySelectorAll('[data-step]').forEach(function (node) {
            node.hidden = node.getAttribute('data-step') !== step;
        });
        _syncStepper(modal, step);
    }

    /** Map any sub-step (processing/failure) to a stepper key + mark done. */
    const _STEP_ORDER = {
        'wallet-topup-stepper': ['method', 'amount', 'review', 'result'],
        'wallet-uxfer-stepper': ['details', 'amount', 'review', 'result'],
        'wallet-wdl-stepper':   ['details', 'amount', 'review', 'result']
    };
    function _syncStepper(modal, step) {
        const stepper = modal.querySelector('.wallet-stepper');
        if (!stepper) return;
        const order = _STEP_ORDER[stepper.id] || [];
        // processing/failure map to the 'review' position (last actionable step)
        let key = step;
        if (step === 'processing') key = 'review';
        if (step === 'failure') key = 'review';
        const activeIdx = order.indexOf(key);
        stepper.querySelectorAll('li').forEach(function (li) {
            const liKey = li.getAttribute('data-step-key');
            const idx = order.indexOf(liKey);
            li.classList.toggle('is-active', idx === activeIdx);
            li.classList.toggle('is-done', idx >= 0 && idx < activeIdx);
        });
    }

    /** Wire quick-amount chips inside a container to fill a target input. */
    function _bindQuickAmounts(scope) {
        (scope || document).querySelectorAll('.wallet-quick-amounts').forEach(function (grp) {
            const targetId = grp.getAttribute('data-target');
            grp.querySelectorAll('.wallet-chip[data-amt]').forEach(function (chip) {
                chip.addEventListener('click', function () {
                    const inp = _el(targetId);
                    if (inp) { inp.value = chip.getAttribute('data-amt'); inp.dispatchEvent(new Event('input')); }
                });
            });
        });
    }

    /* ==========================================================
       TOP UP (method → amount → review → processing → result)
    ========================================================== */
    let _topupMethod = 'Bank Transfer';
    let _topupBusy = false;

    function _openTopUp() {
        _topupMethod = 'Bank Transfer';
        _topupBusy = false;
        const modal = _el('wallet-add-modal');
        if (modal) {
            modal.querySelectorAll('input').forEach(i => i.value = '');
            modal.querySelectorAll('.field-error').forEach(e => e.textContent = '');
            // reset method selection
            modal.querySelectorAll('.wallet-option').forEach(function (opt) {
                opt.setAttribute('aria-pressed', opt.getAttribute('data-method') === 'Bank Transfer' ? 'true' : 'false');
            });
            const avail = _el('wallet-topup-available');
            if (avail) avail.textContent = 'Available Balance: ' + _fmt(_available);
            const confirmBtn = _el('wallet-topup-confirm-btn');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Top Up'; }
        }
        _showStep('wallet-add-modal', 'method');
        _openModal('wallet-add-modal');
    }

    function _handleTopUpReview(e) {
        e.preventDefault();
        const errorEl = _el('wallet-add-error');
        if (errorEl) errorEl.textContent = '';
        const amount = parseFloat(_el('wallet-add-amount').value);
        if (!amount || amount <= 0 || isNaN(amount)) {
            if (errorEl) errorEl.textContent = 'Enter a valid amount greater than R0.00.';
            return;
        }
        _el('wallet-topup-review-method').textContent = _topupMethod;
        _el('wallet-topup-review-amount').textContent = _fmt(amount);
        _el('wallet-topup-review-total').textContent = _fmt(amount);
        const rerr = _el('wallet-topup-review-error');
        if (rerr) rerr.textContent = '';
        _showStep('wallet-add-modal', 'review');
    }

    function _confirmTopUp() {
        if (_topupBusy) return;                         // duplicate-submit guard
        const amount = parseFloat(_el('wallet-add-amount').value);
        if (!amount || amount <= 0) return;
        _topupBusy = true;
        _showStep('wallet-add-modal', 'processing');

        API.Wallet.topUp(amount, _topupMethod).then(function (r) {
            if (r.success && r.data) {
                _el('wallet-topup-result-msg').textContent =
                    _fmt(r.data.balance != null ? amount : amount) + ' has been added to your FlexScribe wallet.';
                _el('wallet-topup-result-ref').textContent = 'Reference: ' + (r.data.reference || '—');
                const balEl = _el('wallet-topup-result-balance');
                if (balEl && r.data.balance != null) balEl.textContent = 'New balance: ' + _fmt(r.data.balance);
                _showStep('wallet-add-modal', 'result');
                _refresh();
            } else {
                const fm = _el('wallet-topup-fail-msg');
                if (fm) fm.textContent = r.error || "We couldn't add the funds to your wallet. Your existing balance has not been changed.";
                _showStep('wallet-add-modal', 'failure');
            }
            _topupBusy = false;
        }).catch(function () {
            _showStep('wallet-add-modal', 'failure');
            _topupBusy = false;
        });
    }

    /* ----------------------------------------------------------
       TRANSFER TO GOAL (existing)
    ---------------------------------------------------------- */
    function _handleTransfer(e) {
        e.preventDefault();
        const amount = parseFloat(_el('wallet-transfer-amount').value);
        const goal = _el('wallet-transfer-goal').value;
        const errorEl = _el('wallet-transfer-error');
        if (!amount || amount <= 0) { if (errorEl) errorEl.textContent = 'Enter a valid amount greater than 0.'; return; }
        if (!goal) { if (errorEl) errorEl.textContent = 'Select a goal.'; return; }
        if (amount > _available) { if (errorEl) errorEl.textContent = 'Amount exceeds available balance.'; return; }

        try {
            WalletStore.transferToGoal(amount, goal);
            _closeModal('wallet-transfer-modal');
            _refresh();
        } catch (err) { if (errorEl) errorEl.textContent = err.message; }
    }

    /* ----------------------------------------------------------
       SEND TO DEPENDANT (existing)
    ---------------------------------------------------------- */
    function _handleSendToDependant(e) {
        e.preventDefault();
        const amount = parseFloat(_el('wallet-send-amount').value);
        const name = _el('wallet-send-name').value.trim();
        const errorEl = _el('wallet-send-error');
        if (!amount || amount <= 0) { if (errorEl) errorEl.textContent = 'Enter a valid amount greater than 0.'; return; }
        if (!name) { if (errorEl) errorEl.textContent = 'Enter a dependant name.'; return; }
        try {
            WalletStore.sendToDependant(amount, name);
            _closeModal('wallet-send-modal');
            _refresh();
        } catch (err) { if (errorEl) errorEl.textContent = err.message; }
    }

    /* ==========================================================
       MERCHANT — TRANSFER TO USER (resolve → review → confirm)
    ========================================================== */
    function _openUserTransfer() {
        _resolvedRecipient = null;
        _uxferBusy = false;
        const modal = _el('wallet-user-transfer-modal');
        if (modal) {
            modal.querySelectorAll('input').forEach(i => i.value = '');
            modal.querySelectorAll('.field-error').forEach(e => e.textContent = '');
            const res = _el('wallet-uxfer-recipient-result');
            if (res) { res.hidden = true; res.textContent = ''; }
            const avail = _el('wallet-uxfer-available');
            if (avail) avail.textContent = 'Available Balance: ' + _fmt(_available);
            const contBtn = _el('wallet-uxfer-recipient-continue');
            if (contBtn) contBtn.disabled = true;
            const confirmBtn = _el('wallet-uxfer-confirm-btn');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Transfer'; }
        }
        _showStep('wallet-user-transfer-modal', 'details');
        _openModal('wallet-user-transfer-modal');
    }

    function _resolveRecipient() {
        const ident = _el('wallet-uxfer-recipient').value.trim();
        const resEl = _el('wallet-uxfer-recipient-result');
        const errEl = _el('wallet-uxfer-error');
        const contBtn = _el('wallet-uxfer-recipient-continue');
        if (errEl) errEl.textContent = '';
        _resolvedRecipient = null;
        if (contBtn) contBtn.disabled = true;
        if (!ident) { if (errEl) errEl.textContent = 'Enter a recipient email or name.'; return; }

        if (resEl) { resEl.hidden = false; resEl.className = 'wallet-recipient-result'; resEl.textContent = 'Searching…'; }

        API.Wallet.resolveRecipient(ident).then(function (r) {
            if (r.success && r.data && r.data.subscriberID) {
                _resolvedRecipient = r.data;
                if (resEl) {
                    resEl.className = 'wallet-recipient-result';
                    resEl.innerHTML = `<span class="wallet-recipient-avatar">${_initial(r.data.name)}</span>
                        <span class="wallet-recipient-name">${_escape(r.data.name)}</span>
                        <span class="wallet-recipient-ok">Recipient selected</span>`;
                }
                if (contBtn) contBtn.disabled = false;
            } else {
                if (resEl) { resEl.className = 'wallet-recipient-result error'; resEl.textContent = r.error || 'Recipient not found.'; }
            }
        }).catch(function () {
            if (resEl) { resEl.className = 'wallet-recipient-result error'; resEl.textContent = 'Could not resolve recipient.'; }
        });
    }

    function _handleUserTransferReview(e) {
        e.preventDefault();
        const errEl = _el('wallet-uxfer-amount-error');
        if (errEl) errEl.textContent = '';
        const amount = parseFloat(_el('wallet-uxfer-amount').value);

        if (!_resolvedRecipient) { if (errEl) errEl.textContent = 'Select a valid recipient first.'; return; }
        if (!amount || amount <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount greater than R0.00.'; return; }
        if (amount > _available) { if (errEl) errEl.textContent = "You don't have enough available funds for this transfer."; return; }

        const note = _el('wallet-uxfer-note').value.trim();
        _el('wallet-uxfer-review-amount').textContent = _fmt(amount);
        _el('wallet-uxfer-review-recipient').textContent = _resolvedRecipient.name;
        _el('wallet-uxfer-review-note').textContent = note || '—';
        _el('wallet-uxfer-review-newbal').textContent = _fmt(_available - amount);
        const revErr = _el('wallet-uxfer-review-error');
        if (revErr) revErr.textContent = '';
        _showStep('wallet-user-transfer-modal', 'review');
    }

    function _confirmUserTransfer() {
        if (_uxferBusy) return;                       // duplicate-submit guard
        const amount = parseFloat(_el('wallet-uxfer-amount').value);
        const note = _el('wallet-uxfer-note').value.trim();
        if (!_resolvedRecipient || !amount || amount <= 0) return;

        _uxferBusy = true;
        _showStep('wallet-user-transfer-modal', 'processing');

        API.Wallet.transferToUser({
            recipientUserID: _resolvedRecipient.subscriberID,
            amount: amount,
            note: note
        }).then(function (r) {
            if (r.success && r.data) {
                _el('wallet-uxfer-result-msg').textContent =
                    _fmt(r.data.amount || amount) + ' sent to ' + (_resolvedRecipient.name) + '.';
                _el('wallet-uxfer-result-ref').textContent = 'Reference: ' + (r.data.reference || '—');
                const dt = _el('wallet-uxfer-result-date');
                if (dt) dt.textContent = _fmtDate(new Date().toISOString());
                _showStep('wallet-user-transfer-modal', 'result');
                _refresh();
            } else {
                const fm = _el('wallet-uxfer-fail-msg');
                if (fm) fm.textContent = r.error || 'The transfer could not be completed. Your balance has not been changed.';
                _showStep('wallet-user-transfer-modal', 'failure');
            }
            _uxferBusy = false;
        }).catch(function () {
            _showStep('wallet-user-transfer-modal', 'failure');
            _uxferBusy = false;
        });
    }

    /* ==========================================================
       MERCHANT — WITHDRAW (destination → review → confirm)
    ========================================================== */
    let _wdlSelectedDest = null;   // { destinationID, label }

    function _openWithdraw() {
        _wdlBusy = false;
        _wdlSelectedDest = null;
        const modal = _el('wallet-withdraw2-modal');
        if (modal) {
            modal.querySelectorAll('input').forEach(i => i.value = '');
            modal.querySelectorAll('.field-error').forEach(e => e.textContent = '');
            const avail = _el('wallet-wdl-available');
            if (avail) avail.textContent = _fmt(_available);
            const contBtn = _el('wallet-wdl-account-continue');
            if (contBtn) contBtn.disabled = true;
            const confirmBtn = _el('wallet-wdl-confirm-btn');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Withdrawal'; }
        }
        _showStep('wallet-withdraw2-modal', 'details');
        _openModal('wallet-withdraw2-modal');
        _loadDestinations();
    }

    function _loadDestinations() {
        const list = _el('wallet-wdl-accounts');
        if (!list || typeof API === 'undefined') return;
        list.innerHTML = '<p class="wallet-field-hint">Loading accounts…</p>';
        API.Wallet.getDestinations().then(function (r) {
            _wdlDestinations = (r.success && Array.isArray(r.data)) ? r.data : [];
            if (_wdlDestinations.length === 0) {
                list.innerHTML = '<p class="wallet-field-hint">No saved bank accounts yet.</p>';
                return;
            }
            list.innerHTML = _wdlDestinations.map(function (d) {
                return `<button type="button" class="wallet-option" data-dest="${d.destinationID}">
                    <span class="wallet-option-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M3 21h18M4 10h16M5 10V7l7-4 7 4v3M6 21V10M18 21V10M10 21V10M14 21V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    <span class="wallet-option-text"><span class="wallet-option-title">${_escape(d.bankName)}</span><span class="wallet-option-desc">${_escape(d.accountMask)}</span></span>
                    <span class="wallet-option-status">Verified</span>
                </button>`;
            }).join('');
            list.querySelectorAll('.wallet-option').forEach(function (opt) {
                opt.addEventListener('click', function () {
                    list.querySelectorAll('.wallet-option').forEach(o => o.setAttribute('aria-pressed', 'false'));
                    opt.setAttribute('aria-pressed', 'true');
                    const id = parseInt(opt.getAttribute('data-dest'), 10);
                    const d = _wdlDestinations.find(x => x.destinationID === id);
                    _wdlSelectedDest = d ? { destinationID: id, label: d.label } : null;
                    const contBtn = _el('wallet-wdl-account-continue');
                    if (contBtn) contBtn.disabled = !_wdlSelectedDest;
                });
            });
        }).catch(function () {
            list.innerHTML = '<p class="wallet-field-hint">Could not load bank accounts.</p>';
        });
    }

    function _handleWithdrawReview(e) {
        e.preventDefault();
        const errEl = _el('wallet-wdl-amount-error');
        if (errEl) errEl.textContent = '';
        const amount = parseFloat(_el('wallet-wdl-amount').value);

        if (!_wdlSelectedDest) { if (errEl) errEl.textContent = 'Select a bank account first.'; return; }
        if (!amount || amount <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount greater than R0.00.'; return; }
        if (amount > _available) { if (errEl) errEl.textContent = 'The withdrawal amount exceeds your available balance.'; return; }

        _el('wallet-wdl-review-amount').textContent = _fmt(amount);
        _el('wallet-wdl-review-total').textContent = _fmt(amount);
        _el('wallet-wdl-review-dest').textContent = _wdlSelectedDest.label;
        _el('wallet-wdl-review-newbal').textContent = _fmt(_available - amount);
        const revErr = _el('wallet-wdl-review-error');
        if (revErr) revErr.textContent = '';
        _showStep('wallet-withdraw2-modal', 'review');
    }

    function _confirmWithdraw() {
        if (_wdlBusy) return;                         // duplicate-submit guard
        const amount = parseFloat(_el('wallet-wdl-amount').value);
        if (!_wdlSelectedDest || !amount || amount <= 0) return;

        _wdlBusy = true;
        _showStep('wallet-withdraw2-modal', 'processing');

        API.Wallet.withdraw(amount, undefined, _wdlSelectedDest.destinationID).then(function (r) {
            if (r.success && r.data) {
                _el('wallet-wdl-result-msg').textContent =
                    'Your ' + _fmt(r.data.amount || amount) + ' withdrawal is being processed.';
                _el('wallet-wdl-result-ref').textContent = 'Reference: ' + (r.data.reference || '—');
                const dd = _el('wallet-wdl-result-dest');
                if (dd) dd.textContent = r.data.destination || _wdlSelectedDest.label;
                _showStep('wallet-withdraw2-modal', 'result');
                _refresh();
            } else {
                const fm = _el('wallet-wdl-fail-msg');
                if (fm) fm.textContent = r.error || 'The withdrawal could not be completed. Your balance has not been changed.';
                _showStep('wallet-withdraw2-modal', 'failure');
            }
            _wdlBusy = false;
        }).catch(function () {
            _showStep('wallet-withdraw2-modal', 'failure');
            _wdlBusy = false;
        });
    }

    /* ==========================================================
       TREND CHART — fed by real transactions
    ========================================================== */
    const _metricLabel = { income: 'income', expenses: 'expenses', savings: 'savings' };
    const _periodLabel = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

    function _drawChart(labels, values) {
        const chart = _el('wal2-chart');
        if (!chart) return;

        if (!labels.length) {
            chart.innerHTML = '<div class="wal2-chart-empty">No activity for this period.</div>';
        } else {
            const max = Math.max.apply(null, values) || 1;
            const nonZero = values.filter(v => v > 0);
            const avg = nonZero.length ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
            chart.innerHTML = labels.map(function (label, i) {
                const v = values[i] || 0;
                const pct = v > 0 ? Math.max(4, Math.round((v / max) * 100)) : 2;
                const muted = (v === 0 || v < avg) ? ' muted' : '';
                return `<div class="wal2-bar-col" title="${_escape(label)}: ${_fmt(v)}">
                            <div class="wal2-bar${muted}" style="height:${pct}%"></div>
                            <span class="wal2-bar-label">${_escape(label)}</span>
                        </div>`;
            }).join('');
        }

        const totalEl = _el('wal2-trend-total');
        const subEl = _el('wal2-trend-sub');
        const sum = values.reduce((s, v) => s + (v || 0), 0);
        if (totalEl) totalEl.textContent = _fmt(sum);
        if (subEl) subEl.textContent = _periodLabel[_period] + ' ' + _metricLabel[_metric];
    }

    function _renderChart() {
        const chart = _el('wal2-chart');
        if (!chart) return;
        if (typeof API === 'undefined') { _drawChart([], []); return; }

        API.Wallet.getTrends({ metric: _metric, period: _period }).then(function (r) {
            if (r.success && r.data && Array.isArray(r.data.labels)) {
                _drawChart(r.data.labels, r.data.values || []);
            } else {
                _drawChart([], []);
            }
        }).catch(function () { _drawChart([], []); });
    }

    function _setMetric(metric) {
        if (!_metricLabel[metric]) return;
        _metric = metric;
        const seg = _el('wal2-metric-seg');
        if (seg) seg.querySelectorAll('.wal2-seg-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-metric') === metric);
        });
        _renderChart();
    }

    function _setPeriod(period) {
        if (!_periodLabel[period]) return;
        _period = period;
        const seg = _el('wal2-period-seg');
        if (seg) seg.querySelectorAll('.wal2-pd-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-period') === period);
        });
        _renderChart();
    }

    /* ==========================================================
       CARD DETAILS REVEAL
    ========================================================== */
    function _toggleCardReveal() {
        _cardRevealed = !_cardRevealed;
        _renderCardNumber();
        const btn = _el('wallet-card-reveal');
        const label = _el('wallet-card-reveal-label');
        const eyeOpen = document.querySelector('.wal2-eye-open');
        const eyeOff = document.querySelector('.wal2-eye-off');
        if (btn) btn.setAttribute('aria-pressed', _cardRevealed ? 'true' : 'false');
        if (label) label.textContent = _cardRevealed ? 'Hide' : 'View';
        if (eyeOpen) eyeOpen.hidden = _cardRevealed;
        if (eyeOff) eyeOff.hidden = !_cardRevealed;
    }

    /* ==========================================================
       UPCOMING PAYMENTS
    ========================================================== */
    function _renderUpcoming() {
        const list = _el('wal2-upcoming-list');
        if (!list || typeof API === 'undefined') return;

        API.Subscriptions.getAll().then(function (result) {
            if (!result.success || !Array.isArray(result.data)) {
                list.innerHTML = '<p class="wal2-up-empty">No upcoming payments.</p>';
                return;
            }
            const today = new Date();
            const items = result.data
                .filter(s => (s.subStatus || s.status || 'active') === 'active')
                .map(function (s) {
                    return {
                        name: s.serviceName || s.name || 'Subscription',
                        amount: parseFloat(s.billingAmount != null ? s.billingAmount : s.amount) || 0,
                        date: s.billingDate || s.nextPaymentDate || null,
                        logoText: s.logoText || (s.serviceName || 'S').charAt(0)
                    };
                })
                .sort(function (a, b) {
                    return new Date(a.date || '2999-01-01') - new Date(b.date || '2999-01-01');
                })
                .slice(0, 4);

            if (!items.length) {
                list.innerHTML = '<p class="wal2-up-empty">No upcoming payments.</p>';
                return;
            }
            list.innerHTML = items.map(function (p) {
                return `<div class="wal2-up-item">
                    <div class="wal2-up-logo">${_escape(String(p.logoText).slice(0,2).toUpperCase())}</div>
                    <div class="wal2-up-info">
                        <p class="wal2-up-name">${_escape(p.name)}</p>
                        <p class="wal2-up-date">${p.date ? _fmtDateShort(p.date) : 'Scheduled'}</p>
                    </div>
                    <span class="wal2-up-amount num">${_fmt(p.amount)}</span>
                </div>`;
            }).join('');
        }).catch(function () {
            list.innerHTML = '<p class="wal2-up-empty">No upcoming payments.</p>';
        });
    }

    function _fmtDateShort(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso).split('T')[0] || '—';
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate();
    }

    /* ----------------------------------------------------------
       REFRESH — reload balances + history from backend
    ---------------------------------------------------------- */
    function _refresh() {
        _loadBalances();
        _loadHistory(true);
        _renderUpcoming();
    }

    /* ----------------------------------------------------------
       EVENT BINDING
       _bindPageEvents runs on every navigation (page markup is
       re-injected). _bindModalEvents runs once (modals live in
       MASTER.html and persist).
    ---------------------------------------------------------- */
    let _modalsBound = false;

    function _bindEvents() {
        _bindPageEvents();
        if (!_modalsBound) { _bindModalEvents(); _modalsBound = true; }
    }

    function _bindPageEvents() {
        const addBtn = _el('wallet-btn-add');
        const withdrawBtn = _el('wallet-btn-withdraw');
        const goalBtn = _el('wallet-btn-transfer');
        const depBtn = _el('wallet-btn-send');
        const userXferBtn = _el('wallet-btn-send-user');

        // Top Up opens the full-screen takeover overlay. Withdraw still
        // uses its dedicated full-page wizard.
        if (addBtn) addBtn.addEventListener('click', () => {
            if (typeof TopUpOverlay !== 'undefined') TopUpOverlay.open();
            else loadPage('wallet-deposit');   // fallback if overlay unavailable
        });
        if (withdrawBtn) withdrawBtn.addEventListener('click', () => loadPage('wallet-withdraw'));
        if (goalBtn) goalBtn.addEventListener('click', () => _openModal('wallet-transfer-modal'));
        if (depBtn) depBtn.addEventListener('click', () => _openModal('wallet-send-modal'));
        if (userXferBtn) userXferBtn.addEventListener('click', _openUserTransfer);

        const warnAddBtn = _el('wallet-warning-add-btn');
        if (warnAddBtn) warnAddBtn.addEventListener('click', () => {
            if (typeof TopUpOverlay !== 'undefined') TopUpOverlay.open();
            else loadPage('wallet-deposit');
        });

        // History filter + load more
        const filter = _el('wallet-history-filter');
        if (filter) filter.addEventListener('change', function () {
            _historyType = filter.value;
            _loadHistory(true);
        });
        const moreBtn2 = _el('wallet-history-more');
        if (moreBtn2) moreBtn2.addEventListener('click', function () {
            _historyOffset += _historyLimit;
            _loadHistory(false);
        });

        // Trend chart — metric toggle (Income/Expenses/Savings)
        const metricSeg = _el('wal2-metric-seg');
        if (metricSeg) metricSeg.addEventListener('click', function (e) {
            const btn = e.target.closest('.wal2-seg-btn');
            if (btn) _setMetric(btn.getAttribute('data-metric'));
        });
        // Trend chart — period toggle (Weekly/Monthly/Yearly)
        const periodSeg = _el('wal2-period-seg');
        if (periodSeg) periodSeg.addEventListener('click', function (e) {
            const btn = e.target.closest('.wal2-pd-btn');
            if (btn) _setPeriod(btn.getAttribute('data-period'));
        });

        // Card details reveal
        const revealBtn = _el('wallet-card-reveal');
        if (revealBtn) revealBtn.addEventListener('click', _toggleCardReveal);
    }

    function _bindModalEvents() {
        // Generic modal close / cancel / backdrop
        document.querySelectorAll('.wallet-modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.wallet-modal-backdrop');
                if (modal) _closeModal(modal.id);
            });
        });
        document.querySelectorAll('.wallet-modal-cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.wallet-modal-backdrop');
                if (modal) _closeModal(modal.id);
            });
        });
        document.querySelectorAll('.wallet-modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => { if (e.target === backdrop) _closeModal(backdrop.id); });
        });

        // Quick-amount chips (all flows)
        _bindQuickAmounts(document);

        // Legacy goal / dependant forms
        const goalForm = _el('wallet-transfer-form');
        const depForm = _el('wallet-send-form');
        if (goalForm) goalForm.addEventListener('submit', _handleTransfer);
        if (depForm) depForm.addEventListener('submit', _handleSendToDependant);

        /* ── TOP UP flow ── */
        const topupMethods = _el('wallet-topup-methods');
        if (topupMethods) topupMethods.addEventListener('click', function (e) {
            const opt = e.target.closest('.wallet-option');
            if (!opt || opt.disabled) return;
            topupMethods.querySelectorAll('.wallet-option').forEach(o => o.setAttribute('aria-pressed', 'false'));
            opt.setAttribute('aria-pressed', 'true');
            _topupMethod = opt.getAttribute('data-method') || 'Bank Transfer';
        });
        const topupMethodContinue = _el('wallet-topup-method-continue');
        if (topupMethodContinue) topupMethodContinue.addEventListener('click', () => {
            const avail = _el('wallet-topup-available');
            if (avail) avail.textContent = 'Available Balance: ' + _fmt(_available);
            _showStep('wallet-add-modal', 'amount');
        });
        const topupAmountBack = _el('wallet-topup-amount-back');
        if (topupAmountBack) topupAmountBack.addEventListener('click', () => _showStep('wallet-add-modal', 'method'));
        const addForm = _el('wallet-add-form');
        if (addForm) addForm.addEventListener('submit', _handleTopUpReview);
        const topupReviewBack = _el('wallet-topup-review-back');
        if (topupReviewBack) topupReviewBack.addEventListener('click', () => _showStep('wallet-add-modal', 'amount'));
        const topupConfirm = _el('wallet-topup-confirm-btn');
        if (topupConfirm) topupConfirm.addEventListener('click', _confirmTopUp);
        const topupRetry = _el('wallet-topup-retry-btn');
        if (topupRetry) topupRetry.addEventListener('click', () => _showStep('wallet-add-modal', 'amount'));

        /* ── TRANSFER flow ── */
        const resolveBtn = _el('wallet-uxfer-resolve-btn');
        const recipInput = _el('wallet-uxfer-recipient');
        const recipContinue = _el('wallet-uxfer-recipient-continue');
        const uxferAmountBack = _el('wallet-uxfer-amount-back');
        const uxferForm = _el('wallet-user-transfer-form');
        const uxferBack = _el('wallet-uxfer-back-btn');
        const uxferConfirm = _el('wallet-uxfer-confirm-btn');
        const uxferRetry = _el('wallet-uxfer-retry-btn');
        if (resolveBtn) resolveBtn.addEventListener('click', _resolveRecipient);
        if (recipInput) recipInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); _resolveRecipient(); } });
        if (recipContinue) recipContinue.addEventListener('click', () => {
            const avail = _el('wallet-uxfer-available');
            if (avail) avail.textContent = 'Available Balance: ' + _fmt(_available);
            _showStep('wallet-user-transfer-modal', 'amount');
        });
        if (uxferAmountBack) uxferAmountBack.addEventListener('click', () => _showStep('wallet-user-transfer-modal', 'details'));
        if (uxferForm) uxferForm.addEventListener('submit', _handleUserTransferReview);
        if (uxferBack) uxferBack.addEventListener('click', () => _showStep('wallet-user-transfer-modal', 'amount'));
        if (uxferConfirm) uxferConfirm.addEventListener('click', _confirmUserTransfer);
        if (uxferRetry) uxferRetry.addEventListener('click', () => _showStep('wallet-user-transfer-modal', 'amount'));

        /* ── WITHDRAW flow ── */
        const wdlAccountContinue = _el('wallet-wdl-account-continue');
        const wdlAmountBack = _el('wallet-wdl-amount-back');
        const wdlForm = _el('wallet-withdraw2-form');
        const wdlBack = _el('wallet-wdl-back-btn');
        const wdlConfirm = _el('wallet-wdl-confirm-btn');
        const wdlRetry = _el('wallet-wdl-retry-btn');
        const wdlAll = _el('wallet-wdl-all');
        if (wdlAccountContinue) wdlAccountContinue.addEventListener('click', () => {
            const avail = _el('wallet-wdl-available');
            if (avail) avail.textContent = _fmt(_available);
            _showStep('wallet-withdraw2-modal', 'amount');
        });
        if (wdlAmountBack) wdlAmountBack.addEventListener('click', () => _showStep('wallet-withdraw2-modal', 'details'));
        if (wdlForm) wdlForm.addEventListener('submit', _handleWithdrawReview);
        if (wdlBack) wdlBack.addEventListener('click', () => _showStep('wallet-withdraw2-modal', 'amount'));
        if (wdlConfirm) wdlConfirm.addEventListener('click', _confirmWithdraw);
        if (wdlRetry) wdlRetry.addEventListener('click', () => _showStep('wallet-withdraw2-modal', 'amount'));
        if (wdlAll) wdlAll.addEventListener('click', function () {
            const inp = _el('wallet-wdl-amount');
            if (inp) inp.value = (_available || 0).toFixed(2);
        });
    }

    /* ----------------------------------------------------------
       INIT
    ---------------------------------------------------------- */
    function init() {
        // The SPA re-injects the wallet markup on every navigation, so the
        // DOM nodes are fresh each time — rebind listeners on each load.
        _bindEvents();
        _initialized = true;
        _historyType = '';
        _metric = 'income';
        _period = 'monthly';
        _cardRevealed = false;
        _refresh();
    }

    // refresh() lets external flows (e.g. the Top Up overlay) re-pull
    // balances/history after a mutation, but only when the wallet DOM
    // is actually mounted (guards against calling it on other pages).
    function refresh() {
        if (document.getElementById('wallet-hero-balance')) _refresh();
    }

    return Object.freeze({ init, refresh });

})();
