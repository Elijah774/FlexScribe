# FlexScribe Frontend Enhancement — Tasks (v2)

> Updated to reflect completed work (Tasks 01–07 DONE) and expanded scope from the full product specification. Each task is independently executable and references specific requirements.

---

## ✅ TASK 01 — Design Token Consolidation (DONE)
All CSS files aligned to `#FF8A34` orange, Inter font, utility variables, global focus ring, utility classes.

## ✅ TASK 02 — Shared UI Utilities (DONE)
`scripts/ui-utils.js` created: toast, ripple, animateCounter, revealOnScroll, skeleton, debounce.

## ✅ TASK 03 — API Module (DONE)
`scripts/api.js` created: all endpoints stubbed with USE_MOCK flag, consistent response shape, auth token handling.

## ✅ TASK 04 — Landing Page (DONE)
9 sections rebuilt: Hero, Features, How It Works, Security, Pricing, About, FAQ, Contact, Footer. Scroll-reveal, counters, sticky nav, responsive.

## ✅ TASK 05 — Login & Registration (DONE)
URL param routing, password strength meter, eye toggle, inline validation, success animation, social buttons, loading page transition, redirect to dashboard.

## ✅ TASK 06 — App Shell & Theme Toggle (DONE)
Light/dark mode fixed (dark-first baseline, `body.light-mode` toggle), search bar added to header, greeting in page title.

## ✅ TASK 07 — Customizable Dashboard (DONE)
16-widget dashboard with DashboardStore, 4 style presets, accent picker, drag-and-drop reorder, customization drawer, vibrant orange glows and gradients.

---

## TASK 08 — Subscription Recommendations Engine

**Objective:** Add "Recommended For You" horizontal strip + provider library to subscriptions panel.

**Files:** `pages/MASTER.html`, `styles/subscription.css`, `scripts/subscriptions-ui.js`, `backend/subscriptions.js`

**Functional requirements:**
- 14 provider cards in horizontal scroll strip (Netflix, Spotify, Disney+, Showmax, YouTube Premium, Apple Music, Amazon Prime, Microsoft 365, Adobe CC, ChatGPT Plus, Canva Pro, GitHub Pro, Dropbox, NordVPN)
- Each card: logo chip, name, monthly cost, category, description, star rating, "Quick View" + "Add" buttons
- Add → confirmation modal with billing cycle, payment source, auto-renew, notifications toggles
- Quick View → detail modal with benefits and pricing table
- Already-subscribed providers excluded from recommendations
- Searchable provider library below recommendations with category chips and sort

**Acceptance criteria:**
- [x] 14 cards render in horizontal strip with scroll-snap
- [x] Add confirmation modal pre-fills provider data
- [x] Quick View modal shows full details
- [x] Provider library search filters in real-time
- [x] Category chips and sort work correctly

---

## TASK 09 — Manual Subscription Enhancement

**Objective:** Extend Add/Edit modal with advanced fields (logo upload, colour tag, reminder days, provider URL).

**Files:** `pages/MASTER.html`, `styles/subscription.css`, `scripts/subscriptions-ui.js`, `backend/subscriptions.js`

**Functional requirements:**
- Collapsible "Advanced Options" section in modal
- Logo upload → base64 preview, renders in sub-row
- Colour tag picker (8 swatches) → left border on row
- Reminder days (1–30) → shown in detail drawer
- Provider URL → clickable link in drawer

**Acceptance criteria:**
- [x] Advanced section toggles smoothly
- [x] Logo upload previews and persists
- [x] Colour tag renders on row
- [x] All fields save and display in drawer

---

## TASK 10 — Wallet Panel

**Objective:** Full Wallet panel per §3 of product spec.

**Files to create:** `styles/wallet.css`, `scripts/wallet-ui.js`, `backend/wallet.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Balance hero card (large amount + virtual card graphic)
- 3 stat cards: Available, Pending In, Pending Out
- Quick Actions row: Add Funds, Withdraw, Transfer to Goal, Send to Dependant
- Recent Wallet Activity list (5 seed transactions)
- Add Funds modal: amount, source selector, confirm → updates balance
- Withdraw modal: amount, destination, confirm
- Transfer to Goal modal: amount, goal picker, confirm
- All modals call API module methods

**Acceptance criteria:**
- [x] Wallet panel shows balance and stats from backend/wallet.js
- [x] All 3 modals open, validate, and update data
- [x] Transactions list re-renders after actions
- [x] Responsive at all breakpoints

---

## TASK 11 — Goals Panel

**Objective:** Full Goals panel per §4 of product spec.

**Files to create:** `styles/goals.css`, `scripts/goals-ui.js`, `backend/goals.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Header stats: Total Saved, Active Goals, Completed Goals
- Goal card grid (2 seed goals + "+ New Goal" dashed card)
- Each card: image, title, target, saved, progress bar, % label
- Filter/sort bar: All / In Progress / Completed
- New Goal modal: name, target amount, target date, image URL, category
- Goal detail drawer: contribution history, edit, delete
- Add Funds to Goal quick action (reads wallet balance)
- Contribution forecasting text: "At current pace, you'll reach this by..."

