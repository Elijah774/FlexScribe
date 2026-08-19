# FlexScribe Frontend Enhancement — Requirements (v3)

## Overview
Build a premium fintech web application with plan-based access control, new-user onboarding questionnaire, plan selection/management, and feature restrictions. The app supports three plans: Individual, Professional, Family. The Android app has FlexTap; the website does NOT.

## Design Tokens (authoritative — v3 colour update)

| Token | Value | Usage |
|---|---|---|
| Background | `#050A10` | App background |
| Secondary bg | `#0B111A` | Sidebar, header |
| Cards | `#111923` | Card surfaces |
| Elevated cards | `#151F2B` | Elevated/hover cards |
| Primary Orange | `#FF6B00` | CTAs, active nav, highlights |
| Orange highlight | `#FF8A1F` | Hover, glow states |
| Text | `#FFFFFF` | Primary headings |
| Secondary text | `#9AA9BD` | Labels, timestamps |
| Borders | `#263342` | All borders/dividers |
| Success | `#67E45C` | Positive amounts, progress |
| Warning | `#FFC247` | Warnings |
| Danger | `#FF4D4D` | Errors, negative amounts |

Orange is used for: primary buttons, active navigation, important highlights, progress indicators, selected cards, CTAs. The interface is NOT entirely orange.

## Plans

### REQ-PLAN-1: Three Website Plans

**Individual** — single user:
- Personal wallet, subscription management, financial goals, subscription timeline, analytics, Scribe Score, reports, bank statement upload, notifications, basic insights

**Professional** — everything in Individual plus:
- Advanced analytics, detailed reports, advanced spending insights, detailed Scribe Score breakdown, financial trends, additional goals, advanced subscription insights, priority recommendations

**Family** — everything in Professional plus:
- Dependants, dependant dashboards, dependant wallets, dependant task tracking, dependant timelines, family-level overview, family reports, shared visibility, multiple profiles

### REQ-PLAN-2: Feature Restrictions
- Family-only features (Dependants) must NOT appear as fully functional for Individual/Professional users
- If a restricted feature is accessed, show a professional upgrade prompt — never break the page
- Backend must also validate plan permissions (not just frontend hiding)

### REQ-PLAN-3: Plan Selection Page (`pages/plans.html`)
- View current plan, compare all three, see feature differences
- Select/upgrade/downgrade/cancel
- Current plan marked "CURRENT PLAN"
- Selected plan gets orange border/glow
- Uses existing FlexScribe dark visual identity

### REQ-PLAN-4: Plan Change Flow
- Click new plan → confirmation modal
- Modal shows: current plan, new plan, feature changes, price, effective date
- User must confirm before change
- Backend updates → success animation → Settings updates → restrictions update immediately

### REQ-PLAN-5: Settings → Subscription & Plan
- Shows current plan, billing info, renewal date, benefits
- "Change Plan" button navigates to `pages/plans.html`

## Onboarding

### REQ-ONBOARD-1: New User Questionnaire
After registration, new users go through onboarding (NOT directly to dashboard):
1. Welcome screen
2. Current subscriptions selection (Netflix, Spotify, Disney+, YouTube Premium, etc. + "Add another")
3. Subscription details (name, price, cycle, renewal date, category, payment method)
4. Financial information (optional: income, goals, expenses, savings target, emergency fund)
5. Bank account setup guidance (change payment methods to FlexScribe, NOT close bank accounts)
6. Completion screen with summary + "Go to Dashboard"

### REQ-ONBOARD-2: Onboarding Completion
- Dashboard uses actual onboarding data (not hardcoded sample data)
- `onboardingCompleted = true` prevents showing questionnaire again
- Existing users: Login → Dashboard
- New users: Register → Plan Selection → Questionnaire → Dashboard

### REQ-ONBOARD-3: Dashboard Personalisation
- Subscriptions from onboarding populate: active subs, upcoming payments, monthly total, spending overview, timeline, Scribe Score inputs
- Data comes from backend, not hardcoded

## Navigation

### REQ-NAV-1: Website Navigation
Sidebar: Dashboard, Wallet, Subscriptions, Goals, Analytics, Timeline, Dependants, Notifications, Reports, Settings

Do NOT add FlexTap to website navigation, dashboard, onboarding, or settings. FlexTap is Android-only.

### REQ-NAV-2: Plan-Based Nav Visibility
- Dependants nav item: only visible/functional for Family plan users
- All other items: available to all plans
- Restricted items show upgrade prompt, never empty/broken pages

## Architecture

### REQ-ARCH-1: Modular Pages
Do NOT move all pages into MASTER.html. Keep separate pages/components. Shared sidebar/header through layout system, page-specific functionality separated.

### REQ-ARCH-2: No FlexTap on Website
Remove any FlexTap elements from website code. FlexTap is exclusively Android.

### REQ-ARCH-3: Preserve Existing Functionality
Dashboard and Subscriptions are already implemented — extend, don't rebuild.

## Authentication

### REQ-AUTH-1: User Journey
- New user: Register → Plan Selection → Questionnaire → Setup → Dashboard
- Returning user: Login → Dashboard
- If `onboardingCompleted = true`, skip questionnaire

## Animations

### REQ-ANIM-1: Subtle Professional Animations
- Cards fade upward when loaded
- Buttons lift on hover
- Orange glow on selected plan
- Plan cards scale when selected
- Modals fade+slide
- Progress bars animate
- Dashboard values animate from zero
- No excessive bouncing or distracting effects

## Responsiveness

### REQ-RESP-1: Desktop/Laptop/Tablet Support
Works on desktop, laptop, tablet, smaller screens. Android app handles mobile.

## Backend Data Model

### REQ-DATA-1: Required Entities
- User: userId, name, email, planId, onboardingCompleted, createdAt
- Plan: planId, name, price, billingCycle, features, active
- UserSubscription: subscriptionId, userId, provider, name, price, billingCycle, renewalDate, category, paymentMethod, status (ACTIVE/PAUSED/CANCELLED)
- FinancialProfile: userId, monthlyIncome, financialGoals, monthlyExpenses, emergencyFundTarget
- Onboarding: userId, completed, completedAt
