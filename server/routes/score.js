/* ===========================================================
   /api/score — Scribe Score breakdown, activity & eligibility
   -----------------------------------------------------------
   The backend is the single source of truth for the score and
   for which actions can currently earn points. The frontend
   never invents point values; it reads eligibility from here
   to decide which contextual tip (if any) to show.
=========================================================== */
'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const scribeScore = require('../helpers/scribe-score');
const RULES = require('../constants/scribeScoreRules');

const router = express.Router();
router.use(authenticateToken);

/* ----------------------------------------------------------
   GET /api/score
   Returns the current score (/1000), the five category scores
   with their maximums, recent activity, a recommended next
   action, and per-action eligibility for tip selection.
---------------------------------------------------------- */
router.get('/', async (req, res) => {
    try {
        const sid = req.user.subscriberID;
        const [score, categories, activity, eligibility, recommendation] = await Promise.all([
            scribeScore.getScore(sid),
            scribeScore.categoryBreakdown(sid),
            scribeScore.recentActivity(sid, 6),
            scribeScore.getEligibility(sid),
            scribeScore.getRecommendation(sid)
        ]);

        res.json({
            success: true,
            data: {
                score,
                maxScore: RULES.MAX_SCORE,
                categories,       // [{ key, label, points, max }]
                activity,         // [{ eventType, category, label, points, at }]
                eligibility,      // { eventType: { eligible, points, category } }
                recommendation    // { eventType, points, category, label } | null
            }
        });
    } catch (err) {
        console.error('GET /api/score error:', err.message);
        res.status(500).json({ success: false, error: 'Could not load score.' });
    }
});

/* ----------------------------------------------------------
   POST /api/score/review/analytics
   Records a monthly analytics review (+5, once per month).
   Called when the user actually opens the analytics page.
---------------------------------------------------------- */
router.post('/review/analytics', async (req, res) => {
    try {
        const r = await scribeScore.awardAnalyticsReviewed(req.user.subscriberID);
        res.json({ success: true, data: r });
    } catch (err) {
        console.error('POST /api/score/review/analytics error:', err.message);
        res.status(500).json({ success: false, error: 'Could not record review.' });
    }
});

/* ----------------------------------------------------------
   POST /api/score/review/upcoming
   Records a review of upcoming payments (+5, once per month).
---------------------------------------------------------- */
router.post('/review/upcoming', async (req, res) => {
    try {
        const r = await scribeScore.awardUpcomingReviewed(req.user.subscriberID);
        res.json({ success: true, data: r });
    } catch (err) {
        console.error('POST /api/score/review/upcoming error:', err.message);
        res.status(500).json({ success: false, error: 'Could not record review.' });
    }
});

/* ----------------------------------------------------------
   POST /api/score/checkin
   Records a qualifying weekly financial check-in (+5, once
   per calendar week). A check-in means the user reviewed both
   their upcoming payments and their financial position.
---------------------------------------------------------- */
router.post('/checkin', async (req, res) => {
    try {
        const r = await scribeScore.awardWeeklyCheckin(req.user.subscriberID);
        res.json({ success: true, data: r });
    } catch (err) {
        console.error('POST /api/score/checkin error:', err.message);
        res.status(500).json({ success: false, error: 'Could not record check-in.' });
    }
});

module.exports = router;
