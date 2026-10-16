/* ===========================================================
   Helper: ScribeScore — conduct-based points engine
   -----------------------------------------------------------
   Subscriber.scribeScore is the single authoritative score
   shown in the UI. ScribeScore.scoreValue is kept in sync.

   Rules (started here):
     • All active subscriptions paid for the month -> +10 (once/month)
     • Any active subscription left unpaid          -> -10 (once/month)
     • Bank statement uploaded                      -> +50 (max 2/year)

   Every change is logged in ScribeScoreEvent with an idempotent
   (subscriberID, eventType, periodKey) unique key, so the same
   monthly/yearly award can't be applied twice.
=========================================================== */
const { query } = require('../db');
const RULES_DEF = require('../constants/scribeScoreRules');

const POINTS = {
    SUBS_PAID: 10,
    SUBS_UNPAID: -10,
    BANK_UPLOAD: 50,
    GOAL_COMPLETED: 5,
};
const BANK_UPLOADS_PER_YEAR = 2;
const SCORE_FLOOR = 0;
const SCORE_CEILING = RULES_DEF.MAX_SCORE; // 1000

/** Current month key, e.g. "2026-08". */
function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Current year key, e.g. "2026". */
function yearKey(d = new Date()) {
    return String(d.getFullYear());
}
/** ISO week key, e.g. "2026-W34" (one earning period per calendar week). */
function weekKey(d = new Date()) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;          // Mon=1..Sun=7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum); // nearest Thursday
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Read the authoritative score. */
async function getScore(subscriberID) {
    const r = await query('SELECT scribeScore FROM Subscriber WHERE subscriberID = @id', { id: subscriberID });
    return r.recordset.length ? (parseInt(r.recordset[0].scribeScore) || 0) : 0;
}

/** Apply a raw signed delta to the score (clamped at the floor).
    Updates Subscriber.scribeScore and mirrors into ScribeScore.scoreValue.
    Returns the new score. */
async function adjustScore(subscriberID, delta) {
    const current = await getScore(subscriberID);
    // Clamp between the floor (0) and the 1,000 ceiling.
    const next = Math.min(SCORE_CEILING, Math.max(SCORE_FLOOR, current + delta));

    await query('UPDATE Subscriber SET scribeScore = @s WHERE subscriberID = @id', { s: next, id: subscriberID });

    // Keep the ScribeScore table in sync (used by reports + legacy reads).
    const existing = await query('SELECT TOP 1 scoreID FROM ScribeScore WHERE subscriberID = @id ORDER BY generatedAt DESC', { id: subscriberID });
    if (existing.recordset.length) {
        await query('UPDATE ScribeScore SET scoreValue = @s, generatedAt = GETDATE() WHERE scoreID = @sid', { s: next, sid: existing.recordset[0].scoreID });
    } else {
        await query('INSERT INTO ScribeScore (subscriberID, scoreValue) VALUES (@id, @s)', { id: subscriberID, s: next });
    }
    return next;
}

/** Apply a points event idempotently. If an event with the same
    (subscriberID, eventType, periodKey) already exists, nothing happens.
    Returns { applied: boolean, score: number, delta: number }. */
