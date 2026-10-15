window._pageContent = window._pageContent || {};
window._pageContent['subscription'] = `
                <!-- Actions bar -->
                <div class="sub-actions-bar">
                    <div class="sub-filters">
                        <button class="filter-status-btn filter-btn--active" data-status="all">All</button>
                        <button class="filter-status-btn" data-status="active">Active</button>
                        <button class="filter-status-btn" data-status="paused">Paused</button>
                    </div>
                    <div class="sub-actions-right">
                        <button class="secondary-btn sub-pay-month-btn" id="sub-pay-month-btn" aria-label="Pay subscriptions for this month">
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" stroke="currentColor" stroke-width="2"/></svg>
                            Pay this month
                        </button>
                        <button class="primary-btn add-sub-btn" id="add-sub-btn" aria-label="Add subscription">
                            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                            Add Subscription
                        </button>
                        <div class="sub-more-wrap">
                            <button class="icon-btn" id="sub-more-btn" aria-label="More options">
                                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
                            </button>
                            <div class="dropdown-menu sub-more-menu" id="sub-more-menu" hidden>
                                <button class="dropdown-menu-item" id="sub-export-btn">
                                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    Export CSV
                                </button>
                                <button class="dropdown-menu-item sort-btn" data-sort="amount">
                                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                    Sort by amount <span class="sort-arrow">↑</span>
                                </button>
                                <button class="dropdown-menu-item sort-btn" data-sort="name">
                                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                    Sort by name <span class="sort-arrow">↑</span>
                                </button>
                                <button class="dropdown-menu-item sort-btn sort-btn--active" data-sort="date">
                                    <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                    Sort by date <span class="sort-arrow">↑</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Category filter chips -->
                <div class="sub-cat-filter">
                    <button class="filter-cat-btn filter-btn--active" data-cat="all">All</button>
                    <button class="filter-cat-btn" data-cat="Entertainment">Entertainment</button>
                    <button class="filter-cat-btn" data-cat="Music">Music</button>
                    <button class="filter-cat-btn" data-cat="Shopping">Shopping</button>
                    <button class="filter-cat-btn" data-cat="Productivity">Productivity</button>
                    <button class="filter-cat-btn" data-cat="Education">Education</button>
                    <button class="filter-cat-btn" data-cat="Utilities">Utilities</button>
                    <button class="filter-cat-btn" data-cat="Gaming">Gaming</button>
                    <button class="filter-cat-btn" data-cat="Fitness">Fitness</button>
                    <button class="filter-cat-btn" data-cat="News">News</button>
                    <button class="filter-cat-btn" data-cat="Other">Other</button>
                </div>

                <!-- All subscriptions list (current/active subs at top) -->
                <div class="panel sub-list-panel">
                    <div class="panel-head">
                        <h3>Your Subscriptions</h3>
                    </div>
                    <ul class="sub-list" id="sub-list" aria-label="Subscriptions list">
                        <!-- Rendered by SubscriptionsUI -->
                    </ul>
                </div>

                <!-- Divider between current and available subscriptions -->
                <hr class="sub-section-divider">

                <!-- Available subscriptions (provider library) -->
                <div class="panel sub-library-panel">
                    <div class="panel-head sub-library-head">
                        <div class="sub-library-title">
                            <h3>Available Subscriptions</h3>
                            <button class="sub-library-toggle" id="provider-library-toggle" aria-expanded="true" aria-controls="provider-library-body" aria-label="Hide available subscriptions">
                                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                        <div class="sub-library-controls">
                            <div class="sub-library-search">
                                <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                <input type="text" id="provider-search" placeholder="Search providers..." autocomplete="off">
                            </div>
                            <select id="provider-sort-select" class="sub-library-sort" aria-label="Sort providers">
                                <option value="popularity">Popular</option>
                                <option value="price-asc">Price: Low to High</option>
                                <option value="price-desc">Price: High to Low</option>
                                <option value="name">Name</option>
                            </select>
                        </div>
                    </div>
                    <div class="sub-library-body" id="provider-library-body">
                        <div class="sub-library-cats" id="provider-cat-chips">
                            <button class="filter-cat-chip filter-btn--active" data-cat="all">All</button>
                            <button class="filter-cat-chip" data-cat="Entertainment">Entertainment</button>
                            <button class="filter-cat-chip" data-cat="Music">Music</button>
                            <button class="filter-cat-chip" data-cat="Shopping">Shopping</button>
                            <button class="filter-cat-chip" data-cat="Productivity">Productivity</button>
                            <button class="filter-cat-chip" data-cat="Education">Education</button>
                            <button class="filter-cat-chip" data-cat="Utilities">Utilities</button>
                            <button class="filter-cat-chip" data-cat="Gaming">Gaming</button>
                            <button class="filter-cat-chip" data-cat="Fitness">Fitness</button>
                            <button class="filter-cat-chip" data-cat="News">News</button>
                            <button class="filter-cat-chip" data-cat="Other">Other</button>
                        </div>
                        <div class="provider-grid" id="provider-grid" role="list" aria-label="Available providers">
                            <!-- Rendered by SubscriptionsUI -->
                        </div>
                    </div>
                </div>

                <!-- FAB (mobile + desktop) -->
                <button class="sub-fab" id="sub-fab" aria-label="Add subscription">
                    <svg viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                </button>

                <!-- ═══════════ ADD / EDIT SUBSCRIPTION MODAL ═══════════ -->
                <div id="sub-modal" class="sub-modal-backdrop sub-edit-modal" hidden aria-modal="true" role="dialog" aria-labelledby="sub-modal-title">
                    <div class="sub-modal-box">
                        <div class="sub-modal-header">
                            <h2 id="sub-modal-title">Edit subscription</h2>
                            <button class="sub-detail-close" id="sub-modal-close" aria-label="Close">
                                <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            </button>
                        </div>
                        <form id="sub-modal-form" novalidate>
                            <div class="sub-modal-body">
                                <!-- Error banner (save failure) -->
                                <div class="sub-modal-banner" id="sub-modal-banner" hidden role="alert"></div>

                                <div class="sub-modal-grid">
                                    <div class="sub-modal-field sub-modal-field--full">
                                        <label for="sub-modal-name">Service name <span class="required">*</span></label>
                                        <input type="text" id="sub-modal-name" placeholder="e.g. Netflix" autocomplete="off">
                                        <span class="sub-modal-field-error" id="sub-modal-name-error"></span>
                                    </div>
                                    <div class="sub-modal-field">
                                        <label for="sub-modal-amount">Amount (R) <span class="required">*</span></label>
                                        <input type="number" id="sub-modal-amount" placeholder="0.00" min="0" step="0.01">
                                        <span class="sub-modal-field-error" id="sub-modal-amount-error"></span>
                                    </div>
                                    <div class="sub-modal-field">
                                        <label for="sub-modal-cycle">Billing cycle</label>
                                        <select id="sub-modal-cycle">
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly" selected>Monthly</option>
                                            <option value="quarterly">Quarterly</option>
                                            <option value="yearly">Yearly</option>
                                        </select>
                                    </div>
                                    <div class="sub-modal-field">
                                        <label for="sub-modal-category">Category</label>
                                        <select id="sub-modal-category">
                                            <option>Entertainment</option>
                                            <option>Music</option>
                                            <option>Shopping</option>
                                            <option>Productivity</option>
                                            <option>Education</option>
                                            <option>Utilities</option>
                                            <option>Gaming</option>
                                            <option>Other</option>
                                        </select>
                                    </div>
                                    <div class="sub-modal-field">
                                        <label for="sub-modal-date">Next payment date</label>
                                        <input type="date" id="sub-modal-date">
                                        <span class="sub-modal-field-help" id="sub-modal-date-help" hidden></span>
                                        <span class="sub-modal-field-error" id="sub-modal-date-error"></span>
                                    </div>
                                    <div class="sub-modal-field sub-modal-field--full">
                                        <label for="sub-modal-notes">Notes</label>
                                        <textarea id="sub-modal-notes" rows="2" placeholder="Optional notes..."></textarea>
                                    </div>
                                </div>

                                <!-- Advanced options -->
                                <button type="button" class="sub-advanced-toggle" id="sub-advanced-toggle" aria-expanded="false" aria-controls="sub-advanced-body">
                                    <svg class="sub-advanced-chevron" viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    <span>Advanced options</span>
                                </button>
                                <div class="sub-advanced-body" id="sub-advanced-body">
                                    <div class="sub-modal-grid">
                                        <div class="sub-modal-field">
                                            <label for="sub-modal-logoclass">Logo colour</label>
                                            <select id="sub-modal-logoclass">
                                                <option value="default">Default</option>
                                                <option value="netflix">Red</option>
                                                <option value="spotify">Green</option>
                                                <option value="prime">Blue</option>
                                                <option value="disney">Purple</option>
                                                <option value="youtube">Orange</option>
                                            </select>
                                        </div>
                                        <div class="sub-modal-field">
                                            <label for="sub-modal-reminder">Reminder (days before)</label>
                                            <input type="number" id="sub-modal-reminder" placeholder="e.g. 3" min="0" max="30">
                                        </div>
                                        <div class="sub-modal-field sub-modal-field--full">
                                            <label>Colour tag</label>
                                            <div class="sub-colour-swatches" id="sub-colour-swatches">
                                                <button type="button" class="sub-swatch" data-colour="" style="background:transparent;border:1px dashed var(--border);" aria-label="No colour"></button>
                                                <button type="button" class="sub-swatch" data-colour="#FF7A29" style="background:#FF7A29;" aria-label="Orange"></button>
                                                <button type="button" class="sub-swatch" data-colour="#6FDB8F" style="background:#6FDB8F;" aria-label="Green"></button>
                                                <button type="button" class="sub-swatch" data-colour="#A77CFF" style="background:#A77CFF;" aria-label="Purple"></button>
                                                <button type="button" class="sub-swatch" data-colour="#E36565" style="background:#E36565;" aria-label="Red"></button>
                                            </div>
                                        </div>
                                        <div class="sub-modal-field sub-modal-field--full">
                                            <label for="sub-modal-provider-url">Provider URL</label>
                                            <input type="url" id="sub-modal-provider-url" placeholder="https://..." autocomplete="off">
                                        </div>
                                        <div class="sub-modal-field sub-modal-field--full">
                                            <label for="sub-modal-logo-upload">Custom logo</label>
                                            <input type="file" id="sub-modal-logo-upload" accept="image/*">
                                            <div class="sub-logo-preview" id="sub-logo-preview" hidden>
                                                <img id="sub-logo-preview-img" alt="Logo preview">
                                                <button type="button" class="sub-logo-remove-btn" id="sub-logo-remove-btn">Remove</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="sub-modal-footer">
                                <button type="button" class="sub-detail-btn sub-detail-btn--edit" id="sub-modal-cancel">Cancel</button>
                                <button type="submit" class="sub-detail-btn sub-detail-btn--toggle" id="sub-modal-save">
                                    <svg class="sub-save-check" viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    <span class="sub-save-label">Save changes</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- ═══════════ SUBSCRIPTION DETAILS MODAL ═══════════ -->
                <div id="sub-detail-modal" class="sub-detail-backdrop" hidden
                     role="dialog" aria-modal="true" aria-labelledby="sub-detail-title">
                    <div class="sub-detail-box" role="document">
                        <div class="sub-detail-header">
                            <h2 id="sub-detail-title">Subscription details</h2>
                            <button class="sub-detail-close" id="sub-detail-close" aria-label="Close">
                                <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            </button>
                        </div>
                        <div class="sub-detail-body">
                            <div class="sub-detail-top">
                                <div id="sub-detail-avatar" class="sub-detail-avatar" aria-hidden="true">—</div>
                                <div class="sub-detail-top-text">
                                    <h3 id="sub-detail-name" class="sub-detail-name">—</h3>
                                    <span id="sub-detail-status" class="sub-detail-badge">—</span>
                                </div>
                            </div>

                            <div class="sub-detail-card">
                                <div class="sub-detail-row">
                                    <span class="sub-detail-label">Amount</span>
                                    <span class="sub-detail-value" id="sub-detail-amount">—</span>
                                </div>
                                <div class="sub-detail-row">
                                    <span class="sub-detail-label">Billing cycle</span>
                                    <span class="sub-detail-value" id="sub-detail-cycle">—</span>
                                </div>
                                <div class="sub-detail-row">
                                    <span class="sub-detail-label">Monthly equivalent</span>
                                    <span class="sub-detail-value" id="sub-detail-monthly">—</span>
                                </div>
                                <div class="sub-detail-row">
                                    <span class="sub-detail-label">Category</span>
                                    <span class="sub-detail-value" id="sub-detail-cat">—</span>
                                </div>
                                <div class="sub-detail-row">
                                    <span class="sub-detail-label">Next payment</span>
                                    <span class="sub-detail-value" id="sub-detail-date">—</span>
                                </div>
                                <div class="sub-detail-row">
                                    <span class="sub-detail-label">Added</span>
                                    <span class="sub-detail-value" id="sub-detail-created">—</span>
                                </div>
                            </div>

                            <div class="sub-detail-notes" id="sub-detail-notes-wrap" hidden>
                                <span class="sub-detail-notes-label">Notes</span>
                                <p class="sub-detail-notes-text" id="sub-detail-notes">—</p>
                            </div>
                        </div>
                        <div class="sub-detail-footer">
                            <button class="sub-detail-btn sub-detail-btn--toggle" id="sub-detail-toggle-btn" type="button">
                                <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M5 3l14 9-14 9V3z" fill="currentColor"/></svg>
                                <span>Reactivate</span>
                            </button>
                            <button class="sub-detail-btn sub-detail-btn--edit" id="sub-detail-edit-btn" type="button">
                                <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                <span>Edit</span>
                            </button>
                            <button class="sub-detail-btn sub-detail-btn--delete" id="sub-detail-delete-btn" type="button">
                                <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ═══════════ PAUSE CONFIRMATION MODAL ═══════════ -->
                <div id="sub-pause-modal" class="sub-modal-backdrop" hidden aria-modal="true" role="dialog">
                    <div class="sub-modal-box sub-modal-box--sm">
                        <div class="sub-modal-header">
                            <h2>Pause Subscription</h2>
                            <button class="icon-btn" id="pause-modal-close" aria-label="Close">
                                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            </button>
                        </div>
                        <div class="sub-modal-body">
                            <p>Pause <strong id="pause-modal-name">this subscription</strong> (<span id="pause-modal-amount">—</span>)? You won't be billed while it's paused.</p>
                            <div class="sub-modal-field">
                                <label for="pause-modal-reason">Reason (optional)</label>
                                <input type="text" id="pause-modal-reason" placeholder="e.g. Taking a break" autocomplete="off">
                            </div>
                        </div>
                        <div class="sub-modal-footer">
                            <button type="button" class="sub-btn sub-btn--secondary" id="pause-modal-cancel">Cancel</button>
                            <button type="button" class="sub-btn sub-btn--primary" id="pause-modal-confirm">Pause</button>
                        </div>
                    </div>
                </div>

                <!-- ═══════════ DELETE CONFIRMATION MODAL ═══════════ -->
                <div id="sub-confirm-modal" class="sub-modal-backdrop" hidden aria-modal="true" role="dialog">
                    <div class="sub-modal-box sub-modal-box--sm">
                        <div class="sub-modal-header">
                            <h2 id="sub-confirm-title">Delete Subscription</h2>
                        </div>
                        <div class="sub-modal-body">
                            <p id="sub-confirm-body">Are you sure you want to delete this subscription? This cannot be undone.</p>
                        </div>
                        <div class="sub-modal-footer">
                            <button type="button" class="sub-btn sub-btn--secondary" id="sub-confirm-cancel">Cancel</button>
                            <button type="button" class="sub-btn sub-btn--danger" id="sub-confirm-ok">Delete</button>
                        </div>
                    </div>
                </div>

                <!-- ═══════════ PROVIDER QUICK-VIEW MODAL ═══════════ -->
                <div id="rec-quickview-modal" class="sub-modal-backdrop" hidden aria-modal="true" role="dialog"></div>

                <!-- ═══════════ ADD-FROM-PROVIDER MODAL ═══════════ -->
                <div id="rec-add-modal" class="sub-modal-backdrop" hidden aria-modal="true" role="dialog">
                    <div class="sub-modal-box sub-modal-box--sm">
                        <div class="sub-modal-header">
                            <h2>Add Subscription</h2>
                            <button class="icon-btn" id="rec-add-modal-close" aria-label="Close">
                                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            </button>
                        </div>
                        <div class="sub-modal-body" id="rec-add-body">
                            <p>Add this provider to your subscriptions?</p>
                        </div>
                        <div class="sub-modal-footer">
                            <button type="button" class="sub-btn sub-btn--secondary" id="rec-add-cancel-btn">Cancel</button>
                            <button type="button" class="sub-btn sub-btn--primary" id="rec-add-confirm-btn">Add</button>
                        </div>
                    </div>
                </div>
`;
