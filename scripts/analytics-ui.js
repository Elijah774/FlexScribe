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
        Utilities:     '#22c55e',
        Fitness:       '#f43f5e',
        News:          '#06b6d4',
        Gaming:        '#a855f7',
        Health:        '#ec4899',
        AI:            '#14b8a6',
        Other:         'var(--text-light)',
    };

    let currentRange = '30d';
    let activeCategory = null;

    /* ── Helpers ───────────────────────────────────────────── */
    function formatRand(n) {
        return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function _rangeToApiParam() {
        switch (currentRange) {
            case 'thisMonth': return '30d';
            case 'lastMonth': return '30d';
            case 'last3Months': return '90d';
            default: return currentRange;
        }
    }

    /* ── Render all sections from API ─────────────────────── */
    async function render() {
        const range = _rangeToApiParam();

        try {
            // Fetch all analytics data in parallel
            const [summaryRes, categoryRes, trendRes] = await Promise.all([
                API.Analytics.getSummary(range),
                API.Analytics.getByCategory(range),
                API.Analytics.getTrend('6m')
            ]);

            const summary = summaryRes.success ? summaryRes.data : {};
            const categories = categoryRes.success ? categoryRes.data : [];
            const trend = trendRes.success ? trendRes.data : [];

            // Build data object compatible with render functions
            const data = {
                totalSpent: parseFloat(summary.totalSpent) || 0,
                totalIncome: parseFloat(summary.totalIncome) || 0,
                savingsRate: summary.savingsRate || 0,
                goalProgressRate: summary.goalProgressRate || 0,
                riskScore: summary.savingsRate !== undefined ? Math.max(0, 100 - summary.savingsRate) : 50,
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
                topMerchants: (Array.isArray(categories) ? categories : []).map(c => ({
                    name: c.category || c.categoryName || 'Other',
                    total: parseFloat(c.monthlyAmount) || 0,
                    count: c.count || 0
                })),
                budgets: (Array.isArray(categories) ? categories : []).map(c => ({
                    category: c.category || c.categoryName || 'Other',
                    budget: (parseFloat(c.monthlyAmount) || 0) * 1.2,
                    actual: parseFloat(c.monthlyAmount) || 0
                }))
            };

            _renderWithData(data);
        } catch (err) {
            console.error('Analytics fetch error:', err);
            // Render empty state
            _renderWithData({
                totalSpent: 0, totalIncome: 0, riskScore: 0,
                byCategory: [], monthlyTrend: [], trendLabels: [],
                topMerchants: [], budgets: []
            });
        }
    }

    function _renderWithData(data) {
        renderStats(data);
        renderDonut(data);
        renderBarChart(data);
        renderMerchants(data);
        renderBudgets(data);
    }

    /* ── Summary strip ─────────────────────────────────────── */
    function renderStats(data) {
        const el = document.getElementById('analytics-stats');
        if (!el) return;
        // Determine risk level label and color
        var riskLabel = 'Moderate';
        var riskClass = '';
        if (data.riskScore <= 30) { riskLabel = 'Low'; riskClass = 'positive'; }
        else if (data.riskScore <= 55) { riskLabel = 'Moderate'; riskClass = ''; }
        else { riskLabel = 'High'; riskClass = 'negative'; }

        var savingsRate = data.savingsRate || 0;
        var savingsClass = savingsRate >= 20 ? 'positive' : (savingsRate < 10 ? 'negative' : '');

        var goalProgress = data.goalProgressRate || 0;
        var goalClass = goalProgress >= 50 ? 'positive' : (goalProgress < 20 ? 'negative' : '');

        el.innerHTML = `
            <div class="analytics-stat-card">
                <p class="analytics-stat-label">Total Spent</p>
                <p class="analytics-stat-value">${formatRand(data.totalSpent)}</p>
            </div>
            <div class="analytics-stat-card">
                <p class="analytics-stat-label">Total Income</p>
                <p class="analytics-stat-value positive">${formatRand(data.totalIncome)}</p>
            </div>
            <div class="analytics-stat-card">
                <p class="analytics-stat-label">Savings Rate</p>
                <p class="analytics-stat-value ${savingsClass}">${savingsRate}%</p>
            </div>
            <div class="analytics-stat-card">
                <p class="analytics-stat-label">Goal Progress</p>
                <p class="analytics-stat-value ${goalClass}">${goalProgress}%</p>
            </div>
            <div class="analytics-stat-card">
                <p class="analytics-stat-label">Risk Score</p>
                <p class="analytics-stat-value ${riskClass}">${data.riskScore}/100</p>
            </div>
        `;
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
                <td><span class="merchant-count">${m.count} txns</span></td>
            </tr>
        `).join('');
    }

    /* ── Budget vs Actual bars ────────────────────────────── */
    function renderBudgets(data) {
        const el = document.getElementById('analytics-budgets');
        if (!el) return;

        el.innerHTML = data.budgets.map(b => {
            const pct = Math.min((b.actual / b.budget) * 100, 100);
            let colorClass = 'green';
            if (pct >= 80) colorClass = 'red';
            else if (pct >= 60) colorClass = 'yellow';

            return `
                <div class="budget-row">
                    <div class="budget-row-header">
                        <span class="budget-category">${b.category}</span>
                        <span class="budget-amounts">${formatRand(b.actual)} / ${formatRand(b.budget)}</span>
                    </div>
                    <div class="budget-bar-track">
                        <div class="budget-bar-fill ${colorClass}" style="width:${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
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

        // Merchant table rows — highlight matching merchants (no exact match possible with seed data,
        // but we keep it ready). Currently no category mapping per merchant, so we skip actual filtering.
    }

    /* ── Export CSV ────────────────────────────────────────── */
    function exportCSV() {
        // Re-fetch and export
        const range = _rangeToApiParam();
        Promise.all([
            API.Analytics.getSummary(range),
            API.Analytics.getByCategory(range)
        ]).then(([summaryRes, categoryRes]) => {
            const summary = summaryRes.success ? summaryRes.data : {};
            const categories = categoryRes.success ? (Array.isArray(categoryRes.data) ? categoryRes.data : []) : [];

            let csv = 'Category,Monthly Amount,Subscription Count\n';
            categories.forEach(c => {
                csv += `${c.category || c.categoryName},${c.monthlyAmount},${c.count}\n`;
            });
            csv += `\nSummary\nTotal Spent,${summary.totalSpent || 0}\nTotal Income,${summary.totalIncome || 0}\nSavings Rate,${summary.savingsRate || 0}%\nMonthly Subscription Cost,${summary.monthlyCost || 0}\n`;

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
        // Always re-render on panel show
        currentRange = '30d';
        activeCategory = null;
        // Reset active tab UI
        document.querySelectorAll('.analytics-range-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === '30d' || btn.dataset.range === 'thisMonth');
        });
        render();
    }

    return { init };
})();