**Acceptance criteria:**
- [x] 2 seed goals render with progress bars
- [x] New Goal modal creates and persists a goal
- [x] Detail drawer shows history and allows edit/delete
- [x] Filter bar works correctly
- [x] Progress bars animate on first view

---

## TASK 12 — Analytics Panel

**Objective:** Full Analytics panel per §5 of product spec.

**Files to create:** `styles/analytics.css`, `scripts/analytics-ui.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Date range switcher (This Month / Last Month / Last 3 Months)
- Summary strip: Total Spent, Total Income, Net Savings Rate %
- Large donut chart (reuse component pattern from dashboard)
- Category trend 6-bar chart (CSS-only, grouped by month)
- Top merchants table (5 rows: logo, name, total, count)
- Budget vs Actual panel (4 category rows with threshold colors)
- Click donut segment → filters page to that category
- Export button (CSV download via API.Analytics or SubscriptionStore)

**Acceptance criteria:**
- [x] All chart sections render with seed data
- [x] Date range switcher updates displayed data
- [x] Donut click filters correctly
- [x] Budget bars change color at thresholds
- [x] Export downloads a CSV file

---

## TASK 13 — Dependants Panel

**Objective:** Full Dependants panel per §6 of product spec.

**Files to create:** `styles/dependants.css`, `scripts/dependants-ui.js`, `backend/dependants.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Dependant card grid (2 seed dependants + "+ Add" card)
- Each card: avatar initial, name, relationship tag, allowance, status badge
- Add Dependant modal: name, email, relationship, avatar, allowance, spending limit
- Detail drawer: permission toggles, activity list, edit/delete
- Send Allowance modal: amount, one-time/recurring, source wallet
- Status management: Active / Invited / Suspended

**Acceptance criteria:**
- [x] 2 seed dependants render in grid
- [x] Add modal creates and persists a dependant
- [x] Detail drawer shows permissions and activity
- [x] Send Allowance modal validates and processes
- [x] Status badge reflects current state

---

## TASK 14 — Transactions Panel

**Objective:** Full Transactions ledger per §7 of product spec.

**Files to create:** `styles/transactions.css`, `scripts/transactions-ui.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Search bar (top) with debounced filter
- Filter chips: Category, Date Range, Type (Income/Expense/Transfer)
- Sortable list: icon, name+date, category tag, amount (color-coded), running balance
- Row click → detail drawer: category edit, notes, receipt attach area
- "Add Manual Transaction" button → modal with all fields
- Bulk select → "Export CSV" action
- Paginated (25 per page) or infinite scroll

**Acceptance criteria:**
- [ ] Transaction list renders with seed data from API mock
- [ ] Search filters in real-time
- [ ] Filter chips work (category, type)
- [ ] Sort by date/amount works
- [ ] Detail drawer allows category edit
- [ ] Manual add creates a transaction

---

## TASK 15 — Notifications Panel

**Objective:** Full Notifications feed per §8 of product spec.

**Files to create:** `styles/notifications.css`, `scripts/notifications-ui.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Filter tabs: All / Unread / Payments / Goals / Security
- Notification list: icon, title, body, timestamp, unread dot
- Click → navigates to linked panel (via linkTo field)
- "Mark all as read" button
- Preferences section: channel (Push/Email) × category toggle grid
- Unread count syncs with header bell badge

**Acceptance criteria:**
- [ ] 5 seed notifications render with correct icons
- [ ] Filter tabs filter the list
- [ ] Clicking a notification marks it read and navigates
- [ ] "Mark all as read" clears all unread dots
- [ ] Bell badge count updates live

---

## TASK 16 — Settings Panel

**Objective:** Full Settings panel per §9 of product spec.

