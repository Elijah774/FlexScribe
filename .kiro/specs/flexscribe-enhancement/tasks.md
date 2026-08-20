# FlexScribe Frontend Enhancement — Tasks (v3)

> Updated to include plan system, onboarding, feature restrictions, corrected design tokens, and FlexTap removal. Tasks 01–07 previously completed.

---

## ✅ TASK 01 — Design Token Consolidation (DONE)
## ✅ TASK 02 — Shared UI Utilities (DONE)
## ✅ TASK 03 — API Module (DONE)
## ✅ TASK 04 — Landing Page (DONE)
## ✅ TASK 05 — Login & Registration (DONE)
## ✅ TASK 06 — App Shell & Theme Toggle (DONE)
## ✅ TASK 07 — Customizable Dashboard (DONE)

---

## TASK 08 — Design Token Update (v3 colours)

**Objective:** Update all CSS to use the corrected v3 colour palette.

**Files:** `styles/MASTER.css`, all panel CSS files

**Changes:**
- `--background: #050A10` (was #090B10)
- `--section: #0B111A` (was #11151B)
- `--card: #111923` (was #181D24)
- Add `--card-elevated: #151F2B`
- `--orange: #FF6B00` (was #FF8A34)
- `--orange-hover: #FF8A1F` (was #FF9B54)
- `--text-light: #9AA9BD` (was #A3ABB8)
- `--border: #263342` (was #272D35)
- `--green: #67E45C` (was #B9F15B)
- `--yellow: #FFC247` (was #FACC15)
- `--danger: #FF4D4D` (was #F87171)

**Acceptance criteria:**
- [ ] All pages render with updated colours
- [ ] No hardcoded hex values from old palette remain
- [ ] Orange used sparingly: CTAs, active nav, highlights only

---

## TASK 09 — Plan System Backend

**Objective:** Create `backend/user.js` with plan management and user state.

**Files to create:** `backend/user.js`, `scripts/plan-gate.js`

**Functional requirements:**
- `UserStore` IIFE: manages user plan, onboarding state in localStorage
- Default plan: `individual`
- Plans: `{ id, name, price, billingCycle, features[] }`
- Methods: `getCurrentPlan()`, `setPlan(planId)`, `isFeatureAllowed(featureName)`, `getOnboardingState()`, `setOnboardingCompleted()`
- `PlanGate` module: `checkAccess(pageName)` returns `{allowed: bool, requiredPlan: string}`
- Gate checks called in `layout.js` before rendering a panel

**Acceptance criteria:**
- [ ] `UserStore.getCurrentPlan()` returns plan object
- [ ] `PlanGate.checkAccess('dependants')` returns `{allowed: false, requiredPlan: 'family'}` for Individual users
- [ ] Plan persists across page refresh

---

## TASK 10 — Plan Selection Page

**Objective:** Create `pages/plans.html` with plan comparison and selection.

**Files to create:** `pages/plans.html`, `styles/plans.css`, `scripts/plans.js`

**Functional requirements:**
- 3 plan cards: Individual (R0), Professional (R99/mo), Family (R199/mo)
- Current plan shows "CURRENT PLAN" badge
- Selected plan gets orange border + glow
- Feature comparison table below cards
- Click plan → confirmation modal (current plan, new plan, changes, price, date)
- Confirm → updates UserStore → success animation → redirect to dashboard
- Cancel button for premium plans
- Accessible from Settings and from post-registration flow

**Acceptance criteria:**
- [ ] All 3 plans render with correct features
- [ ] Current plan identified correctly
- [ ] Confirmation modal shows before change
- [ ] Plan updates in localStorage after confirmation
- [ ] Success animation plays

---

## TASK 11 — Onboarding Questionnaire

**Objective:** Create `pages/onboarding.html` — multi-step new-user setup flow.

**Files to create:** `pages/onboarding.html`, `styles/onboarding.css`, `scripts/onboarding.js`

**Functional requirements:**
- 6-step wizard with progress indicator
- Step 1: Welcome screen
- Step 2: Subscription selection grid (12+ providers + "Add another")
- Step 3: Subscription detail forms (for each selected)
- Step 4: Financial info (optional, with "Skip for now")
- Step 5: Bank setup guidance (provider-neutral, "I'll do this later" / "Done")
- Step 6: Completion summary + "Go to Dashboard"
- Data saved to SubscriptionStore and UserStore
- Sets `onboardingCompleted = true`
- Redirects to dashboard

**Acceptance criteria:**
- [ ] All 6 steps navigate correctly
- [ ] Selected subscriptions persist
- [ ] Subscription details saved to backend store
- [ ] Skip buttons work on optional steps
- [ ] Completion screen shows correct summary
- [ ] Dashboard loads with onboarding data

---

## TASK 12 — Auth Flow Update (Plan + Onboarding routing)

**Objective:** Update login/registration flow to include plan selection and onboarding.

**Files to modify:** `scripts/login.js`, `pages/loading.html`

**Functional requirements:**
- New user registration: Register → `plans.html` → `onboarding.html` → `loading.html` → `MASTER.html`
- Returning user login: Login → `loading.html` → `MASTER.html`
- `loading.html` checks `onboardingCompleted`; if false, redirects to `onboarding.html`
- Login.js stores `isNewUser = true` flag for new registrations

**Acceptance criteria:**
- [ ] New user goes through full onboarding flow
- [ ] Returning user skips onboarding
- [ ] Loading page routes correctly based on state

---

## TASK 13 — Feature Restriction UI

**Objective:** Show upgrade prompts when restricted features are accessed.

**Files to modify:** `scripts/layout.js`, all panel init functions

**Functional requirements:**
- `layout.js loadPage()` calls `PlanGate.checkAccess(pageName)` before rendering
- If not allowed: inject upgrade prompt card into the panel instead of real content
- Upgrade prompt: feature icon, "This feature requires [Plan]", benefits list, "Upgrade Now" button → navigates to plans.html
- Sidebar: Dependants item shows lock icon badge for Individual/Professional users
- Never show broken/empty pages

**Acceptance criteria:**
- [ ] Individual user clicking Dependants sees upgrade prompt
- [ ] Professional user clicking Dependants sees upgrade prompt
- [ ] Family user sees full Dependants panel
- [ ] Lock badge visible on restricted nav items
- [ ] "Upgrade Now" navigates to plans.html

---

## TASK 14 — Settings: Subscription & Plan section

**Objective:** Add plan management to Settings panel.

**Files to modify:** `pages/settings.html`, `scripts/settings-ui.js` (or equivalent)

**Functional requirements:**
- New section "Subscription & Plan" in Settings
- Shows: current plan name, price, renewal date, feature list
- "Change Plan" button → navigates to `pages/plans.html`
- Plan benefits displayed as checkmark list

**Acceptance criteria:**
- [ ] Current plan info displays correctly
- [ ] "Change Plan" navigates to plans.html
- [ ] Plan info updates after plan change

---

## TASK 15 — Remove FlexTap from Website

**Objective:** Remove any FlexTap references from the website codebase.

**Files to check:** All HTML, CSS, JS files

**Functional requirements:**
- Remove FlexTap nav item from sidebar (if present)
- Remove FlexTap widget from dashboard (if present)
- Remove FlexTap from onboarding (if present)
- Remove FlexTap from Settings (if present)
- Do NOT affect Android app code (separate repo/folder)

**Acceptance criteria:**
- [ ] No "FlexTap" text anywhere in website UI
- [ ] No FlexTap nav item in sidebar
- [ ] No FlexTap widget on dashboard
- [ ] Grep for "flextap" returns zero results in website code

---

## TASK 16 — Dashboard Personalisation (from onboarding data)

**Objective:** Dashboard reads from backend stores instead of hardcoded data.

**Files to modify:** `scripts/dashboard-ui.js`

**Functional requirements:**
- Wallet balance reads from WalletStore
- Active subscriptions count reads from SubscriptionStore
- Upcoming payments reads from SubscriptionStore (next 7 days)
- Goals progress reads from GoalsStore
- Recent transactions reads from WalletStore history
- If no data yet (fresh user): show empty states with CTAs ("Add your first subscription", etc.)

**Acceptance criteria:**
- [ ] Dashboard reflects actual stored data
- [ ] Empty states shown for new users with no data
- [ ] After onboarding, dashboard shows onboarding subscriptions

---

## TASK 17 — Subscription Recommendations

**Objective:** Add recommended providers strip to subscriptions panel.

**Files:** `pages/subscription.html`, `styles/subscription.css`, `scripts/subscriptions-ui.js`, `backend/subscriptions.js`

**Functional requirements:**
- 14 provider cards in horizontal scroll strip
- Each card: logo, name, cost, category, "Add" button
- Add → pre-fills subscription creation modal
- Already-subscribed providers excluded
- Searchable provider library with category chips

**Acceptance criteria:**
- [ ] Provider strip renders and scrolls
- [ ] Add pre-fills modal correctly
- [ ] Already-subscribed excluded
- [ ] Search/filter works

---

## TASK 18 — Remaining Panels Audit

**Objective:** Ensure all panels (Wallet, Goals, Analytics, Timeline, Dependants, Notifications, Reports) render correctly with their respective UI scripts.

**Files:** All panel HTML + JS files

**Functional requirements:**
- Each panel has content (not empty divs)
- Each panel's UI script initialises correctly when navigated to
- Plan restrictions applied (Dependants for Family only)
- No console errors on any panel

**Acceptance criteria:**
- [ ] Every sidebar nav item loads a functional panel
- [ ] No empty/broken pages
- [ ] Dependants restricted for non-Family plans
- [ ] Zero console errors

---

## TASK 19 — Responsive Pass

**Objective:** Ensure all pages work on desktop, laptop, tablet.

**Functional requirements:**
- Sidebar: collapsible on smaller screens
- Grids: 3-col → 2-col → 1-col
- Modals: adapt to screen size
- Plans page: cards stack vertically on narrow screens
- Onboarding: full-width steps on tablet

**Acceptance criteria:**
- [ ] All pages usable at 1280px, 1024px, 768px
- [ ] No horizontal overflow
- [ ] No overlapping elements

---

## TASK 20 — Accessibility & Performance

**Objective:** ARIA labels, keyboard nav, lazy loading, no dead code.

**Acceptance criteria:**
- [ ] All interactive elements keyboard-accessible
- [ ] Images have alt text, loading="lazy"
- [ ] Modals trap focus
- [ ] No unused CSS/JS
- [ ] Console shows zero errors

---

## TASK 21 — Final QA

**Test flows:**
1. New user: Register → Plans → Onboarding → Dashboard (with data)
2. Returning user: Login → Dashboard
3. Plan change: Settings → Plans → Change → Confirm → Updated
4. Feature restriction: Individual user → Dependants → Upgrade prompt
5. All panels load without errors
6. Responsive at 1280/1024/768px

**Acceptance criteria:**
- [ ] All 6 flows pass
- [ ] No FlexTap anywhere
- [ ] Plan restrictions work correctly
- [ ] Onboarding data appears on dashboard

---

## Implementation Order

```
[DONE] 01 → 02 → 03 → 04 → 05 → 06 → 07
[NEXT] 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15
[THEN] 16 → 17 → 18
[FINAL] 19 → 20 → 21
```

Tasks 08–15 should be done in order (plan system builds on itself).
Tasks 16–18 can be parallelised.
Tasks 19–21 are always last.
