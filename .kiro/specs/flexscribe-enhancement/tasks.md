# FlexScribe Frontend Enhancement — Tasks

> Each task is independently executable. Tasks are ordered by dependency — complete them top to bottom for the smoothest experience. Each task references the requirements and design docs.

---

## TASK 01 — Design Token Consolidation & Global Styles

**Objective:** Align all CSS files to the authoritative design token set. Eliminate hardcoded hex values.

**Files to modify:**
- `styles/MASTER.css`
- `styles/landing.css`
- `styles/login.css`

**UI requirements:**
- Background `#090B10`, Cards `#181D24`, Sections `#11151B`, Borders `#272D35`
- Primary Accent `#FF8A34`, Hover `#FF9B54`, Text `#F5F5F5`, Secondary `#A3ABB8`
- Add CSS variables: `--shadow-card`, `--shadow-hover`, `--transition-fast: 150ms ease`, `--transition-med: 250ms ease`, `--radius-card: 16px`, `--radius-btn: 10px`, `--radius-input: 8px`
- Add global utility classes: `.text-muted`, `.text-accent`, `.flex-center`, `.sr-only`
- Add global focus ring rule: `*:focus-visible { outline: 2px solid rgba(255,138,52,0.7); outline-offset: 2px; }`

**Functional requirements:**
- Update `MASTER.css` `:root` orange tokens to `#FF8A34` / `#FF9B54`
- Update `landing.css` to use `var(--orange)` etc. instead of hardcoded values where they match the new tokens
- Update `login.css` to use CSS variables throughout — no hardcoded hex values remain
- Add `Inter` font import to `MASTER.css` (currently only `landing.css` and `login.css` import it)
- Add base card hover animation class `.card-hover` (lift + border glow)
- Add base button ripple via `scripts/ui-utils.js` (new shared utilities file)

**Acceptance criteria:**
- [ ] Opening MASTER.html shows correct dark colours matching the spec tokens
- [ ] landing.html and login.html use the same orange as MASTER
- [ ] No hardcoded `#FF6A1A`, `#0F1115`, `#1B1F22` etc. remain in any CSS file
- [ ] Focus rings visible on Tab navigation in all three pages

**Backend integration notes:** None — pure styling task.

---

## TASK 02 — Shared UI Utilities Module

**Objective:** Create `scripts/ui-utils.js` with shared interactive primitives used by all subsequent tasks.

**Files to create:**
- `scripts/ui-utils.js`

**Functional requirements:**
- `UIUtils.ripple(element)` — attaches a ripple effect to any button on click
- `UIUtils.toast(message, type)` — global toast notification (promote subscriptions toast to global; remove from `subscriptions-ui.js`)
- `UIUtils.animateCounter(element, from, to, duration)` — number counter animation
- `UIUtils.revealOnScroll(selector)` — IntersectionObserver scroll-reveal for given CSS selector
- `UIUtils.skeleton(container, count)` — injects loading skeleton rows into a container
- `UIUtils.clearSkeleton(container)` — removes skeleton and shows real content
- `UIUtils.debounce(fn, ms)` — standard debounce utility
- All functions exported on `window.UIUtils` (matching existing global pattern)

**Acceptance criteria:**
- [ ] `ui-utils.js` loads without errors on MASTER.html, landing.html, login.html
- [ ] Toast replaces the inline toast in `subscriptions-ui.js` with no regression
- [ ] Ripple effect visible on `.primary-btn` clicks

**Backend integration notes:** None.

---

## TASK 03 — API Module

**Objective:** Create `scripts/api.js` as the single source of truth for all backend calls.

**Files to create:**
- `scripts/api.js`

**Functional requirements:**
- `const USE_MOCK = true` flag at top — when true, all functions resolve with realistic mock data; when false, real fetch calls fire
- Mock data matches the seed data already in `backend/subscriptions.js`
- Functions: `Auth.login`, `Auth.register`, `Auth.checkEmail`, `Subscriptions.getAll`, `Subscriptions.add`, `Subscriptions.edit`, `Subscriptions.remove`, `Wallet.get`, `Wallet.addFunds`, `Goals.getAll`, `Goals.add`, `Dependants.getAll`, `Notifications.getAll`, `Notifications.markRead`
- All real fetch calls: `Authorization: Bearer ${sessionStorage.getItem('flexscribe_token')}` header
- Consistent response shape: `{ success: true, data: ... }` or `{ success: false, error: '...' }`
- `BASE_URL` reads `window.FLEXSCRIBE_API_BASE || '/api'`

