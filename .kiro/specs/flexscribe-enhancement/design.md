# FlexScribe Frontend Enhancement — Design

## Architecture Overview

```
Flexscibe/
├── landing.html                  ← Public landing page (root)
├── pages/
│   ├── login.html                ← Auth page (login + register tabs)
│   └── MASTER.html               ← App shell (SPA panel routing)
├── styles/
│   ├── landing.css               ← Landing page styles
│   ├── login.css                 ← Auth page styles
│   ├── MASTER.css                ← App shell + design tokens
│   ├── dashboard.css             ← Dashboard panel styles
│   ├── subscription.css          ← Subscription panel styles
│   └── [module].css              ← Per-panel styles (new)
├── scripts/
│   ├── landing.js                ← Landing page interactions
│   ├── login.js                  ← Auth form logic
│   ├── layout.js                 ← App shell routing + dropdowns
│   ├── api.js                    ← ALL API calls (new)
│   ├── subscriptions-ui.js       ← Subscriptions panel UI
│   └── [module]-ui.js            ← Per-panel UI (new)
└── backend/
    ├── subscriptions.js          ← Subscriptions data store
    └── [module].js               ← Per-module data stores (new)
```

## Design Token Consolidation

**Problem:** `landing.css` has its own `:root` with `--orange: #FF8A34` while `MASTER.css` uses `#FF6A1A`. The spec defines `#FF8A34` as the authoritative brand orange.

**Decision:** Update `MASTER.css` `:root` and `body.dark-mode` to use `#FF8A34` / `#FF9B54`. Since the landing page already uses the correct values, this aligns both files. All component CSS already reads `var(--orange)` so no other changes are needed.

## Component Patterns

### Card
```
background: var(--card)          → #181D24
border: 1px solid var(--border) → #272D35
border-radius: 16px
padding: 24px
box-shadow: 0 4px 24px rgba(0,0,0,0.3)
transition: transform 150ms ease, box-shadow 150ms ease
```
Hover: `transform: translateY(-2px)`, `box-shadow: 0 8px 32px rgba(255,138,52,0.12)`

### Button (Primary)
```
background: var(--orange)       → #FF8A34
color: #fff
border: none
border-radius: 10px
padding: 12px 24px
font-weight: 600
font-size: 14px
transition: background 150ms, transform 100ms
```
Hover: `background: var(--orange-hover)`, `transform: scale(1.02)`
Active: `transform: scale(0.98)`
Ripple: pseudo-element radial-gradient animation on click

### Input Field
```
background: #0D1117 (darker than card)
border: 1px solid var(--border)
border-radius: 8px
padding: 12px 16px
color: var(--text)
font-size: 14px
transition: border-color 150ms
```
Focus: `border-color: var(--orange)`, `box-shadow: 0 0 0 3px rgba(255,138,52,0.15)`
Error: `border-color: var(--danger)`, error message below in danger colour

### Modal
- Backdrop: `rgba(0,0,0,0.7)` + `backdrop-filter: blur(4px)`
- Box: max-width 560px, `border-radius: 20px`, slide-up + fade animation
- Mobile: full-screen, slides up from bottom

### Drawer (Detail Panel)
- Slides in from right, width 380px
- Mobile: full-width
- Semi-opaque overlay behind

### Toast
- Fixed bottom-centre desktop, bottom-full-width mobile
- Types: success (green icon), error (red icon), info (blue icon)
- Auto-dismiss 3s, slide-up entrance, slide-down exit

## Landing Page Structure

```
<header>          sticky, frosted glass, 64px
  logo | nav links | CTA buttons

#hero             100vh, gradient bg
  headline + subtext + CTA | dashboard mockup image
  floating metric cards overlaid on mockup

#features         gradient transition from hero
  tag line + title + 5-column feature grid

#how-it-works     alternating text+image rows (3 steps)
  Step 1: Sign Up | Step 2: Connect & Track | Step 3: Save Smarter

#security         dark section with shield iconography
  3 security pillars + compliance badges

#pricing          3 plan cards (Free / Premium / Business)
  Free forever plan, Premium R99/mo, Business R199/mo

#about            team story paragraph + stats strip

#faq              accordion (8 questions)

#contact          simple form (name, email, message) + social links

<footer>          4-column grid, copyright, links
```

## Authentication Flow Design

### URL Routing
```
login.html               → defaults to Sign In tab
login.html?mode=login    → Sign In tab (explicit)
login.html?mode=register → Register tab
```
`scripts/login.js` reads `new URLSearchParams(location.search).get('mode')` on load.