**Files to create:** `styles/settings.css`, `scripts/settings-ui.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Sub-navigation: Profile, Security, Appearance, Billing
- Profile: avatar, name, email, phone fields with inline edit + save
- Security: password change form, 2FA toggle (UI only), active sessions list
- Appearance: theme toggle (dark/light), accent color picker (6 swatches)
- Billing: current plan display, "Upgrade to Premium" CTA
- Danger Zone: Export data button, Delete account (multi-step confirm)

**Acceptance criteria:**
- [ ] All sub-sections navigate correctly
- [ ] Profile fields save to localStorage
- [ ] Theme toggle works (syncs with layout.js)
- [ ] Accent picker updates dashboard accent
- [ ] Delete account shows confirmation flow

---

## TASK 17 — Help & Support Panel

**Objective:** Help & Support per §10 of product spec.

**Files to create:** `styles/help.css`, `scripts/help-ui.js`
**Files to modify:** `pages/MASTER.html`, `scripts/layout.js`

**Functional requirements:**
- Search bar + 6 topic tile grid (Getting Started, Wallet, Subscriptions, Goals, Security, Billing)
- FAQ accordion (8 articles) filtered by search and topic
- Contact form: subject, category dropdown, description, submit
- "Was this helpful? 👍 👎" per FAQ item
- System status indicator ("All systems operational" green dot)

**Acceptance criteria:**
- [ ] Search filters FAQ in real-time
- [ ] Topic tiles filter to relevant FAQs
- [ ] Contact form submits with toast
- [ ] Helpful/unhelpful feedback toggles
- [ ] System status shows green

---

## TASK 18 — Responsive Pass

**Objective:** Full responsive implementation across all panels.

**Files to modify:** `styles/MASTER.css`, all panel CSS files, `scripts/layout.js`

**Functional requirements:**
- Sidebar: icon-only rail at <1024px, bottom tab bar at <768px
- "More" tab opens sheet drawer with remaining nav items
- All modals full-screen on mobile
- All grids collapse to 1-col on mobile
- Touch-friendly tap targets (min 44px)
- No horizontal overflow at any breakpoint

**Acceptance criteria:**
- [ ] Icon-only sidebar at 1024px
- [ ] Bottom tab bar at 768px
- [ ] All panels usable at 375px width
- [ ] No overflow on any page

---

## TASK 19 — Accessibility Pass

**Objective:** WCAG 2.1 AA compliance across all components.

**Files to modify:** All HTML and JS files.

**Functional requirements:**
- All buttons have aria-label or visible text
- All inputs have associated labels
- All images have alt text
- Modals/drawers: role="dialog", aria-modal, focus trap, focus return
- Nav: aria-current="page" on active item
- Progress bars: role="progressbar" with aria-valuenow
- Keyboard: Tab, Enter, Space, Escape work everywhere

**Acceptance criteria:**
- [ ] Tab order logical on all pages
- [ ] Modals trap focus
- [ ] Screen reader announces panel changes
- [ ] No missing alt/aria attributes

---

## TASK 20 — Performance & Code Quality

**Objective:** Optimize load time and code maintainability.

**Files to modify:** All files.

**Functional requirements:**
- All images: `loading="lazy"`
- Scripts: `defer` on landing.html
- No duplicate CSS rules across panel files
- debounce on all search inputs
- requestAnimationFrame for JS animations
- No synchronous localStorage reads in render loops
- Remove dead code and unused CSS classes

**Acceptance criteria:**
- [ ] Dashboard renders in <100ms after nav click
- [ ] No layout shift on panel transitions
- [ ] No render-blocking resources on landing page
- [ ] Console shows zero errors on all pages

---

## TASK 21 — Final Integration & QA

**Objective:** End-to-end smoke test of complete feature set.

**Test flows:**
1. Landing → "Create Account" → Register → Loading → Dashboard
2. Dashboard: all widgets visible, counters animate, calendar works
3. Customize dashboard: toggle widgets, change preset, change accent
4. Subscriptions: add from recommendations, manual add, edit, delete, export CSV
5. Wallet: add funds, transfer to goal, view history
6. Goals: create goal, contribute, view progress
7. Analytics: change date range, click donut, export
8. Dependants: add, send allowance, manage permissions
9. Transactions: search, filter, add manual, export
10. Notifications: filter, mark read, navigate from notification
11. Settings: edit profile, change theme, change accent
12. Help: search FAQ, submit contact form
13. Responsive: test at 1280px, 1024px, 768px, 375px
14. Keyboard: tab through entire app
15. Theme: toggle light/dark, verify all panels

**Acceptance criteria:**
- [ ] All 15 flows pass without console errors
- [ ] No undefined/null/NaN visible in UI
- [ ] localStorage persists all data across refresh
- [ ] Both themes render correctly everywhere

---

## Implementation Order

```
[DONE] 01 → 02 → 03 → 04 → 05 → 06 → 07
[NEXT] 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17
[FINAL] 18 → 19 → 20 → 21
```

Tasks 08–17 can be parallelized (each is an independent panel).
Tasks 18–20 should follow once all panels exist.
Task 21 is always last.
