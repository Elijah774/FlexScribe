# Scribe Score — rules, tips, API & tests

FlexScribe's Scribe Score is a transparent, rule-based score out of **1,000 points**,
split across five categories. It is conduct-based and event-driven: the backend is the
single source of truth, every point change is logged idempotently, and the website reads
the score and action eligibility from the API. Low balance / low income / insufficient
funds **never** deduct points, and simply depositing or spending money earns nothing.

## 1. Categories & rules

| Category | Max | Rule | Points | Earns |
|---|--:|---|--:|---|
| **Subscription Management** | 250 | Add a valid subscription | +10 | once per subscription |
| | | Meaningful update to details | +5 | ≤ once per subscription per month |
| | | Record a genuine cancellation | +10 | once per subscription |
| **Payment Readiness** | 300 | Funds ready before a billing cycle | +10 | per subscription per cycle |
| | | Verified successful payment | +10 | per subscription per cycle |
| **Financial Awareness** | 200 | Review monthly analytics | +5 | once per calendar month |
| | | Review upcoming payments | +5 | once per calendar month |
| **Financial Goals** | 150 | Create a valid goal | +10 | once per goal |
| | | Reach 25 / 50 / 75 / 100% | +5 each | once per milestone per goal |
| **Consistency** | 100 | Weekly financial check-in | +5 | once per calendar week |
| **Total** | **1,000** | | | |

Pre-existing events are retained and mapped into these categories: bank-statement upload
(+50, max 2/year → Awareness), "all subscriptions paid" (+10/month → Payment), and the
legacy goal-completed (+5 → Goals). The historical registration seed of 500 remains on
`Subscriber.scribeScore`.

### Enforcement
- **Idempotency** — every award is logged in `ScribeScoreEvent` with a unique
  `(subscriberID, eventType, periodKey)` key, so a given qualifying event awards exactly
  once per its earning period. Keys: `sub#<id>`, `sub_upd#<id>#<YYYY-MM>`,
  `sub_cancel#<id>`, `ready#<subID>#<YYYY-MM>`, `paid#<subID>#<YYYY-MM>`, `<YYYY-MM>`
  (analytics/upcoming), `goal_new#<id>`, `goal_ms#<id>#<25|50|75|100>`, `<YYYY-Www>` (weekly).
- **Per-category cap** — before a positive award, the category's logged total is summed;
  only the remaining headroom is granted, so no category exceeds its maximum.
- **Overall clamp** — the authoritative score is clamped to `0..1000`.
- The `ScribeScoreEvent` log is the source of truth for category totals and the breakdown.

## 2. Contextual floating tips

A single reusable floating tip (`scripts/scribe-tips.js` + `styles/scribe-tips.css`) tells
the user what they can do to earn points on the current page, with a direct action.

- **Backend decides eligibility.** The tip reads `GET /api/score`; the client never invents
  point values. A tip only shows when the backend reports the action `eligible: true`.
- **One tip per page.** Each page maps to an ordered list of candidate actions; the first
  eligible, not-dismissed candidate is shown.
- **Non-intrusive.** Compact (≈270px) dark card anchored bottom-right (full-width safe strip
  on mobile), hairline border, restrained shadow, subtle fade-in, orange pill action button.
  It never covers primary controls and never blocks a workflow.
- **No points on interaction.** Dismissing (X) or clicking the action never awards points —
  points come only from completing the real workflow server-side.
- **Smart reappearance.** A dismissed tip is suppressed for the session and for its current
  earning period (stored in `localStorage` as a non-sensitive `action#period` flag only).
  When the next period begins, an again-eligible action's tip may reappear.
- **Neutral state.** If nothing is eligible on the dashboard, a muted "You're up to date
  here" card is shown instead of a misleading points tip.

Placement: Dashboard (score tip + score breakdown widget), Subscriptions, Wallet,
Upcoming/Timeline, Analytics, Goals, and a weekly check-in prompt on the dashboard.

## 3. Score display (dashboard)

The dashboard score cell now shows: the score out of 1,000, an overall progress bar, the
five category scores with their maximums, recent score activity, a recommended next action,
and a "View breakdown" link. It refreshes without a full reload via `window.ScribeScore.refresh()`.

## 4. API changes

New route `server/routes/score.js` (mounted at `/api/score`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/score` | score, maxScore, five category scores+maxes, recent activity, recommended next action, per-action eligibility |
| POST | `/api/score/review/analytics` | records a monthly analytics review (+5, once/month) |
| POST | `/api/score/review/upcoming` | records an upcoming-payments review (+5, once/month) |
| POST | `/api/score/checkin` | records a weekly check-in (+5, once/week) |

Client: `API.Score.get()`, `API.Score.reviewAnalytics()`, `API.Score.reviewUpcoming()`,
`API.Score.checkin()` in `scripts/api.js`.

Award calls were wired into existing flows (idempotent, fire-and-forget, never blocking the
response): subscription add/update/cancel (`server/routes/subscriptions.js`), per-paid-sub
payment readiness + success in `pay-month`, goal create + milestone awards in
`server/routes/goals.js`.

Database: `migrations/008-scribe-score-categories.sql` widens `ScribeScoreEvent.periodKey`
to `VARCHAR(60)` and adds a `category VARCHAR(40)` column (idempotent; backfilled).

## 5. Android

**No Android project exists in this repository** (no `AndroidManifest.xml` / `build.gradle`).
The `flexscribe-backend/` folder is an unrelated Java **Spring Boot** service, not an Android
app. Phase 5's Android tips therefore cannot be implemented against a non-existent app. The
website is the source of truth; if/when a native Android app is added, it should consume the
same `GET /api/score` eligibility contract and render equivalent compact tip cards. No
duplicate feature was created just to host a tip.

## 6. Test results

All run against the live server + SQL Server; test data was created and removed, leaving
real users unchanged.

**Engine (idempotency, caps, ceiling) — 14/14 passed:**
- Award applies once; identical repeat is not applied (idempotent).
- Category breakdown reflects awards.
- Per-category caps hold at 250 / 300 / 200 / 150 / 100 under flooding.
- Overall score clamps at 1,000; category sum == 1,000.
- Eligibility turns `false` for actions in a maxed category / already earned this period.
- Recommendation is `null` when fully maxed.

**HTTP endpoints (subscriber 1, then reverted):**
- `POST /review/analytics` → +5 applied; immediate repeat → not applied (idempotent).
- `POST /review/upcoming` → +5; `POST /checkin` → +5.
- `GET /api/score` reflects the new category totals; `analytics_reviewed` eligibility flips
  to `false` after being earned (so the tip stops showing).

**Regression (all 200, no breakage):** `/api/health`, `/api/auth/profile`,
`/api/subscriptions`, `/api/goals`, `/api/wallet`, `/api/analytics/summary`, `/api/score`.

## 7. Limitations / notes

- No automated test framework is configured in the project; validation uses `node --check`
  plus live engine/HTTP/regression scripts (the project's existing convention). None added.
- Historical `ScribeScoreEvent` rows created before migration 008 were backfilled by event
  type; one legacy `subs_unpaid` row is labelled `subscription` rather than `payment`. This
  is cosmetic — breakdown totals clamp at 0 and are unaffected.
- "Payment readiness" is credited when a subscription actually completes its payment in
  `pay-month` (funds were present), which is the verifiable signal available server-side.
