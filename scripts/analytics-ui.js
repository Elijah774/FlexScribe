/* =============================================================
   analytics-ui.js  — Analytics panel UI logic
   Self-contained with inline seed data. No backend file needed.
============================================================= */

const AnalyticsUI = (() => {
    'use strict';

    /* ── Seed Data ─────────────────────────────────────────── */
    const ANALYTICS_DATA = {
        thisMonth: {
            totalSpent: 8450,
            totalIncome: 18500,
            savingsRate: 54,
            byCategory: [
                { category: 'Entertainment', amount: 2800, color: 'var(--orange)' },
                { category: 'Shopping', amount: 1950, color: 'var(--blue)' },
                { category: 'Utilities', amount: 1400, color: '#22c55e' },
                { category: 'Productivity', amount: 1200, color: 'var(--purple)' },
                { category: 'Other', amount: 1100, color: 'var(--text-light)' }
            ],
            monthlyTrend: [6200, 7100, 5800, 8900, 7400, 8450],
            topMerchants: [
                { name: 'Netflix', total: 1194, count: 6 },
                { name: 'Pick n Pay', total: 2850, count: 12 },
                { name: 'Woolworths', total: 1600, count: 8 },
                { name: 'Uber Eats', total: 1420, count: 15 },
                { name: 'Spotify', total: 360, count: 6 }
            ],
            budgets: [
                { category: 'Entertainment', budget: 3000, actual: 2800 },
                { category: 'Shopping', budget: 2000, actual: 1950 },
                { category: 'Utilities', budget: 1500, actual: 1400 },
                { category: 'Dining', budget: 1200, actual: 1420 }
            ]
        },
        lastMonth: {
            totalSpent: 7400,
            totalIncome: 15000,
            savingsRate: 51,
            byCategory: [
                { category: 'Entertainment', amount: 2400, color: 'var(--orange)' },
                { category: 'Shopping', amount: 2100, color: 'var(--blue)' },
                { category: 'Utilities', amount: 1300, color: '#22c55e' },
                { category: 'Productivity', amount: 900, color: 'var(--purple)' },
                { category: 'Other', amount: 700, color: 'var(--text-light)' }
            ],
            monthlyTrend: [5800, 6200, 7100, 5800, 8900, 7400],
            topMerchants: [
                { name: 'Netflix', total: 199, count: 1 },
                { name: 'Pick n Pay', total: 2600, count: 10 },
                { name: 'Woolworths', total: 1400, count: 7 },
                { name: 'Uber Eats', total: 1800, count: 18 },
                { name: 'Amazon', total: 950, count: 3 }
            ],
            budgets: [
                { category: 'Entertainment', budget: 3000, actual: 2400 },
                { category: 'Shopping', budget: 2000, actual: 2100 },
                { category: 'Utilities', budget: 1500, actual: 1300 },
                { category: 'Dining', budget: 1200, actual: 1800 }
            ]
        },
        last3Months: {
            totalSpent: 24250,
            totalIncome: 49500,
            savingsRate: 51,
            byCategory: [
                { category: 'Entertainment', amount: 8100, color: 'var(--orange)' },
                { category: 'Shopping', amount: 6050, color: 'var(--blue)' },
                { category: 'Utilities', amount: 4100, color: '#22c55e' },
                { category: 'Productivity', amount: 3500, color: 'var(--purple)' },
                { category: 'Other', amount: 2500, color: 'var(--text-light)' }
            ],
            monthlyTrend: [6200, 7100, 5800, 8900, 7400, 8450],
            topMerchants: [
                { name: 'Netflix', total: 597, count: 3 },
                { name: 'Pick n Pay', total: 7500, count: 32 },
                { name: 'Woolworths', total: 4200, count: 20 },
                { name: 'Uber Eats', total: 4800, count: 45 },
                { name: 'Spotify', total: 180, count: 3 }
            ],
            budgets: [
                { category: 'Entertainment', budget: 9000, actual: 8100 },
                { category: 'Shopping', budget: 6000, actual: 6050 },
                { category: 'Utilities', budget: 4500, actual: 4100 },
                { category: 'Dining', budget: 3600, actual: 4800 }
            ]
        }
    };

    const MONTH_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let currentRange = 'thisMonth';
    let activeCategory = null; // currently highlighted donut segment

    /* ── Helpers ───────────────────────────────────────────── */
    function formatRand(n) {
        return 'R' + n.toLocaleString('en-ZA');
    }

    function getData() {
        return ANALYTICS_DATA[currentRange];
    }

    /* ── Render all sections ───────────────────────────────── */
    function render() {
        const data = getData();
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
                <p class="analytics-stat-label">Net Savings Rate</p>
                <p class="analytics-stat-value positive">${data.savingsRate}%</p>
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

        const max = Math.max(...data.monthlyTrend);

        el.innerHTML = data.monthlyTrend.map((val, i) => {
            const heightPct = (val / max) * 100;
            return `
                <div class="analytics-bar-col">
                    <span class="analytics-bar-value">${formatRand(val)}</span>
                    <div class="analytics-bar" style="height:${heightPct}%" data-index="${i}"></div>
                    <span class="analytics-bar-label">${MONTH_LABELS[i]}</span>
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
        const data = getData();
        let csv = 'Category,Amount,Budget,Actual\n';

        // Category spending
        data.byCategory.forEach(c => {
            csv += `${c.category},${c.amount},,\n`;
        });

        csv += '\nMerchant,Total,Transactions\n';
        data.topMerchants.forEach(m => {
            csv += `${m.name},${m.total},${m.count}\n`;
        });

        csv += '\nBudget Category,Budget,Actual,Percentage\n';
        data.budgets.forEach(b => {
            const pct = Math.round((b.actual / b.budget) * 100);
            csv += `${b.category},${b.budget},${b.actual},${pct}%\n`;
        });

        csv += `\nSummary\nTotal Spent,${data.totalSpent}\nTotal Income,${data.totalIncome}\nSavings Rate,${data.savingsRate}%\n`;
        csv += `\nMonthly Trend\n`;
        MONTH_LABELS.forEach((label, i) => {
            csv += `${label},${data.monthlyTrend[i]}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flexscribe-analytics-${currentRange}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
