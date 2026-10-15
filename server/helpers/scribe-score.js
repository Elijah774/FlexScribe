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

const POINTS = {
    SUBS_PAID: 10,
    SUBS_UNPAID: -10,
    BANK_UPLOAD: 50,
    GOAL_COMPLETED: 5,
};
const BANK_UPLOADS_PER_YEAR = 2;
const SCORE_FLOOR = 0;

/** Current month key, e.g. "2026-08". */
function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Current year key, e.g. "2026". */
function yearKey(d = new Date()) {
    return String(d.getFullYear());
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
    const next = Math.max(SCORE_FLOOR, current + delta);

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
async function applyEvent(subscriberID, eventType, periodKey, points) {
    // Already applied for this period?
    const dupe = await query(
        'SELECT eventID FROM ScribeScoreEvent WHERE subscriberID = @id AND eventType = @t AND periodKey = @p',
        { id: subscriberID, t: eventType, p: periodKey }
    );
    if (dupe.recordset.length) {
        return { applied: false, score: await getScore(subscriberID), delta: 0 };
    }

    const score = await adjustScore(subscriberID, points);
    try {
        await query(
            'INSERT INTO ScribeScoreEvent (subscriberID, eventType, periodKey, points, scoreAfter) VALUES (@id, @t, @p, @pts, @after)',
            { id: subscriberID, t: eventType, p: periodKey, pts: points, after: score }
        );
    } catch (err) {
        // Unique-key race: another request logged it first. The score delta
        // we just applied would then be a duplicate — reverse it to stay correct.
        await adjustScore(subscriberID, -points);
        return { applied: false, score: await getScore(subscriberID), delta: 0 };
    }
    return { applied: true, score, delta: points };
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
        const res = await applyEvent(subscriberID, 'subs_paid', key, POINTS.SUBS_PAID);
        return { ...res, outcome: 'all_paid' };
    } else {
        const res = await applyEvent(subscriberID, 'subs_unpaid', key, POINTS.SUBS_UNPAID);
        return { ...res, outcome: 'unpaid' };
    }
}

module.exports = {
    POINTS,
    BANK_UPLOADS_PER_YEAR,
    monthKey,
    yearKey,
    getScore,
    adjustScore,
    applyEvent,
    awardBankUpload,
    awardGoalCompleted,
    bankUploadsThisYear,
    evaluateSubscriptionPayment,
};