async function applyEvent(subscriberID, eventType, periodKey, points, category) {
    // Resolve the owning category from the rule table if not passed.
    const cat = category || RULES_DEF.categoryOf(eventType) || null;

    // Already applied for this period?
    const dupe = await query(
        'SELECT eventID FROM ScribeScoreEvent WHERE subscriberID = @id AND eventType = @t AND periodKey = @p',
        { id: subscriberID, t: eventType, p: periodKey }
    );
    if (dupe.recordset.length) {
        return { applied: false, score: await getScore(subscriberID), delta: 0, category: cat };
    }

    // Enforce the per-category ceiling: only award up to the headroom left in
    // the category. (Positive awards only — negative/legacy deltas pass through.)
    let effectivePoints = points;
    if (cat && points > 0) {
        const used = await categoryTotal(subscriberID, cat);
        const max = RULES_DEF.CATEGORY_MAX[cat] || 0;
        const headroom = Math.max(0, max - used);
        if (headroom <= 0) {
            return { applied: false, score: await getScore(subscriberID), delta: 0, category: cat, reason: 'category_full' };
        }
        effectivePoints = Math.min(points, headroom);
    }

    const score = await adjustScore(subscriberID, effectivePoints);
    try {
        await query(
            'INSERT INTO ScribeScoreEvent (subscriberID, eventType, periodKey, points, scoreAfter, category) VALUES (@id, @t, @p, @pts, @after, @cat)',
            { id: subscriberID, t: eventType, p: periodKey, pts: effectivePoints, after: score, cat }
        );
    } catch (err) {
        // Unique-key race: another request logged it first. The score delta
        // we just applied would then be a duplicate — reverse it to stay correct.
        await adjustScore(subscriberID, -effectivePoints);
        return { applied: false, score: await getScore(subscriberID), delta: 0, category: cat };
    }
    return { applied: true, score, delta: effectivePoints, category: cat };
}

/* ----------------------------------------------------------
   Category helpers — the ScribeScoreEvent log is the source
   of truth, so per-category totals are summed from it.
---------------------------------------------------------- */

/** Sum of points logged for one category (clamped 0..categoryMax). */
async function categoryTotal(subscriberID, category) {
    const r = await query(
        'SELECT ISNULL(SUM(points), 0) AS total FROM ScribeScoreEvent WHERE subscriberID = @id AND category = @cat',
        { id: subscriberID, cat: category }
    );
    const raw = parseInt(r.recordset[0].total) || 0;
    const max = RULES_DEF.CATEGORY_MAX[category] || 0;
    return Math.max(0, Math.min(max, raw));
}

/** Full category breakdown: [{ key, label, points, max }] in display order. */
async function categoryBreakdown(subscriberID) {
    const r = await query(
        'SELECT category, ISNULL(SUM(points), 0) AS total FROM ScribeScoreEvent WHERE subscriberID = @id GROUP BY category',
        { id: subscriberID }
    );
    const byCat = {};
    r.recordset.forEach(row => { if (row.category) byCat[row.category] = parseInt(row.total) || 0; });

    return RULES_DEF.CATEGORY_ORDER.map(key => {
        const max = RULES_DEF.CATEGORY_MAX[key] || 0;
        const points = Math.max(0, Math.min(max, byCat[key] || 0));
        return { key, label: RULES_DEF.CATEGORY_LABEL[key], points, max };
    });
}

/** Recent score activity (newest first) for the activity feed.
    Includes both increases and decreases so poor-conduct deductions
    (e.g. a missed payment) are visible, not just awards. */
async function recentActivity(subscriberID, limit = 6) {
    const r = await query(
        `SELECT TOP (@lim) eventType, category, points, createdAt
         FROM ScribeScoreEvent WHERE subscriberID = @id AND points <> 0
         ORDER BY eventID DESC`,
        { id: subscriberID, lim: limit }
    );
    return r.recordset.map(row => ({
        eventType: row.eventType,
        category: row.category,
        label: RULES_DEF.labelOf(row.eventType),
        points: parseInt(row.points) || 0,
        at: row.createdAt
    }));
}

/** Has an idempotent event already been logged for this period/key? */
async function hasEvent(subscriberID, eventType, periodKey) {
    const r = await query(
        'SELECT eventID FROM ScribeScoreEvent WHERE subscriberID = @id AND eventType = @t AND periodKey = @p',
        { id: subscriberID, t: eventType, p: periodKey }
    );
    return r.recordset.length > 0;
}

/* ----------------------------------------------------------
   RULE: Bank statement upload (+50, max 2 per calendar year)
   Call BEFORE inserting the BankStatement row is not required;
   the cap is checked against existing BankStatement rows by the
   route. This just awards the points idempotently per upload.
   `uploadSeq` makes the periodKey unique per allowed upload
   (1 or 2) so both yearly uploads are awarded, but re-processing
   the same upload won't double-award.
---------------------------------------------------------- */
async function awardBankUpload(subscriberID, uploadSeq) {
    const key = `${yearKey()}#${uploadSeq}`;
    return applyEvent(subscriberID, 'bank_upload', key, POINTS.BANK_UPLOAD);
}

