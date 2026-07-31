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
    let _data = null;
    let _listeners = [];

    /* ----------------------------------------------------------
       PERSISTENCE
    ---------------------------------------------------------- */
    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            _data = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(SEED));
        } catch {
            _data = JSON.parse(JSON.stringify(SEED));
        }
    }

    function _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
        } catch (e) {
            console.warn('FlexScribe: could not persist wallet data', e);
        }
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

        _data.balance += amount;

        const tx = {
            id: _uid(),
            type: 'credit',
            description: `Funds added via ${source}`,
            amount: amount,
            date: new Date().toISOString().slice(0, 10),
            category: 'deposit'
        };
        _data.transactions.unshift(tx);
        _notify();
        return tx;
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

        _data.balance -= amount;

        const tx = {
            id: _uid(),
            type: 'debit',
            description: `Withdrawal to ${destination}`,
            amount: amount,
            date: new Date().toISOString().slice(0, 10),
            category: 'withdrawal'
        };
        _data.transactions.unshift(tx);
        _notify();
        return tx;
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

        _data.balance -= amount;

        const tx = {
            id: _uid(),
            type: 'debit',
            description: `Transfer to ${goalName}`,
            amount: amount,
            date: new Date().toISOString().slice(0, 10),
            category: 'transfer'
        };
        _data.transactions.unshift(tx);
        _notify();
        return tx;
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

        _data.balance -= amount;

        const tx = {
            id: _uid(),
            type: 'debit',
            description: `Sent to ${dependantName}`,
            amount: amount,
            date: new Date().toISOString().slice(0, 10),
            category: 'dependant'
        };
        _data.transactions.unshift(tx);
        _notify();
        return tx;
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    _load();

    return Object.freeze({
        // Data access
        getSnapshot,
        getTransactions,
        // Mutations
        addFunds,
        withdraw,
        transferToGoal,
        sendToDependant,
        // Events
        onChange,
        offChange,
        // Utility
        fmtCurrency,
        fmtDate,
    });

})();
