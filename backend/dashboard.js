/* ===========================================================
   DashboardStore — localStorage-backed dashboard configuration
   Manages widget layout, style presets, and accent colour.
=========================================================== */

const DashboardStore = (function () {
    'use strict';

    const STORAGE_KEY = 'flexscribe_dashboard_config';
    const PRESET_KEY  = 'flexscribe_dashboard_preset';
    const ACCENT_KEY  = 'flexscribe_dashboard_accent';

    const WIDGET_IDS = [
        'greeting',
        'quick-actions',
        'flexcard',
        'wallet-balance',
        'active-subs',
        'upcoming-payments-stat',
        'scribe-score',
        'spending-overview',
        'monthly-trend',
        'top-categories',
        'upcoming-payments-list',
        'recent-transactions',
        'goals-progress',
        'calendar',
        'scribe-points',
        'ai-insight'
    ];

    function _defaultConfig() {
        return WIDGET_IDS.map(function (id, index) {
            var size = 'normal';
            if (['wallet-balance', 'active-subs', 'upcoming-payments-stat', 'scribe-score'].indexOf(id) !== -1) {
                size = 'compact';
            }
            var enabled = (id !== 'greeting');
            return { id: id, enabled: enabled, size: size, order: index };
        });
    }

    function getConfig() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) { /* corrupted – fall through */ }
        return _defaultConfig();
    }

    function saveConfig(config) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }

    function resetToDefault() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PRESET_KEY);
        localStorage.removeItem(ACCENT_KEY);
    }

    function getPreset() {
        return localStorage.getItem(PRESET_KEY) || 'modern';
    }

    function setPreset(name) {
        localStorage.setItem(PRESET_KEY, name);
    }

    function getAccent() {
        return localStorage.getItem(ACCENT_KEY) || '#FF8A34';
    }

    function setAccent(hex) {
        localStorage.setItem(ACCENT_KEY, hex);
    }

    function toggleWidget(id) {
        var config = getConfig();
        var widget = config.find(function (w) { return w.id === id; });
        if (widget) {
            widget.enabled = !widget.enabled;
            saveConfig(config);
        }
    }

    function reorderWidgets(orderedIds) {
        var config = getConfig();
        orderedIds.forEach(function (id, index) {
            var widget = config.find(function (w) { return w.id === id; });
            if (widget) widget.order = index;
        });
        config.sort(function (a, b) { return a.order - b.order; });
        saveConfig(config);
    }

    function resizeWidget(id, size) {
        var config = getConfig();
        var widget = config.find(function (w) { return w.id === id; });
        if (widget) {
            widget.size = size;
            saveConfig(config);
        }
    }

    return {
        getConfig:      getConfig,
        saveConfig:     saveConfig,
        resetToDefault: resetToDefault,
        getPreset:      getPreset,
        setPreset:      setPreset,
        getAccent:      getAccent,
        setAccent:      setAccent,
        toggleWidget:   toggleWidget,
        reorderWidgets: reorderWidgets,
        resizeWidget:   resizeWidget
    };
})();