/* ----------------------------------------------------------
   RULE: Goal completed (+5, once per goal)
   The periodKey is the goalID so each goal awards exactly once,
   even if it's completed/re-opened/completed again.
---------------------------------------------------------- */
async function awardGoalCompleted(subscriberID, goalID) {
    return applyEvent(subscriberID, 'goal_completed', `goal#${goalID}`, POINTS.GOAL_COMPLETED);
}

/* ===========================================================
   NEW category-aware award helpers (1,000-point rule engine).
   Each uses an idempotent periodKey so a given qualifying
   event awards exactly once per its earning period, and the
   per-category cap is enforced inside applyEvent.
=========================================================== */
const E = RULES_DEF.EVENTS;

// ── Subscription Management (250) ──────────────────────────
/** +10 once per subscription added. */
async function awardSubAdded(subscriberID, subscriptionID) {
    return applyEvent(subscriberID, E.SUB_ADDED, `sub#${subscriptionID}`, RULES_DEF.pointsOf(E.SUB_ADDED));
}
/** +5 for a meaningful update, max once per subscription per month. */
async function awardSubUpdated(subscriberID, subscriptionID) {
    return applyEvent(subscriberID, E.SUB_UPDATED, `sub_upd#${subscriptionID}#${monthKey()}`, RULES_DEF.pointsOf(E.SUB_UPDATED));
}
/** +10 once per genuine cancellation. */
async function awardSubCancelled(subscriberID, subscriptionID) {
    return applyEvent(subscriberID, E.SUB_CANCELLED, `sub_cancel#${subscriptionID}`, RULES_DEF.pointsOf(E.SUB_CANCELLED));
}

// ── Payment Readiness (300) ────────────────────────────────
/** +10 per subscription billing cycle where funds were ready beforehand. */
async function awardPaymentReady(subscriberID, subscriptionID, period = monthKey()) {
    return applyEvent(subscriberID, E.PAYMENT_READY, `ready#${subscriptionID}#${period}`, RULES_DEF.pointsOf(E.PAYMENT_READY));
}
/** +10 per verified successful subscription payment (per cycle). */
async function awardPaymentSuccess(subscriberID, subscriptionID, period = monthKey()) {
    return applyEvent(subscriberID, E.PAYMENT_SUCCESS, `paid#${subscriptionID}#${period}`, RULES_DEF.pointsOf(E.PAYMENT_SUCCESS));
}
/** -15 per subscription whose payment was MISSED this cycle (conduct-based
    decrease — a bill the user committed to went unpaid). Idempotent per
    subscription per cycle. This is NOT a low-balance penalty in the sense of
    the floor: it fires only when a due payment is actually skipped. */
async function awardPaymentMissed(subscriberID, subscriptionID, period = monthKey()) {
    return applyEvent(subscriberID, E.PAYMENT_MISSED, `missed#${subscriptionID}#${period}`, RULES_DEF.pointsOf(E.PAYMENT_MISSED));
}

// ── Financial Awareness (200) ──────────────────────────────
/** +5 once per calendar month for reviewing monthly analytics. */
async function awardAnalyticsReviewed(subscriberID) {
    return applyEvent(subscriberID, E.ANALYTICS_REVIEWED, monthKey(), RULES_DEF.pointsOf(E.ANALYTICS_REVIEWED));
}
/** +5 once per calendar month for reviewing upcoming payments. */
async function awardUpcomingReviewed(subscriberID) {
    return applyEvent(subscriberID, E.UPCOMING_REVIEWED, monthKey(), RULES_DEF.pointsOf(E.UPCOMING_REVIEWED));
}

