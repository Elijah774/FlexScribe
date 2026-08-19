# FlexScribe Frontend Enhancement — Design (v3)

## Architecture

```
Flexscribe/
├── landing.html
├── pages/
│   ├── login.html / signup.html
│   ├── loading.html              ← Transition page
│   ├── plans.html                ← Plan selection (NEW)
│   ├── onboarding.html           ← New user questionnaire (NEW)
│   ├── MASTER.html               ← App shell (SPA routing)
│   ├── dashboard.html
│   ├── wallet.html
│   ├── subscription.html
│   ├── goals.html
│   ├── analytics.html
│   ├── timeline.html
│   ├── dependants.html
│   ├── notifications.html
│   ├── reports.html
│   ├── settings.html
│   └── profile.html
├── styles/
│   ├── MASTER.css                ← Design tokens + shell
│   ├── [panel].css               ← Per-panel styles
│   ├── plans.css                 ← Plan selection page (NEW)
│   └── onboarding.css            ← Questionnaire styles (NEW)
├── scripts/
│   ├── layout.js                 ← SPA routing + plan checks
│   ├── api.js                    ← All API calls
│   ├── ui-utils.js               ← Shared utilities
│   ├── plans.js                  ← Plan selection logic (NEW)
│   ├── onboarding.js             ← Questionnaire flow (NEW)
│   ├── plan-gate.js              ← Feature restriction checks (NEW)
│   ├── dashboard-ui.js
│   ├── subscriptions-ui.js
│   ├── wallet-ui.js
│   ├── goals-ui.js
│   ├── analytics-ui.js
│   ├── dependants-ui.js
│   ├── reports-ui.js
│   ├── notifications.page.js
│   ├── timeline.page.js
│   └── settings-ui.js
├── backend/
│   ├── subscriptions.js
│   ├── wallet.js
│   ├── goals.js
│   ├── dependants.js
│   └── user.js                   ← Plan + onboarding state (NEW)
└── server/
    └── routes/                   ← Express/Java backend routes
```

## Design Tokens (v3 — corrected)

| Token | Value | CSS Variable |
|---|---|---|
| Background | `#050A10` | `--background` |
| Secondary bg | `#0B111A` | `--section` |
| Cards | `#111923` | `--card` |
| Elevated cards | `#151F2B` | `--card-elevated` |
| Primary Orange | `#FF6B00` | `--orange` |
| Orange highlight | `#FF8A1F` | `--orange-hover` |
| Text | `#FFFFFF` | `--text` |
| Secondary text | `#9AA9BD` | `--text-light` |
| Borders | `#263342` | `--border` |
| Success | `#67E45C` | `--green` |
| Warning | `#FFC247` | `--yellow` |
| Danger | `#FF4D4D` | `--danger` |

## Plan System Design

### Plan Feature Matrix

| Feature | Individual | Professional | Family |
|---|:---:|:---:|:---:|
| Wallet | ✓ | ✓ | ✓ |
| Subscriptions | ✓ | ✓ | ✓ |
| Goals | ✓ | ✓+ | ✓+ |
| Timeline | ✓ | ✓ | ✓ |
| Analytics | Basic | Advanced | Advanced |
| Scribe Score | Basic | Detailed | Detailed |
| Reports | Basic | Detailed | Family |
| Bank Upload | ✓ | ✓ | ✓ |
| Notifications | ✓ | ✓ | ✓ |
| Insights | Basic | Priority | Priority |
| Dependants | ✗ | ✗ | ✓ |
| Family Overview | ✗ | ✗ | ✓ |

### Plan Gate Behaviour
When user clicks a restricted feature:
1. Panel shows upgrade prompt card (not broken/empty page)
2. Card shows: feature name, which plan unlocks it, benefits, "Upgrade" CTA → navigates to plans.html
3. Sidebar item still visible but shows a lock icon badge for Family-only features (Dependants)

### Plan Selection Page (`plans.html`)
- 3 plan cards side by side (Individual R0, Professional R99/mo, Family R199/mo)
- Current plan: "CURRENT PLAN" badge, no CTA button
- Other plans: "Upgrade" or "Downgrade" button
- Selected/hovered plan: orange border + glow
- Below cards: detailed feature comparison table
- Change flow: click → confirmation modal → update → success → redirect

## Onboarding Flow Design

### Page: `pages/onboarding.html`
Multi-step wizard with progress indicator:

**Step 1 — Welcome**
- Logo, "Let's set up your FlexScribe account"
- Explain personalisation purpose
- "Get Started" button

**Step 2 — Subscriptions**
- Grid of popular service tiles (Netflix, Spotify, Disney+, YouTube Premium, Amazon Prime, Showmax, Apple TV+, Microsoft 365, Google One, Gym, Internet, Mobile plan, Other)
- Click to toggle selected (orange border)
- "+ Add another subscription" button
- "Continue" / "Skip" buttons

**Step 3 — Subscription Details**
- For each selected: editable card with name, monthly price, billing cycle, renewal date, category, payment method
- "Continue" button

**Step 4 — Financial Info (optional)**
- Monthly income input
- Main financial goal (dropdown: Save more, Pay off debt, Build emergency fund, etc.)
- Typical monthly expenses
- Preferred savings goal
- Emergency fund target
- "Continue" / "Skip for now" buttons

**Step 5 — Setup Guidance**
- Clear step-by-step guide for changing payment methods
- Provider-neutral language
- "I'll do this later" / "I've completed setup" buttons

**Step 6 — Completion**
- "You're all set!" with subtle animation
- Summary: subs added, monthly total, plan, wallet status
- "Go to Dashboard" button

### Data Flow
Onboarding data → stored via API → Dashboard reads from same source → no hardcoded data

## User Journeys

### New User
Register → Plan Selection (plans.html) → Onboarding (onboarding.html) → Loading → Dashboard

### Returning User
Login → Loading → Dashboard

### Plan Change
Dashboard → Settings → Subscription & Plan → plans.html → Select → Confirm → Success → Dashboard

## Navigation & Restrictions

Sidebar always shows all items. For restricted features:
- Individual/Professional clicking "Dependants": see upgrade prompt panel
- Family plan: full Dependants functionality

Plan stored in `localStorage` (mock) or `sessionStorage` (from API token), checked by `plan-gate.js` before rendering each panel.

## Animations
- Cards: `opacity: 0 → 1`, `translateY(20px → 0)`, 400ms ease
- Buttons: `translateY(0 → -2px)` on hover
- Plan cards: `scale(1 → 1.02)` on hover, orange glow on selected
- Modals: `opacity + translateY` 220ms
- Progress bars: width animates from 0
- Dashboard values: counter animation from 0
- No bouncing, no excessive motion

## Responsive
- Desktop: full sidebar + 3-col grids
- Laptop/Tablet: collapsible sidebar + 2-col
- Smaller screens: usable but Android handles true mobile
- No bottom tab bar needed (Android app covers mobile)
