window._pageContent = window._pageContent || {};
window._pageContent['wallet'] = `
                <!-- Balance Hero Card -->
                <div class="wallet-hero">
                    <div class="wallet-hero-info">
                        <p class="wallet-hero-label">Total Balance</p>
                        <h2 class="wallet-hero-balance" id="wallet-hero-balance">R0.00</h2>
                    </div>
                    <div class="wallet-virtual-card">
                        <div class="wallet-card-top">
                            <span class="wallet-card-logo">FlexScribe</span>
                            <div class="wallet-card-chip"></div>
                        </div>
                        <div class="wallet-card-bottom">
                            <p class="wallet-card-number">•••• •••• •••• 4829</p>
                            <p class="wallet-card-name" id="wallet-card-name">Card Holder</p>
                        </div>
                    </div>
                </div>

                <!-- Stat Cards -->
                <div class="wallet-stats">
                    <div class="wallet-stat-card">
                        <div class="wallet-stat-icon green">
                            <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 2v20M17 7l-5-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                        <p class="wallet-stat-label">Available Balance</p>
                        <p class="wallet-stat-value" id="wallet-stat-available">R0.00</p>
                    </div>
                    <div class="wallet-stat-card">
                        <div class="wallet-stat-icon blue">
                            <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 22V2M7 17l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                        <p class="wallet-stat-label">Pending In</p>
                        <p class="wallet-stat-value" id="wallet-stat-pending-in">R0.00</p>
                    </div>
                    <div class="wallet-stat-card">
                        <div class="wallet-stat-icon red">
                            <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M7 7l10 10M17 7l-10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        </div>
                        <p class="wallet-stat-label">Pending Out</p>
                        <p class="wallet-stat-value" id="wallet-stat-pending-out">R0.00</p>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="wallet-quick-actions">
                    <button class="wallet-action-btn" id="wallet-btn-add">
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                        Add Funds
                    </button>
                    <button class="wallet-action-btn" id="wallet-btn-withdraw">
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        Withdraw
                    </button>
                    <button class="wallet-action-btn" id="wallet-btn-transfer">
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M3 12h18M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        Transfer to Goal
                    </button>
                    <button class="wallet-action-btn" id="wallet-btn-send">
                        <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 3a4 4 0 110 8 4 4 0 010-8zM20 8v6M23 11h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        Send to Dependant
                    </button>
                </div>

                <!-- Recent Wallet Activity -->
                <div class="wallet-activity">
                    <div class="wallet-activity-header">
                        <h3 class="wallet-activity-title">Recent Wallet Activity</h3>
                    </div>
                    <ul class="wallet-activity-list" id="wallet-activity-list">
                        <!-- Rendered by WalletUI -->
                    </ul>
                </div>
`;
