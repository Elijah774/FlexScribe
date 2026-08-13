# FlexScribe Frontend Enhancement — Requirements

## Overview
Produce a premium, modern fintech experience comparable to Revolut, Ramp, Stripe Dashboard, Rocket Money and Monarch Money. The application must feel smooth, interactive, visually polished and production-ready while remaining fully responsive.

## Design Tokens (authoritative — override any conflicting values in existing files)

| Token          | Value     | Usage                        |
|----------------|-----------|------------------------------|
| Background     | `#090B10` | Page background              |
| Cards          | `#181D24` | Card surfaces                |
| Sections       | `#11151B` | Sidebar, header, panels      |
| Borders        | `#272D35` | All borders and dividers     |
| Primary Accent | `#FF8A34` | CTAs, active nav, highlights |
| Hover Accent   | `#FF9B54` | Button hover, link hover     |
| Text           | `#F5F5F5` | Primary text                 |
| Secondary Text | `#A3ABB8` | Labels, timestamps, subtext  |

**Style principles:** subtle gradients, glassmorphism effects on cards, smooth transitions (150–250 ms), shadows with colour-matched tints, premium-feeling animations that are never distracting.

## Functional Requirements

### REQ-1 Landing Page
- Seamless single-page scrolling experience with no visible section breaks
- Sections: Hero, Features, How It Works, Security, Pricing, About, FAQ, Contact, Footer
- Every section flows into the next via gradient backgrounds, overlap, animated separators, and consistent spacing
- Scroll-reveal animations (fade-in + slide-up, triggered by IntersectionObserver)
- Smooth anchor scroll navigation
- Animated statistics counters
- Navigation: "Log In" → `login.html?mode=login`, "Create Account" → `login.html?mode=register`
- Modern fintech illustrations / dashboard mockup screenshots in Hero and How It Works

### REQ-2 Authentication Routing
- `login.html` accepts `?mode=login` (default) or `?mode=register` URL parameter
- Landing page nav buttons pass the correct `mode` parameter
- Correct tab is active on page load based on parameter, no page flicker

### REQ-3 Login Page
- Password visibility toggle (eye icon)
- Email format validation with inline error message
- Password strength meter (weak / fair / strong / very strong)
- "Remember Me" checkbox persists email to localStorage
- "Forgot Password" link (modal or inline flow)
- Loading spinner on submit
- Success animation before redirect
- Error message display (wrong credentials, network error)
- Social login buttons: Google, Apple, Microsoft (UI only, prepared for OAuth)
- After successful login: redirect to `pages/MASTER.html`

### REQ-4 Registration Page
- Fields: First Name, Last Name, Email, Password, Confirm Password, Phone Number
- Accept Terms checkbox (required), Marketing Preferences checkbox (optional)
- Real-time password strength indicator
- Confirm password match validation
- Duplicate email check (client-side format + prepared for API: `POST /auth/check-email`)
- On success: animated success screen, display "500 Scribe Points awarded", redirect to Dashboard

### REQ-5 Interactive UI Baseline
- Hover animations on all interactive cards (elevation lift, border glow)
- Ripple effect on all primary buttons
- Animated progress bars (fill from 0 on first view)
- Animated number counters on stat cards
- Smooth CSS transitions on all state changes
- Loading skeleton screens for async data panels
- Toast notification system (already exists in subscriptions — promote to global)
- Page transition fade on panel switch in MASTER

### REQ-6 Subscription Recommendations
- New "Recommended For You" section in the subscriptions panel
- At least 14 provider cards: Netflix, Spotify, Disney+, Showmax, YouTube Premium, Apple Music, Amazon Prime, Microsoft 365, Adobe Creative Cloud, ChatGPT Plus, Canva Pro, GitHub Pro, Dropbox, NordVPN
- Each card: provider logo/initial, name, monthly cost, category, short description, popularity rating (stars), top 3 benefits, "Add" button, "Quick View" button
- Clicking "Add": opens a confirmation modal with — billing cycle selector (monthly/quarterly/yearly), payment source (Wallet / Bank Card), category confirm, auto-renew toggle, notifications toggle, Save button
- Clicking "Quick View": opens a detail modal with full description and benefits

### REQ-7 Manual Subscription Creation (enhance existing Add modal)
- Extend existing `#sub-modal` with additional fields: Provider Website URL, Upload Provider Logo (file input, preview), Colour Tag picker (8 preset colours), Reminder Days before billing (number input 1–30), Auto Renew toggle
- All new fields are optional except name and amount
- Validation on all fields
- Logo upload stores as base64 in localStorage (no server yet)

### REQ-8 Provider Library
- Searchable, filterable subscription library accessible from within the subscription panel
- Search by name (real-time filter)
- Category filter chips: All, Popular, Entertainment, Utilities, Productivity, Gaming, Education, Health, AI
- Sort options: Price ↑↓, Popularity, A–Z, Newest
- Each entry can be enabled via toggle switch OR the floating + FAB
- "Recently Added" section at the top showing last 5 user-added subscriptions

### REQ-9 Dashboard Enhancements
- Quick Actions row: Add Funds, Send Money, New Goal, Add Subscription (4 pill buttons with icons)
- Financial Health Score card: circular progress indicator (0–850), score label, 3-factor breakdown
- AI Spending Insights: 2–3 plain-language insight cards (static copy, structured for API swap)
- Budget Status: 4 category budget bars (set vs actual, colour changes red when over 80%)
- Calendar Widget: mini month calendar showing payment dates as orange dots
- Monthly Trends mini-chart: 6-bar sparkline for last 6 months spending
- Savings Achievements: 3 badge tiles (locked/unlocked state)
- All existing dashboard content retained

### REQ-10 Backend Preparation
- All API calls isolated in `scripts/api.js` — never inline
- `api.js` exports named functions: `login()`, `register()`, `getSubscriptions()`, `addSubscription()`, `editSubscription()`, `deleteSubscription()`, `getWallet()`, `getGoals()`, `getDependants()`, `getNotifications()`
- Each function returns a Promise; currently resolves with mock data but accepts a `USE_MOCK` flag
- Auth token stored in sessionStorage as `flexscribe_token`
- All fetch calls include `Authorization: Bearer ${token}` header when token exists
- Base URL configurable via `window.FLEXSCRIBE_API_BASE` (defaults to `/api`)

### REQ-11 Responsiveness
- All new components support: Desktop ≥1280px, Laptop 1024–1279px, Tablet 768–1023px, Mobile <768px
- Sidebar collapses to icon-only rail at <1024px (MASTER)
- Bottom tab bar replaces sidebar at <768px (MASTER)
- All modals full-screen on mobile
- No horizontal overflow at any breakpoint

### REQ-12 Accessibility
- All interactive elements have `aria-label` or visible label
- Keyboard: Tab order logical, Enter/Space activates buttons, Escape closes modals/drawers
- Focus ring visible on all focusable elements (2px solid `#FF8A34` at 40% opacity)
- All images have descriptive `alt` text
- Colour contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text

### REQ-13 Code Quality
- No inline `<script>` blocks other than one-liner `lucide.createIcons()` in MASTER
- No inline `style=""` on structural elements (use CSS classes)
- CSS variables used for all colours — never hardcoded hex values in component CSS
- Each new JS module is a self-contained IIFE or ES-module-style object (matching existing pattern)
- Files follow existing naming convention: `scripts/[module]-ui.js`, `backend/[module].js`
