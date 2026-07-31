# FlexScribe Frontend Enhancement — Design (v2)

## Architecture Overview

```
Flexscibe/
├── landing.html                  ← Public landing page (root)
├── pages/
│   ├── login.html                ← Auth page (login + register tabs)
│   ├── loading.html              ← Transition page (login → dashboard)
│   └── MASTER.html               ← App shell (SPA panel routing)
├── styles/
│   ├── landing.css               ← Landing page styles
│   ├── login.css                 ← Auth page styles
│   ├── MASTER.css                ← App shell + design tokens
│   ├── dashboard.css             ← Customizable dashboard panel
│   ├── subscription.css          ← Subscription panel
│   ├── wallet.css                ← Wallet panel
│   ├── goals.css                 ← Goals panel
│   ├── analytics.css             ← Analytics panel
│   ├── dependants.css            ← Dependants panel
│   ├── transactions.css          ← Transactions panel
│   ├── notifications.css         ← Notifications panel
│   ├── settings.css              ← Settings panel
│   └── help.css                  ← Help & Support panel
├── scripts/
│   ├── landing.js                ← Landing page interactions
│   ├── login.js                  ← Auth form logic (URL params, validation)
│   ├── layout.js                 ← App shell routing + dropdowns + theme
│   ├── api.js                    ← ALL API calls (mock + real)
│   ├── ui-utils.js               ← Shared utilities (toast, ripple, etc.)
│   ├── dashboard-ui.js           ← Customizable dashboard (widgets, presets)
│   ├── subscriptions-ui.js       ← Subscriptions panel UI
│   ├── wallet-ui.js              ← Wallet panel UI
│   ├── goals-ui.js               ← Goals panel UI
│   ├── analytics-ui.js           ← Analytics panel UI
│   ├── dependants-ui.js          ← Dependants panel UI
│   ├── transactions-ui.js        ← Transactions panel UI
│   ├── notifications-ui.js       ← Notifications panel UI
│   ├── settings-ui.js            ← Settings panel UI
│   └── help-ui.js                ← Help & Support panel UI
└── backend/
    ├── dashboard.js              ← Dashboard layout persistence
    ├── subscriptions.js          ← Subscriptions data store
    ├── wallet.js                 ← Wallet data store
    ├── goals.js                  ← Goals data store
    ├── dependants.js             ← Dependants data store
    └── notifications.js          ← Notifications data store
```

## Design System (v2 — consolidated from spec + implementation)

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--background` | `#090B10` | App background |
| `--section` | `#11151B` | Sidebar, header |
| `--card` | `#181D24` | Card surfaces |
| `--border` | `#272D35` | All borders |
| `--orange` | `#FF8A34` | Primary CTA, accents |
| `--orange-hover` | `#FF9B54` | Hover states |
| `--orange-tint` | `rgba(255,138,52,0.12)` | Icon chip backgrounds |
| `--orange-glow` | `rgba(255,138,52,0.22)` | Glow effects |
| `--text` | `#F5F5F5` | Primary text |
| `--text-light` | `#A3ABB8` | Secondary text |
| `--green` | `#B9F15B` | Success, positive trends |
| `--danger` | `#F87171` | Errors, negative amounts |
| `--blue` | `#3B82F6` | Info, utilities category |
| `--purple` | `#A77CFF` | Education, secondary accents |
| `--yellow` | `#FACC15` | Warnings, "Other" category |
| `--hover` | `#1E2530` | Hover state backgrounds |
| `--input-bg` | `#0D1117` | Input fields |

### Typography
- Font: `'Inter', system-ui, sans-serif`
- H1 page title: 20px / 700
- H2 card title: 15–18px / 600
- Body: 14px / 400
- Stat values: 22–32px / 700–800
- Micro labels: 11–12px / 400–500

### Component Patterns

**Card:** `background: var(--card)`, `border: 1px solid var(--border)`, `border-radius: 16px`, `padding: 24px`, hover lifts 2px with orange glow shadow

**Button (Primary):** `background: var(--orange)`, `color: #fff`, `border-radius: 10px`, `padding: 12px 24px`, ripple on click, scale 0.98 on active

**Input:** `background: var(--input-bg)`, `border: 1px solid var(--border)`, `border-radius: 8px`, focus → orange border + 3px orange glow ring

**Modal:** backdrop blur 4px, max-width 560px, slide-up + fade, full-screen on mobile

**Drawer:** slides from right 380px, mobile full-width, semi-opaque overlay

**Toast:** fixed bottom-centre, auto-dismiss 3s, types: success/error/info/warning

### Vibrant Visual Style (from reference design)
- Orange ambient glows on interactive elements
- Gradient backgrounds on feature cards (FlexCard, AI Insight)
- Neon drop-shadows on score gauges and progress fills
- Glassmorphism option via `[data-preset="glass"]`
- Subtle particle/glow effects on special widgets

## Customizable Dashboard Design

### Widget Library (16 widgets)
1. Greeting (now in page heading, not body)
2. Quick Actions (4 gradient pills)
3. FlexCard (virtual card with orange glow)
4. Wallet Balance stat
5. Active Subscriptions stat
6. Upcoming Payments stat
7. Scribe Score / Financial Health gauge
8. Spending Overview (donut + legend)
9. Monthly Trend (CSS bar chart)
10. Top Categories (ranked list with bars)
11. Upcoming Payments list
12. Recent Transactions list
13. Goals Progress (progress bars)
14. Calendar (mini month grid)
15. Scribe Points (level + progress)
16. AI Insight (tip card with orange accent)