// ── Financial Goals (150) ──────────────────────────────────
/** +10 once per goal created. */
async function awardGoalCreated(subscriberID, goalID) {
    return applyEvent(subscriberID, E.GOAL_CREATED, `goal_new#${goalID}`, RULES_DEF.pointsOf(E.GOAL_CREATED));
}
/** +5 per 25/50/75/100% milestone reached, once each per goal. */
async function awardGoalMilestone(subscriberID, goalID, milestone) {
    return applyEvent(subscriberID, E.GOAL_MILESTONE, `goal_ms#${goalID}#${milestone}`, RULES_DEF.pointsOf(E.GOAL_MILESTONE));
}
/** Award every milestone newly reached given a percentage complete (0..100). */
async function awardGoalProgress(subscriberID, goalID, pctComplete) {
    const results = [];
    for (const m of RULES_DEF.GOAL_MILESTONES) {
        if (pctComplete >= m) {
            const r = await awardGoalMilestone(subscriberID, goalID, m);
            if (r.applied) results.push({ milestone: m, ...r });
        }
    }
    return results;
}

// ── Consistency (100) ──────────────────────────────────────
/** +5 once per calendar week for a qualifying weekly check-in. */
async function awardWeeklyCheckin(subscriberID) {
    return applyEvent(subscriberID, E.WEEKLY_CHECKIN, weekKey(), RULES_DEF.pointsOf(E.WEEKLY_CHECKIN));
}

/** How many bank statements has the user uploaded this calendar year? */
async function bankUploadsThisYear(subscriberID) {
    const r = await query(
        'SELECT COUNT(*) AS n FROM BankStatement WHERE subscriberID = @id AND YEAR(uploadDate) = YEAR(GETDATE())',
        { id: subscriberID }
    );
    return r.recordset[0].n || 0;
}

/* ----------------------------------------------------------
   RULE: Subscriptions paid / unpaid for the month
     allPaid = true  -> +10 (once this month, dedupe key subs_paid)
     allPaid = false -> -10 (once this month, dedupe key subs_unpaid)
   Users with no active subscriptions are skipped (nothing to pay).
   Returns { applied, score, delta, outcome }.
---------------------------------------------------------- */
async function evaluateSubscriptionPayment(subscriberID, allPaid) {
    const subs = await query(
        "SELECT COUNT(*) AS activeCount FROM Subscription WHERE subscriberID = @id AND subStatus = 'active'",
        { id: subscriberID }
    );
    const activeCount = subs.recordset[0].activeCount || 0;
    if (activeCount === 0) {
        return { applied: false, score: await getScore(subscriberID), delta: 0, outcome: 'no_subscriptions' };
    }

    const key = monthKey();
    if (allPaid) {
        // Reward: every active subscription paid for the month (+10, once/month).
        const res = await applyEvent(subscriberID, 'subs_paid', key, POINTS.SUBS_PAID);
        return { ...res, outcome: 'all_paid' };
    }
    // Missed payments are now penalised per-subscription via awardPaymentMissed
    // (see the pay-month route), so there's no flat monthly deduction here —
    // this avoids double-penalising. We just report the outcome.
    return { applied: false, score: await getScore(subscriberID), delta: 0, outcome: 'unpaid' };
}

