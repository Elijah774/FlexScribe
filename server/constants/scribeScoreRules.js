/* ===========================================================
   scribeScoreRules.js
   Single source of truth for the Scribe Score rule engine:
   the five categories, their maximum points, and every
   point-earning rule (event type, category, points, and a
   short human description used by tips + activity feeds).

   The score is transparent and rule-based, out of 1,000:
     Subscription Management  250
     Payment Readiness        300
     Financial Awareness      200
     Financial Goals          150
     Consistency              100
     ---------------------------------
     TOTAL                  1,000

   Never deduct points for a low balance, low income or
   insufficient funds, and never award points simply for
   depositing or spending money.
=========================================================== */

'use strict';

const MAX_SCORE = 1000;

// ── Category identifiers + their point ceilings ────────────
const CATEGORIES = Object.freeze({
    SUBSCRIPTION: 'subscription',
    PAYMENT:      'payment',
    AWARENESS:    'awareness',
    GOALS:        'goals',
    CONSISTENCY:  'consistency'
});

const CATEGORY_MAX = Object.freeze({
    [CATEGORIES.SUBSCRIPTION]: 250,
    [CATEGORIES.PAYMENT]:      300,
    [CATEGORIES.AWARENESS]:    200,
    [CATEGORIES.GOALS]:        150,
    [CATEGORIES.CONSISTENCY]:  100
});

const CATEGORY_LABEL = Object.freeze({
    [CATEGORIES.SUBSCRIPTION]: 'Subscription Management',
    [CATEGORIES.PAYMENT]:      'Payment Readiness',
    [CATEGORIES.AWARENESS]:    'Financial Awareness',
    [CATEGORIES.GOALS]:        'Financial Goals',
    [CATEGORIES.CONSISTENCY]:  'Consistency'
});

// Display order (used by the breakdown + category widgets).
const CATEGORY_ORDER = Object.freeze([
    CATEGORIES.SUBSCRIPTION,
    CATEGORIES.PAYMENT,
    CATEGORIES.AWARENESS,
    CATEGORIES.GOALS,
    CATEGORIES.CONSISTENCY
]);

// ── Event types (idempotency keys live in the DB per event) ─
const EVENTS = Object.freeze({
    // Subscription Management
    SUB_ADDED:          'sub_added',
    SUB_UPDATED:        'sub_updated',
    SUB_CANCELLED:      'sub_cancelled',
    // Payment Readiness
    PAYMENT_READY:      'payment_ready',
    PAYMENT_SUCCESS:    'payment_success',
    PAYMENT_MISSED:     'payment_missed',
    // Financial Awareness
    ANALYTICS_REVIEWED: 'analytics_reviewed',
    UPCOMING_REVIEWED:  'upcoming_reviewed',
    // Financial Goals
    GOAL_CREATED:       'goal_created',
    GOAL_MILESTONE:     'goal_milestone',
    // Consistency
    WEEKLY_CHECKIN:     'weekly_checkin',

    // ── Pre-existing (kept for backward compatibility) ──
    SUBS_PAID:          'subs_paid',
    SUBS_UNPAID:        'subs_unpaid',
    BANK_UPLOAD:        'bank_upload',
    GOAL_COMPLETED:     'goal_completed'
});

// ── Rule definitions: points + owning category per event ───
const RULES = Object.freeze({
    [EVENTS.SUB_ADDED]:          { category: CATEGORIES.SUBSCRIPTION, points: 10, label: 'Added a subscription' },
    [EVENTS.SUB_UPDATED]:        { category: CATEGORIES.SUBSCRIPTION, points: 5,  label: 'Updated subscription details' },
    [EVENTS.SUB_CANCELLED]:      { category: CATEGORIES.SUBSCRIPTION, points: 10, label: 'Recorded a cancellation' },

    [EVENTS.PAYMENT_READY]:      { category: CATEGORIES.PAYMENT, points: 10, label: 'Funds ready before a payment' },
    [EVENTS.PAYMENT_SUCCESS]:    { category: CATEGORIES.PAYMENT, points: 10, label: 'Completed a subscription payment' },
    [EVENTS.PAYMENT_MISSED]:     { category: CATEGORIES.PAYMENT, points: -15, label: 'Missed a subscription payment' },

    [EVENTS.ANALYTICS_REVIEWED]: { category: CATEGORIES.AWARENESS, points: 5, label: 'Reviewed monthly analytics' },
    [EVENTS.UPCOMING_REVIEWED]:  { category: CATEGORIES.AWARENESS, points: 5, label: 'Reviewed upcoming payments' },

    [EVENTS.GOAL_CREATED]:       { category: CATEGORIES.GOALS, points: 10, label: 'Created a financial goal' },
    [EVENTS.GOAL_MILESTONE]:     { category: CATEGORIES.GOALS, points: 5,  label: 'Reached a goal milestone' },

    [EVENTS.WEEKLY_CHECKIN]:     { category: CATEGORIES.CONSISTENCY, points: 5, label: 'Completed a weekly check-in' },

    // Pre-existing events mapped to their categories so the
    // breakdown still accounts for historical points.
    [EVENTS.SUBS_PAID]:          { category: CATEGORIES.PAYMENT,     points: 10,  label: 'All subscriptions paid' },
    [EVENTS.SUBS_UNPAID]:        { category: CATEGORIES.PAYMENT,     points: -10, label: 'Subscriptions left unpaid' },
    [EVENTS.BANK_UPLOAD]:        { category: CATEGORIES.AWARENESS,   points: 50,  label: 'Uploaded a bank statement' },
    [EVENTS.GOAL_COMPLETED]:     { category: CATEGORIES.GOALS,       points: 5,   label: 'Completed a goal' }
});

// Goal milestones (percent complete).
const GOAL_MILESTONES = Object.freeze([25, 50, 75, 100]);

function categoryOf(eventType) {
    return RULES[eventType] ? RULES[eventType].category : null;
}
function pointsOf(eventType) {
    return RULES[eventType] ? RULES[eventType].points : 0;
}
function labelOf(eventType) {
    return RULES[eventType] ? RULES[eventType].label : eventType;
}

module.exports = {
    MAX_SCORE,
    CATEGORIES,
    CATEGORY_MAX,
    CATEGORY_LABEL,
    CATEGORY_ORDER,
    EVENTS,
    RULES,
    GOAL_MILESTONES,
    categoryOf,
    pointsOf,
    labelOf
};