**Acceptance criteria:**
- [ ] `api.js` loads without errors
- [ ] `API.Subscriptions.getAll()` returns same shape as `SubscriptionStore.getAll()` mock
- [ ] Setting `USE_MOCK = false` causes fetch calls to fire to `/api/...` (will 404 — that's expected)

**Backend integration notes:**
- SQL Server integration: swap `USE_MOCK = false` and point `window.FLEXSCRIBE_API_BASE` to your Express/ASP.NET backend URL
- Token flow: login → save JWT to `sessionStorage.flexscribe_token` → attach on every subsequent request

---

## TASK 04 — Landing Page Enhancement

**Objective:** Rebuild `landing.html` into a premium, seamless scrolling fintech website.

**Files to modify:**
- `landing.html`
- `styles/landing.css`
- `scripts/landing.js`

**UI requirements:**

**Navigation:**
- Sticky frosted-glass header (backdrop-filter blur, semi-transparent background on scroll)
- Logo left, nav links centre, CTA buttons right
- Mobile: hamburger menu with slide-down drawer
- "Log In" → `pages/login.html?mode=login`, "Create Account" → `pages/login.html?mode=register`
- Smooth scroll to section on nav link click (`scroll-behavior: smooth`)

**Hero section (`#hero`):**
- Full viewport height, gradient from `#090B10` to `#0D1520`
- Left: large headline ("Manage. Track. Save. Smarter."), subtext, two CTA buttons, two trust badges (Free Forever, No Card Required)
- Right: `images/dashboardPreview.png` with subtle float animation and orange glow shadow
- Three floating stat cards overlaid: "2500+ Users", "R2.4M+ Saved", "4.9★ Rating" — glassmorphism cards
- Fade-in + slide-up scroll-reveal on load

**Features section (`#features`):**
- Orange text tag "FEATURES", h2 heading, subtext
- 5-column card grid on desktop, 2-col tablet, 1-col mobile
- Each card: icon chip (orange tint bg), h3, description, subtle border glow on hover
- Gradient transition from hero: `background: linear-gradient(180deg, #0D1520 0%, #090B10 100%)`

**How It Works section (`#how-it-works`):**
- 3 steps in alternating left/right layout (desktop), vertical stack (mobile)
- Each step: number badge, heading, description, screenshot/illustration
- Connecting animated dashed line between steps

**Security section (`#security`):**
- Dark card background (`#11151B`), centered layout
- 3 pillars: Bank-grade encryption, Zero data selling, 2FA protection
- Lock/shield icons, compliance text

**Pricing section (`#pricing`):**
- 3 plan cards: Free (R0), Premium (R99/mo), Business (R199/mo)
- Premium card has orange border + "Most Popular" badge
- Feature comparison list per card
- CTA button on each

**About section (`#about`):**
- Story paragraph, team mission statement
- 4 stats (Users, Subscriptions, Saved, Rating) with animated counters on scroll-reveal

**FAQ section (`#faq`):**
- 8 accordion items — click to expand/collapse with smooth height animation
- Questions covering: What is FlexScribe, Is it free, How secure is my data, etc.

**Contact section (`#contact`):**
- Form: Name, Email, Message, Send button
- Social links: Twitter/X, LinkedIn, GitHub
- No backend required — form shows success toast on submit

**Footer:**
- 4-column grid: Logo+tagline, Company links, Support links, Legal links
- Bottom bar: copyright, privacy policy, terms

**Functional requirements:**
- All nav links are anchor links to section IDs
- `scripts/landing.js` handles: sticky header class on scroll, hamburger toggle, scroll-reveal via `UIUtils.revealOnScroll`, animated counters via `UIUtils.animateCounter`, FAQ accordion, contact form toast
- No `fetch()` calls needed on landing page

**Acceptance criteria:**
- [ ] All 9 sections render with no horizontal overflow
- [ ] Nav links scroll to correct sections
- [ ] Scroll-reveal animations trigger correctly
- [ ] Stat counters animate when About section enters viewport
- [ ] FAQ accordion works with keyboard (Enter/Space)
- [ ] Contact form shows toast on submit
- [ ] Fully responsive at 1280px, 1024px, 768px, 375px
- [ ] "Log In" and "Create Account" open correct tab in login.html

**Backend integration notes:** Contact form → `POST /api/support/contact` when `USE_MOCK = false`.

---

## TASK 05 — Login & Registration Enhancement

**Objective:** Upgrade `pages/login.html` and `scripts/login.js` into a polished, production-ready auth experience.

**Files to modify:**
- `pages/login.html`
- `styles/login.css`
- `scripts/login.js`

**UI requirements:**

**Layout:**
- Full-page centered card, max-width 460px
- Logo at top of card
- Tab switcher: Sign In / Create Account
- Background: subtle radial gradient glow behind card

**Sign In tab:**
- Email field with inline validation icon
- Password field with eye toggle icon
- Password strength meter (hidden on login, shown on register)
- Remember Me checkbox
- Forgot Password link → inline collapsed panel (not a separate page): email input + "Send Reset Link" button + success state
- Sign In button: loading spinner while submitting, success checkmark animation, then redirect
- Error banner below button for auth failures

**Register tab:**
- Fields: First Name, Last Name, Email, Password, Confirm Password, Phone Number
- Password strength meter (4-segment bar: Weak/Fair/Strong/Very Strong)
- Confirm password match indicator (✓ / ✗ icon)
- Accept Terms checkbox (required) with link to terms
- Marketing Preferences checkbox (optional)
- Register button: same loading/success states as login
- On success: full-card success screen with confetti-style animation, "500 Scribe Points Awarded!" message, countdown redirect

**Social login:**
- Google, Apple, Microsoft buttons below divider
- Consistent styling, icons from FontAwesome (already loaded)

**Functional requirements:**
- `login.js` reads `?mode` param on load, activates correct tab
- Tab switch also updates URL: `history.replaceState({}, '', '?mode=login')`
- Validation: email regex, password ≥ 8 chars on register, passwords match, terms checked
- "Remember Me" saves email to `localStorage.flexscribe_remembered_email` and pre-fills on next load
- On successful login: `sessionStorage.setItem('flexscribe_token', 'mock-token')`, redirect to `MASTER.html`
- On successful register: show success screen, award points message, redirect after 2.5s
- All validation errors shown inline (not alert())

**Acceptance criteria:**
- [ ] `login.html?mode=register` opens Register tab with no flicker
- [ ] `login.html?mode=login` opens Sign In tab
- [ ] Email validation rejects invalid formats with inline error
- [ ] Password strength meter updates in real-time
- [ ] Passwords-match indicator updates in real-time
- [ ] Remember Me pre-fills email on return
- [ ] Success animation plays before redirect
- [ ] Social buttons render correctly (UI only)
- [ ] Fully responsive at all breakpoints
- [ ] Keyboard navigable, focus rings visible

**Backend integration notes:**
- Login: `API.Auth.login(email, password)` → JWT → `sessionStorage.flexscribe_token`
- Register: `API.Auth.register(fields)` → success response → award points
- Check email: `API.Auth.checkEmail(email)` on blur of email field during registration

---

## TASK 06 — MASTER App Shell Responsive Improvements

**Objective:** Make the app shell (sidebar, header, layout grid) fully responsive.

**Files to modify:**
- `pages/MASTER.html`
- `styles/MASTER.css`
- `scripts/layout.js`

**UI requirements:**

**Tablet (1024–1279px):**
- Sidebar collapses to 72px wide (icon-only, no labels)
- Hovering a nav item shows a tooltip with the label
- Main content grid adjusts: `grid-template-columns: 72px 1fr`
- Logo area shows only the logo icon (no text)

**Mobile (<768px):**
- Sidebar completely hidden
- Bottom tab bar (fixed, 64px tall) with 5 icons: Home, Wallet, Subscriptions, Goals, More
- "More" opens a sheet drawer with remaining nav items
- Header title shortened
- Page heading subtext hidden

**Panel transition:**
- Fade out old panel, fade in new panel (200ms, via CSS class `.panel-entering`)

**Acceptance criteria:**
- [ ] Sidebar shows icon-only at 1024px, full labels at 1280px
- [ ] Bottom tab bar visible at 768px, tabs navigate correctly
- [ ] "More" drawer opens and lists remaining nav items
- [ ] Panel transitions smooth on all navigations
- [ ] No horizontal scroll at any breakpoint

**Backend integration notes:** None.

---

## TASK 07 — Dashboard Panel Enhancement

**Objective:** Upgrade the Dashboard panel with all new sections defined in REQ-9.

**Files to modify:**
- `pages/MASTER.html` (dashboard panel HTML)
- `styles/dashboard.css`

**Files to create:**
- `scripts/dashboard-ui.js`

**UI requirements:**

**Quick Actions row** (below page heading, above stat cards):
- 4 pill buttons side by side: Add Funds (wallet icon), Send Money (arrow icon), New Goal (target icon), Add Subscription (plus icon)
- Orange background on primary pill, ghost style on others
- Hover lift animation

**Stat cards row** (existing, enhanced):
- Animated counter on load (0 → value over 800ms)
- Subtle upward trend indicator (+2.3% vs last month in green) or downward (red)

**Financial Health Score card** (new, spans 2 columns):
- Circular SVG progress ring (0–850 score range)
- Score number in centre, label "Scribe Score" below
- 3 sub-factors: Subscription regularity %, Budget adherence %, Savings rate %
- Each sub-factor as a thin progress bar

**AI Spending Insights cards** (2 cards, side by side):
- Orange left border accent
- "AI Insight" chip tag
- Plain-language text: e.g. "Your entertainment spend is 32% above your monthly average" and "You have R450 in potentially unused subscriptions"
- "View details" link

**Budget Status panel:**
- 4 category rows: Entertainment, Shopping, Utilities, Productivity
- Each row: category icon, label, spend/limit (e.g. R320 / R500), progress bar
- Bar colour: green <60%, yellow 60–80%, red >80%

**Monthly Trends mini-chart:**
- 6 vertical bars for last 6 months
- CSS-only bar chart (no library needed), heights set by inline `style` variable
- Hover shows tooltip with month + amount

**Calendar Widget:**
- 5×7 mini calendar grid for current month
- Days with upcoming payments have an orange dot indicator
- Today highlighted with orange background

**Savings Achievements badges:**
- 3 tiles: "First Goal Set" (unlocked), "5 Subscriptions Tracked" (unlocked), "R1000 Saved" (locked — greyed)
- Unlocked: gold icon + label; Locked: grey icon + "X more to unlock"

**Functional requirements:**
- `dashboard-ui.js` exposes `DashboardUI.init()`, called from `layout.js` when `pageName === 'dashboard'`
- Counters animate once per session (flag in sessionStorage)
- Progress bars animate on first view via IntersectionObserver
- Calendar widget reads from `SubscriptionStore.getStats().upcoming` for dot placement
- All data currently static/seeded — structured for API swap

**Acceptance criteria:**
- [ ] All new sections render without breaking existing sections
- [ ] Stat counters animate on first dashboard load
- [ ] Progress bars fill animated
- [ ] Financial Health Score ring draws correctly
- [ ] Calendar shows orange dots on correct dates
- [ ] Budget bars change colour at 60% / 80% thresholds
- [ ] Fully responsive (2-col layout on tablet, single-col on mobile)

**Backend integration notes:**
- `API.Wallet.get()` → balance card
- `API.Goals.getAll()` → goals progress panel
- AI insights → `API.Analytics.getInsights()` (future)

---

## TASK 08 — Subscription Recommendations Engine

**Objective:** Add a "Recommended For You" section to the Subscriptions panel.

**Files to modify:**
- `pages/MASTER.html` (subscription panel)
- `styles/subscription.css`
- `scripts/subscriptions-ui.js`
- `backend/subscriptions.js`

**UI requirements:**

**Recommendations strip:**
- Section heading "Recommended For You" + "See all →" link
- Horizontal scrollable card row (scroll-snap)
- Each card (200px wide, 280px tall):
  - Provider logo initial chip (brand-coloured)
  - Provider name (bold)
  - Monthly cost (large, orange)
  - Category chip
  - Short description (2 lines max, truncated)
  - Star rating (filled/empty stars out of 5)
  - "Quick View" ghost button
  - "Add" primary button (smaller)
- Scrollbar hidden, drag to scroll on desktop

**Add Confirmation Modal:**
- Provider name + logo in header
- Billing cycle selector: Monthly / Quarterly / Yearly (pill toggle)
- Payment source: Wallet / Bank Card (pill toggle)
- Category (pre-filled, editable dropdown)
- Auto-Renew toggle
- Notifications toggle
- Estimated cost display (updates on cycle change)
- "Add Subscription" primary button
- Cancel

**Quick View Modal:**
- Full provider description
- Benefits list (3 bullet points)
- Popularity bar + user count
- Pricing table (monthly/quarterly/yearly)
- "Add Subscription" CTA

**Functional requirements:**
- Provider library of 14 entries defined in `backend/subscriptions.js` as `RECOMMENDED_PROVIDERS`
- Recommendations exclude providers the user already has (matched by name)
- Clicking "Add" on a recommendation pre-fills the main Add modal AND opens the confirmation modal
- After adding from recommendation, card disappears from the strip
- Strip re-renders on SubscriptionStore change

**Acceptance criteria:**
- [ ] 14 provider cards render in the horizontal strip
- [ ] Strip scrolls horizontally, cards snap into place
- [ ] Already-subscribed providers excluded from recommendations
- [ ] Add confirmation modal opens with provider pre-filled
- [ ] Billing cycle selector updates estimated cost display
- [ ] Adding from modal calls `SubscriptionStore.add()` and re-renders
- [ ] Quick View modal shows correct provider info

**Backend integration notes:**
- Recommendations: `GET /api/subscriptions/recommendations?exclude=[ids]`
- Provider catalogue: `GET /api/subscriptions/providers?search=&category=`

---

## TASK 09 — Provider Library

**Objective:** Add a searchable, filterable subscription library within the Subscriptions panel.

**Files to modify:**
- `pages/MASTER.html` (subscription panel)
- `styles/subscription.css`
- `scripts/subscriptions-ui.js`
- `backend/subscriptions.js`

**UI requirements:**

**Library section** (below Recommendations, above All Subscriptions list):
- Section heading "Provider Library" + search input (full width)
- Category filter chip row: All, Popular, Entertainment, Music, Shopping, Productivity, Gaming, Education, Health, AI
- Sort dropdown: Popular, Price ↑, Price ↓, A–Z, Newest
- Provider grid: 4-col desktop, 3-col tablet, 2-col mobile
- Each provider tile:
  - 56px logo chip
  - Name
  - Category tag
  - Price/mo
  - Popularity rating (compact stars)
  - "+" icon button to add (opens confirmation modal)
- "Recently Added" label on last 5 user-created subscriptions in the list

**Functional requirements:**
- Search filters provider list in real-time (debounced 200ms)
- Category chips filter by category
- Sort updates display order
- "+" button opens Add confirmation modal pre-filled with provider data
- Library reads from `RECOMMENDED_PROVIDERS` in `backend/subscriptions.js`
- User-added custom subscriptions appear in the "Recently Added" section

**Acceptance criteria:**
- [ ] Search filters providers in real-time
- [ ] Category filter chips work, "All" shows all
- [ ] Sort options work correctly
- [ ] "+" button pre-fills modal
- [ ] "Recently Added" shows last 5 user subscriptions
- [ ] Responsive grid at all breakpoints

**Backend integration notes:**
- `GET /api/subscriptions/providers?search=&category=&sort=`

---

## TASK 10 — Manual Subscription Creation Enhancement

**Objective:** Extend the existing Add/Edit modal with advanced fields per REQ-7.

**Files to modify:**
- `pages/MASTER.html` (sub-modal HTML)
- `styles/subscription.css`
- `scripts/subscriptions-ui.js`
- `backend/subscriptions.js`

**UI requirements:**

Add a collapsible "Advanced Options" section at the bottom of the modal with:
- Provider Website URL (text input, validated as URL)
- Upload Provider Logo (file input, shows circular preview when file selected)
- Colour Tag picker (8 preset colour swatches — click to select)
- Reminder Days (number input 1–30, label: "Remind me X days before billing")
- Auto Renew toggle (already present on row — move here)

**Functional requirements:**
- "Advanced Options" collapsed by default, chevron toggles open/close with smooth height animation
- Logo upload: converts to base64 with `FileReader`, stores in subscription `logoBase64` field
- If `logoBase64` present, renders as `<img>` instead of the letter initial in the sub-logo chip
- Colour tag: stored as hex in subscription `colorTag` field; shown as 4px left border on sub-row
- Reminder days: stored as `reminderDays` field; shown in detail drawer
- URL: shown as clickable link in detail drawer
- All new fields optional
- Validation: URL must be valid URL format if provided; reminder days 1–30

**Acceptance criteria:**
- [ ] "Advanced Options" section toggles open/close smoothly
- [ ] Logo preview shows after file selection
- [ ] Colour tag selection visually highlights chosen swatch
- [ ] Colour tag appears as left border on subscription row
- [ ] Logo renders in sub-row when base64 present
- [ ] All new fields persist via `SubscriptionStore.edit/add`
- [ ] URL appears as link in detail drawer
- [ ] Reminder days appear in drawer

**Backend integration notes:**
- Logo: `POST /api/subscriptions/:id/logo` (multipart) — swap base64 for CDN URL
- Reminder: trigger notification N days before `nextPaymentDate`

---

## TASK 11 — Remaining Panels (Wallet, Goals, Analytics, Timeline, Dependants, Notifications, Reports)

**Objective:** Replace "coming soon" placeholders with functional panel skeletons.

**Files to modify:**
- `pages/MASTER.html` (all placeholder panels)
- `styles/MASTER.css`

**Files to create:**
- `styles/wallet.css`, `styles/goals.css`, `styles/analytics.css`
- `styles/timeline.css`, `styles/dependants.css`, `styles/notifications.css`, `styles/reports.css`
- `scripts/wallet-ui.js`, `scripts/goals-ui.js`, `scripts/analytics-ui.js`
- `scripts/timeline-ui.js`, `scripts/dependants-ui.js`, `scripts/notifications-ui.js`, `scripts/reports-ui.js`
- `backend/wallet.js`, `backend/goals.js`, `backend/dependants.js`, `backend/notifications.js`

**For each panel — minimum viable content:**

**Wallet:** Balance hero card (large R amount + virtual card illustration), 3 stat cards (Pending In, Pending Out, Available), Quick Actions row (Add Funds, Withdraw, Transfer, Send), Recent Wallet Activity list (5 rows)

**Goals:** Header stats (Total Saved, Active Goals, Completed), Goal card grid (2 sample goals with progress bars, + New Goal dashed card), Filter bar (All/In Progress/Completed)

**Analytics:** Summary strip (Total Spent, Total Income, Net Savings %), Donut chart (reuse subscription donut component), Category trend 6-bar chart (CSS-only), Top merchants table (5 rows)

**Timeline:** Month heading, 30-day calendar grid with payment markers, Upcoming list (sorted by date), Total month forecast card

**Dependants:** Dependant card grid (2 sample cards: avatar initial, name, relationship, allowance balance, status badge), + Add Dependant dashed card

**Notifications:** Filter tabs (All/Unread/Payments/Goals), Notification list (5 items with unread dot), Mark all read button

**Reports:** Report cards row (Monthly Summary, Category Breakdown, Subscription Audit), Download CSV button, simple 6-month bar chart

**Functional requirements:**
- Each panel's `[module]-ui.js` exposes `[Module]UI.init()`, called from `layout.js`
- Each backend store loads from localStorage with seed data
- All lists use the same row patterns established in subscriptions
- Loading skeleton shown for 500ms then replaced with content (simulating async)

**Acceptance criteria:**
- [ ] Each panel renders actual content (no "coming soon" text)
- [ ] Navigating to each panel shows correct content
- [ ] No CSS conflicts with existing panels
- [ ] Loading skeletons briefly visible on first navigation
- [ ] Each panel responsive at all breakpoints

**Backend integration notes:** Each panel maps directly to the API endpoints defined in the spec doc (§3–§8).

---

## TASK 12 — Accessibility Pass

**Objective:** Ensure all interactive elements meet WCAG 2.1 AA accessibility requirements.

**Files to modify:** All HTML and JS files.

**Requirements:**
- All `<button>` elements have descriptive `aria-label` if no visible text
- All `<input>` elements have associated `<label>` (via `for` or `aria-labelledby`)
- All images have `alt` text (decorative images use `alt=""`)
- Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to heading, focus trapped inside while open, focus returns to trigger on close
- Drawer: same as modal
- Toast: `role="status"` or `role="alert"` (use `alert` for errors)
- Nav: `role="navigation"`, active item has `aria-current="page"`
- Tab switcher: `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`
- Progress bars: `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Dropdown menus: `role="menu"`, `role="menuitem"`, keyboard: Arrow Up/Down, Enter, Escape

**Acceptance criteria:**
- [ ] Tab order is logical on all pages
- [ ] All modals trap focus correctly
- [ ] Screen reader announces panel changes
- [ ] No missing alt attributes
- [ ] All form inputs have labels

**Backend integration notes:** None — pure accessibility task.

---

## TASK 13 — Performance Optimisation

**Objective:** Ensure the app loads fast and runs smoothly.

**Files to modify:** All files.

**Requirements:**
- All images use `loading="lazy"` attribute
- `landing.html` defers non-critical scripts: `<script defer>`
- CSS in `MASTER.html` uses `<link rel="preload">` for critical styles
- Subscription provider logo images: use CSS-only letter chips instead of external images (already done — confirm no external image loads)
- Remove any unused CSS classes (audit `dashboard.css` for orphaned rules)
- `debounce` applied to search inputs (already using UIUtils.debounce)
- `requestAnimationFrame` used for all JS-driven animations
- No synchronous `localStorage` reads in render paths (read once on init, cache in memory)

**Acceptance criteria:**
- [ ] No render-blocking scripts on landing.html
- [ ] No missing `loading="lazy"` on below-fold images
- [ ] Dashboard panel renders in under 100ms after navigation
- [ ] No layout shift (CLS) on panel transitions

**Backend integration notes:** None.

---

## TASK 14 — Final Integration & QA

**Objective:** End-to-end smoke test of the complete feature set.

**Test flows:**
1. Landing → "Create Account" → Register tab opens
2. Register: fill all fields → success animation → redirect to Dashboard
3. Dashboard: all new sections visible, counters animate, calendar shows subscription dates
4. Navigate to Subscriptions: list loads, stats correct
5. Add Subscription via "+ Add": all fields save, row appears in list, stats update
6. Add Subscription via Recommendation strip: confirmation modal, adds to list
7. Edit a subscription: modal pre-fills, changes save
8. Delete a subscription: confirm modal, row removed, stats update
9. Toggle a subscription: active/paused state updates in stats
10. Export CSV: file downloads with correct data
11. Navigate through all panels: no "coming soon" text, content visible
12. Resize to 768px: bottom tab bar visible, panels still navigate
13. Resize to 375px: no horizontal overflow, modals full-screen
14. Tab through entire dashboard with keyboard only
15. Landing page: scroll through all sections, FAQ works, contact form toast

**Acceptance criteria:**
- [ ] All 15 test flows pass without console errors
- [ ] No `undefined`, `null`, or `NaN` visible in the UI
- [ ] localStorage persists subscriptions across page refresh
- [ ] Dark theme correct on all pages

**Backend integration notes:** After backend is ready, set `USE_MOCK = false` in `api.js` and run all flows against the live API.

---

## Implementation Order

```
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14
```

Tasks 04–10 can be parallelised after 01–03 are complete.
Tasks 11–13 can be parallelised with each other.
Task 14 is always last.
