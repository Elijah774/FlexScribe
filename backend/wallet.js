/* =============================================================
   FlexScribe — Wallet Backend (client-side data layer)
   backend/wallet.js

   Responsibilities:
   • In-memory data store seeded from localStorage
   • Balance, pendingIn, pendingOut tracking
   • Transactions list (credit/debit)
   • CRUD: addFunds, withdraw, transferToGoal, sendToDependant
   • onChange pub/sub for UI re-renders
   • All mutations persist to localStorage automatically
   • Exposes a single global `WalletStore` object consumed
     by the UI layer (scripts/wallet-ui.js)
============================================================= */

'use strict';

const WalletStore = (() => {

    /* ----------------------------------------------------------
       CONSTANTS
    ---------------------------------------------------------- */
    const STORAGE_KEY = 'flexscribe_wallet';

    /* ----------------------------------------------------------
       SEED DATA (used only when localStorage is empty)
    ---------------------------------------------------------- */
    const SEED = {
        balance: 12450.00,
        pendingIn: 3500.00,
        pendingOut: 1200.00,
        transactions: [
            { id: 'wt_001', type: 'credit', description: 'Salary deposit', amount: 15000, date: '2025-05-15', category: 'income' },
            { id: 'wt_002', type: 'debit', description: 'Netflix subscription', amount: 199, date: '2025-05-14', category: 'subscription' },
            { id: 'wt_003', type: 'credit', description: 'Freelance payment', amount: 3500, date: '2025-05-12', category: 'income' },
            { id: 'wt_004', type: 'debit', description: 'Transfer to Vacation Goal', amount: 2000, date: '2025-05-10', category: 'transfer' },
            { id: 'wt_005', type: 'debit', description: 'Grocery shopping', amount: 850, date: '2025-05-08', category: 'expense' }
        ]
    };

    /* ----------------------------------------------------------
       PRIVATE STATE
    ---------------------------------------------------------- */
    let _data = { balance: 0, pendingIn: 0, pendingOut: 0, transactions: [] };
    let _listeners = [];

    /* ----------------------------------------------------------
       PERSISTENCE — Backend API (SQL Server)
       No localStorage. API is the source of truth.
    ---------------------------------------------------------- */
    function _load() {
        // No-op. Data comes from loadFromAPI().
    }

    async function loadFromAPI() {
        if (typeof API === 'undefined') {
            throw new Error('API not available');
        }
        // Get balance
        const balResult = await API.Wallet.get();
        if (balResult.success && balResult.data) {
            const d = balResult.data.data || balResult.data;
            _data.balance = (d.balanceCents || 0) / 100;
            _data.pendingIn = (d.pendingInCents || 0) / 100;
            _data.pendingOut = (d.pendingOutCents || 0) / 100;
        } else {
            throw new Error(balResult.error || 'Failed to load wallet');
        }
        // Get history
        try {
            const histResult = await API.Wallet.getHistory();
            if (histResult.success && histResult.data) {
                const hist = Array.isArray(histResult.data) ? histResult.data : (histResult.data.data || []);
                _data.transactions = hist.map(function(t) {
                    return {
                        id: t.id || ('wt_' + Math.random().toString(36).slice(2)),
                        type: t.type || 'debit',
                        description: t.label || t.type || '',
                        amount: Math.abs((t.amountCents || 0) / 100),
                        date: t.date || '',
                        category: t.type || 'transaction'
                    };
                });
            }
        } catch (histErr) {
            console.warn('Wallet: could not load history:', histErr);
            _data.transactions = [];
        }
        _listeners.forEach(fn => fn(getSnapshot()));
        return _data;
    }

    function _save() {
        // No-op. We do not persist to localStorage.
    }

    /* ----------------------------------------------------------
       CHANGE NOTIFICATION (pub/sub for UI re-renders)
    ---------------------------------------------------------- */
    function _notify() {
        _save();
        _listeners.forEach(fn => fn(getSnapshot()));
    }

    function onChange(fn) {
        _listeners.push(fn);
    }

    function offChange(fn) {
        _listeners = _listeners.filter(l => l !== fn);
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */
    function _uid() {
        return 'wt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /** Format currency as "R 12,450.00" */
    function fmtCurrency(val) {
        return 'R' + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /** Format date "YYYY-MM-DD" → "MMM D, YYYY" */
    function fmtDate(iso) {
        if (!iso) return '—';
        const [y, m, d] = iso.split('-').map(Number);
        const months = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[m - 1]} ${d}, ${y}`;
    }

    /* ----------------------------------------------------------
       READ
    ---------------------------------------------------------- */
    function getSnapshot() {
        return {
            balance: _data.balance,
            pendingIn: _data.pendingIn,
            pendingOut: _data.pendingOut,
            transactions: [..._data.transactions],
            fmtBalance: fmtCurrency(_data.balance),
            fmtPendingIn: fmtCurrency(_data.pendingIn),
            fmtPendingOut: fmtCurrency(_data.pendingOut),
        };
    }

    function getTransactions() {
        return [..._data.transactions];
    }

    /* ----------------------------------------------------------
       WRITE — Add Funds
    ---------------------------------------------------------- */
    /**
     * @param {number} amount
     * @param {string} source - 'Bank Card' or 'EFT'
     * @returns {Object} the new transaction
     */
    function addFunds(amount, source) {
        amount = parseFloat(amount);
        if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');

        API.Wallet.addFunds(Math.round(amount * 100), source).then(function(result) {
            if (result.success) { loadFromAPI(); }
            else { console.error('Add funds failed:', result.error); }
        }).catch(function(err) { console.error('Add funds network error:', err); });

        return { id: 'pending', type: 'credit', description: 'Funds added via ' + (source || 'deposit'), amount: amount, date: new Date().toISOString().slice(0, 10), category: 'deposit' };
    }

    /* ----------------------------------------------------------
       WRITE — Withdraw
    ---------------------------------------------------------- */
    /**
     * @param {number} amount
     * @param {string} destination
     * @returns {Object} the new transaction
     */
    function withdraw(amount, destination) {
        amount = parseFloat(amount);
        if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');
        if (amount > _data.balance) throw new Error('Insufficient balance.');

        API.Wallet.withdraw(Math.round(amount * 100), destination).then(function(result) {
            if (result.success) { loadFromAPI(); }
            else { console.error('Withdraw failed:', result.error); }
        }).catch(function(err) { console.error('Withdraw network error:', err); });

        return { id: 'pending', type: 'debit', description: 'Withdrawal to ' + (destination || 'bank'), amount: amount, date: new Date().toISOString().slice(0, 10), category: 'withdrawal' };
    }

    /* ----------------------------------------------------------
       WRITE — Transfer to Goal
    ---------------------------------------------------------- */
    /**
     * @param {number} amount
     * @param {string} goalName
     * @returns {Object} the new transaction
     */
    function transferToGoal(amount, goalName) {
        amount = parseFloat(amount);
        if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');
        if (amount > _data.balance) throw new Error('Insufficient balance.');

        API.Wallet.transfer(Math.round(amount * 100)).then(function(result) {
            if (result.success) { loadFromAPI(); }
            else { console.error('Transfer failed:', result.error); }
        }).catch(function(err) { console.error('Transfer network error:', err); });

        return { id: 'pending', type: 'debit', description: 'Transfer to ' + (goalName || 'goal'), amount: amount, date: new Date().toISOString().slice(0, 10), category: 'transfer' };
    }

    /* ----------------------------------------------------------
       WRITE — Send to Dependant
    ---------------------------------------------------------- */
    /**
     * @param {number} amount
     * @param {string} dependantName
     * @returns {Object} the new transaction
     */
    function sendToDependant(amount, dependantName) {
        amount = parseFloat(amount);
        if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');
        if (amount > _data.balance) throw new Error('Insufficient balance.');

        API.Wallet.withdraw(Math.round(amount * 100), 'dependant').then(function(result) {
            if (result.success) { loadFromAPI(); }
            else { console.error('Send to dependant failed:', result.error); }
        }).catch(function(err) { console.error('Send to dependant network error:', err); });

        return { id: 'pending', type: 'debit', description: 'Sent to ' + (dependantName || 'dependant'), amount: amount, date: new Date().toISOString().slice(0, 10), category: 'dependant' };
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    // Do NOT auto-load. Data comes from loadFromAPI().

    return Object.freeze({
        // Data access
        getSnapshot,
        getTransactions,
        // Mutations (API-backed)
        addFunds,
        withdraw,
        transferToGoal,
        sendToDependant,
        // API loading
        loadFromAPI,
        // Events
        onChange,
        offChange,
        // Utility
        fmtCurrency,
        fmtDate,
    });

})();
