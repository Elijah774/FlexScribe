window._pageContent = window._pageContent || {};
window._pageContent['reports'] = `
                <!-- Stats Strip -->
                <div class="rpt-stats-strip">
                    <div class="rpt-stat-card">
                        <div class="rpt-stat-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="2"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-label">Reports Generated</span>
                            <span class="rpt-stat-value" id="rpt-stat-count">0</span>
                            <span class="rpt-stat-sub">This Year</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card">
                        <div class="rpt-stat-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 2v20M17 7l-5-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-label">Total Spending</span>
                            <span class="rpt-stat-value" id="rpt-stat-spending">R0.00</span>
                            <span class="rpt-stat-sub">This Month</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card">
                        <div class="rpt-stat-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-label">Monthly Savings</span>
                            <span class="rpt-stat-value" id="rpt-stat-savings">R0.00</span>
                            <span class="rpt-stat-sub">This Month</span>
                        </div>
                    </div>
                    <div class="rpt-stat-card">
                        <div class="rpt-stat-icon"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                        <div class="rpt-stat-info">
                            <span class="rpt-stat-label">Scribe Score</span>
                            <span class="rpt-stat-value" id="rpt-stat-accuracy">0</span>
                            <span class="rpt-stat-sub" id="rpt-stat-accuracy-sub">--</span>
                        </div>
                    </div>
                </div>

                <!-- Middle Row: Compile + AI Analysis + Upload -->
                <div class="rpt-middle-row">
                    <!-- Compile Financial Report -->
                    <div class="rpt-compile-card">
                        <h3 class="rpt-card-title">Compile Financial Report</h3>
                        <p class="rpt-card-sub">Generate a customised financial report for any period.</p>
                        <div class="rpt-compile-form">
                            <div class="rpt-compile-left">
                                <label class="rpt-form-label">Select Time Period</label>
                                <select id="rpt-period" class="rpt-select">
                                    <option>This Month</option>
                                    <option>Last Month</option>
                                    <option>Last 3 Months</option>
                                    <option>Last 6 Months</option>
                                    <option>This Year</option>
                                </select>
                                <span class="rpt-date-range" id="rpt-date-range"></span>
                                <label class="rpt-form-label" style="margin-top:12px">Report Type</label>
                                <select id="rpt-type" class="rpt-select">
                                    <option>Detailed Report</option>
                                    <option>Summary</option>
                                    <option>Quarterly</option>
                                </select>
                            </div>
                            <div class="rpt-compile-right">
                                <label class="rpt-form-label">Include in Report</label>
                                <div class="rpt-check-grid">
                                    <label class="rpt-check"><input type="checkbox" checked> Wallet Summary</label>
                                    <label class="rpt-check"><input type="checkbox" checked> Transactions</label>
                                    <label class="rpt-check"><input type="checkbox" checked> Subscriptions</label>
                                    <label class="rpt-check"><input type="checkbox" checked> Spending Categories</label>
                                    <label class="rpt-check"><input type="checkbox" checked> Goals Progress</label>
                                    <label class="rpt-check"><input type="checkbox" checked> AI Insights &amp; Recommendations</label>
                                    <label class="rpt-check"><input type="checkbox" checked> Dependants</label>
                                    <label class="rpt-check"><input type="checkbox" checked> Financial Health Score</label>
                                </div>
                            </div>
                        </div>
                        <button class="rpt-generate-btn" id="rpt-generate-btn">
                            Generate Report
                        </button>
                    </div>

                    <!-- Statement Analysis (AI) -->
                    <div class="rpt-ai-analysis-card">
                        <div class="rpt-card-title-row">
                            <h3 class="rpt-card-title">Statement Analysis (AI)</h3>
                            <span class="rpt-badge-new">New</span>
                        </div>
                        <p class="rpt-card-sub">Upload a bank statement to get AI analysis.</p>
                        <div class="rpt-analysis-result" id="rpt-analysis-result">
                            <p style="color:var(--text-light);font-size:13px;">No statement uploaded yet. Upload one to see analysis.</p>
                        </div>
                        <a href="#" class="rpt-link" onclick="return false">Review Detected Items &rarr;</a>
                    </div>
                </div>

                <!-- Right Column: Upload + AI Insights + Spending Breakdown -->
                <div class="rpt-right-col">
                    <!-- Upload Bank Statement -->
                    <div class="rpt-upload-card">
                        <div class="rpt-card-title-row">
                            <h3 class="rpt-card-title">Upload Bank Statement</h3>
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                        <p class="rpt-card-sub">Upload your bank statement and let AI extract your transactions, detect subscriptions and categorise your spending.</p>
                        <div class="rpt-upload-zone" id="rpt-upload-zone">
                            <svg viewBox="0 0 24 24" fill="none" width="32" height="32"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            <p>Drag &amp; drop file here</p>
                            <span>or</span>
                            <button class="rpt-choose-file-btn" id="rpt-choose-file-btn">Choose File</button>
                            <input type="file" id="rpt-file-input" accept=".pdf,.csv,.xlsx" hidden>
                        </div>
                        <p class="rpt-upload-hint">Supported: PDF, CSV, Excel (.xlsx) &middot; Max size: 10MB</p>
                        <div class="rpt-recent-uploads" id="rpt-recent-uploads">
                            <h4>Recent Uploads</h4>
                            <p style="color:var(--text-light);font-size:13px;">No uploads yet.</p>
                        </div>
                        <a href="#" class="rpt-link" onclick="return false">View all uploads &rarr;</a>
                        <button id="rpt-see-full-report-btn" style="display:none;margin-top:12px;width:100%;padding:12px;background:var(--orange);color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">See Full Report</button>
                    </div>

                    <!-- AI Financial Insights -->
                    <div class="rpt-insights-card">
                        <h3 class="rpt-card-title">AI Financial Insights</h3>
                        <p class="rpt-card-sub">Smart insights based on your financial behaviour.</p>
                        <ul class="rpt-insights-list" id="rpt-insights-list">
                            <li style="color:var(--text-light)">Generate a report to see personalised insights.</li>
                        </ul>
                        <a href="#" class="rpt-link" onclick="return false">View all insights &rarr;</a>
                    </div>

                    <!-- Spending Breakdown -->
                    <div class="rpt-breakdown-card">
                        <h3 class="rpt-card-title">Spending Breakdown</h3>
                        <div class="rpt-breakdown-content">
                            <div class="rpt-donut-wrap">
                                <svg viewBox="0 0 200 200" class="rpt-donut" id="rpt-donut">
                                    <circle cx="100" cy="100" r="72" fill="none" stroke="var(--border)" stroke-width="28"/>
                                </svg>
                                <div class="rpt-donut-center"><span class="rpt-donut-value" id="rpt-donut-value">R0</span><span class="rpt-donut-label">Total Spent</span></div>
                            </div>
                            <ul class="rpt-breakdown-legend" id="rpt-breakdown-legend">
                                <li style="color:var(--text-light)">No spending data yet.</li>
                            </ul>
                        </div>
                        <a href="#" class="rpt-link" onclick="loadPage('analytics');return false">View detailed analytics &rarr;</a>
                    </div>
                </div><!-- /rpt-right-col -->

                <!-- Generated Reports Table -->
                <div class="rpt-table-section">
                    <div class="rpt-table-header">
                        <div>
                            <h3 class="rpt-card-title">Generated Reports</h3>
                            <p class="rpt-card-sub">View, download and share your generated financial reports.</p>
                        </div>
                        <div class="rpt-table-actions">
                            <div class="rpt-table-search">
                                <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                <input type="text" placeholder="Search reports..." id="rpt-table-search-input">
                            </div>
                            <select class="rpt-select rpt-select-sm" id="rpt-table-filter">
                                <option>All Reports</option>
                                <option>Detailed</option>
                                <option>Summary</option>
                                <option>Quarterly</option>
                            </select>
                        </div>
                    </div>
                    <div class="rpt-table-wrap">
                        <table class="rpt-table" id="rpt-table">
                            <thead>
                                <tr>
                                    <th>Report Name</th>
                                    <th>Type</th>
                                    <th>Period</th>
                                    <th>Generated On</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="rpt-table-body">
                                <tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:24px;">No reports generated yet. Use the form above to compile your first report.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Bottom Grid Row -->
                <div class="rpt-bottom-grid">
                    <!-- Financial Health Score -->
                    <div class="rpt-health-card">
                        <div class="rpt-card-title-row"><h3 class="rpt-card-title">Financial Health Score</h3></div>
                        <div class="rpt-health-body">
                            <div class="rpt-health-ring-wrap">
                                <svg viewBox="0 0 160 160" class="rpt-health-ring">
                                    <circle cx="80" cy="80" r="65" fill="none" stroke="var(--border)" stroke-width="12"/>
                                    <circle cx="80" cy="80" r="65" fill="none" stroke="var(--green)" stroke-width="12" stroke-dasharray="408.4" stroke-dashoffset="408.4" stroke-linecap="round" transform="rotate(-90 80 80)" id="rpt-health-ring-fill"/>
                                </svg>
                                <div class="rpt-health-center"><span class="rpt-health-val" id="rpt-health-val">0%</span><span class="rpt-health-label" id="rpt-health-label">No data</span></div>
                            </div>
                            <ul class="rpt-health-legend" id="rpt-health-legend">
                                <li style="color:var(--text-light)">Generate a report to see your health score.</li>
                            </ul>
                        </div>
                        <a href="#" class="rpt-link" onclick="return false">View full report &rarr;</a>
                    </div>

                    <!-- Trends Over Time -->
                    <div class="rpt-trends-card">
                        <div class="rpt-card-title-row"><h3 class="rpt-card-title">Trends Over Time</h3></div>
                        <div class="rpt-trends-legend"><span class="rpt-dot" style="background:var(--orange)"></span>Spending <span class="rpt-dot" style="background:var(--green);margin-left:12px"></span>Savings</div>
                        <div class="rpt-trends-chart" id="rpt-trends-chart">
                            <svg viewBox="0 0 400 140" class="rpt-trends-svg" preserveAspectRatio="none" id="rpt-trends-svg">
                                <line x1="20" y1="130" x2="380" y2="130" stroke="var(--border)" stroke-width="0.5"/>
                                <text x="200" y="75" text-anchor="middle" fill="var(--text-light)" font-size="12">No trend data yet</text>
                            </svg>
                            <div class="rpt-chart-labels" id="rpt-chart-labels"></div>
                        </div>
                        <a href="#" class="rpt-link" onclick="loadPage('analytics');return false">View full analytics &rarr;</a>
                    </div>

                    <!-- Top Categories -->
                    <div class="rpt-topcats-card">
                        <div class="rpt-card-title-row"><h3 class="rpt-card-title">Top Categories</h3></div>
                        <ul class="rpt-topcats-list" id="rpt-topcats-list">
                            <li style="color:var(--text-light)">No category data yet.</li>
                        </ul>
                        <a href="#" class="rpt-link" onclick="return false">View all categories &rarr;</a>
                    </div>

                    <!-- Recommendations -->
                    <div class="rpt-recommendations-card">
                        <h3 class="rpt-card-title">Recommendations</h3>
                        <ul class="rpt-rec-list" id="rpt-rec-list">
                            <li class="rpt-rec-item" style="color:var(--text-light)">
                                <div class="rpt-rec-text">
                                    <p>Add subscriptions and generate a report to receive personalised recommendations.</p>
                                </div>
                            </li>
                        </ul>
                        <a href="#" class="rpt-link" onclick="return false">View all recommendations &rarr;</a>
                    </div>
                </div><!-- /rpt-bottom-grid -->

                <!-- Full Report Modal -->
                <div class="rpt-fullreport-modal" id="rpt-fullreport-modal" hidden style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.7);align-items:center;justify-content:center;padding:20px;display:none;">
                    <div style="background:var(--card);border:1px solid var(--border);border-radius:18px;width:100%;max-width:750px;max-height:85vh;overflow-y:auto;padding:28px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                            <h2 style="font-size:20px;color:var(--text);">Financial Report</h2>
                            <button id="rpt-fullreport-close" style="background:none;border:none;color:var(--text-light);font-size:24px;cursor:pointer;padding:4px 10px;border-radius:8px;">&times;</button>
                        </div>
                        <div id="rpt-fullreport-body"></div>
                    </div>
                </div>
`;
