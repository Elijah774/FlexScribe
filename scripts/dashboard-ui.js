/* ===========================================================
   DashboardUI — Futuristic Fixed Grid Dashboard
   Renders data from WalletStore, SubscriptionStore, GoalsStore
   into the fixed 3-column layout.
=========================================================== */
const DashboardUI = (function () {
    'use strict';

    let _initialized = false;

    function init() {
        _renderFlexCard();
        _renderTimeline('week');
        _renderUpcoming();
        _renderAI();
        _renderGoals();
        _renderTransactions();
        if (!_initialized) {
            _bindEvents();
            _initialized = true;
        }
    }

    function _bindEvents() {
        // Timeline tabs
        document.querySelectorAll('.dash-tt-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.dash-tt-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                _renderTimeline(btn.dataset.range);
            });
        });

        // AI popup
        var recBtn = document.getElementById('dash-ai-rec-btn');
        var popupOverlay = document.getElementById('dash-ai-popup-overlay');
        var popup = document.getElementById('dash-ai-popup');
        var popupClose = document.getElementById('dash-ai-popup-close');

        if (recBtn) recBtn.addEventListener('click', function() {
            _renderAIPopup();
            popupOverlay.hidden = false;
            popup.hidden = false;
        });
        if (popupClose) popupClose.addEventListener('click', _closeAIPopup);
        if (popupOverlay) popupOverlay.addEventListener('click', _closeAIPopup);
    }

    function _closeAIPopup() {
        document.getElementById('dash-ai-popup-overlay').hidden = true;
        document.getElementById('dash-ai-popup').hidden = true;
    }

    // ═══ FlexCard ═══
    function _renderFlexCard() {
        var profile = null;
        try { profile = JSON.parse(localStorage.getItem('flexscribe_profile')); } catch(e) {}
        var name = (profile && profile.fullName) ? profile.fullName.toUpperCase() : 'SARAH MITCHELL';
        var nameEl = document.getElementById('dash-fc-name');
        if (nameEl) nameEl.textContent = name;

        if (typeof WalletStore !== 'undefined') {
            var snap = WalletStore.getSnapshot();
            var balEl = document.getElementById('dash-fc-balance');
            if (balEl) balEl.textContent = snap.fmtBalance;
        }
    }

    // ═══ Timeline Chart (SVG Line Graph) ═══
    function _renderTimeline(range) {
        var chart = document.getElementById('dash-timeline-chart');
        if (!chart) return;

        var data = {
            week:  [850, 420, 199, 1200, 350, 680, 950],
            month: [4200, 3800, 5100, 4600],
            year:  [8400, 7200, 9100, 6800, 8900, 7400, 8200, 6900, 7800, 8450, 7100, 9200]
        };
        var labels = {
            week:  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
            month: ['Week 1','Week 2','Week 3','Week 4'],
            year:  ['J','F','M','A','M','J','J','A','S','O','N','D']
        };

        var values = data[range] || data.week;
        var lbls = labels[range] || labels.week;
        var max = Math.max.apply(null, values);
        var min = Math.min.apply(null, values);

        var svgW = 300;
        var svgH = 100;
        var padX = 10;
        var padY = 10;
        var graphW = svgW - padX * 2;
        var graphH = svgH - padY * 2;

        // Build points
        var points = values.map(function(v, i) {
            var x = padX + (i / (values.length - 1)) * graphW;
            var y = padY + graphH - ((v - min) / (max - min || 1)) * graphH;
            return { x: x, y: y };
        });

        // Build smooth path (using line segments)
        var pathD = points.map(function(p, i) {
            return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
        }).join(' ');

        // Fill area path
        var areaD = pathD + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (svgH - padY) + ' L' + points[0].x.toFixed(1) + ',' + (svgH - padY) + ' Z';

        var html = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="dash-line-svg" preserveAspectRatio="none">';
        html += '<defs><linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--orange)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--orange)" stop-opacity="0.02"/></linearGradient></defs>';
        html += '<path d="' + areaD + '" fill="url(#lineGrad)"/>';
        html += '<path d="' + pathD + '" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        // Dots
        points.forEach(function(p) {
            html += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="var(--orange)" stroke="var(--card)" stroke-width="1.5"/>';
        });
        html += '</svg>';

        // Labels below
        html += '<div class="dash-tl-labels">';
        lbls.forEach(function(l) {
            html += '<span>' + l + '</span>';
        });
        html += '</div>';

        chart.innerHTML = html;
    }

    // ═══ Upcoming Payments ═══
    function _renderUpcoming() {
        var list = document.getElementById('dash-upcoming-list');
        if (!list) return;

        var payments = [];
        if (typeof SubscriptionStore !== 'undefined') {
            var stats = SubscriptionStore.getStats();
            payments = (stats.upcoming || []).slice(0, 4);
        }

        if (!payments.length) {
            payments = [
                { name: 'Netflix', amount: 199, nextPaymentDate: '2025-05-18', logoClass: 'netflix', logoText: 'N' },
                { name: 'Spotify', amount: 59.99, nextPaymentDate: '2025-05-16', logoClass: 'spotify', logoText: 'S' },
                { name: 'Disney+', amount: 89, nextPaymentDate: '2025-05-24', logoClass: 'disney', logoText: 'D+' },
                { name: 'Amazon Prime', amount: 99, nextPaymentDate: '2025-05-22', logoClass: 'prime', logoText: 'P' }
            ];
        }

        var fmtCur = (typeof SubscriptionStore !== 'undefined') ? SubscriptionStore.fmtCurrency : function(v) { return 'R' + v.toFixed(2); };
        var fmtDate = (typeof SubscriptionStore !== 'undefined') ? SubscriptionStore.fmtDate : function(d) { return d; };

        list.innerHTML = payments.map(function(p) {
            var cls = p.logoClass || 'default';
            var letter = p.logoText || p.name.charAt(0);
            return '<div class="dash-up-item">' +
                '<div class="dash-up-logo sub-logo ' + cls + '">' + letter + '</div>' +
                '<div class="dash-up-info"><p class="dash-up-name">' + p.name + '</p><p class="dash-up-date">' + fmtDate(p.nextPaymentDate) + '</p></div>' +
                '<span class="dash-up-amount">' + fmtCur(p.amount) + '</span>' +
                '</div>';
        }).join('');
    }

    // ═══ AI Insights ═══
    function _renderAI() {
        var body = document.getElementById('dash-ai-body');
        if (!body) return;

        var insight = 'Your spending is well-balanced this month.';
        if (typeof SubscriptionStore !== 'undefined') {
            var stats = SubscriptionStore.getStats();
            if (stats.byCategory.length > 0) {
                var top = stats.byCategory[0];
                insight = '<strong>' + top.category + '</strong> is your top spend at ' + top.pct + '% of subscriptions. ';
            }
        }
        if (typeof WalletStore !== 'undefined') {
            var snap = WalletStore.getSnapshot();
            var debits = snap.transactions.filter(function(t) { return t.type === 'debit'; });
            var total = debits.reduce(function(s,t) { return s + t.amount; }, 0);
            if (total > 0) insight += 'Total outflows: <strong>' + WalletStore.fmtCurrency(total) + '</strong>.';
        }
        body.innerHTML = insight;
    }

    function _renderAIPopup() {
        var body = document.getElementById('dash-ai-popup-body');
        if (!body) return;

        var recs = [];
        if (typeof SubscriptionStore !== 'undefined') {
            var stats = SubscriptionStore.getStats();
            if (stats.byCategory.length > 0 && stats.byCategory[0].pct > 40) {
                recs.push('Your <strong>' + stats.byCategory[0].category + '</strong> spending (' + stats.byCategory[0].pct + '%) is high. Consider reviewing unused services.');
            }
            var pausedCount = stats.totalCount - stats.activeCount;
            if (pausedCount > 0) {
                recs.push('You have <strong>' + pausedCount + ' paused subscription' + (pausedCount > 1 ? 's' : '') + '</strong>. Cancelling could save ' + stats.fmtSavings + '/year.');
            }
        }
        if (typeof GoalsStore !== 'undefined') {
            var goals = GoalsStore.getAll().filter(function(g) { return g.status === 'in_progress'; });
            goals.forEach(function(g) {
                var pct = Math.round((g.savedAmount / g.targetAmount) * 100);
                if (pct >= 70) recs.push('<strong>' + g.name + '</strong> is ' + pct + '% funded — you\'re almost there!');
            });
        }
        if (recs.length === 0) recs.push('Great job! Your finances look healthy. Keep tracking your spending to maintain your score.');

        body.innerHTML = recs.map(function(r) {
            return '<div class="dash-ai-popup-card"><p>' + r + '</p></div>';
        }).join('');
    }

    // ═══ Goals Progress ═══
    function _renderGoals() {
        var list = document.getElementById('dash-goals-list');
        if (!list) return;

        var goals = [];
        if (typeof GoalsStore !== 'undefined') {
            goals = GoalsStore.getAll().filter(function(g) { return g.status === 'in_progress'; }).slice(0, 3);
        }

        if (!goals.length) {
            list.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No active goals. Create one to start tracking!</p>';
            return;
        }

        var icons = { Travel: '✈️', Tech: '💻', Education: '📚', Emergency: '🚨', Home: '🏠', Vehicle: '🚗', Other: '🎯' };

        list.innerHTML = goals.map(function(g) {
            var pct = Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100));
            var emoji = icons[g.category] || '🎯';
            return '<div class="dash-goal-row">' +
                '<span class="dash-goal-emoji">' + emoji + '</span>' +
                '<div class="dash-goal-info"><p class="dash-goal-name">' + g.name + '</p><div class="dash-goal-bar"><div class="dash-goal-fill" style="width:' + pct + '%"></div></div></div>' +
                '<span class="dash-goal-pct">' + pct + '%</span>' +
                '</div>';
        }).join('');
    }

    // ═══ Recent Transactions ═══
    function _renderTransactions() {
        var list = document.getElementById('dash-txn-list');
        if (!list) return;

        var txs = [];
        if (typeof WalletStore !== 'undefined') {
            txs = WalletStore.getTransactions().slice(0, 5);
        }

        if (!txs.length) {
            list.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No transactions yet.</p>';
            return;
        }

        list.innerHTML = txs.map(function(tx) {
            var isCredit = tx.type === 'credit';
            var icon = isCredit ? '↓' : '↑';
            var cls = isCredit ? 'credit' : 'debit';
            var sign = isCredit ? '+' : '-';
            return '<div class="dash-txn-row">' +
                '<div class="dash-txn-icon ' + cls + '">' + icon + '</div>' +
                '<div class="dash-txn-info"><p class="dash-txn-name">' + tx.description + '</p><p class="dash-txn-date">' + WalletStore.fmtDate(tx.date) + '</p></div>' +
                '<span class="dash-txn-amt ' + cls + '">' + sign + WalletStore.fmtCurrency(tx.amount) + '</span>' +
                '</div>';
        }).join('');
    }

    return { init: init };
})();
