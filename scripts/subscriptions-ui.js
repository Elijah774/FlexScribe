/* =============================================================
   FlexScribe — Subscriptions UI Layer
   scripts/subscriptions-ui.js

   Consumes SubscriptionStore (backend/subscriptions.js) and
   drives all DOM updates for the subscriptions panel:
   • Stat card re-render
   • Subscription list render (add / edit / delete / toggle)
   • Donut chart + legend re-render
   • Upcoming payments re-render
   • Add / Edit modal open-close-submit
   • Detail drawer open-close
   • Row kebab menus
   • Sort + filter toolbar
   • CSV export
   • FAB + header "+ Add" button
   • Toast notifications
============================================================= */

'use strict';

const SubscriptionsUI = (() => {

    /* ----------------------------------------------------------
       STATE
    ---------------------------------------------------------- */
    let _editingId   = null;   // id of sub currently in edit modal
    let _detailId    = null;   // id of sub in detail drawer
    let _sortKey     = 'date';
    let _sortDir     = 'asc';
    let _filterCat   = 'all';
    let _filterStatus = 'all'; // 'all' | 'active' | 'paused'
    let _currentCustomLogo = '';  // base64 logo string for modal
    let _currentColourTag  = '';  // selected colour hex for modal
    let _advancedOpen      = false; // advanced section state

    /* ----------------------------------------------------------
       DOM REFS  (resolved once on init)
    ---------------------------------------------------------- */
    let $;  // shorthand querySelector inside panel

    function _q(sel)  { return document.querySelector(sel); }
    function _qa(sel) { return document.querySelectorAll(sel); }

    /* ----------------------------------------------------------
       TOAST — delegates to UIUtils.toast (global utility)
    ---------------------------------------------------------- */
    function toast(msg, type = 'success') {
        if (typeof UIUtils !== 'undefined') {
            UIUtils.toast(msg, type);
        } else {
            // Fallback if ui-utils.js not loaded yet
            console.info(`[Toast:${type}] ${msg}`);
        }
    }

    /* ----------------------------------------------------------
       LOGO HELPER
    ---------------------------------------------------------- */
    const LOGO_CLASSES = ['netflix','spotify','disney','prime','youtube','apple','google','microsoft','default'];

    function _logoHtml(sub) {
        if (sub.customLogo) {
            return `<img class="sub-logo-img" src="${sub.customLogo}" alt="${_esc(sub.name)} logo">`;
        }
        const cls = LOGO_CLASSES.includes(sub.logoClass) ? sub.logoClass : 'default';
        const letter = sub.logoText || sub.name.charAt(0).toUpperCase();
        return `<span class="sub-logo ${cls}" aria-hidden="true">${letter}</span>`;
    }

    function _payLogoHtml(sub) {
        if (sub.customLogo) {
            return `<img class="sub-logo-img" src="${sub.customLogo}" alt="${_esc(sub.name)} logo" style="width:36px;height:36px;border-radius:9px;">`;
        }
        const cls = LOGO_CLASSES.includes(sub.logoClass) ? sub.logoClass : 'default';
        const letter = sub.logoText || sub.name.charAt(0).toUpperCase();
        return `<span class="pay-logo ${cls}" aria-hidden="true">${letter}</span>`;
    }

    function _recLogoHtml(provider) {
        const cls = LOGO_CLASSES.includes(provider.logoClass) ? provider.logoClass : 'default';
        const letter = provider.logoText || provider.name.charAt(0).toUpperCase();
        return `<span class="rec-card-logo sub-logo ${cls}" aria-hidden="true">${letter}</span>`;
    }

    /* ----------------------------------------------------------
       STAT CARDS
    ---------------------------------------------------------- */
    function _renderStats(stats) {
        const map = {
            'sub-stat-active':   stats.activeCount,
            'sub-stat-monthly':  stats.fmtMonthly,
            'sub-stat-annual':   stats.fmtAnnual,
            'sub-stat-savings':  stats.fmtSavings,
        };
        for (const [id, val] of Object.entries(map)) {
            const el = _q(`#${id}`);
            if (el) el.textContent = val;
        }
    }

    /* ----------------------------------------------------------
       DONUT CHART + LEGEND
    ---------------------------------------------------------- */
    const CIRCUMFERENCE = 2 * Math.PI * 72; // r=72

    function _renderDonut(stats) {
        const svg    = _q('#sub-donut-svg');
        const legend = _q('#sub-donut-legend');
        const center = _q('#sub-donut-value');
        if (!svg || !legend) return;

        if (center) center.textContent = stats.fmtMonthly;

        // Remove existing dynamic slices
        svg.querySelectorAll('.donut-slice').forEach(el => el.remove());

        let offset = 0;
        stats.byCategory.forEach(slice => {
            const dash = (slice.pct / 100) * CIRCUMFERENCE;
            const gap  = CIRCUMFERENCE - dash;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '100');
            circle.setAttribute('cy', '100');
            circle.setAttribute('r', '72');
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke', slice.color);
            circle.setAttribute('stroke-width', '30');
            circle.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${gap.toFixed(1)}`);
            circle.setAttribute('stroke-dashoffset', (-offset).toFixed(1));
            circle.setAttribute('transform', 'rotate(-90 100 100)');
            circle.classList.add('donut-slice');
            svg.appendChild(circle);
            offset += dash;
        });

        // Legend
        legend.innerHTML = stats.byCategory.map(slice => `
            <li>
                <span class="dot" style="background:${slice.color}"></span>
                <span class="leg-name">${slice.category}</span>
                <span class="leg-pct">${slice.pct}%</span>
            </li>`).join('');
    }

    /* ----------------------------------------------------------
       UPCOMING PAYMENTS LIST
    ---------------------------------------------------------- */
    function _renderUpcoming(stats) {
        const list = _q('#sub-upcoming-list');
        if (!list) return;

        if (!stats.upcoming.length) {
            list.innerHTML = `<li class="sub-empty-row">No payments in the next 30 days</li>`;
            return;
        }

        list.innerHTML = stats.upcoming.map(s => {
            const days = SubscriptionStore.daysUntil(s.nextPaymentDate);
            const label = days === 0 ? 'Today'
                        : days === 1 ? 'Tomorrow'
                        : `${SubscriptionStore.fmtDate(s.nextPaymentDate)}`;
            const urgent = days <= 3 ? 'pay-date--urgent' : '';
            return `
            <li class="pay-row">
                ${_payLogoHtml(s)}
                <div class="pay-info">
                    <p class="pay-title">${_esc(s.name)}</p>
                    <p class="pay-sub">${_esc(s.category)}</p>
                </div>
                <div class="pay-amount-col">
                    <p class="pay-price">${SubscriptionStore.fmtCurrency(s.amount)}</p>
                    <p class="pay-date ${urgent}">${label}</p>
                </div>
            </li>`;
        }).join('');
    }

    /* ----------------------------------------------------------
       SUBSCRIPTION LIST
    ---------------------------------------------------------- */
    function _getFiltered(all) {
        return all.filter(s => {
            const catOk    = _filterCat === 'all' || s.category === _filterCat;
            const statusOk = _filterStatus === 'all'
                           || (_filterStatus === 'active' && s.active)
                           || (_filterStatus === 'paused' && !s.active);
            return catOk && statusOk;
        });
    }

    function _renderList(stats) {
        const list = _q('#sub-list');
        if (!list) return;

        const filtered = _getFiltered(stats.all);

        if (!filtered.length) {
            list.innerHTML = `
                <li class="sub-empty-state">
                    <svg viewBox="0 0 48 48" fill="none"><rect x="8" y="14" width="32" height="22" rx="4" stroke="currentColor" stroke-width="2"/><path d="M16 14V10a8 8 0 0116 0v4" stroke="currentColor" stroke-width="2"/></svg>
                    <p>No subscriptions found</p>
                    <button class="primary-btn" onclick="SubscriptionsUI.openAddModal()">Add your first subscription</button>
                </li>`;
            return;
        }

        list.innerHTML = filtered.map(s => {
            const days = SubscriptionStore.daysUntil(s.nextPaymentDate);
            const dateLabel = s.nextPaymentDate ? SubscriptionStore.fmtDate(s.nextPaymentDate) : '—';
            const urgentClass = (days !== null && days <= 3 && s.active) ? 'sub-date--urgent' : '';
            const cycleLabel = s.billingCycle.charAt(0).toUpperCase() + s.billingCycle.slice(1);

            return `
            <li class="sub-row" data-id="${s.id}"${s.colourTag ? ` data-colour-tag="${s.colourTag}" style="border-left:3px solid ${s.colourTag};padding-left:11px;"` : ''}>
                ${_logoHtml(s)}
                <div class="sub-info">
                    <p class="sub-title"><a href="#" class="sub-name-link" onclick="event.stopPropagation();SubscriptionsUI.openDetailDrawer('${s.id}');return false">${_esc(s.name)}</a></p>
                    <p class="sub-sub">${SubscriptionStore.fmtCurrency(s.amount)} / ${cycleLabel.toLowerCase()} &bull; ${_esc(s.category)}</p>
                </div>
                <p class="sub-date ${urgentClass}">${dateLabel}</p>
                <label class="switch" aria-label="Toggle ${_esc(s.name)}">
                    <input type="checkbox" ${s.active ? 'checked' : ''}
                           onchange="SubscriptionsUI.handleToggle('${s.id}')">
                    <span class="switch-track"></span>
                </label>
                <div class="sub-menu-wrap">
                    <button class="icon-btn sub-menu-btn" aria-label="More options for ${_esc(s.name)}"
                            onclick="SubscriptionsUI.openRowMenu(event,'${s.id}')">
                        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5"  r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
                    </button>
                    <div class="dropdown-menu sub-menu" id="sub-menu-${s.id}" hidden>
                        <button class="dropdown-menu-item" onclick="SubscriptionsUI.openDetailDrawer('${s.id}')">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
                            View Details
                        </button>
                        <button class="dropdown-menu-item" onclick="SubscriptionsUI.openEditModal('${s.id}')">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            Edit
                        </button>
                        <button class="dropdown-menu-item danger" onclick="SubscriptionsUI.handleDelete('${s.id}')">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            Delete
                        </button>
                    </div>
                </div>
            </li>`;
        }).join('');

        // Re-render lucide icons inside newly created rows
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    /* ----------------------------------------------------------
       RECOMMENDATIONS STRIP
    ---------------------------------------------------------- */
    function _starSvg(filled) {
        if (filled) {
            return `<svg class="rec-star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
        }
        return `<svg class="rec-star rec-star--empty" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    }

    function _ratingHtml(rating) {
        let html = '';
        const full = Math.floor(rating);
        const half = rating - full >= 0.5;
        for (let i = 0; i < 5; i++) {
            html += _starSvg(i < full || (i === full && half));
        }
        html += `<span class="rec-card-rating-value">${rating.toFixed(1)}</span>`;
        return html;
    }

    function _renderRecommendations() {
        const strip = _q('#rec-strip');
        if (!strip) return;

        const providers = SubscriptionStore.getRecommendations();

        if (!providers.length) {
            strip.innerHTML = `<p class="sub-empty-row" style="width:100%;text-align:center;">You're subscribed to all available providers!</p>`;
            strip.style.animation = 'none';
            return;
        }

        const cardsHtml = providers.map(p => `
            <article class="rec-card" role="listitem" aria-label="${_esc(p.name)} recommendation card">
                <div class="rec-card-header">
                    ${_recLogoHtml(p)}
                    <div class="rec-card-info">
                        <p class="rec-card-name">${_esc(p.name)}</p>
                        <p class="rec-card-category">${_esc(p.category)}</p>
                    </div>
                </div>
                <p class="rec-card-cost">${SubscriptionStore.fmtCurrency(p.monthlyCost)} <span>/mo</span></p>
                <p class="rec-card-desc">${_esc(p.description)}</p>
                <div class="rec-card-rating" aria-label="Rating ${p.rating} out of 5">${_ratingHtml(p.rating)}</div>
                <div class="rec-card-actions">
                    <button class="rec-btn-view" onclick="SubscriptionsUI.quickViewProvider('${p.id}')" aria-label="Quick view ${_esc(p.name)}">Quick View</button>
                    <button class="rec-btn-add" onclick="SubscriptionsUI.addProvider('${p.id}')" aria-label="Add ${_esc(p.name)}">Add</button>
                </div>
            </article>
        `).join('');

        // Duplicate cards for seamless infinite scroll
        strip.innerHTML = cardsHtml + cardsHtml;
        strip.style.animation = '';
    }

    /* ----------------------------------------------------------
       PROVIDER LIBRARY — searchable grid of all providers
    ---------------------------------------------------------- */
    let _providerSearchTerm = '';
    let _providerFilterCat  = 'all';
    let _providerSortKey    = 'popularity';

    function _renderProviderLibrary() {
        const grid = _q('#provider-grid');
        const recentGrid = _q('#provider-recently-grid');
        if (!grid) return;

        const allProviders = SubscriptionStore.PROVIDERS;
        const subscribedNames = new Set(
            SubscriptionStore.getAll().map(s => s.name.toLowerCase().trim())
        );

        // Render "Recently Added" — last 5 user subscriptions by createdAt
        if (recentGrid) {
            const allSubs = SubscriptionStore.getAll();
            const sorted = [...allSubs].sort((a, b) => {
                return (b.createdAt || '').localeCompare(a.createdAt || '');
            });
            const recent = sorted.slice(0, 5);

            if (recent.length === 0) {
                recentGrid.innerHTML = '';
            } else {
                recentGrid.innerHTML = recent.map(s => `
                    <div class="provider-card" role="listitem">
                        <div class="provider-card-header">
                            ${_recLogoHtml({ logoClass: s.logoClass, logoText: s.logoText, name: s.name })}
                            <div class="provider-card-info">
                                <p class="provider-card-name">${_esc(s.name)}</p>
                                <p class="provider-card-category">${_esc(s.category)}</p>
                            </div>
                        </div>
                        <p class="provider-card-cost">${SubscriptionStore.fmtCurrency(s.amount)} <span>/${s.billingCycle}</span></p>
                        <div class="provider-card-actions">
                            <span class="provider-badge-subscribed">Subscribed</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Filter providers by search term
        const term = _providerSearchTerm.toLowerCase().trim();
        let filtered = term
            ? allProviders.filter(p => p.name.toLowerCase().includes(term))
            : [...allProviders];

        // Apply category filter
        if (_providerFilterCat !== 'all') {
            filtered = filtered.filter(p => p.category === _providerFilterCat);
        }

        // Apply sort
        switch (_providerSortKey) {
            case 'price-asc':
                filtered.sort((a, b) => a.monthlyCost - b.monthlyCost);
                break;
            case 'price-desc':
                filtered.sort((a, b) => b.monthlyCost - a.monthlyCost);
                break;
            case 'popularity':
                filtered.sort((a, b) => b.rating - a.rating);
                break;
            case 'az':
                filtered.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
                break;
        }

        if (!filtered.length) {
            const msg = _providerFilterCat !== 'all'
                ? `No providers in "${_providerFilterCat}" category`
                : `No providers match "${_esc(_providerSearchTerm)}"`;
            grid.innerHTML = `<p class="provider-grid-empty">${msg}</p>`;
            return;
        }

        grid.innerHTML = filtered.map(p => {
            const isSubscribed = subscribedNames.has(p.name.toLowerCase().trim());
            const actionHtml = isSubscribed
                ? `<span class="provider-badge-subscribed">Subscribed</span>`
                : `<button class="provider-btn-add" onclick="SubscriptionsUI.addProvider('${p.id}')" aria-label="Add ${_esc(p.name)}">Add</button>`;

            return `
            <article class="provider-card" role="listitem" aria-label="${_esc(p.name)} provider card">
                <div class="provider-card-header">
                    ${_recLogoHtml(p)}
                    <div class="provider-card-info">
                        <p class="provider-card-name">${_esc(p.name)}</p>
                        <p class="provider-card-category">${_esc(p.category)}</p>
                    </div>
                </div>
                <p class="provider-card-cost">${SubscriptionStore.fmtCurrency(p.monthlyCost)} <span>/mo</span></p>
                <p class="provider-card-desc">${_esc(p.description)}</p>
                <div class="provider-card-rating" aria-label="Rating ${p.rating} out of 5">${_ratingHtml(p.rating)}</div>
                <div class="provider-card-actions">
                    ${actionHtml}
                </div>
            </article>`;
        }).join('');
    }

    /* ----------------------------------------------------------
       PROVIDER ACTIONS (Quick View + Add from recommendation)
    ---------------------------------------------------------- */
    function quickViewProvider(providerId) {
        const provider = SubscriptionStore.PROVIDERS.find(p => p.id === providerId);
        if (!provider) return;
        _openRecQuickViewModal(provider);
    }

    function addProvider(providerId) {
        const provider = SubscriptionStore.PROVIDERS.find(p => p.id === providerId);
        if (!provider) return;
        _openRecAddModal(provider);
    }

    /* ----------------------------------------------------------
       RECOMMENDATION QUICK VIEW MODAL
    ---------------------------------------------------------- */
    let _recQvProvider = null;

    function _openRecQuickViewModal(provider) {
        _recQvProvider = provider;
        const modal = _q('#rec-quickview-modal');
        if (!modal) return;

        // Populate hero
        const cls = LOGO_CLASSES.includes(provider.logoClass) ? provider.logoClass : 'default';
        const letter = provider.logoText || provider.name.charAt(0).toUpperCase();
        _q('#rec-qv-logo').innerHTML = `<span class="sub-logo ${cls}" style="width:48px;height:48px;font-size:18px;" aria-hidden="true">${letter}</span>`;
        _q('#rec-qv-name').textContent = provider.name;
        _q('#rec-qv-category').textContent = provider.category;

        // Description
        _q('#rec-qv-desc').textContent = provider.description || '';

        // Rating
        _q('#rec-qv-rating').innerHTML = _ratingHtml(provider.rating);

        // Monthly cost
        _q('#rec-qv-cost').textContent = SubscriptionStore.fmtCurrency(provider.monthlyCost);

        // Pricing table
        const monthly = provider.monthlyCost;
        const quarterly = monthly * 3;
        const yearly = monthly * 12 * 0.83; // 17% discount
        _q('#rec-qv-price-monthly').textContent = `${SubscriptionStore.fmtCurrency(monthly)}/mo`;
        _q('#rec-qv-price-quarterly').textContent = `${SubscriptionStore.fmtCurrency(quarterly)}/qtr`;
        _q('#rec-qv-price-yearly').textContent = `${SubscriptionStore.fmtCurrency(yearly)}/yr`;

        // Benefits list
        const benefitsList = _q('#rec-qv-benefits-list');
        const benefits = provider.benefits || [];
        benefitsList.innerHTML = benefits.map(b => `<li>${_esc(b)}</li>`).join('');

        // Show modal
        modal.hidden = false;
        modal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));
    }

    function closeRecQuickViewModal() {
        const modal = _q('#rec-quickview-modal');
        if (!modal) return;
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', () => {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        }, { once: true });
        _recQvProvider = null;
    }

    function _handleRecQvAdd() {
        if (!_recQvProvider) return;
        closeRecQuickViewModal();
        // Small delay so the first modal fully closes before opening Add Confirmation
        setTimeout(() => _openRecAddModal(_recQvProvider), 220);
    }

    /* ----------------------------------------------------------
       RECOMMENDATION ADD CONFIRMATION MODAL
    ---------------------------------------------------------- */
    let _recAddProvider = null; // provider currently in rec-add modal

    function _openRecAddModal(provider) {
        _recAddProvider = provider;
        const modal = _q('#rec-add-modal');
        if (!modal) return;

        // Populate hero
        const cls = LOGO_CLASSES.includes(provider.logoClass) ? provider.logoClass : 'default';
        const letter = provider.logoText || provider.name.charAt(0).toUpperCase();
        _q('#rec-add-logo').innerHTML = `<span class="sub-logo ${cls}" style="width:44px;height:44px;font-size:16px;" aria-hidden="true">${letter}</span>`;
        _q('#rec-add-name').textContent = provider.name;
        _q('#rec-add-category').textContent = provider.category;
        _q('#rec-add-cost').textContent = SubscriptionStore.fmtCurrency(provider.monthlyCost);
        _q('#rec-add-desc').textContent = provider.description || '';

        // Reset options to defaults
        _q('#rec-add-cycle').value = 'monthly';
        _q('#rec-add-payment').value = 'wallet';
        _q('#rec-add-autorenew').checked = true;
        _q('#rec-add-notify').checked = true;

        // Reset date field
        const dateInput = _q('#rec-add-date');
        if (dateInput) {
            dateInput.value = '';
            dateInput.classList.remove('sub-modal-field--error');
        }
        const dateErr = _q('#rec-add-date-error');
        if (dateErr) dateErr.textContent = '';

        // Show modal
        modal.hidden = false;
        modal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));
    }

    function closeRecAddModal() {
        const modal = _q('#rec-add-modal');
        if (!modal) return;
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', () => {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        }, { once: true });
        _recAddProvider = null;
    }

    function _handleRecAddConfirm() {
        if (!_recAddProvider) return;

        const cycle = _q('#rec-add-cycle').value;
        // Calculate amount based on selected billing cycle
        let amount = _recAddProvider.monthlyCost;
        if (cycle === 'quarterly') amount = _recAddProvider.monthlyCost * 3;
        if (cycle === 'yearly') amount = _recAddProvider.monthlyCost * 12;

        // Require a billing date — prompt via the main Add modal if not provided
        const dateInput = _q('#rec-add-date');
        const dateValue = dateInput ? dateInput.value : '';

        if (!dateValue) {
            // Show error on the rec-add modal
            const errEl = _q('#rec-add-date-error');
            if (errEl) errEl.textContent = 'Billing date is required.';
            if (dateInput) dateInput.classList.add('sub-modal-field--error');
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = new Date(dateValue + 'T00:00:00');
        if (selected < today) {
            const errEl = _q('#rec-add-date-error');
            if (errEl) errEl.textContent = 'Billing date cannot be in the past.';
            if (dateInput) dateInput.classList.add('sub-modal-field--error');
            return;
        }

        const fields = {
            name: _recAddProvider.name,
            amount: amount,
            category: _recAddProvider.category,
            billingCycle: cycle,
            nextPaymentDate: dateValue,
            notes: _recAddProvider.description || '',
            logoClass: _recAddProvider.logoClass || 'default',
            logoText: _recAddProvider.logoText || _recAddProvider.name.charAt(0).toUpperCase(),
            autoRenew: _q('#rec-add-autorenew').checked,
            notifications: _q('#rec-add-notify').checked,
            paymentSource: _q('#rec-add-payment').value,
        };

        try {
            SubscriptionStore.add(fields);
            toast(`${_recAddProvider.name} added successfully!`);
            closeRecAddModal();
            // Re-render recommendations to exclude newly added provider
            _renderRecommendations();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    /* ----------------------------------------------------------
       FULL RE-RENDER  (called by SubscriptionStore.onChange)
    ---------------------------------------------------------- */
    function render(stats) {
        _renderList(stats);
        _renderRecommendations();
        _updateSortUI();
        _updateFilterUI();
    }

    /* ----------------------------------------------------------
       ROW KEBAB MENU
    ---------------------------------------------------------- */
    function openRowMenu(e, id) {
        e.stopPropagation();
        // Close all other open menus first
        _qa('.sub-menu:not([hidden])').forEach(m => {
            if (m.id !== `sub-menu-${id}`) m.hidden = true;
        });
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = !menu.hidden;
    }

    /* Close menus on outside click */
    function _bindGlobalClose() {
        document.addEventListener('click', () => {
            _qa('.sub-menu').forEach(m => m.hidden = true);
            _q('#sub-more-menu') && (_q('#sub-more-menu').hidden = true);
        });
    }

    /* ----------------------------------------------------------
       TOGGLE
    ---------------------------------------------------------- */
    /* ----------------------------------------------------------
       TOGGLE — with pause confirmation popup
    ---------------------------------------------------------- */
    function handleToggle(id) {
        const sub = SubscriptionStore.getById(id);
        if (!sub) return;

        // If currently active → pausing → show confirmation
        if (sub.active) {
            _openPauseConfirmModal(id);
        } else {
            // Reactivating — no confirmation needed
            SubscriptionStore.toggle(id);
            toast(`${sub.name} reactivated.`);
        }
    }

    let _pauseTargetId = null;

    function _openPauseConfirmModal(id) {
        _pauseTargetId = id;
        const sub = SubscriptionStore.getById(id);
        if (!sub) return;

        const modal = _q('#sub-pause-modal');
        if (!modal) {
            // Fallback if modal doesn't exist
            if (confirm(`Are you sure you want to pause ${sub.name}?`)) {
                SubscriptionStore.toggle(id);
                toast(`${sub.name} paused.`);
            }
            return;
        }

        _q('#pause-modal-name').textContent = sub.name;
        _q('#pause-modal-amount').textContent = SubscriptionStore.fmtCurrency(sub.amount) + ' / ' + sub.billingCycle;
        _q('#pause-modal-reason').value = '';

        modal.hidden = false;
        modal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));
    }

    function closePauseModal() {
        const modal = _q('#sub-pause-modal');
        if (!modal) return;
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', () => {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        }, { once: true });
        _pauseTargetId = null;
    }

    function _handlePauseConfirm() {
        if (!_pauseTargetId) return;
        const sub = SubscriptionStore.getById(_pauseTargetId);
        const reason = _q('#pause-modal-reason')?.value || '';

        SubscriptionStore.toggle(_pauseTargetId);
        // Store the pause reason in notes (appended)
        if (reason && sub) {
            const existingNotes = sub.notes || '';
            const pauseNote = `[Paused: ${reason}]`;
            SubscriptionStore.edit(_pauseTargetId, { notes: existingNotes ? existingNotes + ' ' + pauseNote : pauseNote });
        }

        toast(`${sub?.name || 'Subscription'} paused.`);
        closePauseModal();
    }

    /* ----------------------------------------------------------
       DELETE
    ---------------------------------------------------------- */
    function handleDelete(id) {
        const sub = SubscriptionStore.getById(id);
        if (!sub) return;

        // Close any open menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        // Confirm dialog using the custom confirm modal
        openConfirmModal(
            `Delete "${sub.name}"?`,
            'This will permanently remove it from your subscriptions.',
            () => {
                SubscriptionStore.remove(id);
                toast(`"${sub.name}" deleted.`);
            }
        );
    }

    /* ----------------------------------------------------------
       SORT
    ---------------------------------------------------------- */
    function handleSort(key) {
        if (_sortKey === key) {
            _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            _sortKey = key;
            _sortDir = 'asc';
        }
        SubscriptionStore.sort(_sortKey, _sortDir);
    }

    function _updateSortUI() {
        _qa('.sort-btn').forEach(btn => {
            const key = btn.dataset.sort;
            btn.classList.toggle('sort-btn--active', key === _sortKey);
            btn.querySelector('.sort-arrow')?.classList.toggle('sort-arrow--desc', key === _sortKey && _sortDir === 'desc');
        });
    }

    /* ----------------------------------------------------------
       FILTER
    ---------------------------------------------------------- */
    function handleFilterCat(cat) {
        _filterCat = cat;
        render(SubscriptionStore.getStats());
    }

    function handleFilterStatus(status) {
        _filterStatus = status;
        render(SubscriptionStore.getStats());
    }

    function _updateFilterUI() {
        _qa('.filter-cat-btn').forEach(btn => {
            btn.classList.toggle('filter-btn--active', btn.dataset.cat === _filterCat);
        });
        _qa('.filter-status-btn').forEach(btn => {
            btn.classList.toggle('filter-btn--active', btn.dataset.status === _filterStatus);
        });
        // Provider library category chips
        _qa('.filter-cat-chip').forEach(btn => {
            btn.classList.toggle('filter-btn--active', btn.dataset.providerCat === _providerFilterCat);
        });
    }

    /* ----------------------------------------------------------
       ADD / EDIT MODAL
    ---------------------------------------------------------- */
    function openAddModal() {
        _editingId = null;
        _populateModal(null);
        _openModal();
    }

    function openEditModal(id) {
        // Close row menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        _editingId = id;
        _populateModal(SubscriptionStore.getById(id));
        _openModal();
    }

    function _openModal() {
        const modal = _q('#sub-modal');
        if (!modal) return;
        modal.hidden = false;
        modal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));
        _q('#sub-modal-name')?.focus();
    }

    function closeModal() {
        const modal = _q('#sub-modal');
        if (!modal) return;
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', () => {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        }, { once: true });
        _clearModalErrors();
    }

    function _populateModal(sub) {
        const title = _q('#sub-modal-title');
        if (title) title.textContent = sub ? 'Edit Subscription' : 'Add Subscription';

        _q('#sub-modal-name').value           = sub?.name            || '';
        _q('#sub-modal-amount').value         = sub?.amount          || '';
        _q('#sub-modal-category').value       = sub?.category        || 'Entertainment';
        _q('#sub-modal-cycle').value          = sub?.billingCycle    || 'monthly';
        _q('#sub-modal-date').value           = sub?.nextPaymentDate || '';
        _q('#sub-modal-notes').value          = sub?.notes           || '';
        _q('#sub-modal-logoclass').value      = sub?.logoClass       || 'default';

        // Advanced fields
        _q('#sub-modal-reminder').value       = sub?.reminderDays    || '';
        _q('#sub-modal-provider-url').value   = sub?.providerUrl     || '';

        // Logo preview
        _currentCustomLogo = sub?.customLogo || '';
        const previewEl = _q('#sub-logo-preview');
        const previewImg = _q('#sub-logo-preview-img');
        if (_currentCustomLogo && previewEl && previewImg) {
            previewImg.src = _currentCustomLogo;
            previewEl.hidden = false;
        } else if (previewEl) {
            previewEl.hidden = true;
        }
        // Reset file input
        const fileInput = _q('#sub-modal-logo-upload');
        if (fileInput) fileInput.value = '';

        // Colour tag
        _currentColourTag = sub?.colourTag || '';
        _qa('.sub-swatch').forEach(sw => {
            sw.classList.toggle('sub-swatch--selected', sw.dataset.colour === _currentColourTag);
        });

        // Collapse advanced section if nothing is filled (for new subs)
        const hasAdvanced = _currentCustomLogo || _currentColourTag ||
                            sub?.reminderDays || sub?.providerUrl;
        _setAdvancedOpen(!!hasAdvanced);

        _clearModalErrors();
    }

    function _clearModalErrors() {
        _qa('.sub-modal-field-error').forEach(el => el.textContent = '');
        _qa('.sub-modal-field--error').forEach(el => el.classList.remove('sub-modal-field--error'));
    }

    /* ----------------------------------------------------------
       ADVANCED OPTIONS TOGGLE + HELPERS
    ---------------------------------------------------------- */
    function _setAdvancedOpen(open) {
        _advancedOpen = open;
        const toggle = _q('#sub-advanced-toggle');
        const body = _q('#sub-advanced-body');
        if (!toggle || !body) return;

        toggle.setAttribute('aria-expanded', String(open));
        body.setAttribute('aria-hidden', String(!open));
        if (open) {
            body.classList.add('sub-advanced-body--open');
        } else {
            body.classList.remove('sub-advanced-body--open');
        }
    }

    function _toggleAdvanced() {
        _setAdvancedOpen(!_advancedOpen);
    }

    function _handleLogoUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            _currentCustomLogo = evt.target.result;
            const previewEl = _q('#sub-logo-preview');
            const previewImg = _q('#sub-logo-preview-img');
            if (previewEl && previewImg) {
                previewImg.src = _currentCustomLogo;
                previewEl.hidden = false;
            }
        };
        reader.readAsDataURL(file);
    }

    function _handleLogoRemove() {
        _currentCustomLogo = '';
        const previewEl = _q('#sub-logo-preview');
        const fileInput = _q('#sub-modal-logo-upload');
        if (previewEl) previewEl.hidden = true;
        if (fileInput) fileInput.value = '';
    }

    function _handleSwatchClick(e) {
        const swatch = e.target.closest('.sub-swatch');
        if (!swatch) return;
        _currentColourTag = swatch.dataset.colour;
        _qa('.sub-swatch').forEach(sw => {
            sw.classList.toggle('sub-swatch--selected', sw.dataset.colour === _currentColourTag);
        });
    }

    function _setFieldError(fieldId, msg) {
        const input = _q(`#${fieldId}`);
        const err   = _q(`#${fieldId}-error`);
        if (input) input.closest('.sub-modal-field')?.classList.add('sub-modal-field--error');
        if (err)   err.textContent = msg;
    }

    function handleModalSubmit(e) {
        e.preventDefault();
        _clearModalErrors();

        const fields = {
            name:            _q('#sub-modal-name').value.trim(),
            amount:          _q('#sub-modal-amount').value,
            category:        _q('#sub-modal-category').value,
            billingCycle:    _q('#sub-modal-cycle').value,
            nextPaymentDate: _q('#sub-modal-date').value,
            notes:           _q('#sub-modal-notes').value,
            logoClass:       _q('#sub-modal-logoclass').value,
            customLogo:      _currentCustomLogo,
            colourTag:       _currentColourTag,
            reminderDays:    _q('#sub-modal-reminder').value,
            providerUrl:     _q('#sub-modal-provider-url').value,
        };

        // Auto-derive logoText from first letter
        fields.logoText = fields.name.charAt(0).toUpperCase();

        let valid = true;
        if (!fields.name) {
            _setFieldError('sub-modal-name', 'Name is required.');
            valid = false;
        }
        if (!fields.amount || parseFloat(fields.amount) <= 0) {
            _setFieldError('sub-modal-amount', 'Enter a valid amount greater than 0.');
            valid = false;
        }
        if (!fields.nextPaymentDate) {
            _setFieldError('sub-modal-date', 'Billing date is required.');
            valid = false;
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const selected = new Date(fields.nextPaymentDate + 'T00:00:00');
            if (selected < today) {
                _setFieldError('sub-modal-date', 'Billing date cannot be in the past.');
                valid = false;
            }
        }
        if (!valid) return;

        (async function() {
            try {
                if (_editingId) {
                    await SubscriptionStore.edit(_editingId, fields);
                    toast('Subscription updated.');
                } else {
                    await SubscriptionStore.add(fields);
                    toast('Subscription added.');
                }
                closeModal();
            } catch (err) {
                toast(err.message, 'error');
            }
        })();
    }

    /* ----------------------------------------------------------
       DETAIL DRAWER
    ---------------------------------------------------------- */
    function openDetailDrawer(id) {
        // Close row menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        _detailId = id;
        _renderDrawer(SubscriptionStore.getById(id));

        const drawer = _q('#sub-drawer');
        const overlay = _q('#sub-drawer-overlay');
        if (!drawer) return;
        drawer.hidden = false;
        overlay && (overlay.hidden = false);
        requestAnimationFrame(() => {
            drawer.classList.add('sub-drawer--open');
            overlay?.classList.add('sub-drawer-overlay--visible');
        });
    }

    function closeDrawer() {
        const drawer  = _q('#sub-drawer');
        const overlay = _q('#sub-drawer-overlay');
        if (!drawer) return;
        drawer.classList.remove('sub-drawer--open');
        overlay?.classList.remove('sub-drawer-overlay--visible');
        drawer.addEventListener('transitionend', () => {
            drawer.hidden = true;
            overlay && (overlay.hidden = true);
        }, { once: true });
        _detailId = null;
    }

    function _renderDrawer(sub) {
        if (!sub) return;
        const days  = SubscriptionStore.daysUntil(sub.nextPaymentDate);
        const urgent = days !== null && days <= 3 && sub.active;

        _q('#drawer-logo').innerHTML    = _logoHtml(sub);
        _q('#drawer-name').textContent  = sub.name;
        _q('#drawer-cat').textContent   = sub.category;
        _q('#drawer-amount').textContent = SubscriptionStore.fmtCurrency(sub.amount);
        _q('#drawer-cycle').textContent  = sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1);
        _q('#drawer-date').textContent   = SubscriptionStore.fmtDate(sub.nextPaymentDate);
        _q('#drawer-date').className     = urgent ? 'drawer-value drawer-value--urgent' : 'drawer-value';
        _q('#drawer-status').textContent = sub.active ? 'Active' : 'Paused';
        _q('#drawer-status').className   = `drawer-badge drawer-badge--${sub.active ? 'active' : 'paused'}`;
        _q('#drawer-notes').textContent  = sub.notes || 'No notes added.';
        _q('#drawer-created').textContent = SubscriptionStore.fmtDate(sub.createdAt);

        // Monthly equivalent if not already monthly
        const monthly = sub.billingCycle !== 'monthly'
            ? ` (≈ ${SubscriptionStore.fmtCurrency(sub.amount / (sub.billingCycle === 'yearly' ? 12 : sub.billingCycle === 'quarterly' ? 3 : 0.25))} / mo)`
            : '';
        _q('#drawer-monthly-equiv').textContent = monthly;

        // Reminder days
        const reminderRow = _q('#drawer-reminder-row');
        const reminderVal = _q('#drawer-reminder');
        if (reminderRow && reminderVal) {
            if (sub.reminderDays) {
                reminderRow.hidden = false;
                reminderVal.textContent = `${sub.reminderDays} day${sub.reminderDays > 1 ? 's' : ''} before`;
            } else {
                reminderRow.hidden = true;
            }
        }

        // Provider URL
        const urlRow = _q('#drawer-provider-url-row');
        const urlVal = _q('#drawer-provider-url');
        if (urlRow && urlVal) {
            if (sub.providerUrl) {
                urlRow.hidden = false;
                urlVal.innerHTML = `<a href="${_esc(sub.providerUrl)}" target="_blank" rel="noopener noreferrer" class="drawer-link">${_esc(sub.providerUrl)}</a>`;
            } else {
                urlRow.hidden = true;
            }
        }

        // Wire drawer action buttons
        _q('#drawer-edit-btn').onclick   = () => { closeDrawer(); openEditModal(sub.id); };
        _q('#drawer-delete-btn').onclick = () => { closeDrawer(); handleDelete(sub.id); };
        _q('#drawer-toggle-btn').textContent = sub.active ? 'Pause Subscription' : 'Reactivate';
        _q('#drawer-toggle-btn').onclick = () => {
            handleToggle(sub.id);
            closeDrawer();
        };
    }

    /* ----------------------------------------------------------
       CONFIRM MODAL
    ---------------------------------------------------------- */
    function openConfirmModal(title, body, onConfirm) {
        const modal = _q('#sub-confirm-modal');
        if (!modal) { if (confirm(`${title}\n${body}`)) onConfirm(); return; }
        _q('#sub-confirm-title').textContent = title;
        _q('#sub-confirm-body').textContent  = body;
        _q('#sub-confirm-ok').onclick = () => { closeConfirmModal(); onConfirm(); };
        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));
    }

    function closeConfirmModal() {
        const modal = _q('#sub-confirm-modal');
        if (!modal) return;
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', () => modal.hidden = true, { once: true });
    }

    /* ----------------------------------------------------------
       TOOLBAR DROPDOWN (sort/export)
    ---------------------------------------------------------- */
    function toggleMoreMenu(e) {
        e.stopPropagation();
        const menu = _q('#sub-more-menu');
        if (menu) menu.hidden = !menu.hidden;
    }

    /* ----------------------------------------------------------
       ESCAPE HELPER
    ---------------------------------------------------------- */
    function _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ----------------------------------------------------------
       KEYBOARD: close modal/drawer on Escape
    ---------------------------------------------------------- */
    function _bindKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (!_q('#rec-quickview-modal')?.hidden) closeRecQuickViewModal();
                else if (!_q('#rec-add-modal')?.hidden)      closeRecAddModal();
                else if (!_q('#sub-modal')?.hidden)     closeModal();
                else if (!_q('#sub-drawer')?.hidden)    closeDrawer();
                else if (!_q('#sub-pause-modal')?.hidden)   closePauseModal();
                else if (!_q('#sub-confirm-modal')?.hidden) closeConfirmModal();
            }
        });
    }

    /* ----------------------------------------------------------
       INIT  — called once when the subscription panel is shown
    ---------------------------------------------------------- */
    function init() {
        // Avoid double-init
        if (document.body.dataset.subUiInit === '1') {
            SubscriptionStore.loadFromAPI().then(function() {
                render(SubscriptionStore.getStats());
            }).catch(function(err) {
                console.error('Subscriptions load error:', err);
                render(SubscriptionStore.getStats());
            });
            return;
        }
        document.body.dataset.subUiInit = '1';

        // Subscribe to store changes
        SubscriptionStore.onChange(render);

        // Wire static buttons
        const addBtn  = _q('#add-sub-btn');
        const addFab  = _q('#sub-fab');
        const moreBtn = _q('#sub-more-btn');
        const form    = _q('#sub-modal-form');
        const modalClose     = _q('#sub-modal-close');
        const drawerClose    = _q('#sub-drawer-close');
        const drawerOverlay  = _q('#sub-drawer-overlay');
        const confirmCancel  = _q('#sub-confirm-cancel');
        const exportBtn      = _q('#sub-export-btn');
        const recAddClose    = _q('#rec-add-modal-close');
        const recAddCancel   = _q('#rec-add-cancel-btn');
        const recAddConfirm  = _q('#rec-add-confirm-btn');

        addBtn?.addEventListener('click', openAddModal);
        addFab?.addEventListener('click', openAddModal);
        moreBtn?.addEventListener('click', toggleMoreMenu);
        form?.addEventListener('submit', handleModalSubmit);
        modalClose?.addEventListener('click', closeModal);
        drawerClose?.addEventListener('click', closeDrawer);
        drawerOverlay?.addEventListener('click', closeDrawer);
        confirmCancel?.addEventListener('click', closeConfirmModal);

        // Pause confirmation modal
        const pauseClose   = _q('#pause-modal-close');
        const pauseCancel  = _q('#pause-modal-cancel');
        const pauseConfirm = _q('#pause-modal-confirm');
        pauseClose?.addEventListener('click', closePauseModal);
        pauseCancel?.addEventListener('click', closePauseModal);
        pauseConfirm?.addEventListener('click', _handlePauseConfirm);
        _q('#sub-pause-modal')?.addEventListener('click', e => {
            if (e.target.id === 'sub-pause-modal') closePauseModal();
        });
        exportBtn?.addEventListener('click', () => { SubscriptionStore.exportCSV(); toast('Exported to CSV.'); });

        // Advanced options section
        const advToggle   = _q('#sub-advanced-toggle');
        const logoInput   = _q('#sub-modal-logo-upload');
        const logoRemove  = _q('#sub-logo-remove-btn');
        const swatches    = _q('#sub-colour-swatches');

        advToggle?.addEventListener('click', _toggleAdvanced);
        logoInput?.addEventListener('change', _handleLogoUpload);
        logoRemove?.addEventListener('click', _handleLogoRemove);
        swatches?.addEventListener('click', _handleSwatchClick);

        // Recommendation add modal buttons
        recAddClose?.addEventListener('click', closeRecAddModal);
        recAddCancel?.addEventListener('click', closeRecAddModal);
        recAddConfirm?.addEventListener('click', _handleRecAddConfirm);
        _q('#rec-add-modal')?.addEventListener('click', e => {
            if (e.target.id === 'rec-add-modal') closeRecAddModal();
        });

        // Recommendation quick view modal buttons
        const recQvClose   = _q('#rec-qv-modal-close');
        const recQvCancel  = _q('#rec-qv-cancel-btn');
        const recQvAdd     = _q('#rec-qv-add-btn');
        recQvClose?.addEventListener('click', closeRecQuickViewModal);
        recQvCancel?.addEventListener('click', closeRecQuickViewModal);
        recQvAdd?.addEventListener('click', _handleRecQvAdd);
        _q('#rec-quickview-modal')?.addEventListener('click', e => {
            if (e.target.id === 'rec-quickview-modal') closeRecQuickViewModal();
        });

        // Sort buttons
        _qa('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => handleSort(btn.dataset.sort));
        });

        // Filter buttons
        _qa('.filter-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFilterCat(btn.dataset.cat));
        });
        _qa('.filter-status-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFilterStatus(btn.dataset.status));
        });

        // Close modal on backdrop click
        _q('#sub-modal')?.addEventListener('click', e => {
            if (e.target.id === 'sub-modal') closeModal();
        });

        // Provider Library search — debounced real-time filtering
        const providerSearchInput = _q('#provider-search');
        if (providerSearchInput) {
            const _debouncedSearch = UIUtils.debounce((value) => {
                _providerSearchTerm = value;
                _renderProviderLibrary();
            }, 300);

            providerSearchInput.addEventListener('input', (e) => {
                _debouncedSearch(e.target.value);
            });
        }

        // Provider Library category chips
        _qa('.filter-cat-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                _providerFilterCat = btn.dataset.providerCat;
                _qa('.filter-cat-chip').forEach(b => b.classList.remove('filter-btn--active'));
                btn.classList.add('filter-btn--active');
                _renderProviderLibrary();
            });
        });

        // Provider Library sort select
        const providerSortSelect = _q('#provider-sort-select');
        if (providerSortSelect) {
            providerSortSelect.addEventListener('change', (e) => {
                _providerSortKey = e.target.value;
                _renderProviderLibrary();
            });
        }

        _bindGlobalClose();
        _bindKeyboard();

        // Initial render — load from API
        SubscriptionStore.loadFromAPI().then(function() {
            render(SubscriptionStore.getStats());
        }).catch(function(err) {
            console.error('Subscriptions initial load error:', err);
            render(SubscriptionStore.getStats());
        });
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        init,
        render,
        openAddModal,
        openEditModal,
        openDetailDrawer,
        closeModal,
        closeDrawer,
        closeConfirmModal,
        closePauseModal,
        closeRecAddModal,
        closeRecQuickViewModal,
        handleToggle,
        handleDelete,
        handleSort,
        handleFilterCat,
        handleFilterStatus,
        openRowMenu,
        handleModalSubmit,
        toggleMoreMenu,
        quickViewProvider,
        addProvider,
    });

})();
