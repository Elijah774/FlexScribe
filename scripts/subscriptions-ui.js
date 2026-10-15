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

    // Edit modal flow state
    let _editOpenedFromDetails = false; // reopen details modal on close?
    let _editOriginal          = null;  // snapshot of original values (dirty check)
    let _editReturnFocus       = null;  // element to restore focus to on close
    let _editTrapHandler       = null;  // keydown focus-trap handler
    let _editSaving            = false; // save request in flight

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
            // Shared next-payment display: paused -> "Paused" (no date),
            // active -> rolled-forward future date (Today / in N days / date).
            const npd = _nextPaymentDisplay(s);
            const dateLabel = npd.text;
            const dateClass = `sub-date--${npd.cls}`;
            const cycleLabel = s.billingCycle.charAt(0).toUpperCase() + s.billingCycle.slice(1);

            return `
            <li class="sub-row" data-id="${s.id}"${s.colourTag ? ` data-colour-tag="${s.colourTag}" style="border-left:3px solid ${s.colourTag};padding-left:11px;"` : ''}>
                ${_logoHtml(s)}
                <div class="sub-info">
                    <p class="sub-title"><a href="#" class="sub-name-link" onclick="event.stopPropagation();SubscriptionsUI.openDetailDrawer('${s.id}');return false">${_esc(s.name)}</a></p>
                    <p class="sub-sub">${SubscriptionStore.fmtCurrency(s.amount)} / ${cycleLabel.toLowerCase()} &bull; ${_esc(s.category)}</p>
                </div>
                <p class="sub-date ${dateClass}">${dateLabel}</p>
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

        // The "Recently Added" strip is intentionally not rendered — the
        // user's own subscriptions should not appear in this section.
        if (recentGrid) recentGrid.innerHTML = '';

        // Hide providers the user is already subscribed to — only show
        // genuinely available ones.
        const available = allProviders.filter(
            p => !subscribedNames.has(p.name.toLowerCase().trim())
        );

        // Filter providers by search term
        const term = _providerSearchTerm.toLowerCase().trim();
        let filtered = term
            ? available.filter(p => p.name.toLowerCase().includes(term))
            : [...available];

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
            case 'name':
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
            const actionHtml = `<button class="provider-btn-add" onclick="SubscriptionsUI.addProvider('${p.id}')" aria-label="Add ${_esc(p.name)}">Add</button>`;

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
    /* ----------------------------------------------------------
       NEXT FUTURE BILLING DATE
       Subscriptions auto-renew: if the stored next-payment date is
       in the past, roll it forward by its billing cycle until it is
       today or later. Returns a Date (never in the past).
    ---------------------------------------------------------- */
    /* Shared next-payment display helper — single source of truth for how a
       subscription's next payment is shown everywhere (details modal, list
       rows, upcoming widget). Delegates the date maths to
       SubscriptionStore.getNextPaymentDate.

       Returns { text, cls } where cls is one of:
         'paused'  (muted grey — no date)
         'today'   (orange — due today)
         'soon'    (orange — due within 7 days, "date (in N days)")
         'normal'  (default text — later than 7 days)
         'none'    (muted "—" — invalid/missing)                             */
    function _nextPaymentDisplay(sub) {
        if (!sub) return { text: '—', cls: 'none' };

        const isActive = sub.active;
        if (!isActive) return { text: 'Paused', cls: 'paused' };

        const next = SubscriptionStore.getNextPaymentDate(sub);
        if (!next) return { text: '—', cls: 'none' };

        const iso = SubscriptionStore.toISODate(next);
        const days = SubscriptionStore.daysUntil(iso);
        const dateStr = SubscriptionStore.fmtDate(iso);

        if (days === 0) return { text: 'Today', cls: 'today', iso: iso };
        if (days !== null && days <= 7) {
            return { text: `${dateStr} (in ${days} day${days === 1 ? '' : 's'})`, cls: 'soon', iso: iso };
        }
        return { text: dateStr, cls: 'normal', iso: iso };
    }
    function render(stats) {
        _renderList(stats);
        _renderRecommendations();
        _renderProviderLibrary();
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
    /* ----------------------------------------------------------
       PAY SUBSCRIPTIONS FOR THE MONTH
       Pays all active subs from the wallet (server-side), which
       adjusts the ScribeScore (+10 all paid / -10 any unpaid).
    ---------------------------------------------------------- */
    let _payingMonth = false;
    function handlePayMonth() {
        if (_payingMonth) return;
        const btn = _q('#sub-pay-month-btn');
        const active = SubscriptionStore.getActive ? SubscriptionStore.getActive() : [];
        if (!active.length) {
            toast('You have no active subscriptions to pay.', 'info');
            return;
        }

        _payingMonth = true;
        if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

        API.Subscriptions.payMonth().then(function (result) {
            if (result.success) {
                const d = result.data || {};
                if (d.outcome === 'no_subscriptions') {
                    toast('You have no active subscriptions to pay.', 'info');
                } else {
                    toast(d.message || 'Subscriptions processed.', d.allPaid ? 'success' : 'warning');
                }

                // Refresh wallet (debited) + subscriptions list.
                if (typeof WalletStore !== 'undefined' && WalletStore.loadFromAPI) WalletStore.loadFromAPI();
                SubscriptionStore.loadFromAPI().then(function () {
                    render(SubscriptionStore.getStats());
                }).catch(function () {});

                // Real-time ScribeScore update.
                if (window.ScribeScore && typeof d.delta === 'number' && d.delta !== 0) {
                    window.ScribeScore.refresh({ delta: d.delta, toast: 'ScribeScore updated.' });
                } else if (window.ScribeScore) {
                    window.ScribeScore.refresh();
                }
            } else {
                toast(result.error || 'Could not process subscription payments.', 'error');
            }
        }).catch(function () {
            toast('Network error. Please try again.', 'error');
        }).finally(function () {
            _payingMonth = false;
            if (btn) { btn.disabled = false; btn.style.opacity = ''; }
        });
    }

    function handleToggle(id) {
        const sub = SubscriptionStore.getById(id);
        if (!sub) return;

        if (sub.active) {
            // Pausing → confirmation popup (keeps anchor, just hidden).
            _openPauseConfirmModal(id);
        } else {
            // Reactivating → ask when the next payment is due, prefilled with
            // the next date computed FROM TODAY (never an old/past date).
            _openReactivatePrompt(id);
        }
    }

    function _openReactivatePrompt(id) {
        const sub = SubscriptionStore.getById(id);
        if (!sub) return;

        // Compute a sensible default: roll the stored anchor forward from
        // today using the billing cycle (treat as active for the calc).
        const computed = SubscriptionStore.getNextPaymentDate(
            Object.assign({}, sub, { active: true })
        );
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const defaultIso = SubscriptionStore.toISODate(computed || today);

        openDatePromptDialog({
            title: 'When is the next payment due?',
            label: 'Next payment date',
            defaultDate: defaultIso,
            confirmLabel: 'Reactivate',
            onCancel: () => {
                // The row checkbox may have flipped on; re-render to restore it.
                render(SubscriptionStore.getStats());
            },
            onConfirm: async (dateIso) => {
                try {
                    await SubscriptionStore.toggle(id);               // -> active
                    await SubscriptionStore.edit(id, { nextPaymentDate: dateIso }); // new anchor
                    toast('Subscription reactivated');
                    render(SubscriptionStore.getStats());
                    // Refresh an open details modal for this sub.
                    if (_detailId === id && !_q('#sub-detail-modal')?.hidden) {
                        _renderDrawer(SubscriptionStore.getById(id));
                    }
                } catch (err) {
                    toast(err.message || 'Could not reactivate.', 'error');
                }
            },
        });
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

    async function _handlePauseConfirm() {
        if (!_pauseTargetId) return;
        const id = _pauseTargetId;
        const sub = SubscriptionStore.getById(id);
        const reason = _q('#pause-modal-reason')?.value || '';

        closePauseModal();
        try {
            // Pause keeps the stored anchor date — it's just not displayed.
            await SubscriptionStore.toggle(id);
            if (reason && sub) {
                const existingNotes = sub.notes || '';
                const pauseNote = `[Paused: ${reason}]`;
                await SubscriptionStore.edit(id, { notes: existingNotes ? existingNotes + ' ' + pauseNote : pauseNote });
            }
            toast('Subscription paused');
            render(SubscriptionStore.getStats());
            if (_detailId === id && !_q('#sub-detail-modal')?.hidden) {
                _renderDrawer(SubscriptionStore.getById(id));
            }
        } catch (err) {
            toast(err.message || 'Could not pause.', 'error');
        }
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

        // Reusable orange-bordered confirm dialog.
        openConfirmDialog({
            title: 'Delete this subscription?',
            text: `This will permanently remove "${sub.name}" from your subscriptions.`,
            cancelLabel: 'Cancel',
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: () => {
                SubscriptionStore.remove(id);
                toast(`"${sub.name}" deleted.`);
            },
        });
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
            btn.classList.toggle('filter-btn--active', (btn.dataset.cat || 'all') === _providerFilterCat);
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

    function openEditModal(id, opts) {
        // Close row menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        _editOpenedFromDetails = !!(opts && opts.fromDetails);
        _editReturnFocus = document.activeElement;
        _editingId = id;
        _populateModal(SubscriptionStore.getById(id));
        _editOriginal = _snapshotForm();   // baseline for dirty detection
        _openModal();
    }

    /* Capture the current form values so we can detect "dirty" edits. */
    function _snapshotForm() {
        return JSON.stringify({
            name:   _q('#sub-modal-name').value.trim(),
            amount: _q('#sub-modal-amount').value,
            cat:    _q('#sub-modal-category').value,
            cycle:  _q('#sub-modal-cycle').value,
            date:   _q('#sub-modal-date').value,
            notes:  _q('#sub-modal-notes').value,
            logo:   _q('#sub-modal-logoclass').value,
            colour: _currentColourTag,
            custom: _currentCustomLogo,
            remind: _q('#sub-modal-reminder').value,
            url:    _q('#sub-modal-provider-url').value,
        });
    }

    function _isDirty() {
        return _editOriginal !== null && _snapshotForm() !== _editOriginal;
    }

    function _openModal() {
        const modal = _q('#sub-modal');
        if (!modal) return;

        // Advanced section always starts collapsed on open.
        _setAdvancedOpen(false);
        _hideBanner();

        modal.hidden = false;
        modal.removeAttribute('aria-hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => modal.classList.add('sub-modal--visible'));

        // Autofocus the Service name field with the cursor at the end.
        const nameEl = _q('#sub-modal-name');
        if (nameEl) {
            nameEl.focus();
            const len = nameEl.value.length;
            try { nameEl.setSelectionRange(len, len); } catch (_) { /* non-text input */ }
        }

        // Focus trap.
        _editTrapHandler = (e) => {
            if (e.key !== 'Tab') return;
            const list = Array.from(modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )).filter(el => !el.disabled && el.offsetParent !== null);
            if (!list.length) return;
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        };
        modal.addEventListener('keydown', _editTrapHandler);
    }

    /* Hard close — no dirty check. Used internally after Save or Discard. */
    function _forceCloseModal() {
        const modal = _q('#sub-modal');
        if (!modal) return;
        if (_editTrapHandler) {
            modal.removeEventListener('keydown', _editTrapHandler);
            _editTrapHandler = null;
        }
        modal.classList.remove('sub-modal--visible');
        modal.addEventListener('transitionend', function _done() {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            modal.removeEventListener('transitionend', _done);
        }, { once: true });
        _clearModalErrors();
        _hideBanner();
    }

    /* Public close — behaves like Cancel: confirm if dirty, else close and
       (optionally) reopen the details modal with the original data. */
    function closeModal() {
        if (_editSaving) return; // ignore while a save is running
        // If the discard-confirm dialog is already showing, don't stack another.
        const confirm2 = _q('#sub-confirm2');
        if (confirm2 && !confirm2.hidden) return;

        const reopenDetails = _editOpenedFromDetails;
        const originalId = _editingId;

        const finish = () => {
            _forceCloseModal();
            const ret = _editReturnFocus;
            _editReturnFocus = null;
            _editOriginal = null;
            _editOpenedFromDetails = false;
            if (reopenDetails && originalId) {
                // Reopen details with (unchanged) data.
                openDetailDrawer(originalId);
            } else if (ret && typeof ret.focus === 'function') {
                ret.focus();
            }
        };

        if (_isDirty()) {
            _openDiscardConfirm(finish);
        } else {
            finish();
        }
    }

    function _populateModal(sub) {
        const title = _q('#sub-modal-title');
        if (title) title.textContent = sub ? 'Edit Subscription' : 'Add Subscription';

        _q('#sub-modal-name').value           = sub?.name            || '';
        _q('#sub-modal-amount').value         = sub?.amount          || '';
        _q('#sub-modal-category').value       = sub?.category        || 'Entertainment';
        _q('#sub-modal-cycle').value          = sub?.billingCycle    || 'monthly';

        // Next payment date field.
        //  - Paused: disabled, "Paused" placeholder + helper text.
        //  - Active/new: prefilled with the computed next date (never past).
        const dateInput = _q('#sub-modal-date');
        const dateHelp  = _q('#sub-modal-date-help');
        const dateField = dateInput?.closest('.sub-modal-field');
        if (dateInput) {
            if (sub && sub.active === false) {
                dateInput.value = '';
                dateInput.disabled = true;
                dateInput.placeholder = 'Paused';
                dateField?.classList.add('sub-modal-field--paused');
                if (dateHelp) { dateHelp.textContent = 'Reactivate to set a payment date.'; dateHelp.hidden = false; }
            } else {
                dateInput.disabled = false;
                dateInput.placeholder = '';
                dateField?.classList.remove('sub-modal-field--paused');
                if (dateHelp) { dateHelp.textContent = ''; dateHelp.hidden = true; }
                const next = sub ? SubscriptionStore.getNextPaymentDate(sub) : null;
                dateInput.value = next ? SubscriptionStore.toISODate(next) : (sub?.nextPaymentDate || '');
            }
        }
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

        // Advanced section always starts collapsed (reset on every open).
        _setAdvancedOpen(false);

        _clearModalErrors();
    }

    /* ----------------------------------------------------------
       ERROR BANNER (save failure)
    ---------------------------------------------------------- */
    function _showBanner(msg) {
        const b = _q('#sub-modal-banner');
        if (!b) return;
        b.textContent = msg;
        b.hidden = false;
    }
    function _hideBanner() {
        const b = _q('#sub-modal-banner');
        if (!b) return;
        b.hidden = true;
        b.textContent = '';
    }

    /* ----------------------------------------------------------
       DISCARD-CHANGES CONFIRM DIALOG (reusable)
       opts: { title, text, confirmLabel, onConfirm, onCancel, danger }
    ---------------------------------------------------------- */
    function openConfirmDialog(opts) {
        const o = opts || {};
        // Build (or reuse) the backdrop element.
        let backdrop = _q('#sub-confirm2');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'sub-confirm2';
            backdrop.className = 'sub-confirm2-backdrop';
            backdrop.setAttribute('role', 'dialog');
            backdrop.setAttribute('aria-modal', 'true');
            document.body.appendChild(backdrop);
        }
        const confirmClass = o.danger ? 'sub-detail-btn--delete' : 'sub-detail-btn--toggle';
        backdrop.innerHTML = `
            <div class="sub-confirm2-box" role="document">
                <h3 class="sub-confirm2-title">${_esc(o.title || 'Are you sure?')}</h3>
                <p class="sub-confirm2-text">${_esc(o.text || '')}</p>
                <div class="sub-confirm2-actions">
                    <button type="button" class="sub-detail-btn sub-detail-btn--edit" data-act="cancel">${_esc(o.cancelLabel || 'Keep editing')}</button>
                    <button type="button" class="sub-detail-btn ${confirmClass}" data-act="confirm">${_esc(o.confirmLabel || 'Discard')}</button>
                </div>
            </div>`;

        const close = () => {
            backdrop.classList.remove('is-visible');
            backdrop.addEventListener('transitionend', function _d() {
                backdrop.hidden = true;
                backdrop.removeEventListener('transitionend', _d);
            }, { once: true });
            document.removeEventListener('keydown', onKey);
        };

        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); o.onCancel && o.onCancel(); }
        };

        backdrop.querySelector('[data-act="cancel"]').onclick = () => { close(); o.onCancel && o.onCancel(); };
        backdrop.querySelector('[data-act="confirm"]').onclick = () => { close(); o.onConfirm && o.onConfirm(); };
        backdrop.onclick = (e) => { if (e.target === backdrop) { close(); o.onCancel && o.onCancel(); } };

        backdrop.hidden = false;
        requestAnimationFrame(() => {
            backdrop.classList.add('is-visible');
            backdrop.querySelector('[data-act="confirm"]')?.focus();
        });
        document.addEventListener('keydown', onKey);
    }

    function _openDiscardConfirm(onConfirm) {
        openConfirmDialog({
            title: 'Discard changes?',
            text: "Your edits won't be saved.",
            cancelLabel: 'Keep editing',
            confirmLabel: 'Discard',
            danger: true,
            onConfirm: onConfirm,
        });
    }

    /* Reusable date-prompt dialog (orange-bordered). Used by Reactivate to
       ask when the next payment is due. opts: { title, label, defaultDate,
       confirmLabel, onConfirm(dateIso), onCancel }. */
    function openDatePromptDialog(opts) {
        const o = opts || {};
        let backdrop = _q('#sub-dateprompt');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'sub-dateprompt';
            backdrop.className = 'sub-confirm2-backdrop';
            backdrop.setAttribute('role', 'dialog');
            backdrop.setAttribute('aria-modal', 'true');
            document.body.appendChild(backdrop);
        }
        const minDate = SubscriptionStore.toISODate((function () { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })());
        backdrop.innerHTML = `
            <div class="sub-confirm2-box" role="document">
                <h3 class="sub-confirm2-title">${_esc(o.title || 'When is the next payment due?')}</h3>
                <div class="sub-modal-field" style="margin-bottom:18px;">
                    <label for="sub-dateprompt-input">${_esc(o.label || 'Next payment date')}</label>
                    <input type="date" id="sub-dateprompt-input" value="${_esc(o.defaultDate || '')}" min="${minDate}">
                    <span class="sub-modal-field-error" id="sub-dateprompt-error"></span>
                </div>
                <div class="sub-confirm2-actions">
                    <button type="button" class="sub-detail-btn sub-detail-btn--edit" data-act="cancel">Cancel</button>
                    <button type="button" class="sub-detail-btn sub-detail-btn--toggle" data-act="confirm">${_esc(o.confirmLabel || 'Reactivate')}</button>
                </div>
            </div>`;

        const input = backdrop.querySelector('#sub-dateprompt-input');
        const errEl = backdrop.querySelector('#sub-dateprompt-error');

        const close = () => {
            backdrop.classList.remove('is-visible');
            backdrop.addEventListener('transitionend', function _d() {
                backdrop.hidden = true;
                backdrop.removeEventListener('transitionend', _d);
            }, { once: true });
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); o.onCancel && o.onCancel(); }
        };

        backdrop.querySelector('[data-act="cancel"]').onclick = () => { close(); o.onCancel && o.onCancel(); };
        backdrop.querySelector('[data-act="confirm"]').onclick = () => {
            const val = input.value;
            const parsed = SubscriptionStore.parseLocalDate(val);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            if (!parsed) { errEl.textContent = 'Choose a valid date.'; return; }
            if (parsed < today) { errEl.textContent = 'Date cannot be in the past.'; return; }
            close();
            o.onConfirm && o.onConfirm(val);
        };
        backdrop.onclick = (e) => { if (e.target === backdrop) { close(); o.onCancel && o.onCancel(); } };

        backdrop.hidden = false;
        requestAnimationFrame(() => {
            backdrop.classList.add('is-visible');
            input?.focus();
        });
        document.addEventListener('keydown', onKey);
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

        const dateInput = _q('#sub-modal-date');
        const dateDisabled = !!(dateInput && dateInput.disabled); // paused sub

        const fields = {
            name:            _q('#sub-modal-name').value.trim(),
            amount:          _q('#sub-modal-amount').value,
            category:        _q('#sub-modal-category').value,
            billingCycle:    _q('#sub-modal-cycle').value,
            nextPaymentDate: dateInput.value,
            notes:           _q('#sub-modal-notes').value,
            logoClass:       _q('#sub-modal-logoclass').value,
            customLogo:      _currentCustomLogo,
            colourTag:       _currentColourTag,
            reminderDays:    _q('#sub-modal-reminder').value,
            providerUrl:     _q('#sub-modal-provider-url').value,
        };

        // Paused subscription: don't touch the stored anchor date on save.
        if (dateDisabled) delete fields.nextPaymentDate;

        // Auto-derive logoText from first letter
        fields.logoText = fields.name.charAt(0).toUpperCase();

        let valid = true;
        if (!fields.name) {
            _setFieldError('sub-modal-name', 'Enter a service name.');
            valid = false;
        }
        if (!fields.amount || isNaN(parseFloat(fields.amount)) || parseFloat(fields.amount) <= 0) {
            _setFieldError('sub-modal-amount', 'Enter an amount greater than 0.');
            valid = false;
        }
        // Date validation only applies when the field is active (not paused).
        if (!dateDisabled) {
            if (!fields.nextPaymentDate) {
                _setFieldError('sub-modal-date', 'Choose a valid date.');
                valid = false;
            } else {
                const selected = SubscriptionStore.parseLocalDate(fields.nextPaymentDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (!selected) {
                    _setFieldError('sub-modal-date', 'Choose a valid date.');
                    valid = false;
                } else if (selected < today) {
                    _setFieldError('sub-modal-date', 'Billing date cannot be in the past.');
                    valid = false;
                }
            }
        }
        if (!valid) {
            // Focus the first invalid field.
            _q('.sub-modal-field--error input, .sub-modal-field--error select')?.focus();
            return;
        }

        _hideBanner();

        const wasEditing = !!_editingId;
        const editedId   = _editingId;
        const reopenDetails = _editOpenedFromDetails;

        (async function() {
            _setSaving(true);
            try {
                if (wasEditing) {
                    await SubscriptionStore.edit(editedId, fields);
                } else {
                    await SubscriptionStore.add(fields);
                }

                _setSaving(false);
                _forceCloseModal();
                _editOriginal = null;
                _editOpenedFromDetails = false;

                toast(wasEditing ? 'Subscription updated' : 'Subscription added');

                // Refresh the list so the row shows new values immediately.
                render(SubscriptionStore.getStats());

                // Reopen the details modal (with updated data) if we came from it.
                if (wasEditing && reopenDetails && editedId) {
                    openDetailDrawer(editedId);
                }
            } catch (err) {
                // Keep the modal open with the user's input; re-enable + banner.
                _setSaving(false);
                _showBanner("Couldn't save your changes. Try again.");
            }
        })();
    }

    /* Toggle the saving/loading state: spinner + disabled fields & buttons. */
    function _setSaving(on) {
        _editSaving = on;
        const saveBtn = _q('#sub-modal-save');
        const cancelBtn = _q('#sub-modal-cancel');
        const closeBtn = _q('#sub-modal-close');
        const form = _q('#sub-modal-form');

        if (saveBtn) {
            saveBtn.disabled = on;
            saveBtn.classList.toggle('is-saving', on);
            const label = saveBtn.querySelector('.sub-save-label');
            let spinner = saveBtn.querySelector('.sub-save-spinner');
            if (on) {
                if (!spinner) {
                    spinner = document.createElement('span');
                    spinner.className = 'sub-save-spinner';
                    saveBtn.insertBefore(spinner, label);
                }
                if (label) label.textContent = 'Saving…';
            } else {
                if (spinner) spinner.remove();
                if (label) label.textContent = 'Save changes';
            }
        }
        if (cancelBtn) cancelBtn.disabled = on;
        if (closeBtn) closeBtn.disabled = on;

        // Disable all form fields while saving.
        if (form) {
            form.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = on; });
        }
    }

    /* ----------------------------------------------------------
       DETAIL DRAWER
    ---------------------------------------------------------- */
    /* Element that had focus before the modal opened — focus returns here
       on close (accessibility requirement). */
    let _detailReturnFocus = null;
    let _detailTrapHandler = null;

    /* Robustly format a stored created/added date. Handles ISO date strings
       ("2026-09-25"), full ISO timestamps ("2026-09-25T10:30:00.000Z"), and
       epoch-millisecond values. Returns "—" for missing/invalid dates — this
       fixes the "Sep NaN, 2026" bug that came from splitting a timestamp on
       "-" and reading "25T10:30:00..." as the day number. */
    function _fmtDateSafe(raw) {
        if (raw === null || raw === undefined || raw === '') return '—';

        let d;
        if (raw instanceof Date) {
            d = raw;
        } else if (typeof raw === 'number') {
            d = new Date(raw);
        } else {
            const str = String(raw).trim();
            if (!str) return '—';
            // Pure "YYYY-MM-DD" — parse the date part explicitly to avoid TZ
            // shifts; anything with time/offset goes through Date().
            const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateOnly) {
                d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
            } else {
                d = new Date(str);
            }
        }

        if (!d || isNaN(d.getTime())) return '—';

        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }

    function openDetailDrawer(id) {
        // Close row menu
        const menu = _q(`#sub-menu-${id}`);
        if (menu) menu.hidden = true;

        _detailId = id;
        // Remember the element to return focus to (the clicked row/link).
        _detailReturnFocus = document.activeElement;

        _renderDrawer(SubscriptionStore.getById(id));

        const modal = _q('#sub-detail-modal');
        if (!modal) return;
        modal.hidden = false;
        document.body.classList.add('sub-modal-open');
        requestAnimationFrame(() => modal.classList.add('sub-detail--visible'));

        // Focus the close button first, then set up a focus trap.
        const closeBtn = _q('#sub-detail-close');
        closeBtn && closeBtn.focus();
        _detailTrapHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusables = modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const list = Array.from(focusables).filter(el => !el.hasAttribute('hidden') && el.offsetParent !== null);
            if (!list.length) return;
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        };
        modal.addEventListener('keydown', _detailTrapHandler);
    }

    function closeDrawer() {
        const modal = _q('#sub-detail-modal');
        if (!modal || modal.hidden) return;

        if (_detailTrapHandler) {
            modal.removeEventListener('keydown', _detailTrapHandler);
            _detailTrapHandler = null;
        }

        modal.classList.remove('sub-detail--visible');
        document.body.classList.remove('sub-modal-open');
        modal.addEventListener('transitionend', function _done() {
            modal.hidden = true;
            modal.removeEventListener('transitionend', _done);
        }, { once: true });

        // Return focus to the row that opened the modal.
        if (_detailReturnFocus && typeof _detailReturnFocus.focus === 'function') {
            _detailReturnFocus.focus();
        }
        _detailReturnFocus = null;
        _detailId = null;
    }

    function _renderDrawer(sub) {
        if (!sub) return;

        // Avatar — first letter of the name.
        const avatar = _q('#sub-detail-avatar');
        if (avatar) avatar.textContent = (sub.name || '?').charAt(0).toUpperCase();

        // Full name (wraps via CSS — no truncation).
        _q('#sub-detail-name').textContent = sub.name;

        // Status badge.
        const badge = _q('#sub-detail-status');
        badge.textContent = sub.active ? 'Active' : 'Paused';
        badge.className = `sub-detail-badge sub-detail-badge--${sub.active ? 'active' : 'paused'}`;

        // Detail rows.
        _q('#sub-detail-amount').textContent = SubscriptionStore.fmtCurrency(sub.amount);
        _q('#sub-detail-cycle').textContent  = sub.billingCycle.charAt(0).toUpperCase() + sub.billingCycle.slice(1);

        const perMonth = sub.billingCycle === 'monthly'
            ? sub.amount
            : sub.amount / (sub.billingCycle === 'yearly' ? 12 : sub.billingCycle === 'quarterly' ? 3 : sub.billingCycle === 'weekly' ? (52 / 12) : 1);
        _q('#sub-detail-monthly').textContent = `${SubscriptionStore.fmtCurrency(perMonth)} / mo`;

        _q('#sub-detail-cat').textContent = sub.category;

        // Next payment — shared display rules (Paused / Today / in N days /
        // date). Active subs always roll forward, so never red/overdue.
        const npd = _nextPaymentDisplay(sub);
        const dateEl = _q('#sub-detail-date');
        dateEl.textContent = npd.text;
        dateEl.className = `sub-detail-value sub-detail-np sub-detail-np--${npd.cls}`;

        _q('#sub-detail-created').textContent = _fmtDateSafe(sub.createdAt);

        // Notes — hide the whole section when there are none.
        const notesWrap = _q('#sub-detail-notes-wrap');
        const notesText = _q('#sub-detail-notes');
        const notes = (sub.notes || '').trim();
        if (notes) {
            notesWrap.hidden = false;
            notesText.textContent = notes;
        } else {
            notesWrap.hidden = true;
            notesText.textContent = '';
        }

        // Toggle button — label + icon. Active shows "Pause" with a pause
        // (two-bar) icon; paused shows "Reactivate" with a play icon.
        const toggleBtn = _q('#sub-detail-toggle-btn');
        toggleBtn.querySelector('span').textContent = sub.active ? 'Pause' : 'Reactivate';
        const toggleIcon = toggleBtn.querySelector('svg');
        if (toggleIcon) {
            toggleIcon.innerHTML = sub.active
                ? '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'
                : '<path d="M5 3l14 9-14 9V3z" fill="currentColor"/>';
        }
        // The pause/reactivate dialogs render on top and refresh this modal
        // themselves, so we don't close the details modal here.
        toggleBtn.onclick = () => { handleToggle(sub.id); };

        // Edit opens the edit modal from the details context (so we can
        // reopen details afterward). Delete reuses the confirm flow.
        _q('#sub-detail-edit-btn').onclick   = () => { closeDrawer(); openEditModal(sub.id, { fromDetails: true }); };
        _q('#sub-detail-delete-btn').onclick = () => { closeDrawer(); handleDelete(sub.id); };
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
            if (e.key !== 'Escape') return;

            // Dynamically-built dialogs (#sub-confirm2, #sub-dateprompt) carry
            // their own Escape handlers — let those handle it and bail so we
            // don't also close the modal underneath them.
            const confirm2 = _q('#sub-confirm2');
            const dateprompt = _q('#sub-dateprompt');
            if ((confirm2 && !confirm2.hidden) || (dateprompt && !dateprompt.hidden)) return;

            // Top-most first.
            if (!_q('#rec-quickview-modal')?.hidden) closeRecQuickViewModal();
            else if (!_q('#rec-add-modal')?.hidden)     closeRecAddModal();
            else if (!_q('#sub-pause-modal')?.hidden)   closePauseModal();
            else if (!_q('#sub-confirm-modal')?.hidden) closeConfirmModal();
            else if (!_q('#sub-modal')?.hidden)         closeModal();
            else if (!_q('#sub-detail-modal')?.hidden)  closeDrawer();
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
        const drawerClose    = _q('#sub-detail-close');
        const drawerOverlay  = _q('#sub-detail-modal');
        const confirmCancel  = _q('#sub-confirm-cancel');
        const exportBtn      = _q('#sub-export-btn');
        const recAddClose    = _q('#rec-add-modal-close');
        const recAddCancel   = _q('#rec-add-cancel-btn');
        const recAddConfirm  = _q('#rec-add-confirm-btn');

        addBtn?.addEventListener('click', openAddModal);
        addFab?.addEventListener('click', openAddModal);
        moreBtn?.addEventListener('click', toggleMoreMenu);
        _q('#sub-pay-month-btn')?.addEventListener('click', handlePayMonth);
        form?.addEventListener('submit', handleModalSubmit);
        modalClose?.addEventListener('click', closeModal);
        _q('#sub-modal-cancel')?.addEventListener('click', closeModal);
        // Enter in any text/number/date/select input (not the Notes textarea)
        // triggers Save.
        form?.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            if (e.target && e.target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            handleModalSubmit(e);
        });
        drawerClose?.addEventListener('click', closeDrawer);
        // Backdrop click (only when the overlay itself is the target, not the box).
        drawerOverlay?.addEventListener('click', e => {
            if (e.target === drawerOverlay) closeDrawer();
        });
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
                _providerFilterCat = btn.dataset.cat || 'all';
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

        // Available Subscriptions collapse / expand toggle
        const libToggle = _q('#provider-library-toggle');
        const libBody = _q('#provider-library-body');
        const libControls = _q('.sub-library-panel .sub-library-controls');
        if (libToggle && libBody) {
            libToggle.addEventListener('click', () => {
                const collapsed = libBody.hasAttribute('hidden');
                if (collapsed) {
                    libBody.removeAttribute('hidden');
                    if (libControls) libControls.style.display = '';
                    libToggle.setAttribute('aria-expanded', 'true');
                    libToggle.setAttribute('aria-label', 'Hide available subscriptions');
                    libToggle.classList.remove('is-collapsed');
                } else {
                    libBody.setAttribute('hidden', '');
                    if (libControls) libControls.style.display = 'none';
                    libToggle.setAttribute('aria-expanded', 'false');
                    libToggle.setAttribute('aria-label', 'Show available subscriptions');
                    libToggle.classList.add('is-collapsed');
                }
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
        openConfirmDialog,
        openDatePromptDialog,
        handlePayMonth,
    });

})();
