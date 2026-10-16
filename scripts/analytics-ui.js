/* =============================================================
   analytics-ui.js  — Analytics panel UI logic
   Fetches real data from /api/analytics endpoints.
============================================================= */

const AnalyticsUI = (() => {
    'use strict';

    const CATEGORY_COLORS = {
        Entertainment: 'var(--orange)',
        Music:         'var(--green)',
        Shopping:      'var(--blue)',
        Productivity:  'var(--purple)',
        Education:     'var(--yellow)',
        Utilities:     '#6FDB8F',
        Fitness:       '#E36565',
        News:          '#94969D',
        Gaming:        '#A77CFF',
        Health:        '#A77CFF',
        AI:            '#6FDB8F',
        Other:         'var(--text-light)',
    };

    let currentRange = 'thisMonth';
    let activeCategory = null;

    /* ── Helpers ───────────────────────────────────────────── */
    function formatRand(n) {
        return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    // Pass the calendar range key straight through to the API. The backend
    // (/analytics/summary) understands thisMonth / lastMonth / last3Months and
    // scopes the data to that exact window.
    function _rangeToApiParam() {
        switch (currentRange) {
            case 'thisMonth':
            case 'lastMonth':
            case 'last3Months':
                return currentRange;
            default:
                return 'thisMonth';
        }
    }

    // Human phrase for the selected period, used in the card-back explanations.
    function _rangePhrase() {
        switch (currentRange) {
            case 'lastMonth':    return 'last month';
            case 'last3Months':  return 'the last 3 months';
            case 'thisMonth':
            default:             return 'this month';
        }
    }

    /* ── Render all sections from API ─────────────────────── */
    async function render() {
        const range = _rangeToApiParam();

        try {
            // Fetch all analytics data in parallel
            const [summaryRes, categoryRes, trendRes, spendingRes] = await Promise.all([
                API.Analytics.getSummary(range),
                API.Analytics.getByCategory(range),
                API.Analytics.getTrend('6m'),
                API.Analytics.getSpendingBreakdown(range)
            ]);

            const summary = summaryRes.success ? summaryRes.data : {};
            const categories = categoryRes.success ? categoryRes.data : [];
            const trend = trendRes.success ? trendRes.data : [];
            const spending = spendingRes.success ? spendingRes.data : { total: 0, breakdown: [] };

            // Build data object compatible with render functions
            const data = {
                totalSpent: parseFloat(summary.totalSpent) || 0,
                totalIncome: parseFloat(summary.totalIncome) || 0,
                goalProgressRate: summary.goalProgressRate || 0,
                // The multi-factor risk score is computed live by the summary
                // endpoint (subscription + budget + savings + buffer, equally
                // weighted). Fall back to a simple spend-vs-income heuristic
                // only if the API didn't return one.
                riskScore: (summary.riskScore !== undefined && summary.riskScore !== null)
                    ? summary.riskScore
                    : ((summary.totalIncome > 0)
                        ? Math.max(0, Math.min(100, Math.round((parseFloat(summary.totalSpent) / parseFloat(summary.totalIncome)) * 100)))
                        : 50),
                // Whether the full four-factor breakdown is available.
                riskStored: (summary.riskScore !== undefined && summary.riskScore !== null),
                riskBreakdown: summary.riskBreakdown || null,
                goalsSaved: summary.goals ? parseFloat(summary.goals.totalSaved) || 0 : 0,
                goalsTarget: summary.goals ? parseFloat(summary.goals.totalTarget) || 0 : 0,
                byCategory: (Array.isArray(categories) ? categories : []).map(c => ({
                    category: c.category || c.categoryName || 'Other',
                    amount: parseFloat(c.monthlyAmount) || 0,
                    color: CATEGORY_COLORS[c.category || c.categoryName] || CATEGORY_COLORS.Other
                })),
                monthlyTrend: (Array.isArray(trend) ? trend : []).map(t => parseFloat(t.spent) || 0),
                trendLabels: (Array.isArray(trend) ? trend : []).map(t => {
                    if (!t.month) return '';
                    const parts = t.month.split('-');
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return months[parseInt(parts[1]) - 1] || t.month;
                }),
                topMerchants: (() => {
                    const cats = Array.isArray(categories) ? categories : [];
                    const grand = cats.reduce((s, c) => s + (parseFloat(c.monthlyAmount) || 0), 0);
                    return cats.map(c => {
                        const amt = parseFloat(c.monthlyAmount) || 0;
                        return {
                            name: c.category || c.categoryName || 'Other',
                            total: amt,
                            // Share of total monthly subscription spend.
                            pct: grand > 0 ? Math.round((amt / grand) * 100) : 0
                        };
                    });
                })(),
                // "Where your money goes" — real spending outflows by purpose
                // (allowances, task rewards, subscriptions) for the period.
                spending: {
                    total: parseFloat(spending.total) || 0,
                    items: (Array.isArray(spending.breakdown) ? spending.breakdown : []).map(b => ({
                        label: b.label || 'Other',
                        amount: parseFloat(b.amount) || 0,
                        pct: b.pct || 0
                    }))
                }
            };

            _renderWithData(data);
        } catch (err) {
            console.error('Analytics fetch error:', err);
            // Render empty state
            _renderWithData({
                totalSpent: 0, totalIncome: 0, riskScore: 0,
                byCategory: [], monthlyTrend: [], trendLabels: [],
                topMerchants: [], spending: { total: 0, items: [] }
            });
        }
    }

    function _renderWithData(data) {
        renderStats(data);
        renderDonut(data);
        renderBarChart(data);
        renderMerchants(data);
        renderSpending(data);
    }

    /* ── Summary strip ─────────────────────────────────────── */

    // Escape text destined for innerHTML (card backs include dynamic labels).
    function _esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // Build one flippable stat card. `back` is HTML describing the calc.
    function _statCard(label, value, valueClass, backHtml) {
        return `
            <div class="analytics-stat-card" tabindex="0" role="button" aria-label="${_esc(label)} — click to see how it's calculated">
                <div class="analytics-stat-inner">
                    <div class="analytics-stat-face analytics-stat-front">
                        <p class="analytics-stat-label">${_esc(label)}</p>
                        <p class="analytics-stat-value ${valueClass}">${value}</p>
                    </div>
                    <div class="analytics-stat-face analytics-stat-back">
                        <div class="analytics-stat-calc">${backHtml}</div>
                    </div>
                </div>
            </div>`;
    }

    function renderStats(data) {
        const el = document.getElementById('analytics-stats');
        if (!el) return;

        // Determine risk level label and color
        var riskClass = '';
        if (data.riskScore <= 30) { riskClass = 'positive'; }
        else if (data.riskScore <= 55) { riskClass = ''; }
        else { riskClass = 'negative'; }

        var goalProgress = data.goalProgressRate || 0;
        var goalClass = goalProgress >= 50 ? 'positive' : (goalProgress < 20 ? 'negative' : '');

        // ── Card-back explanations ──
        // Period phrase matches the active range tab (this month / last month /
        // the last 3 months) so the wording reflects the window actually shown.
        const period = _rangePhrase();

        const spentBack = `
            <p>Money spent in ${period} — <strong>allowances, task rewards and subscriptions</strong>.</p>
            <p class="analytics-stat-formula">= ${formatRand(data.totalSpent)}</p>`;

        const incomeBack = `
            <p>Sum of wallet <strong>credits</strong> (top-ups) in ${period}.</p>
            <p class="analytics-stat-formula">= ${formatRand(data.totalIncome)}</p>`;

        const goalBack = `
            <p>Progress across all your goals.</p>
            <p class="analytics-stat-formula">Saved ÷ Target × 100</p>
            <p class="analytics-stat-formula">${formatRand(data.goalsSaved)} ÷ ${formatRand(data.goalsTarget)} = ${goalProgress}%</p>`;

        // Risk card back — show the four-factor model when the stored score is
        // available, otherwise explain the fallback.
        let riskBack;
        if (data.riskStored) {
            const b = data.riskBreakdown || {};
            const fmtPct = v => (v === null || v === undefined) ? '—' : Math.round(v) + '%';
            riskBack = `
                <ul class="analytics-stat-list">
                    <li><span>Subscription efficiency</span><span>${fmtPct(b.subscriptionPct)}</span></li>
                    <li><span>Budget discipline</span><span>${fmtPct(b.budgetPct)}</span></li>
                    <li><span>Goal progress</span><span>${fmtPct(b.savingsPct)}</span></li>
                    <li><span>Cash cushion</span><span>${fmtPct(b.bufferPct)}</span></li>
                </ul>
                <p class="analytics-stat-formula">Risk = 100 − (avg of the four) = ${data.riskScore}/100</p>`;
        } else {
            riskBack = `
                <p>Not yet computed from the full model — showing a fallback based on ${period}.</p>
                <p class="analytics-stat-formula">Risk = Spent ÷ Income × 100 = ${data.riskScore}/100</p>`;
        }

        el.innerHTML =
            _statCard('Total Spent',  formatRand(data.totalSpent),  '',            spentBack) +
            _statCard('Total Income', formatRand(data.totalIncome), 'positive',    incomeBack) +
            _statCard('Goal Progress', goalProgress + '%',          goalClass,     goalBack) +
            _statCard('Risk Score',   data.riskScore + '/100',      riskClass,     riskBack);

        _bindStatFlips(el);
    }

    // Click a card to flip; click again to flip back.
    function _bindStatFlips(container) {
        container.querySelectorAll('.analytics-stat-card').forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('flipped');
            });
            // Keyboard: Enter/Space toggles, Escape flips back.
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.classList.toggle('flipped');
                } else if (e.key === 'Escape') {
                    card.classList.remove('flipped');
                }
            });
        });
    }

    /* ── Donut chart (SVG) ─────────────────────────────────── */
    function renderDonut(data) {
        const svgEl = document.getElementById('analytics-donut-svg');
        const legendEl = document.getElementById('analytics-donut-legend');
        const centerEl = document.getElementById('analytics-donut-total');
        if (!svgEl || !legendEl) return;

        const total = data.byCategory.reduce((s, c) => s + c.amount, 0);
        const r = 72;
        const circumference = 2 * Math.PI * r;
        let offset = 0;

        // Clear existing segments (keep base circle)
        svgEl.querySelectorAll('.analytics-donut-segment').forEach(s => s.remove());

        data.byCategory.forEach((cat, i) => {
            const pct = cat.amount / total;
            const dash = pct * circumference;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '100');
            circle.setAttribute('cy', '100');
            circle.setAttribute('r', String(r));
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', cat.color);
            circle.setAttribute('stroke-width', '30');
            circle.setAttribute('stroke-dasharray', `${dash} ${circumference - dash}`);
            circle.setAttribute('stroke-dashoffset', String(-offset));
            circle.setAttribute('class', 'analytics-donut-segment');
            circle.setAttribute('data-category', cat.category);
            circle.style.transform = 'rotate(-90deg)';
            circle.style.transformOrigin = '50% 50%';
            circle.addEventListener('click', () => toggleCategory(cat.category));
            svgEl.appendChild(circle);
            offset += dash;
        });

        // Center text
        if (centerEl) centerEl.textContent = formatRand(total);

        // Legend
        legendEl.innerHTML = data.byCategory.map(cat => `
            <li class="analytics-legend-item${activeCategory === cat.category ? ' active' : ''}" data-category="${cat.category}">
                <span class="analytics-legend-dot" style="background:${cat.color}"></span>
                <span>${cat.category}</span>
                <span class="analytics-legend-amount">${formatRand(cat.amount)}</span>
            </li>
        `).join('');

        // Legend click events
        legendEl.querySelectorAll('.analytics-legend-item').forEach(item => {
            item.addEventListener('click', () => toggleCategory(item.dataset.category));
        });

        applyHighlighting();
    }

    /* ── Bar chart (monthly trend) ────────────────────────── */
    function renderBarChart(data) {
        const el = document.getElementById('analytics-bar-chart');
        if (!el) return;

        if (!data.monthlyTrend || data.monthlyTrend.length === 0) {
            el.innerHTML = '<p style="padding:24px;text-align:center;color:var(--text-light);">No trend data yet.</p>';
            return;
        }

        const max = Math.max(...data.monthlyTrend);
        const labels = data.trendLabels || data.monthlyTrend.map((_, i) => 'M' + (i + 1));

        el.innerHTML = data.monthlyTrend.map((val, i) => {
            const heightPct = max > 0 ? (val / max) * 100 : 0;
            return `
                <div class="analytics-bar-col">
                    <span class="analytics-bar-value">${formatRand(val)}</span>
                    <div class="analytics-bar" style="height:${heightPct}%" data-index="${i}"></div>
                    <span class="analytics-bar-label">${labels[i] || ''}</span>
                </div>
            `;
        }).join('');
    }

    /* ── Top merchants table ──────────────────────────────── */
    function renderMerchants(data) {
        const el = document.getElementById('analytics-merchants-body');
        if (!el) return;

        el.innerHTML = data.topMerchants.map(m => `
            <tr>
                <td>
                    <div class="merchant-row">
                        <span class="merchant-initial">${m.name.charAt(0)}</span>
                        <span>${m.name}</span>
                    </div>
                </td>
                <td>${formatRand(m.total)}</td>
                <td><span class="merchant-count">${m.pct}%</span></td>
            </tr>
        `).join('');
    }

    /* ── Where Your Money Goes (spending breakdown) ───────── */
    // Distinct colour per spending purpose; bars are sized to each slice's
    // share of total spending so they read as a proportional breakdown.
    const SPENDING_COLORS = {
        'Allowances':    'var(--blue)',
        'Task Rewards':  'var(--green)',
        'Subscriptions': 'var(--orange)',
        'Other':         'var(--text-light)'
    };

    function renderSpending(data) {
        const el = document.getElementById('analytics-spending');
        if (!el) return;

        const spending = data.spending || { total: 0, items: [] };
        const items = Array.isArray(spending.items) ? spending.items : [];

        if (items.length === 0 || spending.total <= 0) {
            el.innerHTML = '<p class="spend-empty">No spending in this period.</p>';
            return;
        }

        const rows = items.map(item => {
            const color = SPENDING_COLORS[item.label] || SPENDING_COLORS.Other;
            return `
                <div class="spend-row">
                    <div class="spend-row-top">
                        <span class="spend-label">${item.label}</span>
                        <span class="spend-value">${formatRand(item.amount)}<span class="spend-pct">${item.pct}%</span></span>
                    </div>
                    <div class="spend-track">
                        <div class="spend-fill" style="width:${item.pct}%;background:${color}"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Total footer makes the reconciliation to the Total Spent card explicit.
        const footer = `
            <div class="spend-total">
                <span>Total</span>
                <span>${formatRand(spending.total)}</span>
            </div>`;

        el.innerHTML = rows + footer;
    }

    /* ── Donut click → filter/highlight ───────────────────── */
    function toggleCategory(cat) {
        activeCategory = activeCategory === cat ? null : cat;
        applyHighlighting();
        // Re-render legend to update active class
        const legendEl = document.getElementById('analytics-donut-legend');
        if (legendEl) {
            legendEl.querySelectorAll('.analytics-legend-item').forEach(item => {
                item.classList.toggle('active', item.dataset.category === activeCategory);
            });
        }
    }

    function applyHighlighting() {
        // Donut segments
        document.querySelectorAll('.analytics-donut-segment').forEach(seg => {
            seg.classList.remove('dimmed', 'highlighted');
            if (activeCategory) {
                if (seg.dataset.category === activeCategory) {
                    seg.classList.add('highlighted');
                } else {
                    seg.classList.add('dimmed');
                }
            }
        });

        // Bar chart — when a category is active, dim bars (visual indication)
        document.querySelectorAll('.analytics-bar').forEach(bar => {
            bar.classList.remove('dimmed', 'highlighted');
            if (activeCategory) {
                bar.classList.add('dimmed');
            }
        });
    }

    /* ── Export CSV ────────────────────────────────────────── */
    function exportCSV() {
        // Re-fetch and export
        const range = _rangeToApiParam();
        Promise.all([
            API.Analytics.getSummary(range),
            API.Analytics.getByCategory(range),
            API.Analytics.getSpendingBreakdown(range)
        ]).then(([summaryRes, categoryRes, spendingRes]) => {
            const summary = summaryRes.success ? summaryRes.data : {};
            const categories = categoryRes.success ? (Array.isArray(categoryRes.data) ? categoryRes.data : []) : [];
            const spending = spendingRes.success ? (spendingRes.data || { total: 0, breakdown: [] }) : { total: 0, breakdown: [] };
            const spendItems = Array.isArray(spending.breakdown) ? spending.breakdown : [];

            let csv = 'Category,Monthly Amount\n';
            categories.forEach(c => {
                csv += `${c.category || c.categoryName},${c.monthlyAmount}\n`;
            });

            // Where your money goes — real spending outflows by purpose,
            // scoped to the selected period. Sums to Total Spent.
            csv += `\nSpending Breakdown,Amount,% of Total\n`;
            spendItems.forEach(b => {
                csv += `${b.label},${b.amount},${b.pct}%\n`;
            });
            csv += `Total Spending,${spending.total || 0},100%\n`;

            csv += `\nSummary\nTotal Spent,${summary.totalSpent || 0}\nTotal Income,${summary.totalIncome || 0}\nGoal Progress,${summary.goalProgressRate || 0}%\nRisk Score,${summary.riskScore != null ? summary.riskScore : 'N/A'}\nMonthly Subscription Cost,${summary.monthlyCost || 0}\n`;

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `flexscribe-analytics-${currentRange}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }).catch(err => console.error('Export error:', err));
    }

    /* ── Event wiring ─────────────────────────────────────── */
    function bindEvents() {
        // Range tabs
        document.querySelectorAll('.analytics-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.analytics-range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentRange = btn.dataset.range;
                activeCategory = null;
                render();
            });
        });

        // Export button
        const exportBtn = document.getElementById('analytics-export-btn');
        if (exportBtn) exportBtn.addEventListener('click', exportCSV);
    }

    /* ── Public init (idempotent) ─────────────────────────── */
    let initialized = false;

    function init() {
        if (!initialized) {
            bindEvents();
            initialized = true;
        }
        // Always re-render on panel show, defaulting to the current month.
        currentRange = 'thisMonth';
        activeCategory = null;
        // Reset active tab UI
        document.querySelectorAll('.analytics-range-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === 'thisMonth');
        });
        render();
    }

    return { init };
})();