/* ===========================================================
   Eligibility — which actions can currently earn points.
   Drives the contextual tips. The backend is the source of
   truth: an action is only "eligible" when (a) it hasn't been
   earned yet this period and (b) its category has headroom.
   No points are awarded here — this is read-only.
=========================================================== */
async function getEligibility(subscriberID) {
    const breakdown = await categoryBreakdown(subscriberID);
    const headroom = {};
    breakdown.forEach(c => { headroom[c.key] = c.max - c.points; });

    const C = RULES_DEF.CATEGORIES;
    const mk = monthKey();
    const wk = weekKey();

    // Monthly / weekly review actions: eligible if not yet done this period
    // AND the category still has room.
    const analyticsDone = await hasEvent(subscriberID, E.ANALYTICS_REVIEWED, mk);
    const upcomingDone   = await hasEvent(subscriberID, E.UPCOMING_REVIEWED, mk);
    const checkinDone    = await hasEvent(subscriberID, E.WEEKLY_CHECKIN, wk);

    // Does the user have active subscriptions / any goals? (affects which
    // tips are meaningful — never recommend an impossible action.)
    const subRow = await query(
        "SELECT COUNT(*) AS n FROM Subscription WHERE subscriberID = @id AND subStatus = 'active'",
        { id: subscriberID }
    );
    const activeSubs = subRow.recordset[0].n || 0;
    const goalRow = await query(
        'SELECT COUNT(*) AS n FROM FinancialGoal WHERE subscriberID = @id',
        { id: subscriberID }
    );
    const goalCount = goalRow.recordset[0].n || 0;

    function room(cat) { return (headroom[cat] || 0) > 0; }

    return {
        // key: { eligible, points, category }
        [E.SUB_ADDED]:          { eligible: room(C.SUBSCRIPTION), points: RULES_DEF.pointsOf(E.SUB_ADDED), category: C.SUBSCRIPTION },
        [E.SUB_UPDATED]:        { eligible: room(C.SUBSCRIPTION) && activeSubs > 0, points: RULES_DEF.pointsOf(E.SUB_UPDATED), category: C.SUBSCRIPTION },
        [E.PAYMENT_READY]:      { eligible: room(C.PAYMENT) && activeSubs > 0, points: RULES_DEF.pointsOf(E.PAYMENT_READY), category: C.PAYMENT },
        [E.ANALYTICS_REVIEWED]: { eligible: room(C.AWARENESS) && !analyticsDone, points: RULES_DEF.pointsOf(E.ANALYTICS_REVIEWED), category: C.AWARENESS },
        [E.UPCOMING_REVIEWED]:  { eligible: room(C.AWARENESS) && !upcomingDone, points: RULES_DEF.pointsOf(E.UPCOMING_REVIEWED), category: C.AWARENESS },
        [E.GOAL_CREATED]:       { eligible: room(C.GOALS), points: RULES_DEF.pointsOf(E.GOAL_CREATED), category: C.GOALS },
        [E.GOAL_MILESTONE]:     { eligible: room(C.GOALS) && goalCount > 0, points: RULES_DEF.pointsOf(E.GOAL_MILESTONE), category: C.GOALS },
        [E.WEEKLY_CHECKIN]:     { eligible: room(C.CONSISTENCY) && !checkinDone, points: RULES_DEF.pointsOf(E.WEEKLY_CHECKIN), category: C.CONSISTENCY }
    };
}

/** A single recommended next action (highest-value eligible action in the
    category with the most remaining headroom). Returns null if the user is
    maxed out everywhere. */
async function getRecommendation(subscriberID) {
    const [breakdown, elig] = await Promise.all([
        categoryBreakdown(subscriberID),
        getEligibility(subscriberID)
    ]);
    const headroom = {};
    breakdown.forEach(c => { headroom[c.key] = c.max - c.points; });

    const candidates = Object.keys(elig)
        .filter(k => elig[k].eligible)
        .map(k => ({
            eventType: k,
            points: elig[k].points,
            category: elig[k].category,
            headroom: headroom[elig[k].category] || 0,
            label: RULES_DEF.labelOf(k)
        }))
        .filter(c => c.points > 0);

    if (!candidates.length) return null;

    // Prioritise: higher points, then larger category headroom.
    candidates.sort((a, b) => (b.points - a.points) || (b.headroom - a.headroom));
    return candidates[0];
}

module.exports = {
    POINTS,
    BANK_UPLOADS_PER_YEAR,
    SCORE_CEILING,
    monthKey,
    yearKey,
    weekKey,
    getScore,
    adjustScore,
    applyEvent,
    hasEvent,
    categoryTotal,
    categoryBreakdown,
    recentActivity,
    getEligibility,
    getRecommendation,
    // legacy awards
    awardBankUpload,
    awardGoalCompleted,
    bankUploadsThisYear,
    evaluateSubscriptionPayment,
    // new category-aware awards
    awardSubAdded,
    awardSubUpdated,
    awardSubCancelled,
    awardPaymentReady,
    awardPaymentSuccess,
    awardPaymentMissed,
    awardAnalyticsReviewed,
    awardUpcomingReviewed,
    awardGoalCreated,
    awardGoalMilestone,
    awardGoalProgress,
    awardWeeklyCheckin,
};
