'use strict';

const TimelineUI = (() => {
    let _initialized = false;
    let _currentYear = new Date().getFullYear();
    let _currentMonth = new Date().getMonth();
    var _monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function init() {
        var monthSelect = document.getElementById('tl-month-select');
        if (!monthSelect) return;

        if (!_initialized) {
            // Populate month dropdown
            _monthNames.forEach(function(name, i) {
                var opt = document.createElement('option');
                opt.value = i;
                opt.textContent = name + ' ' + _currentYear;
                if (i === _currentMonth) opt.selected = true;
                monthSelect.appendChild(opt);
            });
            monthSelect.addEventListener('change', function() { _currentMonth = parseInt(this.value); _renderCalendar(); });

            var prevBtn = document.getElementById('tl-prev-month');
            var nextBtn = document.getElementById('tl-next-month');
            if (prevBtn) prevBtn.addEventListener('click', function() { _currentMonth--; if (_currentMonth < 0) { _currentMonth = 11; _currentYear--; } monthSelect.value = _currentMonth; _renderCalendar(); });
            if (nextBtn) nextBtn.addEventListener('click', function() { _currentMonth++; if (_currentMonth > 11) { _currentMonth = 0; _currentYear++; } monthSelect.value = _currentMonth; _renderCalendar(); });

            _initialized = true;
        }

        _renderCalendar();
    }

    function _getSubscriptions() {
        if (typeof SubscriptionStore !== 'undefined') return SubscriptionStore.getAll();
        return [];
    }

    function _renderCalendar() {
        var grid = document.getElementById('tl-days-grid');
        var details = document.getElementById('tl-details');
        if (!grid) return;

        var subs = _getSubscriptions();
        var firstDay = new Date(_currentYear, _currentMonth, 1).getDay();
        var daysInMonth = new Date(_currentYear, _currentMonth + 1, 0).getDate();
        var today = new Date();
        var todayDate = today.getDate();
        var todayMonth = today.getMonth();
        var todayYear = today.getFullYear();

        var dayMap = {};
        subs.forEach(function(sub) {
            if (!sub.nextPaymentDate) return;
            var d = new Date(sub.nextPaymentDate);
            // Payment due this month
            if (d.getMonth() === _currentMonth && d.getFullYear() === _currentYear) {
                var day = d.getDate();
                if (!dayMap[day]) dayMap[day] = [];
                dayMap[day].push({ name: sub.name, amount: sub.amount, type: 'due', autoRenew: !!sub.active });
            }
            // Auto-renewal: active subs renew monthly on same day
            if (sub.active && sub.nextPaymentDate) {
                var renewDay = new Date(sub.nextPaymentDate).getDate();
                if (renewDay <= daysInMonth) {
                    if (!dayMap[renewDay]) dayMap[renewDay] = [];
                    var exists = dayMap[renewDay].some(function(e) { return e.name === sub.name; });
                    if (!exists) {
                        dayMap[renewDay].push({ name: sub.name, amount: sub.amount, type: 'renew', autoRenew: true });
                    }
                }
            }
        });

        var offset = firstDay === 0 ? 6 : firstDay - 1;
        var html = '';
        for (var i = 0; i < offset; i++) html += '<div class="tl-day empty"></div>';
        for (var day = 1; day <= daysInMonth; day++) {
            var classes = 'tl-day';
            var isToday = (day === todayDate && _currentMonth === todayMonth && _currentYear === todayYear);
            if (isToday) classes += ' today';
            var events = dayMap[day] || [];
            var hasDue = events.some(function(e) { return e.type === 'due'; });
            var hasRenew = events.some(function(e) { return e.autoRenew; });
            if (hasDue) classes += ' has-due';
            if (hasRenew) classes += ' has-renew';
            if (events.length > 0) classes += ' has-event';

            html += '<div class="' + classes + '" data-day="' + day + '">';
            html += '<span class="tl-day-num">' + day + '</span>';
            if (events.length > 0) {
                html += '<div class="tl-day-dots">';
                if (hasDue) html += '<span class="tl-day-dot tl-dot-due"></span>';
                if (hasRenew) html += '<span class="tl-day-dot tl-dot-renew"></span>';
                html += '</div>';
            }
            html += '</div>';
        }
        grid.innerHTML = html;

        grid.onclick = function(e) {
            var dayEl = e.target.closest('.tl-day.has-event');
            if (!dayEl) return;
            var clickedDay = parseInt(dayEl.dataset.day);
            _renderDetails(clickedDay, dayMap[clickedDay] || []);
        };

        if (details) details.innerHTML = '<p class="tl-details-placeholder">Click on a highlighted day to see subscription details.</p>';
    }

    function _renderDetails(day, events) {
        var details = document.getElementById('tl-details');
        if (!details) return;
        var dateStr = day + ' ' + _monthNames[_currentMonth] + ' ' + _currentYear;
        var html = '<p class="tl-detail-header">' + dateStr + '</p><div class="tl-detail-list">';
        events.forEach(function(ev) {
            var badge = ev.type === 'due' ? '<span class="tl-detail-badge tl-badge-due">Payment Due</span>' : '';
            if (ev.autoRenew) badge += '<span class="tl-detail-badge tl-badge-renew">Auto-Renew</span>';
            html += '<div class="tl-detail-item"><div><span class="tl-detail-name">' + ev.name + '</span>' + badge + '</div><span class="tl-detail-amount">R' + (ev.amount || 0).toFixed(2) + '</span></div>';
        });
        html += '</div>';
        details.innerHTML = html;
    }

    return Object.freeze({ init: init });
})();
