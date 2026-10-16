/* =============================================================
   FlexScribe — Shared UI Utilities
   scripts/ui-utils.js

   Exposes window.UIUtils with:
   • toast(message, type, duration)
   • ripple(element)
   • animateCounter(element, from, to, duration)
   • revealOnScroll(selector, options)
   • skeleton(container, rows, height)
   • clearSkeleton(container)
   • debounce(fn, ms)
   • throttle(fn, ms)

   Load this script before any module that uses it.
   Already used by: subscriptions-ui.js (toast replaces inline)
============================================================= */

'use strict';

const UIUtils = (() => {

    /* ----------------------------------------------------------
       TOAST NOTIFICATIONS
       Usage: UIUtils.toast('Saved!', 'success')
       Types: 'success' | 'error' | 'info' | 'warning'
    ---------------------------------------------------------- */

    const TOAST_ICONS = {
        success: '✓',
        error:   '✕',
        info:    'ℹ',
        warning: '⚠',
    };

    const TOAST_COLORS = {
        success: 'var(--green)',
        error:   'var(--danger)',
        info:    'var(--blue, #94969D)',
        warning: 'var(--yellow, #FFB65C)',
    };

    let _toastContainer = null;

    function _ensureContainer() {
        if (_toastContainer) return _toastContainer;
        _toastContainer = document.createElement('div');
        _toastContainer.id = 'ui-toast-container';
        _toastContainer.setAttribute('aria-live', 'polite');
        _toastContainer.setAttribute('aria-atomic', 'false');
        Object.assign(_toastContainer.style, {
            position:      'fixed',
            bottom:        'max(16px, env(safe-area-inset-bottom))',
            left:          '50%',
            transform:     'translateX(-50%)',
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'center',
            gap:           '10px',
            zIndex:        '9999',
            pointerEvents: 'none',
            width:         'auto',
            maxWidth:      'min(92vw, 440px)',
            padding:       '0 8px',
            boxSizing:     'border-box',
        });
        document.body.appendChild(_toastContainer);
        return _toastContainer;
    }

    /**
     * @param {string} message
     * @param {'success'|'error'|'info'|'warning'} [type='success']
     * @param {number} [duration=3000]
     */
    function toast(message, type = 'success', duration = 3000) {
        const container = _ensureContainer();

        const el = document.createElement('div');
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        Object.assign(el.style, {
            display:       'flex',
            alignItems:    'center',
            gap:           '10px',
            background:    'var(--card, #181D24)',
            border:        '1px solid var(--border, #272D35)',
            borderRadius:  '10px',
            padding:       '12px 18px',
            fontSize:      '13.5px',
            lineHeight:    '1.35',
            color:         'var(--text, #F5F5F5)',
            boxShadow:     '0 8px 24px rgba(0,0,0,0.35)',
            whiteSpace:    'normal',
            overflowWrap:  'anywhere',
            maxWidth:      '100%',
            boxSizing:     'border-box',
            pointerEvents: 'all',
            opacity:       '0',
            transform:     'translateY(12px)',
            transition:    'opacity 200ms ease, transform 200ms ease',
            userSelect:    'none',
            cursor:        'pointer',
        });

        const icon = document.createElement('span');
        icon.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;
        icon.style.color = TOAST_COLORS[type] || TOAST_COLORS.info;
        icon.style.fontWeight = '700';
        icon.style.fontSize = '15px';
        icon.style.flexShrink = '0';

        const text = document.createElement('span');
        text.textContent = message;

        el.appendChild(icon);
        el.appendChild(text);
        container.appendChild(el);

        // Entrance
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.opacity   = '1';
                el.style.transform = 'translateY(0)';
            });
        });

        // Auto-dismiss
        const timer = setTimeout(() => _dismissToast(el), duration);

        // Click to dismiss early
        el.addEventListener('click', () => {
            clearTimeout(timer);
            _dismissToast(el);
        });

        return el;
    }

    function _dismissToast(el) {
        el.style.opacity   = '0';
        el.style.transform = 'translateY(12px)';
        el.addEventListener('transitionend', () => el.remove(), { once: true });
    }


    /* ----------------------------------------------------------
       RIPPLE EFFECT
       Usage: UIUtils.ripple(buttonElement)
       Or add class .ripple-btn and call UIUtils.initRipples()
    ---------------------------------------------------------- */

    /**
     * Attach a one-shot ripple to an element on click.
     * @param {HTMLElement} el
     */
    function ripple(el) {
        el.addEventListener('click', _createRipple);
    }

    function _createRipple(e) {
        const btn    = e.currentTarget;
        const circle = document.createElement('span');
        const rect   = btn.getBoundingClientRect();
        const size   = Math.max(rect.width, rect.height);
        const x      = e.clientX - rect.left - size / 2;
        const y      = e.clientY - rect.top  - size / 2;

        Object.assign(circle.style, {
            position:     'absolute',
            width:        `${size}px`,
            height:       `${size}px`,
            left:         `${x}px`,
            top:          `${y}px`,
            borderRadius: '50%',
            background:   'rgba(255,255,255,0.22)',
            transform:    'scale(0)',
            animation:    'ripple-expand 400ms ease-out forwards',
            pointerEvents:'none',
        });

        // Ensure button has position:relative and overflow:hidden
        const prevPos = getComputedStyle(btn).position;
        if (prevPos === 'static') btn.style.position = 'relative';
        btn.style.overflow = 'hidden';

        btn.appendChild(circle);
        circle.addEventListener('animationend', () => circle.remove());
    }

    /** Auto-attach ripple to all .primary-btn and .ripple-btn elements */
    function initRipples() {
        document.querySelectorAll('.primary-btn, .ripple-btn').forEach(ripple);
    }

    // Inject the keyframe once
    if (!document.getElementById('ripple-keyframes')) {
        const style = document.createElement('style');
        style.id = 'ripple-keyframes';
        style.textContent = `
            @keyframes ripple-expand {
                to { transform: scale(2.5); opacity: 0; }
            }`;
        document.head.appendChild(style);
    }


    /* ----------------------------------------------------------
       ANIMATED COUNTER
       Usage: UIUtils.animateCounter(element, 0, 2500, 1200)
    ---------------------------------------------------------- */

    /**
     * @param {HTMLElement} el
     * @param {number} from
     * @param {number} to
     * @param {number} [duration=1200]  ms
     * @param {Function} [formatter]    optional value → string
     */
    function animateCounter(el, from, to, duration = 1200, formatter = null) {
        if (!el) return;
        const start   = performance.now();
        const range   = to - from;
        const fmt     = formatter || (v => Math.round(v).toLocaleString());
        const isFloat = !Number.isInteger(to);

        function step(now) {
            const elapsed  = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased    = 1 - Math.pow(1 - progress, 3);
            const value    = from + range * eased;
            el.textContent = fmt(isFloat ? parseFloat(value.toFixed(2)) : Math.round(value));
            if (progress < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }


    /* ----------------------------------------------------------
       SCROLL REVEAL
       Usage: UIUtils.revealOnScroll('.reveal')
    ---------------------------------------------------------- */

    /**
     * @param {string} selector  CSS selector for elements to reveal
     * @param {Object} [options]
     * @param {number} [options.threshold=0.15]
     * @param {string} [options.rootMargin='0px 0px -40px 0px']
     */
    function revealOnScroll(selector = '.reveal', options = {}) {
        const config = {
            threshold:  options.threshold  ?? 0.15,
            rootMargin: options.rootMargin ?? '0px 0px -40px 0px',
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, config);

        document.querySelectorAll(selector).forEach(el => observer.observe(el));
        return observer;
    }

    /**
     * Reveal elements one-by-one with a stagger delay.
     * Adds `data-reveal-delay` inline style to each child.
     * @param {string} parentSelector
     * @param {string} childSelector
     * @param {number} [staggerMs=80]
     */
    function revealStagger(parentSelector, childSelector, staggerMs = 80) {
        document.querySelectorAll(parentSelector).forEach(parent => {
            parent.querySelectorAll(childSelector).forEach((child, i) => {
                child.style.transitionDelay = `${i * staggerMs}ms`;
                child.classList.add('reveal');
            });
        });
        revealOnScroll(parentSelector + ' ' + childSelector);
    }


    /* ----------------------------------------------------------
       SKELETON LOADING
       Usage:
         UIUtils.skeleton('#sub-list', 4, 52)
         // ... fetch data ...
         UIUtils.clearSkeleton('#sub-list')
         // inject real content
    ---------------------------------------------------------- */

    /**
     * Injects N skeleton rows into a container.
     * @param {string|HTMLElement} target  selector or element
     * @param {number} [rows=3]
     * @param {number} [rowHeight=44]  px
     */
    function skeleton(target, rows = 3, rowHeight = 44) {
        const el = typeof target === 'string'
            ? document.querySelector(target)
            : target;
        if (!el) return;

        el.dataset.skeletonPrev = el.innerHTML;
        el.innerHTML = Array.from({ length: rows }, () => `
            <li style="display:flex;align-items:center;gap:12px;padding:10px 0;
                       border-bottom:1px solid var(--border);">
                <div class="skeleton" style="width:38px;height:38px;border-radius:10px;flex-shrink:0;"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
                    <div class="skeleton" style="width:55%;height:14px;"></div>
                    <div class="skeleton" style="width:35%;height:11px;"></div>
                </div>
                <div class="skeleton" style="width:70px;height:14px;border-radius:6px;"></div>
            </li>`).join('');
    }

    /**
     * Removes skeleton rows and optionally restores prior content.
     * @param {string|HTMLElement} target
     * @param {boolean} [restore=false]
     */
    function clearSkeleton(target, restore = false) {
        const el = typeof target === 'string'
            ? document.querySelector(target)
            : target;
        if (!el) return;
        if (restore && el.dataset.skeletonPrev) {
            el.innerHTML = el.dataset.skeletonPrev;
        } else {
            el.innerHTML = '';
        }
        delete el.dataset.skeletonPrev;
    }


    /* ----------------------------------------------------------
       DEBOUNCE / THROTTLE
    ---------------------------------------------------------- */

    /**
     * @param {Function} fn
     * @param {number}   ms
     */
    function debounce(fn, ms) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    /**
     * @param {Function} fn
     * @param {number}   ms
     */
    function throttle(fn, ms) {
        let last = 0;
        return function (...args) {
            const now = Date.now();
            if (now - last >= ms) {
                last = now;
                fn.apply(this, args);
            }
        };
    }


    /* ----------------------------------------------------------
       AUTO-INIT on DOMContentLoaded
    ---------------------------------------------------------- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRipples);
    } else {
        initRipples();
    }


    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        toast,
        ripple,
        initRipples,
        animateCounter,
        revealOnScroll,
        revealStagger,
        skeleton,
        clearSkeleton,
        debounce,
        throttle,
    });

})();

/* =============================================================
   ScribeScore — real-time score refresh
   A tiny global so any flow (bank upload, subscription payment,
   etc.) can push the latest ScribeScore to the UI immediately
   without a full page reload.

   window.ScribeScore.refresh(opts?)
     opts.toast  : optional toast message to show
     opts.delta  : optional +/- number (prefixes toast)
   Updates:
     • the dashboard score ring (DashboardUI.refreshScore)
     • the reports "Scribe Score" stat (#rpt-stat-accuracy)
============================================================= */
(function () {
    'use strict';

    function _applyToStat(score) {
        var accEl = document.getElementById('rpt-stat-accuracy');
        if (accEl) accEl.textContent = score;
        var accSub = document.getElementById('rpt-stat-accuracy-sub');
        if (accSub) {
            if (score >= 800) accSub.textContent = 'Excellent';
            else if (score >= 500) accSub.textContent = 'Good';
            else if (score > 0) accSub.textContent = 'Building';
            else accSub.textContent = '--';
        }
    }

    function refresh(opts) {
        opts = opts || {};
        // Re-render the dashboard ring/breakdown if that module is mounted.
        try { if (window.DashboardUI && DashboardUI.refreshScore) DashboardUI.refreshScore(); } catch (e) {}

        // The score just changed — drop the tips' cached score so the next
        // tip reflects the new eligibility (e.g. an earned action vanishes),
        // then re-show the current page's tip.
        try {
            if (window.ScribeTips) {
                ScribeTips.invalidate();
                var page = (typeof getCurrentPage === 'function') ? getCurrentPage() : _currentPageName();
                if (page) ScribeTips.showForPage(page);
            }
        } catch (e) {}

        // Pull the authoritative score and update any visible stat + toast.
        if (typeof API !== 'undefined' && API.Auth && API.Auth.getUser) {
            API.Auth.getUser().then(function (res) {
                if (!res || !res.success || !res.data) return;
                var score = parseInt(res.data.scribeScore) || 0;
                _applyToStat(score);
                if (opts.toast && window.UIUtils) {
                    var prefix = (typeof opts.delta === 'number' && opts.delta !== 0)
                        ? (opts.delta > 0 ? '+' + opts.delta + ' · ' : opts.delta + ' · ')
                        : '';
                    UIUtils.toast(prefix + opts.toast, opts.delta < 0 ? 'warning' : 'success');
                }
            }).catch(function () {});
        }
    }

    // Best-effort "which page is showing" — reads the visible page panel.
    function _currentPageName() {
        try {
            var panels = document.querySelectorAll('.page-panel');
            for (var i = 0; i < panels.length; i++) {
                if (!panels[i].hidden) {
                    return panels[i].id ? panels[i].id.replace(/-panel$/, '').replace(/^panel-/, '') : null;
                }
            }
        } catch (e) {}
        return null;
    }

    window.ScribeScore = { refresh: refresh };
})();