### Style Presets
- **Modern** (default): clean flat dark cards
- **Glass**: frosted blur, transparent cards, glowing borders
- **Bold**: gradient backgrounds, large typography, strong shadows
- **Minimal**: thin borders, less padding, restrained color

### Personalization
- Toggle widgets on/off
- Drag-and-drop reorder
- Choose style preset
- Choose accent color (6 preset swatches)
- Persist to localStorage
- Reset to default

## New Panel Designs (from product spec)

### Wallet (§3)
- Top stat row: Available Balance, Pending In, Pending Out
- Balance line chart (30/90/365 day range)
- Linked Accounts list with bank logos
- Quick Actions: Add Funds, Withdraw, Transfer, Send to Dependant
- Recent Wallet Activity list
- Modals: Add Funds, Withdraw, Transfer to Goal

### Goals (§4)
- Header stats: Total Saved, Active, Completed
- Goal card grid with progress bars + images
- "+ New Goal" dashed card
- Filter/sort: All / In Progress / Completed
- Goal detail drawer: contribution history, edit, delete
- Contribution forecasting line

### Analytics (§5)
- Date range switcher + compare toggle
- Summary strip: Total Spent, Income, Net Savings %
- Large donut chart + full legend
- Category trend stacked bar chart
- Top merchants table
- Budget vs Actual bars (green/yellow/red thresholds)
- AI insight cards

### Dependants (§6)
- Card grid: avatar, name, relationship, allowance, status
- "+ Add Dependant" card
- Detail drawer: permissions, spending limits, activity
- Send Allowance modal (one-time/recurring)
- Approve/Decline fund request queue

### Transactions (§7)
- Search bar + filter chips (Category, Date, Amount, Type)
- Sortable table: icon, name, date, category tag, amount, balance
- Row click → detail drawer (edit category, notes, receipt)
- "Add Manual Transaction" modal
- Bulk actions on multi-select
- CSV/PDF export

### Notifications (§8)
- Filter tabs: All / Unread / Payments / Goals / Security
- Notification list with unread orange dot
- Click → navigates to relevant panel
- "Mark all as read" button
- Preferences panel: channel × category toggle matrix

### Settings (§9)
- Sub-nav: Profile, Security, Linked Accounts, Notifications, Billing, Appearance, Danger Zone
- Inline editing with auto-save
- 2FA setup (QR code + verify)
- Theme toggle + accent picker
- Export data / Delete account (multi-step confirm)

### Help & Support (§10)
- Search bar + topic tile grid
- FAQ accordion (filtered by search)
- Contact form with category dropdown
- "Chat with us" floating widget
- System status indicator

## Navigation Structure

**Sidebar (280px, collapsible):**
- Dashboard, Wallet, Subscriptions, Goals, Analytics, Timeline, Dependants, Notifications, Reports, Settings
- Bottom: Scribe Points display, Upgrade card, Sign out

**Header:**
- Page title (dynamic greeting on dashboard)
- Search bar (center)
- Theme toggle, Notifications bell (badge), User avatar chip

## Responsive Breakpoints

| Breakpoint | Sidebar | Modals | Grid |
|---|---|---|---|
| ≥ 1280px | 280px expanded | centred 560px | 3-col widgets |
| 1024–1279 | 72px icon-only | centred 480px | 2-col widgets |
| 768–1023 | 72px icon-only | full-width | 2-col widgets |
| < 768px | bottom tab bar | full-screen | 1-col widgets |

## API Architecture

All calls through `scripts/api.js` with `USE_MOCK` flag:
- `API.Auth.*` — login, register, checkEmail, logout, forgotPassword
- `API.Subscriptions.*` — getAll, add, edit, remove, toggle, getProviders
- `API.Wallet.*` — get, getHistory, addFunds, withdraw, transfer
- `API.Goals.*` — getAll, add, edit, remove, contribute
- `API.Dependants.*` — getAll, add, edit, remove, sendAllowance
- `API.Notifications.*` — getAll, markRead, markAllRead
- `API.Analytics.*` — getSummary, getByCategory, getTrend, getInsights
- `API.Support.*` — submitContact, getFaq

Auth token in `sessionStorage.flexscribe_token`, attached as Bearer header on all real requests.

## Animation Specifications

| Animation | Duration | Easing | Trigger |
|---|---|---|---|
| Page panel switch | 200ms | ease | nav click |
| Modal open | 220ms | cubic-bezier(.4,0,.2,1) | button |
| Drawer slide | 280ms | cubic-bezier(.4,0,.2,1) | row click |
| Card hover lift | 150ms | ease | :hover |
| Button press | 100ms | ease | :active |
| Counter increment | 1500ms | ease-out | in-viewport |
| Progress bar fill | 800ms | ease-out | in-viewport |
| Scroll reveal | 500ms | ease | IntersectionObserver |
| Toast enter | 200ms | ease | toast() |
| Ripple | 400ms | ease-out | click |
| Loading page progress | ~3s total | stepped | page load |
