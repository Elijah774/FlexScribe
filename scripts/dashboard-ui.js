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
        _renderScribeScore();
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
        // Load user name from profile API or sessionStorage
        var name = 'CARD HOLDER';
        try {
            var profile = JSON.parse(localStorage.getItem('flexscribe_profile'));
            if (profile && profile.fullName) name = profile.fullName.toUpperCase();
        } catch(e) {}

        // Try to get name from API if available
        if (typeof API !== 'undefined') {
            API.Auth.getUser().then(function(result) {
                if (result.success && result.data) {
                    var d = result.data;
                    var fullName = ((d.firstName || '') + ' ' + (d.lastName || '')).trim();
                    if (fullName) {
                        var nameEl = document.getElementById('dash-fc-name');
                        if (nameEl) nameEl.textContent = fullName.toUpperCase();
                    }
                }
            }).catch(function() {});
        }

        var nameEl = document.getElementById('dash-fc-name');
        if (nameEl) nameEl.textContent = name;

        if (typeof WalletStore !== 'undefined') {
            var snap = WalletStore.getSnapshot();
            var balEl = document.getElementById('dash-fc-balance');
            if (balEl) balEl.textContent = snap.fmtBalance;
        }

        // Fetch card number from wallet API
        if (typeof API !== 'undefined') {
            API.Wallet.get().then(function(result) {
                if (result.success && result.data && result.data.cardNumber) {
                    var cn = result.data.cardNumber;
                    var masked = cn.slice(0, 4) + ' \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 ' + cn.slice(-4);
                    var numEl = document.getElementById('dash-fc-number');
                    if (numEl) numEl.textContent = masked;
                }
            }).catch(function() {});
        }
    }

    // ═══ Scribe Score Ring (dynamic from API) ═══
    function _renderScribeScore() {
        if (typeof API === 'undefined') return;

        API.Auth.getUser().then(function(result) {
            if (!result.success || !result.data) return;
            var score = parseInt(result.data.scribeScore) || 0;

            // Max score is 1000 for ring purposes
            var maxScore = 1000;
            var pct = Math.min(score / maxScore, 1); // 0 to 1

            // Update the score value text
            var valueEl = document.getElementById('dash-score-value');
            if (valueEl) valueEl.textContent = score;

            // Update the outer ring (Financial Health) — r=70, circumference=440
            var outerRing = document.querySelector('.dash-ring-outer');
            if (outerRing) {
                var outerCircumference = 440;
                var outerOffset = outerCircumference - (pct * outerCircumference);
                outerRing.style.strokeDashoffset = outerOffset;
                outerRing.style.transition = 'stroke-dashoffset 1s ease-out';
            }

            // Update the inner ring (Scribe Score) — r=52, circumference=327
            var innerRing = document.querySelector('.dash-ring-inner');
            if (innerRing) {
                var innerCircumference = 327;
                var innerOffset = innerCircumference - (pct * innerCircumference);
                innerRing.style.strokeDashoffset = innerOffset;
                innerRing.style.transition = 'stroke-dashoffset 1s ease-out';
            }

            // Update legend text
            var healthPct = Math.round(pct * 100);
            var scorePct = Math.round(pct * 100);
            var legends = document.querySelectorAll('.dash-score-leg');
            if (legends.length >= 2) {
                legends[0].innerHTML = '<span class="dash-dot green"></span>Financial Health ' + healthPct + '%';
                legends[1].innerHTML = '<span class="dash-dot orange"></span>Scribe Score ' + scorePct + '%';
            }
        }).catch(function() {});
    }

    // ═══ Timeline Chart (SVG Line Graph) ═══
    function _renderTimeline(range) {
        var chart = document.getElementById('dash-timeline-chart');
        if (!chart) return;

        // Build data from real wallet transactions
        var values = [];
        var lbls = [];

        if (typeof WalletStore !== 'undefined') {
            var txs = WalletStore.getTransactions();
            var debits = txs.filter(function(t) { return t.type === 'debit' || t.type === 'transfer'; });

            if (range === 'week') {
                var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                var today = new Date();
                for (var i = 6; i >= 0; i--) {
                    var d = new Date(today);
                    d.setDate(d.getDate() - i);
                    var dateStr = d.toISOString().slice(0, 10);
                    var dayTotal = debits.filter(function(t) { return t.date === dateStr; }).reduce(function(s, t) { return s + t.amount; }, 0);
                    values.push(dayTotal);
                    lbls.push(dayNames[d.getDay()]);
                }
            } else if (range === 'month') {
                var today2 = new Date();
                for (var w = 3; w >= 0; w--) {
                    var weekStart = new Date(today2);
                    weekStart.setDate(weekStart.getDate() - (w * 7 + 6));
                    var weekEnd = new Date(today2);
                    weekEnd.setDate(weekEnd.getDate() - (w * 7));
                    var ws = weekStart.toISOString().slice(0, 10);
                    var we = weekEnd.toISOString().slice(0, 10);
                    var weekTotal = debits.filter(function(t) { return t.date >= ws && t.date <= we; }).reduce(function(s, t) { return s + t.amount; }, 0);
                    values.push(weekTotal);
                    lbls.push('Week ' + (4 - w));
                }
            } else {
                var months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
                var today3 = new Date();
                for (var m = 11; m >= 0; m--) {
                    var md = new Date(today3.getFullYear(), today3.getMonth() - m, 1);
                    var mStr = md.toISOString().slice(0, 7);
                    var mTotal = debits.filter(function(t) { return t.date && t.date.startsWith(mStr); }).reduce(function(s, t) { return s + t.amount; }, 0);
                    values.push(mTotal);
                    lbls.push(months[md.getMonth()]);
                }
            }
        }

        // Fallback if no data
        if (values.length === 0) {
            values = [0];
            lbls = ['—'];
        }

        var max = Math.max.apply(null, values);
        var min = Math.min.apply(null, values);

        var svgW = 300;
        var svgH = 100;
        var padX = 10;
        var padY = 10;
        var graphW = svgW - padX * 2;
        var graphH = svgH - padY * 2;

        var points = values.map(function(v, i) {
            var x = padX + (values.length > 1 ? (i / (values.length - 1)) * graphW : graphW / 2);
            var y = padY + graphH - ((v - min) / (max - min || 1)) * graphH;
            return { x: x, y: y };
        });

        var pathD = points.map(function(p, i) {
            return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
        }).join(' ');

        var areaD = pathD + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (svgH - padY) + ' L' + points[0].x.toFixed(1) + ',' + (svgH - padY) + ' Z';

        var html = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="dash-line-svg" preserveAspectRatio="none">';
        html += '<defs><linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--orange)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--orange)" stop-opacity="0.02"/></linearGradient></defs>';
        html += '<path d="' + areaD + '" fill="url(#lineGrad)"/>';
        html += '<path d="' + pathD + '" fill="none" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        points.forEach(function(p) {
            html += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="var(--orange)" stroke="var(--card)" stroke-width="1.5"/>';
        });
        html += '</svg>';

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
            list.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No upcoming payments.</p>';
            return;
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
            var goals = GoalsStore.getAll().filter(function(g) { return g.status === 'in_progress' || g.status === 'active'; });
            goals.forEach(function(g) {
                var saved = parseFloat(g.savedAmount || g.currentProgress) || 0;
                var target = parseFloat(g.targetAmount) || 1;
                var pct = Math.round((saved / target) * 100);
                if (pct >= 70) recs.push('<strong>' + (g.name || g.goalName) + '</strong> is ' + pct + '% funded — you\'re almost there!');
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

        // Load goals from API directly
        if (typeof API !== 'undefined') {
            API.Goals.getAll().then(function(result) {
                if (result.success && Array.isArray(result.data)) {
                    var goals = result.data.filter(function(g) { return g.goalStatus === 'active'; }).slice(0, 3);
                    if (!goals.length) {
                        list.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No active goals. Create one to start tracking!</p>';
                        return;
                    }
                    var icons = { Travel: 'T', Tech: 'Tc', Education: 'Ed', Emergency: 'Em', Home: 'H', Vehicle: 'V', Other: 'O' };
                    list.innerHTML = goals.map(function(g) {
                        var target = parseFloat(g.targetAmount) || 1;
                        var saved = parseFloat(g.currentProgress) || 0;
                        var pct = Math.min(100, Math.round((saved / target) * 100));
                        var icon = icons[g.category] || 'O';
                        return '<div class="dash-goal-row">' +
                            '<span class="dash-goal-emoji">' + icon + '</span>' +
                            '<div class="dash-goal-info"><p class="dash-goal-name">' + (g.goalName || '') + '</p><div class="dash-goal-bar"><div class="dash-goal-fill" style="width:' + pct + '%"></div></div></div>' +
                            '<span class="dash-goal-pct">' + pct + '%</span>' +
                            '</div>';
                    }).join('');
                } else {
                    list.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No active goals. Create one to start tracking!</p>';
                }
            }).catch(function() {
                list.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No active goals. Create one to start tracking!</p>';
            });
        } else {
            list.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No active goals. Create one to start tracking!</p>';
        }
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