### Login Form States
```
idle       → normal form
loading    → button disabled, spinner visible, fields disabled
success    → green checkmark animation, "Redirecting..." text, 1.5s delay then redirect
error      → red shake animation on form, error message displayed
```

### Password Strength Rules
- Weak: < 8 chars
- Fair: ≥ 8 chars, one type of character
- Strong: ≥ 8 chars, letters + numbers
- Very Strong: ≥ 12 chars, upper + lower + numbers + symbols

## Dashboard Panel Layout (enhanced)

```
┌─────────────────────────────────────────────────────────────┐
│  Quick Actions (4 pills)                                     │
├──────────┬──────────┬──────────┬──────────────────────────┤
│  Balance │  Subs    │  Upcoming│  Scribe Score             │
├──────────┴──────────┴──────────┴──────────────────────────┤
│  Financial Health Score   │  AI Spending Insights (2 cards)│
├───────────────────────────┴────────────────────────────────┤
│  Spending Overview (donut)│  Recent Transactions           │
├───────────────────────────┼────────────────────────────────┤
│  Budget Status (4 bars)   │  Upcoming Payments             │
├───────────────────────────┼────────────────────────────────┤
│  Monthly Trends (bars)    │  Goals Progress                │
├───────────────────────────┴────────────────────────────────┤
│  Savings Achievements (3 badges)   │  Calendar Widget      │
└─────────────────────────────────────────────────────────────┘
```

## Subscription Panel Layout (enhanced)

```
┌─────────────────────────────────────────────────────────────┐
│  Status filter pills  │  + Add Subscription  │  ⋮ More     │
├──────────┬──────────┬──────────┬─────────────────────────  │
│  Active  │ Monthly  │  Annual  │  Potential Savings         │
├──────────┴──────────┴──────────┴───────────────────────────┤
│  Upcoming Payments (3)        │  Spending by Category       │
├──────────────────────────────────────────────────────────────┤
│  ── Recommended For You ──────────────────────────────────  │
│  [card] [card] [card] [card] [card]  →  horizontal scroll   │
├──────────────────────────────────────────────────────────────┤
│  ── Provider Library ─────────────────────────────────────  │
│  [search] [cat chips] [sort]                                 │
│  [provider grid]                                            │
├──────────────────────────────────────────────────────────────┤
│  Category filter chips                                       │
│  All Subscriptions list                                      │
└─────────────────────────────────────────────────────────────┘
```

## API Module Design (`scripts/api.js`)

```javascript
const USE_MOCK = true;
const BASE = window.FLEXSCRIBE_API_BASE || '/api';

// Auth
export async function login(email, password) { ... }
export async function register(fields) { ... }
export async function checkEmail(email) { ... }

// Subscriptions
export async function getSubscriptions() { ... }
export async function addSubscription(data) { ... }
export async function editSubscription(id, data) { ... }
export async function deleteSubscription(id) { ... }

// Wallet
export async function getWallet() { ... }
export async function addFunds(amount, sourceId) { ... }

// Goals
export async function getGoals() { ... }
export async function addGoal(data) { ... }

// Dependants
export async function getDependants() { ... }

// Notifications
export async function getNotifications() { ... }
export async function markRead(id) { ... }
```

## Responsive Breakpoints

| Breakpoint | MASTER sidebar    | Modals         |
|------------|-------------------|----------------|
| ≥ 1280px   | 280px expanded    | centred, 560px |
| 1024–1279  | 72px icon-only    | centred, 480px |
| 768–1023   | 72px icon-only    | centred, full-w|
| < 768px    | bottom tab bar    | full-screen    |

## Animation Specifications

| Animation         | Duration | Easing              | Trigger       |
|-------------------|----------|---------------------|---------------|
| Page panel switch | 200ms    | ease                | nav click     |
| Modal open        | 220ms    | cubic-bezier(.4,0,.2,1) | button |
| Drawer slide      | 280ms    | cubic-bezier(.4,0,.2,1) | row click|
| Card hover lift   | 150ms    | ease                | :hover        |
| Button press      | 100ms    | ease                | :active       |
| Counter increment | 1500ms   | ease-out            | in-viewport   |
| Progress bar fill | 800ms    | ease-out            | in-viewport   |
| Scroll reveal     | 500ms    | ease                | IntersectionObserver |
| Toast enter       | 200ms    | ease                | toast()       |
| Ripple            | 400ms    | ease-out            | click         |
