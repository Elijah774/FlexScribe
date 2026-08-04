/* =============================================================
   FlexScribe — Reports UI Layer
   scripts/reports-ui.js

   Handles interactivity for the Reports panel:
   • Generate Report button (simulated)
   • File upload zone (drag & drop + click)
   • Table search/filter
   • Period selector date range update
   • Trends chart tooltip on hover
============================================================= */

'use strict';

const ReportsUI = (() => {

    let _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        _initGenerateBtn();
        _initUploadZone();
        _initTableSearch();
        _initTableFilter();
        _initPeriodSelector();
        _initTrendsTooltip();
    }

    /* ----------------------------------------------------------
       GENERATE REPORT
    ---------------------------------------------------------- */
    function _initGenerateBtn() {
        const btn = document.getElementById('rpt-generate-btn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const original = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="rpt-spinner"></span> Generating...';
            btn.style.opacity = '0.7';

            setTimeout(() => {
                btn.innerHTML = original;
                btn.disabled = false;
                btn.style.opacity = '1';

                if (typeof UIUtils !== 'undefined') {
                    UIUtils.toast('Report generated successfully!', 'success');
                }

                // Update stats
                const countEl = document.getElementById('rpt-stat-count');
                if (countEl) {
                    const current = parseInt(countEl.textContent) || 12;
                    countEl.textContent = current + 1;
                }
            }, 2000);
        });
    }

    /* ----------------------------------------------------------
       FILE UPLOAD ZONE
    ---------------------------------------------------------- */
    function _initUploadZone() {
        const zone = document.getElementById('rpt-upload-zone');
        const fileInput = document.getElementById('rpt-file-input');
        const chooseBtn = document.getElementById('rpt-choose-file-btn');
        if (!zone || !fileInput) return;

        // Click to upload
        if (chooseBtn) {
            chooseBtn.addEventListener('click', () => fileInput.click());
        }
        zone.addEventListener('click', (e) => {
            if (e.target !== chooseBtn) fileInput.click();
        });

        // Drag and drop
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length) _handleUpload(files[0]);
        });

        // File input change
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) _handleUpload(fileInput.files[0]);
        });
    }

    function _handleUpload(file) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowed = ['.pdf', '.csv', '.xlsx'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();

        if (!allowed.includes(ext)) {
            if (typeof UIUtils !== 'undefined') UIUtils.toast('Unsupported file type. Use PDF, CSV or Excel.', 'error');
            return;
        }
        if (file.size > maxSize) {
            if (typeof UIUtils !== 'undefined') UIUtils.toast('File too large. Max 10MB.', 'error');
            return;
        }

        // Simulate upload
        if (typeof UIUtils !== 'undefined') UIUtils.toast('Uploading ' + file.name + '...', 'success');

        setTimeout(() => {
            if (typeof UIUtils !== 'undefined') UIUtils.toast('Upload complete! AI is analysing...', 'success');
        }, 1500);
    }

    /* ----------------------------------------------------------
       TABLE SEARCH
    ---------------------------------------------------------- */
    function _initTableSearch() {
        const input = document.getElementById('rpt-table-search-input');
        const tbody = document.getElementById('rpt-table-body');
        if (!input || !tbody) return;

        input.addEventListener('input', () => {
            const query = input.value.trim().toLowerCase();
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    /* ----------------------------------------------------------
       TABLE FILTER
    ---------------------------------------------------------- */
    function _initTableFilter() {
        const filter = document.getElementById('rpt-table-filter');
        const tbody = document.getElementById('rpt-table-body');
        if (!filter || !tbody) return;

        filter.addEventListener('change', () => {
            const val = filter.value.toLowerCase();
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                if (val === 'all reports') {
                    row.style.display = '';
                } else {
                    const type = row.querySelectorAll('td')[1];
                    if (type) {
                        row.style.display = type.textContent.toLowerCase().includes(val) ? '' : 'none';
                    }
                }
            });
        });
    }

    /* ----------------------------------------------------------
       PERIOD SELECTOR — updates date range text
    ---------------------------------------------------------- */
    function _initPeriodSelector() {
        const select = document.getElementById('rpt-period');
        const rangeEl = document.getElementById('rpt-date-range');
        if (!select || !rangeEl) return;

        select.addEventListener('change', () => {
            const now = new Date();
            let start, end;

            switch (select.value) {
                case 'This Month':
                    start = new Date(now.getFullYear(), now.getMonth(), 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    break;
                case 'Last Month':
                    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    end = new Date(now.getFullYear(), now.getMonth(), 0);
                    break;
                case 'Last 3 Months':
                    start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    break;
                case 'Last 6 Months':
                    start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    break;
                case 'This Year':
                    start = new Date(now.getFullYear(), 0, 1);
                    end = new Date(now.getFullYear(), 11, 31);
                    break;
                default:
                    start = new Date(now.getFullYear(), now.getMonth(), 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            }

            const fmt = (d) => {
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return String(d.getDate()).padStart(2, '0') + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
            };

            rangeEl.textContent = fmt(start) + ' - ' + fmt(end);
        });
    }

    /* ----------------------------------------------------------
       TRENDS CHART TOOLTIP
    ---------------------------------------------------------- */
    function _initTrendsTooltip() {
        const chart = document.getElementById('rpt-trends-chart');
        const tooltip = document.getElementById('rpt-chart-tooltip');
        if (!chart || !tooltip) return;

        const svg = chart.querySelector('.rpt-trends-svg');
        if (!svg) return;

        const data = [
            { month: "Feb '25", spending: 'R22,100', savings: 'R3,800' },
            { month: "Mar '25", spending: 'R24,300', savings: 'R4,100' },
            { month: "Apr '25", spending: 'R23,600', savings: 'R4,400' },
            { month: "May '25", spending: 'R26,800', savings: 'R4,800' },
            { month: "Jun '25", spending: 'R25,900', savings: 'R5,000' },
            { month: "Jul '25", spending: 'R28,540', savings: 'R5,200' },
        ];

        const dots = svg.querySelectorAll('circle[fill="var(--orange)"]');
        dots.forEach((dot, i) => {
            dot.style.cursor = 'pointer';
            dot.addEventListener('mouseenter', () => {
                tooltip.hidden = false;
                tooltip.querySelector('.rpt-tooltip-month').textContent = data[i].month;
                tooltip.querySelectorAll('.rpt-tooltip-val')[0].textContent = 'Spending: ' + data[i].spending;
                tooltip.querySelectorAll('.rpt-tooltip-val')[1].textContent = 'Savings: ' + data[i].savings;
            });
            dot.addEventListener('mouseleave', () => {
                tooltip.hidden = true;
            });
        });
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({ init });

})();
