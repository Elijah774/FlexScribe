/* ===========================================================
   notificationTypes.js
   Centralized enumeration of notification types, priorities,
   related-entity types, and default action URLs.

   Keep this file as the single source of truth so the type
   strings stay consistent across the service, routes, jobs,
   and (via the API) the website and Android app.
=========================================================== */

'use strict';

// ── Notification type identifiers ──────────────────────────
const NOTIFICATION_TYPES = Object.freeze({
    PAYMENT_SUCCESS:               'PAYMENT_SUCCESS',
    PAYMENT_FAILED:                'PAYMENT_FAILED',
    SUBSCRIPTION_ADDED:            'SUBSCRIPTION_ADDED',
    SUBSCRIPTION_UPDATED:          'SUBSCRIPTION_UPDATED',
    SUBSCRIPTION_CANCELLED:        'SUBSCRIPTION_CANCELLED',
    SUBSCRIPTION_PAUSED:           'SUBSCRIPTION_PAUSED',
    SUBSCRIPTION_RENEWAL_REMINDER: 'SUBSCRIPTION_RENEWAL_REMINDER',
    UPCOMING_PAYMENT:              'UPCOMING_PAYMENT',
    LOW_BALANCE:                   'LOW_BALANCE',
    INSUFFICIENT_FUNDS:            'INSUFFICIENT_FUNDS',
    GOAL_PROGRESS:                 'GOAL_PROGRESS',
    GOAL_COMPLETED:                'GOAL_COMPLETED',
    WEEKLY_SUMMARY:                'WEEKLY_SUMMARY',
    MONTHLY_SUMMARY:               'MONTHLY_SUMMARY',
    SYSTEM:                        'SYSTEM',
    FLEXTAP:                       'FLEXTAP'
});

// ── Priority levels ────────────────────────────────────────
const PRIORITY = Object.freeze({
    LOW:      'low',
    MEDIUM:   'medium',
    HIGH:     'high',
    CRITICAL: 'critical'
});

// ── Related entity types (what the notification points at) ──
const ENTITY_TYPES = Object.freeze({
    SUBSCRIPTION: 'SUBSCRIPTION',
    WALLET:       'WALLET',
    TRANSACTION:  'TRANSACTION',
    GOAL:         'GOAL',
    REPORT:       'REPORT',
    DEPENDANT:    'DEPENDANT',
    NONE:         'NONE'
});

// ── Default in-app action URLs per type ────────────────────
// The website uses these directly; Android maps them to screens.
const DEFAULT_ACTION_URLS = Object.freeze({
    PAYMENT_SUCCESS:               '/wallet',
    PAYMENT_FAILED:                '/wallet',
    SUBSCRIPTION_ADDED:            '/subscriptions',
    SUBSCRIPTION_UPDATED:          '/subscriptions',
    SUBSCRIPTION_CANCELLED:        '/subscriptions',
    SUBSCRIPTION_PAUSED:           '/subscriptions',
    SUBSCRIPTION_RENEWAL_REMINDER: '/subscriptions',
    UPCOMING_PAYMENT:              '/timeline',
    LOW_BALANCE:                   '/wallet',
    INSUFFICIENT_FUNDS:            '/wallet',
    GOAL_PROGRESS:                 '/goals',
    GOAL_COMPLETED:                '/goals',
    WEEKLY_SUMMARY:                '/analytics',
    MONTHLY_SUMMARY:               '/reports',
    SYSTEM:                        '/dashboard',
    FLEXTAP:                       '/wallet'
});

// ── Default priority per type ──────────────────────────────
const DEFAULT_PRIORITY = Object.freeze({
    PAYMENT_SUCCESS:               PRIORITY.MEDIUM,
    PAYMENT_FAILED:                PRIORITY.CRITICAL,
    SUBSCRIPTION_ADDED:            PRIORITY.LOW,
    SUBSCRIPTION_UPDATED:          PRIORITY.LOW,
    SUBSCRIPTION_CANCELLED:        PRIORITY.MEDIUM,
    SUBSCRIPTION_PAUSED:           PRIORITY.LOW,
    SUBSCRIPTION_RENEWAL_REMINDER: PRIORITY.MEDIUM,
    UPCOMING_PAYMENT:              PRIORITY.MEDIUM,
    LOW_BALANCE:                   PRIORITY.HIGH,
    INSUFFICIENT_FUNDS:            PRIORITY.HIGH,
    GOAL_PROGRESS:                 PRIORITY.LOW,
    GOAL_COMPLETED:                PRIORITY.MEDIUM,
    WEEKLY_SUMMARY:                PRIORITY.LOW,
    MONTHLY_SUMMARY:               PRIORITY.LOW,
    SYSTEM:                        PRIORITY.MEDIUM,
    FLEXTAP:                       PRIORITY.MEDIUM
});

// ── FlexTap types are defined but dormant until FlexTap ships ──
const DORMANT_TYPES = Object.freeze([
    NOTIFICATION_TYPES.FLEXTAP
]);

// ── Helper: is a given string a valid notification type? ────
function isValidType(type) {
    return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, type)
        || Object.values(NOTIFICATION_TYPES).indexOf(type) !== -1;
}

function isValidPriority(priority) {
    return Object.values(PRIORITY).indexOf(priority) !== -1;
}

module.exports = {
    NOTIFICATION_TYPES,
    PRIORITY,
    ENTITY_TYPES,
    DEFAULT_ACTION_URLS,
    DEFAULT_PRIORITY,
    DORMANT_TYPES,
    isValidType,
    isValidPriority
};
