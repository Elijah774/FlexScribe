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
        _loadPageData();
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
                if (e.dataTransfer.files.length > 0) {
                    var file = e.dataTransfer.files[0];
                    // Reject folders (they have no type and typically size 0)
                    if (!file.type && file.size === 0) {
                        _showToast('Folders cannot be uploaded. Please select a file.', 'error');
                        return;
                    }
                    _uploadFile(file);
                }
            });
        }
    }

    async function _uploadFile(file) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'pdf' && ext !== 'csv' && ext !== 'xlsx') {
            _showToast('Only PDF, CSV, and Excel (.xlsx) files are accepted.', 'error');
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

                // Show detected subscriptions as suggestions
                if (data.subscriptionsDetected && data.subscriptionsDetected.length > 0) {
                    _showSubscriptionSuggestions(data.subscriptionsDetected);
                }
            } else {
                var msg = result.error || result.data?.message || 'Upload failed.';
                _showToast(msg, 'error');
                _resetUploadZone(uploadZone, msg);
            }
        } catch (err) {
            _showToast('Could not connect to server.', 'error');
            _resetUploadZone(uploadZone, 'Connection error. Is the server running?');
        }
    }

    /* ----------------------------------------------------------
       SUBSCRIPTION SUGGESTIONS (after bank statement upload)
    ---------------------------------------------------------- */
    function _showSubscriptionSuggestions(subscriptions) {
        // Find or create the suggestions container
        var container = document.getElementById('rpt-sub-suggestions');
        if (!container) {
            // Create it below the upload card
            var uploadCard = document.querySelector('.rpt-upload-card');
            if (!uploadCard) return;
            container = document.createElement('div');
            container.id = 'rpt-sub-suggestions';
            container.className = 'rpt-insights-card';
            container.style.marginTop = '16px';
            uploadCard.parentNode.insertBefore(container, uploadCard.nextSibling);
        }

        // Filter out subscriptions the user already has
        var existingNames = [];
        if (typeof SubscriptionStore !== 'undefined') {
            existingNames = SubscriptionStore.getAll().map(function(s) { return s.name.toLowerCase().trim(); });
        }

        var suggestions = subscriptions.filter(function(sub) {
            var name = (sub.name || '').toLowerCase().trim();
            // Remove common bank prefixes for comparison
            var cleaned = name.replace(/^(pos\s*|debit\s*order\s*|recurring\s*|eft\s*|payment\s*to\s*)/i, '').trim();
            return !existingNames.some(function(existing) {
                return existing.includes(cleaned) || cleaned.includes(existing);
            });
        });

        if (suggestions.length === 0) {
            container.innerHTML = '<h3 class="rpt-card-title">Detected Subscriptions</h3><p style="color:var(--text-light);font-size:13px;">All detected subscriptions are already in your list.</p>';
            return;
        }

        var html = '<h3 class="rpt-card-title">Detected Subscriptions (' + suggestions.length + ')</h3>';
        html += '<p class="rpt-card-sub" style="margin-bottom:12px;">We found these recurring charges in your statement. Add them to track automatically.</p>';
        html += '<div class="rpt-sub-suggest-list">';

        suggestions.forEach(function(sub, idx) {
            var name = sub.name || 'Unknown';
            var amount = sub.averageAmount || 0;
            var confidence = sub.confidence || 'medium';
            var occurrences = sub.occurrences || 0;
            var badge = confidence === 'high' ? '<span style="background:var(--green);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;">HIGH</span>' : '<span style="background:var(--orange);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;margin-left:6px;">LIKELY</span>';

            html += '<div class="rpt-sub-suggest-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">';
            html += '<div style="flex:1;">';
            html += '<p style="font-weight:600;font-size:14px;color:var(--text);margin:0;">' + _escHtml(name) + badge + '</p>';
            html += '<p style="font-size:12px;color:var(--text-light);margin:2px 0 0;">R' + amount.toFixed(2) + '/mo · ' + occurrences + ' occurrence' + (occurrences > 1 ? 's' : '') + ' detected</p>';
            html += '</div>';
            html += '<button class="rpt-choose-file-btn" style="padding:6px 14px;font-size:12px;white-space:nowrap;" onclick="ReportsUI.addDetectedSubscription(' + idx + ')">Add</button>';
            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;

        // Store suggestions for the add handler
        window._detectedSubscriptions = suggestions;
    }

    function _addDetectedSubscription(idx) {
        var suggestions = window._detectedSubscriptions || [];
        var sub = suggestions[idx];
        if (!sub) return;

        var name = (sub.name || '').replace(/^(pos\s*|debit\s*order\s*|recurring\s*|eft\s*|payment\s*to\s*)/i, '').trim();
        // Capitalize first letter of each word
        name = name.replace(/\b\w/g, function(c) { return c.toUpperCase(); });

        // Determine category from the transaction category or name
        var category = _guessCategory(name);

        // Calculate next billing date (roughly 1 month from now)
        var nextDate = new Date();
        nextDate.setMonth(nextDate.getMonth() + 1);
        var nextDateStr = nextDate.toISOString().slice(0, 10);

        // Add via the subscription store (async)
        if (typeof SubscriptionStore !== 'undefined') {
            SubscriptionStore.add({
                name: name,
                amount: sub.averageAmount || 0,
                category: category,
                billingCycle: 'monthly',
                nextPaymentDate: nextDateStr,
                notes: 'Detected from bank statement upload',
                logoClass: 'default',
                logoText: name.charAt(0).toUpperCase()
            }).then(function() {
                _showToast(name + ' added to subscriptions!', 'success');

                // Remove from suggestions list
                suggestions.splice(idx, 1);
                window._detectedSubscriptions = suggestions;
                if (suggestions.length > 0) {
                    _showSubscriptionSuggestions(suggestions);
                } else {
                    var container = document.getElementById('rpt-sub-suggestions');
                    if (container) container.innerHTML = '<h3 class="rpt-card-title">Detected Subscriptions</h3><p style="color:var(--green);font-size:13px;">All subscriptions have been added.</p>';
                }
            }).catch(function(err) {
                _showToast(err.message || 'Could not add subscription.', 'error');
            });
        } else {
            _showToast('Subscription store not available.', 'error');
        }
    }

    function _guessCategory(name) {
        var n = name.toLowerCase();
        if (/netflix|disney|showmax|youtube|hbo|dstv|hulu|amazon prime/.test(n)) return 'Entertainment';
        if (/spotify|apple music|audible|soundcloud/.test(n)) return 'Music';
        if (/microsoft|adobe|canva|github|notion|slack|zoom|chatgpt|grammarly/.test(n)) return 'Productivity';
        if (/gym|virgin active|planet fitness|crossfit/.test(n)) return 'Fitness';
        if (/vodacom|mtn|telkom|cell c|rain|internet/.test(n)) return 'Utilities';
        if (/takealot|amazon|mr price/.test(n)) return 'Shopping';
        if (/discovery|momentum|liberty|outsurance|santam|miway/.test(n)) return 'Health';
        if (/nordvpn|expressvpn|surfshark|dropbox|icloud|google one/.test(n)) return 'Utilities';
        if (/playstation|xbox|nintendo|steam/.test(n)) return 'Gaming';
        return 'Other';
    }

    function _escHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _resetUploadZone(zone, errorMsg) {
        if (!zone) return;
        zone.innerHTML =
            '<p style="color:var(--danger);margin-bottom:10px;font-size:13px;">' + (errorMsg || 'Upload failed.') + '</p>' +
            '<svg viewBox="0 0 24 24" fill="none" width="32" height="32"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<p>Drag &amp; drop file here</p>' +
            '<span>or</span>' +
            '<button class="rpt-choose-file-btn" onclick="document.getElementById(\'rpt-file-input\').click()">Choose File</button>';
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

        // Store data for export and add download button
        window._lastReportData = data;
        var existingBtn = document.getElementById('rpt-download-csv-btn');
        if (!existingBtn) {
            var headerDiv = body.parentElement.querySelector('div[style*="justify-content"]');
            if (headerDiv) {
                var dlBtn = document.createElement('button');
                dlBtn.id = 'rpt-download-csv-btn';
                dlBtn.textContent = 'Download CSV';
                dlBtn.style.cssText = 'background:var(--orange);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;margin-right:12px;';
                dlBtn.onclick = function() { _exportReportCSV(window._lastReportData); };
                headerDiv.insertBefore(dlBtn, headerDiv.lastElementChild);
            }
        }
    }

    /* ----------------------------------------------------------
       EXPORT REPORT AS CSV
    ---------------------------------------------------------- */
    function _exportReportCSV(data) {
        if (!data) { _showToast('No report data to export.', 'error'); return; }

        var lines = [];
        var now = new Date().toISOString().slice(0, 10);

        // Header
        lines.push('FlexScribe Financial Report');
        lines.push('Generated,' + now);

        // Period
        var periodStr = '';
        if (data.period) periodStr = data.period.start + ' to ' + data.period.end;
        else if (data.periodStart) periodStr = data.periodStart + ' to ' + (data.periodEnd || now);
        if (periodStr) lines.push('Period,' + periodStr);
        if (data.reportType) lines.push('Type,' + data.reportType);
        lines.push('');

        // Summary
        var income = data.totalIncome || 0;
        var expenses = data.totalExpenses || data.totalWithdrawals || 0;
        var net = data.netCashFlow !== undefined ? data.netCashFlow : (data.savings !== undefined ? data.savings : income - expenses);
        lines.push('SUMMARY');
        lines.push('Total Income,R' + income.toFixed(2));
        lines.push('Total Expenses,R' + expenses.toFixed(2));
        lines.push('Net Cash Flow,R' + net.toFixed(2));
        if (data.walletBalance !== undefined) lines.push('Wallet Balance,R' + data.walletBalance.toFixed(2));
        if (data.totalSubscriptionCost !== undefined || data.subscriptionImpact !== undefined) {
            lines.push('Subscription Cost (monthly),R' + (data.subscriptionImpact || data.totalSubscriptionCost || 0).toFixed(2));
        }
        if (data.scribeScore !== undefined) lines.push('Scribe Score,' + data.scribeScore);
        if (data.riskLevel || data.financialStatus) lines.push('Risk Level,' + (data.riskLevel || data.financialStatus));
        lines.push('');

        // Categories
        if (data.categories && data.categories.length > 0) {
            lines.push('SPENDING BY CATEGORY');
            lines.push('Category,Amount');
            data.categories.forEach(function(c) {
                lines.push('"' + (c.category || c.name || '') + '",R' + (c.amount || 0).toFixed(2));
            });
            lines.push('');
        }

        // Goals
        if (data.goals && data.goals.length > 0) {
            lines.push('GOALS PROGRESS');
            lines.push('Goal,Target,Saved,Progress');
            data.goals.forEach(function(g) {
                lines.push('"' + g.name + '",R' + (g.target || 0).toFixed(2) + ',R' + (g.saved || 0).toFixed(2) + ',' + (g.pct || 0) + '%');
            });
            lines.push('');
        }

        // Monthly breakdown
        var monthly = data.monthlyBreakdown;
        if (monthly && typeof monthly === 'object' && Object.keys(monthly).length > 0) {
            lines.push('MONTHLY BREAKDOWN');
            lines.push('Month,Income,Expenses,Net');
            Object.keys(monthly).sort().forEach(function(m) {
                var row = monthly[m];
                var mIncome = (row.income || 0);
                var mExpenses = (row.expenses || 0);
                var mNet = mIncome - mExpenses;
                lines.push(m + ',R' + mIncome.toFixed(2) + ',R' + mExpenses.toFixed(2) + ',R' + mNet.toFixed(2));
            });
            lines.push('');
        }

        // Transactions
        var txs = data.transactions || [];
        if (txs.length > 0) {
            lines.push('TRANSACTIONS (' + txs.length + ')');
            lines.push('Date,Description,Type,Amount');
            txs.forEach(function(t) {
                var amt = t.amount || 0;
                var type = t.type || (amt >= 0 ? 'credit' : 'debit');
                var desc = (t.description || '').replace(/"/g, '""');
                lines.push((t.date || '') + ',"' + desc + '",' + type + ',R' + Math.abs(amt).toFixed(2));
            });
        }

        // Build CSV and trigger download
        var csv = lines.join('\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'FlexScribe-Report-' + now + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        _showToast('Report downloaded as CSV.', 'success');
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
       LOAD LIVE DATA INTO PAGE SECTIONS
       Fetches from wallet transactions, subscriptions, reports
       list, and bank statement data to populate the reports
       dashboard sections with real data instead of placeholders.
    ---------------------------------------------------------- */
    async function _loadPageData() {
        if (typeof API === 'undefined') return;

        // --- Stats strip: spending, savings, report count ---
        try {
            var walletResult = await API.Wallet.getHistory('30d');
            if (walletResult.success && Array.isArray(walletResult.data)) {
                var txs = walletResult.data;
                var spending = 0, income = 0;
                txs.forEach(function(t) {
                    var amt = Math.abs(t.amountCents || t.amount || 0);
                    if (t.type === 'debit' || t.type === 'transfer') spending += amt;
                    if (t.type === 'credit') income += amt;
                });
                // Convert cents to Rands if needed
                if (spending > 10000) { spending = spending / 100; income = income / 100; }
                var savings = income - spending;
                var spendEl = document.getElementById('rpt-stat-spending');
                var saveEl = document.getElementById('rpt-stat-savings');
                if (spendEl) spendEl.textContent = 'R' + spending.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                if (saveEl) saveEl.textContent = 'R' + Math.max(0, savings).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            }
        } catch(e) {}

        // --- Reports count from reports list ---
        try {
            var reportsResult = await API.Reports.getAll();
            if (reportsResult.success && Array.isArray(reportsResult.data)) {
                var reports = reportsResult.data;
                var countEl = document.getElementById('rpt-stat-count');
                if (countEl) countEl.textContent = reports.length;
                _renderReportsTable(reports);
            }
        } catch(e) {}

        // --- Scribe Score ---
        try {
            var userResult = await API.Auth.getUser();
            if (userResult.success && userResult.data) {
                var score = userResult.data.scribeScore || 0;
                var accEl = document.getElementById('rpt-stat-accuracy');
                var accSub = document.getElementById('rpt-stat-accuracy-sub');
                if (accEl) accEl.textContent = score;
                if (accSub) {
                    if (score >= 80) accSub.textContent = 'Excellent';
                    else if (score >= 50) accSub.textContent = 'Good';
                    else if (score > 0) accSub.textContent = 'Building';
                    else accSub.textContent = '--';
                }
            }
        } catch(e) {}

        // --- Spending breakdown from subscriptions ---
        try {
            if (typeof SubscriptionStore !== 'undefined') {
                var stats = SubscriptionStore.getStats();
                if (stats.byCategory && stats.byCategory.length > 0) {
                    _renderDonut(stats.byCategory, stats.monthly);
                    _renderTopCategories(stats.byCategory);
                }
            }
        } catch(e) {}

        // --- Bank statement analysis ---
        try {
            var stmtResult = await API.BankStatements.getReport();
            if (stmtResult.success && stmtResult.data) {
                var d = stmtResult.data.data || stmtResult.data;
                if (d && d.statementID) {
                    _renderAnalysis(d);
                    _renderRecentUploads(d);
                }
            }
        } catch(e) {}
    }

    /* ----------------------------------------------------------
       RENDER HELPERS FOR LIVE DATA
    ---------------------------------------------------------- */
    function _renderReportsTable(reports) {
        var tbody = document.getElementById('rpt-table-body');
        if (!tbody) return;
        if (reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:24px;">No reports generated yet. Use the form above to compile your first report.</td></tr>';
            return;
        }
        tbody.innerHTML = reports.map(function(r) {
            var start = r.startDate || '';
            var end = r.endDate || '';
            var period = start + ' to ' + end;
            return '<tr>' +
                '<td>Financial Report (' + end + ')</td>' +
                '<td>Detailed</td>' +
                '<td>' + period + '</td>' +
                '<td>' + end + '</td>' +
                '<td class="rpt-actions-cell"><button class="rpt-icon-btn" title="View" onclick="ReportsUI._viewReport(' + r.id + ')"><svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg></button></td>' +
                '</tr>';
        }).join('');
    }

    function _renderDonut(categories, totalMonthly) {
        var donut = document.getElementById('rpt-donut');
        var valueEl = document.getElementById('rpt-donut-value');
        var legend = document.getElementById('rpt-breakdown-legend');
        if (!donut || !legend) return;

        var total = totalMonthly || categories.reduce(function(s, c) { return s + (c.amount || 0); }, 0);
        if (valueEl) valueEl.textContent = 'R' + total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        var colors = ['#FF7A29', '#6FDB8F', '#A77CFF', '#FFB65C', '#E36565', '#94969D', '#7C4DFF'];
        var circumference = 2 * Math.PI * 72; // 452.4
        var offset = 0;
        var slicesHtml = '<circle cx="100" cy="100" r="72" fill="none" stroke="var(--border)" stroke-width="28"/>';
        var legendHtml = '';

        categories.forEach(function(cat, i) {
            var pct = total > 0 ? (cat.amount / total) : 0;
            var dash = pct * circumference;
            var color = colors[i % colors.length];
            slicesHtml += '<circle cx="100" cy="100" r="72" fill="none" stroke="' + color + '" stroke-width="28" stroke-dasharray="' + dash.toFixed(1) + ' ' + circumference.toFixed(1) + '" stroke-dashoffset="' + (-offset).toFixed(1) + '" transform="rotate(-90 100 100)"/>';
            offset += dash;
            legendHtml += '<li><span class="rpt-dot" style="background:' + color + '"></span>' + cat.category + '<span class="rpt-leg-amt">R' + (cat.amount || 0).toFixed(0) + '</span><span class="rpt-leg-pct">' + (pct * 100).toFixed(1) + '%</span></li>';
        });

        donut.innerHTML = slicesHtml;
        legend.innerHTML = legendHtml || '<li style="color:var(--text-light)">No spending data yet.</li>';
    }

    function _renderTopCategories(categories) {
        var list = document.getElementById('rpt-topcats-list');
        if (!list) return;
        var colors = ['#FF7A29', '#6FDB8F', '#A77CFF', '#FFB65C', '#E36565'];
        var total = categories.reduce(function(s, c) { return s + (c.amount || 0); }, 0);
        list.innerHTML = categories.slice(0, 5).map(function(cat, i) {
            var pct = total > 0 ? ((cat.amount / total) * 100).toFixed(1) : '0.0';
            return '<li><span class="rpt-cat-dot" style="background:' + colors[i % colors.length] + '"></span><span class="rpt-cat-name">' + cat.category + '</span><span class="rpt-cat-amt">R' + (cat.amount || 0).toFixed(0) + '</span><span class="rpt-cat-pct">' + pct + '%</span></li>';
        }).join('');
    }

    function _renderAnalysis(data) {
        var container = document.getElementById('rpt-analysis-result');
        if (!container) return;
        var statusIcon = '<svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="var(--green)" stroke-width="2" stroke-linecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        container.innerHTML =
            '<div class="rpt-analysis-status">' + statusIcon + '<div><strong>Analysis Complete</strong><p class="rpt-analysis-file">Uploaded: ' + (data.fileReference || 'Bank Statement') + '<br>' + (data.uploadDate || '') + ' &middot; ' + (data.transactionCount || 0) + ' Transactions</p></div></div>' +
            '<div class="rpt-analysis-metrics">' +
                '<div class="rpt-metric"><span class="rpt-metric-val">R' + ((data.totalIncome || 0).toFixed(0)) + '</span><span class="rpt-metric-label">Total Income</span></div>' +
                '<div class="rpt-metric"><span class="rpt-metric-val">R' + ((data.totalExpenses || 0).toFixed(0)) + '</span><span class="rpt-metric-label">Total Expenses</span></div>' +
                '<div class="rpt-metric"><span class="rpt-metric-val">' + (data.transactionCount || 0) + '</span><span class="rpt-metric-label">Transactions</span></div>' +
                '<div class="rpt-metric"><span class="rpt-metric-val">' + (data.financialStatus || '--') + '</span><span class="rpt-metric-label">Status</span></div>' +
            '</div>';
    }

    function _renderRecentUploads(data) {
        var container = document.getElementById('rpt-recent-uploads');
        if (!container || !data.fileReference) return;
        container.innerHTML = '<h4>Recent Uploads</h4>' +
            '<div class="rpt-upload-item"><span>' + data.fileReference + '</span><span class="rpt-upload-date">' + (data.uploadDate || '') + '</span><span class="rpt-upload-status complete">Complete &#10003;</span></div>';
    }

    /* ----------------------------------------------------------
       PUBLIC
    ---------------------------------------------------------- */
    return Object.freeze({ init: init, _viewReport: function() {}, addDetectedSubscription: _addDetectedSubscription });

})();
