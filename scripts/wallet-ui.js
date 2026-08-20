/* =============================================================
   FlexScribe — Wallet Panel UI
   scripts/wallet-ui.js

   Responsibilities:
   • Renders the wallet panel: hero card, stats, quick actions,
     recent activity list
   • Opens/closes Add Funds, Withdraw, Transfer to Goal modals
   • Validates inputs and calls WalletStore methods
   • Re-renders data on WalletStore.onChange events
   • Exposes global `WalletUI` IIFE consumed by layout.js
============================================================= */

'use strict';

const WalletUI = (() => {

    let _initialized = false;

    /* ----------------------------------------------------------
       SELECTORS
    ---------------------------------------------------------- */
    const _el = (id) => document.getElementById(id);

    /* ----------------------------------------------------------
       GOALS (for transfer picker)
    ---------------------------------------------------------- */
    const GOALS = [
        'Vacation Fund',
        'Emergency Fund',
        'New Laptop',
        'Car Savings',
        'Education'
    ];

    /* ----------------------------------------------------------
       RENDER
    ---------------------------------------------------------- */
    function _render() {
        const snap = WalletStore.getSnapshot();

        // Hero balance
        const balanceEl = _el('wallet-hero-balance');
        if (balanceEl) balanceEl.textContent = snap.fmtBalance;

        // Stat cards
        const availEl = _el('wallet-stat-available');
        const pendInEl = _el('wallet-stat-pending-in');
        const pendOutEl = _el('wallet-stat-pending-out');
        if (availEl) availEl.textContent = snap.fmtBalance;
        if (pendInEl) pendInEl.textContent = snap.fmtPendingIn;
        if (pendOutEl) pendOutEl.textContent = snap.fmtPendingOut;

        // Transactions list
        _renderTransactions(snap.transactions);
    }

    function _renderTransactions(transactions) {
        const list = _el('wallet-activity-list');
        if (!list) return;

        const recent = transactions.slice(0, 5);

        if (recent.length === 0) {
            list.innerHTML = '<li class="wallet-tx-item"><span class="wallet-tx-desc" style="color:var(--text-light)">No transactions yet.</span></li>';
            return;
        }

        list.innerHTML = recent.map(tx => {
            const isCredit = tx.type === 'credit';
            const icon = isCredit ? '↓' : '↑';
            const sign = isCredit ? '+' : '-';
            const colorClass = isCredit ? 'credit' : 'debit';

            return `
                <li class="wallet-tx-item">
                    <div class="wallet-tx-icon ${colorClass}">${icon}</div>
                    <div class="wallet-tx-info">
                        <p class="wallet-tx-desc">${tx.description}</p>
                        <p class="wallet-tx-date">${WalletStore.fmtDate(tx.date)}</p>
                    </div>
                    <span class="wallet-tx-amount ${colorClass}">${sign}${WalletStore.fmtCurrency(tx.amount)}</span>
                </li>
            `;
        }).join('');
    }

    /* ----------------------------------------------------------
       MODALS — generic open/close
    ---------------------------------------------------------- */
    function _openModal(id) {
        const modal = _el(id);
        if (modal) modal.hidden = false;
    }

    function _closeModal(id) {
        const modal = _el(id);
        if (modal) {
            modal.hidden = true;
            // Clear inputs & errors
            modal.querySelectorAll('input').forEach(inp => inp.value = '');
            modal.querySelectorAll('.field-error').forEach(e => e.textContent = '');
        }
    }

    /* ----------------------------------------------------------
       ADD FUNDS MODAL
    ---------------------------------------------------------- */
    function _handleAddFunds(e) {
        e.preventDefault();
        const amountInput = _el('wallet-add-amount');
        const sourceSelect = _el('wallet-add-source');
        const errorEl = _el('wallet-add-error');

        const amount = parseFloat(amountInput.value);
        if (!amount || amount <= 0) {
            if (errorEl) errorEl.textContent = 'Enter a valid amount greater than 0.';
            return;
        }

        try {
            WalletStore.addFunds(amount, sourceSelect.value);
            _closeModal('wallet-add-modal');
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       WITHDRAW MODAL
    ---------------------------------------------------------- */
    function _handleWithdraw(e) {
        e.preventDefault();
        const amountInput = _el('wallet-withdraw-amount');
        const destInput = _el('wallet-withdraw-dest');
        const errorEl = _el('wallet-withdraw-error');

        const amount = parseFloat(amountInput.value);
        const dest = destInput.value.trim();

        if (!amount || amount <= 0) {
            if (errorEl) errorEl.textContent = 'Enter a valid amount greater than 0.';
            return;
        }
        if (!dest) {
            if (errorEl) errorEl.textContent = 'Enter a destination.';
            return;
        }

        try {
            WalletStore.withdraw(amount, dest);
            _closeModal('wallet-withdraw-modal');
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       TRANSFER TO GOAL MODAL
    ---------------------------------------------------------- */
    function _handleTransfer(e) {
        e.preventDefault();
        const amountInput = _el('wallet-transfer-amount');
        const goalSelect = _el('wallet-transfer-goal');
        const errorEl = _el('wallet-transfer-error');

        const amount = parseFloat(amountInput.value);
        const goal = goalSelect.value;

        if (!amount || amount <= 0) {
            if (errorEl) errorEl.textContent = 'Enter a valid amount greater than 0.';
            return;
        }
        if (!goal) {
            if (errorEl) errorEl.textContent = 'Select a goal.';
            return;
        }

        try {
            WalletStore.transferToGoal(amount, goal);
            _closeModal('wallet-transfer-modal');
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       EVENT BINDING
    ---------------------------------------------------------- */
    function _bindEvents() {
        // Quick action buttons
        const addBtn = _el('wallet-btn-add');
        const withdrawBtn = _el('wallet-btn-withdraw');
        const transferBtn = _el('wallet-btn-transfer');
        const sendBtn = _el('wallet-btn-send');

        if (addBtn) addBtn.addEventListener('click', () => _openModal('wallet-add-modal'));
        if (withdrawBtn) withdrawBtn.addEventListener('click', () => _openModal('wallet-withdraw-modal'));
        if (transferBtn) transferBtn.addEventListener('click', () => _openModal('wallet-transfer-modal'));
        if (sendBtn) sendBtn.addEventListener('click', () => _openModal('wallet-send-modal'));

        // Modal close buttons
        document.querySelectorAll('.wallet-modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.wallet-modal-backdrop');
                if (modal) _closeModal(modal.id);
            });
        });

        // Modal cancel buttons
        document.querySelectorAll('.wallet-modal-cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.wallet-modal-backdrop');
                if (modal) _closeModal(modal.id);
            });
        });

        // Backdrop click to close
        document.querySelectorAll('.wallet-modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) _closeModal(backdrop.id);
            });
        });

        // Form submissions
        const addForm = _el('wallet-add-form');
        const withdrawForm = _el('wallet-withdraw-form');
        const transferForm = _el('wallet-transfer-form');
        const sendForm = _el('wallet-send-form');

        if (addForm) addForm.addEventListener('submit', _handleAddFunds);
        if (withdrawForm) withdrawForm.addEventListener('submit', _handleWithdraw);
        if (transferForm) transferForm.addEventListener('submit', _handleTransfer);
        if (sendForm) sendForm.addEventListener('submit', _handleSendToDependant);

        // Listen for store changes to re-render
        WalletStore.onChange(_render);
    }

    /* ----------------------------------------------------------
       SEND TO DEPENDANT MODAL
    ---------------------------------------------------------- */
    function _handleSendToDependant(e) {
        e.preventDefault();
        const amountInput = _el('wallet-send-amount');
        const nameInput = _el('wallet-send-name');
        const errorEl = _el('wallet-send-error');

        const amount = parseFloat(amountInput.value);
        const name = nameInput.value.trim();

        if (!amount || amount <= 0) {
            if (errorEl) errorEl.textContent = 'Enter a valid amount greater than 0.';
            return;
        }
        if (!name) {
            if (errorEl) errorEl.textContent = 'Enter a dependant name.';
            return;
        }

        try {
            WalletStore.sendToDependant(amount, name);
            _closeModal('wallet-send-modal');
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message;
        }
    }

    /* ----------------------------------------------------------
       INIT
    ---------------------------------------------------------- */
    function init() {
        if (_initialized) {
            // Re-load from API on subsequent visits
            WalletStore.loadFromAPI().then(_render).catch(function(err) {
                console.error('Wallet reload error:', err);
            });
            return;
        }
        _initialized = true;
        _bindEvents();
        // Initial load from API
        WalletStore.loadFromAPI().then(_render).catch(function(err) {
            console.error('Wallet initial load error:', err);
        });
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        init,
    });

})();
