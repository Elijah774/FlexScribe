/* =============================================================
   FlexScribe — Reports UI
   scripts/reports-ui.js
   Handles: Generate Report button, bank statement upload,
   and full report modal display.
============================================================= */

'use strict';

const ReportsUI = (() => {

    let _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        _bindGenerateReport();
        _bindUpload();
        _bindFullReportModal();
        _checkExistingReport();
    }

    /* ----------------------------------------------------------
       GENERATE REPORT
    ---------------------------------------------------------- */
    function _bindGenerateReport() {
        var btn = document.getElementById('rpt-generate-btn');
        if (!btn) return;

        btn.addEventListener('click', async function() {
            var period = document.getElementById('rpt-period')?.value || 'This Month';
            var reportType = document.getElementById('rpt-type')?.value || 'Detailed Report';

            btn.disabled = true;
            btn.textContent = 'Generating...';

            try {
                var result = await API.Reports.compile({ period: period, reportType: reportType });
                if (result.success) {
                    var data = result.data?.data || result.data;
                    _showToast('Report generated successfully!', 'success');
                    _showReportModal(data);
                } else {
                    var msg = result.error || result.data?.message || 'Failed to generate report.';
                    _showToast(msg, 'error');
                }
            } catch (err) {
                _showToast('Could not connect to server. Is the backend running?', 'error');
                console.error('Generate report error:', err);
            }

            btn.disabled = false;
            btn.textContent = 'Generate Report';
        });
    }

    /* ----------------------------------------------------------
       BANK STATEMENT UPLOAD
    ---------------------------------------------------------- */
    function _bindUpload() {
        var fileInput = document.getElementById('rpt-file-input');
        var chooseBtn = document.getElementById('rpt-choose-file-btn');
        var uploadZone = document.getElementById('rpt-upload-zone');

        if (chooseBtn && fileInput) {
            chooseBtn.addEventListener('click', function() { fileInput.click(); });
        }

        if (fileInput) {
            fileInput.addEventListener('change', function() {
                if (fileInput.files.length > 0) _uploadFile(fileInput.files[0]);
            });
        }

        if (uploadZone) {
            uploadZone.addEventListener('dragover', function(e) { e.preventDefault(); uploadZone.style.borderColor = 'var(--orange)'; });
            uploadZone.addEventListener('dragleave', function() { uploadZone.style.borderColor = ''; });
            uploadZone.addEventListener('drop', function(e) {
                e.preventDefault();
                uploadZone.style.borderColor = '';
                if (e.dataTransfer.files.length > 0) _uploadFile(e.dataTransfer.files[0]);
            });
        }
    }

    async function _uploadFile(file) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'pdf' && ext !== 'csv') {
            _showToast('Only PDF and CSV files are accepted.', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            _showToast('File too large. Max 10MB.', 'error');
            return;
        }

        var uploadZone = document.getElementById('rpt-upload-zone');
        if (uploadZone) uploadZone.innerHTML = '<p style="color:var(--orange)">Uploading and analysing...</p>';

        try {
            var result = await API.BankStatements.upload(file);
            if (result.success) {
                var data = result.data?.data || result.data;
                _showToast('Statement uploaded! +100 Scribe Points earned.', 'success');
                if (uploadZone) uploadZone.innerHTML = '<p style="color:var(--green)">&#10003; Upload complete: ' + file.name + '</p>';
                var seeBtn = document.getElementById('rpt-see-full-report-btn');
                if (seeBtn) seeBtn.style.display = 'block';
                window._lastStatementReport = data;
            } else {
                var msg = result.error || result.data?.message || 'Upload failed.';
                _showToast(msg, 'error');
                if (uploadZone) uploadZone.innerHTML = '<p style="color:var(--danger)">' + msg + '</p><button class="rpt-choose-file-btn" onclick="document.getElementById(\'rpt-file-input\').click()">Try Again</button>';
            }
        } catch (err) {
            _showToast('Could not connect to server.', 'error');
            if (uploadZone) uploadZone.innerHTML = '<p style="color:var(--danger)">Connection error</p>';
        }
    }

    /* ----------------------------------------------------------
       FULL REPORT MODAL
    ---------------------------------------------------------- */
    function _bindFullReportModal() {
        var seeBtn = document.getElementById('rpt-see-full-report-btn');
        var modal = document.getElementById('rpt-fullreport-modal');
        var closeBtn = document.getElementById('rpt-fullreport-close');

        if (seeBtn) {
            seeBtn.addEventListener('click', async function() {
                var data = window._lastStatementReport;
                if (!data) {
                    try {
                        var result = await API.BankStatements.getReport();
                        if (result.success && result.data) data = result.data?.data || result.data;
                    } catch(e) {}
                }
                if (!data) { _showToast('No report available. Upload a statement first.', 'error'); return; }
                _showReportModal(data);
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', function() { modal.hidden = true; modal.style.display = 'none'; });
            modal.addEventListener('click', function(e) { if (e.target === modal) { modal.hidden = true; modal.style.display = 'none'; } });
        }
    }

    function _showReportModal(data) {
        var modal = document.getElementById('rpt-fullreport-modal');
        var body = document.getElementById('rpt-fullreport-body');
        if (!modal || !body) return;

        var html = '';

        // Financial status
        var status = data.financialStatus || data.riskLevel || 'low';
        var statusMap = { safe: 'Financially Responsible', low: 'Financially Responsible', warning: 'Caution Advised', medium: 'Caution Advised', danger: 'Overspending', high: 'Overspending' };
        var classMap = { safe: 'safe', low: 'safe', warning: 'warning', medium: 'warning', danger: 'danger', high: 'danger' };
        html += '<div class="rpt-fr-status ' + (classMap[status] || 'safe') + '">' + (statusMap[status] || 'Low Risk') + '</div>';

        // Period
        var periodStr = '';
        if (data.period) periodStr = data.period.start + ' to ' + data.period.end;
        else if (data.periodStart) periodStr = data.periodStart + ' to ' + (data.periodEnd || 'now');
        if (periodStr) html += '<p style="font-size:12px;color:var(--text-light);margin-bottom:16px;">' + (data.reportType || '') + ' &middot; ' + periodStr + '</p>';

        // Stats
        var income = data.totalIncome || 0;
        var expenses = data.totalExpenses || data.totalWithdrawals || 0;
        var net = data.netCashFlow !== undefined ? data.netCashFlow : (data.savings !== undefined ? data.savings : income - expenses);
        html += '<div class="rpt-fr-stats">';
        html += '<div class="rpt-fr-stat"><span class="rpt-fr-stat-val">R' + income.toFixed(2) + '</span><span class="rpt-fr-stat-label">Total Income</span></div>';
        html += '<div class="rpt-fr-stat"><span class="rpt-fr-stat-val">R' + expenses.toFixed(2) + '</span><span class="rpt-fr-stat-label">Total Expenses</span></div>';
        html += '<div class="rpt-fr-stat"><span class="rpt-fr-stat-val" style="color:' + (net >= 0 ? 'var(--green)' : 'var(--danger)') + '">R' + net.toFixed(2) + '</span><span class="rpt-fr-stat-label">Net Cash Flow</span></div>';
        html += '</div>';

        // Subscription impact
        if (data.subscriptionImpact !== undefined || data.totalSubscriptionCost !== undefined) {
            var subCost = data.subscriptionImpact || data.totalSubscriptionCost || 0;
            html += '<div class="rpt-fr-impact"><p><strong>FlexScribe Subscriptions:</strong> R' + subCost.toFixed(2) + '/mo included in expenses.</p></div>';
        }

        // Wallet balance + Scribe Score
        if (data.walletBalance !== undefined || data.scribeScore !== undefined) {
            html += '<div class="rpt-fr-impact"><p>';
            if (data.walletBalance !== undefined) html += '<strong>Wallet Balance:</strong> R' + data.walletBalance.toFixed(2) + ' &middot; ';
            if (data.scribeScore !== undefined) html += '<strong>Scribe Score:</strong> ' + data.scribeScore;
            html += '</p></div>';
        }

        // Categories
        if (data.categories && data.categories.length > 0) {
            html += '<div class="rpt-fr-section"><h3>Spending by Category</h3>';
            data.categories.forEach(function(c) {
                html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>' + (c.category || c.name) + '</span><span style="font-weight:600">R' + (c.amount || 0).toFixed(2) + '</span></div>';
            });
            html += '</div>';
        }

        // Goals
        if (data.goals && data.goals.length > 0) {
            html += '<div class="rpt-fr-section"><h3>Goals Progress</h3>';
            data.goals.forEach(function(g) {
                html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>' + g.name + '</span><span style="font-weight:600">' + g.pct + '% (R' + (g.saved || 0).toFixed(2) + ' / R' + (g.target || 0).toFixed(2) + ')</span></div>';
            });
            html += '</div>';
        }

        // Monthly breakdown
        var monthly = data.monthlyBreakdown;
        if (monthly && typeof monthly === 'object' && Object.keys(monthly).length > 0) {
            html += '<div class="rpt-fr-section"><h3>Month-by-Month</h3><table class="rpt-fr-monthly-table"><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead><tbody>';
            Object.keys(monthly).sort().forEach(function(m) {
                var row = monthly[m];
                var mNet = (row.income || 0) - (row.expenses || 0);
                html += '<tr><td>' + m + '</td><td>R' + (row.income || 0).toFixed(2) + '</td><td>R' + (row.expenses || 0).toFixed(2) + '</td><td style="color:' + (mNet >= 0 ? 'var(--green)' : 'var(--danger)') + '">R' + mNet.toFixed(2) + '</td></tr>';
            });
            html += '</tbody></table></div>';
        }

        // Transactions
        var txs = data.transactions || [];
        if (txs.length > 0) {
            html += '<div class="rpt-fr-section"><h3>Transactions (' + (data.transactionCount || txs.length) + ')</h3><div class="rpt-fr-tx-list">';
            txs.slice(0, 50).forEach(function(t) {
                var amt = t.amount || 0;
                var cls = amt >= 0 ? 'credit' : 'debit';
                if (t.type === 'credit') cls = 'credit';
                if (t.type === 'debit') cls = 'debit';
                var sign = cls === 'credit' ? '+' : '-';
                html += '<div class="rpt-fr-tx-item"><div><span class="rpt-fr-tx-desc">' + (t.description || t.type || '') + '</span><br><span class="rpt-fr-tx-date">' + (t.date || '') + '</span></div><span class="rpt-fr-tx-amount ' + cls + '">' + sign + 'R' + Math.abs(amt).toFixed(2) + '</span></div>';
            });
            if (txs.length > 50) html += '<p style="text-align:center;color:var(--text-light);padding:8px;">...and ' + (txs.length - 50) + ' more</p>';
            html += '</div></div>';
        }

        body.innerHTML = html;
        modal.hidden = false;
        modal.style.display = 'flex';
    }

    /* ----------------------------------------------------------
       CHECK EXISTING REPORT ON LOAD
    ---------------------------------------------------------- */
    async function _checkExistingReport() {
        try {
            var result = await API.BankStatements.getReport();
            if (result.success && result.data) {
                var d = result.data?.data || result.data;
                if (d && d.statementID) {
                    window._lastStatementReport = d;
                    var seeBtn = document.getElementById('rpt-see-full-report-btn');
                    if (seeBtn) seeBtn.style.display = 'block';
                }
            }
        } catch(e) {
            // Silently ignore — user may not be logged in or backend not running
        }
    }

    /* ----------------------------------------------------------
       TOAST HELPER
    ---------------------------------------------------------- */
    function _showToast(msg, type) {
        if (typeof UIUtils !== 'undefined' && UIUtils.toast) {
            UIUtils.toast(msg, type);
        } else {
            alert(msg);
        }
    }

    /* ----------------------------------------------------------
       PUBLIC
    ---------------------------------------------------------- */
    return Object.freeze({ init: init });

})();
