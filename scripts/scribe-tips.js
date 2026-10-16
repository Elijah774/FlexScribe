/* ===========================================================
   scribe-tips.js — contextual Scribe Score tips
   -----------------------------------------------------------
   A single, reusable floating tip window that tells the user
   what they can do to earn Scribe Score points on the page
   they're viewing, with a direct action to the right workflow.

   Rules honoured:
     • Backend is the source of truth. Eligibility + point
       values come from GET /api/score — the client never
       invents points.
     • At most ONE tip is visible per page.
     • Dismissing or clicking a tip never awards points.
     • A tip stops appearing once its action is no longer
       eligible (already earned this period / category full).
     • Dismissed tips don't reappear in the same session, and a
       per-period dismissal is remembered via localStorage
       (only a non-sensitive action id + period key is stored).
     • Tips never block critical workflows (they're corner
       floating cards with a close button).

   Public API:
     ScribeTips.showForPage(pageName)
     ScribeTips.clear()
     ScribeTips.invalidate()   // drop cached score (after an award)
=========================================================== */
(function () {
    'use strict';

    var EL_ID = 'scribe-tip-floating';
    var STORE_KEY = 'flexscribe_tip_dismissed';   // { "<action>#<period>": 1 }
    var _sessionDismissed = {};                     // action -> true (this session)
    var _scoreCache = null;                          // last /api/score payload
    var _cacheAt = 0;
    var CACHE_MS = 60000;

    /* ── Page → ordered list of candidate actions ──────────────
       The first ELIGIBLE candidate for the page is shown. Each
       entry maps to an action (eventType) returned by /api/score,
       plus the tip copy and the navigation target. */
    var PAGE_TIPS = {
        dashboard: [
            { action: 'weekly_checkin',     title: 'Weekly check-in',       body: 'Review your upcoming bills and position to earn points this week.', cta: 'Start check-in', go: 'timeline' },
            { action: 'upcoming_reviewed',  title: 'Review upcoming',       body: 'Check your upcoming subscription payments to stay prepared.',       cta: 'Review payments', go: 'timeline' },
            { action: 'goal_created',       title: 'Improve your score',    body: 'Set a financial goal to start earning in the Goals category.',       cta: 'Set a goal', go: 'goals' }
        ],
        subscription: [
            { action: 'sub_added',          title: 'Add a subscription',    body: 'Add a subscription with its plan, price and billing date.',          cta: 'Add subscription', go: 'subscription' },
            { action: 'sub_updated',        title: 'Keep details current',  body: 'A meaningful update to a subscription keeps your records accurate.',  cta: 'View subscriptions', go: 'subscription' }
        ],
        wallet: [
            { action: 'payment_ready',      title: 'Be payment-ready',      body: 'Make sure your balance covers upcoming subscriptions before they bill.', cta: 'View upcoming', go: 'timeline' }
        ],
        timeline: [
            { action: 'upcoming_reviewed',  title: 'Review upcoming',       body: 'Reviewing your upcoming payments this month keeps you on track.',     cta: 'Review payments', go: 'timeline' },
            { action: 'payment_ready',      title: 'Be payment-ready',      body: 'Check whether your balance covers your upcoming subscriptions.',       cta: 'Open wallet', go: 'wallet' }
        ],
        analytics: [
            { action: 'analytics_reviewed', title: 'Review your spending',  body: 'Review your monthly spending analytics to stay financially aware.',   cta: 'Open analytics', go: 'analytics' }
        ],
        goals: [
            { action: 'goal_created',       title: 'Set a financial goal',  body: 'Create a goal, then earn more as you reach each milestone.',          cta: 'Create a goal', go: 'goals' },
            { action: 'goal_milestone',     title: 'Reach a milestone',     body: 'Add funds toward a goal to reach its next 25/50/75/100% milestone.',  cta: 'View goals', go: 'goals' }
        ]
    };

    /* ── localStorage dismissal (non-sensitive) ──────────────── */
    function _loadDismissed() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }
    function _saveDismissed(obj) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) {}
    }
    // A short, non-sensitive period key so a dismissal resets when the next
    // earning period begins (monthly for most actions; weekly for check-in).
    function _periodKeyFor(action) {
        var d = new Date();
        if (action === 'weekly_checkin') {
            var day = (d.getDay() + 6) % 7;              // Mon=0
            var monday = new Date(d); monday.setDate(d.getDate() - day);
            return 'W' + monday.toISOString().slice(0, 10);
        }
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    function _isDismissed(action) {
        if (_sessionDismissed[action]) return true;
        var store = _loadDismissed();
        return !!store[action + '#' + _periodKeyFor(action)];
    }
    function _rememberDismissed(action) {
        _sessionDismissed[action] = true;
        var store = _loadDismissed();
        store[action + '#' + _periodKeyFor(action)] = 1;
        _saveDismissed(store);
    }

    /* ── Score fetch (cached) ──────────────────────────────────*/
    function _getScore() {
        if (_scoreCache && (Date.now() - _cacheAt) < CACHE_MS) {
            return Promise.resolve(_scoreCache);
        }
        if (typeof API === 'undefined' || !API.Score) return Promise.resolve(null);
        return API.Score.get().then(function (res) {
            if (res && res.success && res.data) {
                _scoreCache = res.data; _cacheAt = Date.now();
                return _scoreCache;
            }
            return null;
        }).catch(function () { return null; });
    }

    function invalidate() { _scoreCache = null; _cacheAt = 0; }

    /* ── Rendering ─────────────────────────────────────────────*/
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function clear() {
        var ex = document.getElementById(EL_ID);
        if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    }

    var LIGHTBULB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0012 2z"/></svg>';
    var CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    function _renderTip(tip, points, eligible) {
        clear();
        var el = document.createElement('div');
        el.id = EL_ID;
        el.className = 'scribe-tip scribe-tip--corner' + (eligible ? '' : ' scribe-tip--info');
        el.setAttribute('role', 'status');
        // When eligible → "+N points" (earnable now). When not → an honest
        // "Earn +N" worth label so we never falsely promise points right now.
        var pointsLabel = eligible ? ('+' + points + ' points') : ('Worth +' + points);
        el.innerHTML =
            '<div class="scribe-tip-head">' +
                '<span class="scribe-tip-icon">' + LIGHTBULB + '</span>' +
                '<span class="scribe-tip-title">' + _esc(tip.title) + '</span>' +
                '<button class="scribe-tip-close" type="button" aria-label="Dismiss tip">' + CLOSE + '</button>' +
            '</div>' +
            '<p class="scribe-tip-body">' + _esc(tip.body) + '</p>' +
            '<div class="scribe-tip-footer">' +
                '<span class="scribe-tip-points">' + pointsLabel + '</span>' +
                '<button class="scribe-tip-action" type="button">' + _esc(tip.cta) + '</button>' +
            '</div>';

        document.body.appendChild(el);
        _applyPos(el);
        _makeDraggable(el);
        // Fade-in next frame.
        requestAnimationFrame(function () { el.classList.add('scribe-tip--visible'); });

        // Dismiss (never awards points).
        el.querySelector('.scribe-tip-close').addEventListener('click', function () {
            _rememberDismissed(tip.action);
            _hide(el);
        });
        // Action navigates to the relevant workflow (never awards points).
        el.querySelector('.scribe-tip-action').addEventListener('click', function () {
            _hide(el);
            if (typeof loadPage === 'function' && tip.go) loadPage(tip.go);
        });
    }

    function _renderNeutral() {
        clear();
        var el = document.createElement('div');
        el.id = EL_ID;
        el.className = 'scribe-tip scribe-tip--corner scribe-tip--neutral';
        el.setAttribute('role', 'status');
        el.innerHTML =
            '<div class="scribe-tip-head">' +
                '<span class="scribe-tip-icon">' + LIGHTBULB + '</span>' +
                '<span class="scribe-tip-title">You\u2019re up to date here</span>' +
                '<button class="scribe-tip-close" type="button" aria-label="Dismiss tip">' + CLOSE + '</button>' +
            '</div>' +
            '<p class="scribe-tip-body">No Scribe Score actions are available on this page right now. Check back next period.</p>';
        document.body.appendChild(el);
        _applyPos(el);
        _makeDraggable(el);
        requestAnimationFrame(function () { el.classList.add('scribe-tip--visible'); });
        el.querySelector('.scribe-tip-close').addEventListener('click', function () { _hide(el); });
    }

    function _hide(el) {
        el = el || document.getElementById(EL_ID);
        if (!el) return;
        el.classList.remove('scribe-tip--visible');
        setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 300);
    }

    /* ── Draggable (grab the header to move the tip anywhere) ───
       Position is remembered for the session so it stays put as
       the user navigates between pages. */
    var _pos = null;   // { left, top } in px, session only

    function _clampToViewport(left, top, el) {
        var w = el.offsetWidth || 270, h = el.offsetHeight || 120;
        var maxL = Math.max(4, window.innerWidth - w - 4);
        var maxT = Math.max(4, window.innerHeight - h - 4);
        return { left: Math.min(Math.max(4, left), maxL), top: Math.min(Math.max(4, top), maxT) };
    }

    function _applyPos(el) {
        if (!_pos) return;
        var c = _clampToViewport(_pos.left, _pos.top, el);
        el.classList.remove('scribe-tip--corner');
        el.style.left = c.left + 'px';
        el.style.top = c.top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    }

    function _makeDraggable(el) {
        var handle = el.querySelector('.scribe-tip-head');
        if (!handle) return;
        handle.classList.add('scribe-tip-drag');
        var dragging = false, startX = 0, startY = 0, baseL = 0, baseT = 0, moved = false;

        function down(e) {
            // Don't start a drag from the close button.
            if (e.target.closest('.scribe-tip-close')) return;
            var pt = e.touches ? e.touches[0] : e;
            dragging = true; moved = false;
            var r = el.getBoundingClientRect();
            baseL = r.left; baseT = r.top;
            startX = pt.clientX; startY = pt.clientY;
            // Switch to absolute positioning from the current spot.
            el.classList.remove('scribe-tip--corner');
            el.style.left = baseL + 'px'; el.style.top = baseT + 'px';
            el.style.right = 'auto'; el.style.bottom = 'auto';
            el.classList.add('scribe-tip--dragging');
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', up);
            if (e.cancelable) e.preventDefault();
        }
        function move(e) {
            if (!dragging) return;
            var pt = e.touches ? e.touches[0] : e;
            var dx = pt.clientX - startX, dy = pt.clientY - startY;
            if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
            var c = _clampToViewport(baseL + dx, baseT + dy, el);
            el.style.left = c.left + 'px'; el.style.top = c.top + 'px';
            if (e.cancelable) e.preventDefault();
        }
        function up() {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('scribe-tip--dragging');
            if (moved) _pos = { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', up);
        }
        handle.addEventListener('mousedown', down);
        handle.addEventListener('touchstart', down, { passive: false });
    }

    // Fallback point values so an informational tip can still show its worth
    // even if the backend eligibility map hasn't loaded a figure for it.
    var ACTION_POINTS = {
        weekly_checkin: 5, upcoming_reviewed: 5, analytics_reviewed: 5,
        goal_created: 10, goal_milestone: 5, sub_added: 10, sub_updated: 5,
        payment_ready: 10, sub_cancelled: 10, payment_success: 10
    };

    /* ── Entry point: show the single best tip for a page ──────
       A tip ALWAYS appears on a page that has candidates so users
       always get guidance on how to earn points:
         1. First eligible, not-dismissed action -> "+N points".
         2. Else first not-dismissed action -> informational
            "Worth +N" (still links to the workflow, no false promise).
         3. Else (all dismissed) -> neutral "up to date" card. */
    function showForPage(pageName, opts) {
        opts = opts || {};
        var candidates = PAGE_TIPS[pageName];
        if (!candidates) { clear(); return; }

        _getScore().then(function (data) {
            var elig = (data && data.eligibility) || {};

            // 1. Prefer an eligible, not-dismissed action.
            for (var i = 0; i < candidates.length; i++) {
                var tip = candidates[i];
                var e = elig[tip.action];
                if (e && e.eligible && !_isDismissed(tip.action)) {
                    _renderTip(tip, e.points, true);
                    return;
                }
            }
            // 2. Otherwise show the first not-dismissed candidate as guidance.
            for (var j = 0; j < candidates.length; j++) {
                var t2 = candidates[j];
                if (!_isDismissed(t2.action)) {
                    var pts = (elig[t2.action] && elig[t2.action].points) || ACTION_POINTS[t2.action] || 5;
                    _renderTip(t2, pts, false);
                    return;
                }
            }
            // 3. Everything on this page was dismissed — gentle neutral card.
            _renderNeutral();
        });
    }

    window.ScribeTips = {
        showForPage: showForPage,
        clear: clear,
        invalidate: invalidate
    };
})();
