# FlexScribe Database Integration Guide

This document explains how the FlexScribe application connects to and uses the local SQL Server database. It is intended for all project members who need to understand, maintain, or extend the database integration.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Database Connection Setup](#database-connection-setup)
4. [Running the Application](#running-the-application)
5. [Project Structure](#project-structure)
6. [Data Flow (UI to Database)](#data-flow-ui-to-database)
7. [API Endpoints Reference](#api-endpoints-reference)
8. [Database Schema Overview](#database-schema-overview)
9. [Frontend-to-Backend Field Mapping](#frontend-to-backend-field-mapping)
10. [Authentication (JWT)](#authentication-jwt)
11. [Adding a New Feature (Step-by-Step)](#adding-a-new-feature-step-by-step)
12. [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)
13. [Testing](#testing)
14. [Important Rules](#important-rules)

---

## Architecture Overview

```
Browser (Frontend)
    |
    |  HTTP requests (fetch)
    v
Express.js Backend (Node.js, port 3000)
    |
    |  SQL queries via mssql package
    v
SQL Server (localhost:1433)
    |
    v
FlexScribeDB (database)
```

The application is a single-page app (SPA) served from `pages/MASTER.html`. The Express backend serves both the static frontend files and the REST API endpoints under `/api/`.

---

## Prerequisites

- **Node.js** (v18+) installed at `C:\Program Files\nodejs\`
- **SQL Server** (local instance MSSQLSERVER) running on port 1433
- **FlexScribeDB** database created (use `flexscribe-local-database.sql`)
- **SQL Server Authentication** enabled with login `FlexScribeApp`

---

## Database Connection Setup

### SQL Server Configuration

| Setting | Value |
|---------|-------|
| Server | localhost |
| Port | 1433 |
| Database | FlexScribeDB |
| Authentication | SQL Server Authentication |
| Login | FlexScribeApp |
| Password | FlexScribe123! |
| Encrypt | false |
| Trust Server Certificate | true |

### Environment File (`server/.env`)

```env
DB_SERVER=localhost
DB_NAME=FlexScribeDB
DB_USER=FlexScribeApp
DB_PASSWORD=FlexScribe123!
DB_TRUSTED=false
PORT=3000
JWT_SECRET=flexscribe_jwt_secret_change_in_production
```

**Never commit the `.env` file to source control.** It contains credentials.

### Connection Code (`server/db.js`)

```javascript
const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'FlexScribeDB',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};
```

The `db.js` module exports:
- `sql` — the mssql library
- `getPool()` — returns the connection pool (creates it on first call)
- `query(sqlString, params)` — executes a parameterized query

---

## Running the Application

### Start the server

```powershell
cd C:\Users\MoulanaShaheen\Desktop\FlexScribe\server
node server.js
```

Expected output:
```
✓ Connected to SQL Server: FlexScribeDB
🚀 FlexScribe API running on http://localhost:3000
```

### Open the app

Navigate to: `http://localhost:3000/pages/MASTER.html`

### Using VS Code Run & Debug

Select **"Run FlexScribe"** from the Run & Debug dropdown (Ctrl+Shift+D) and click Play. This starts the server and opens Edge automatically.

---

## Project Structure

```
FlexScribe/
├── server/                    # Backend (Node.js + Express)
│   ├── .env                   # Database credentials (DO NOT COMMIT)
│   ├── db.js                  # Database connection pool
│   ├── server.js              # Express app entry point
│   ├── middleware/
│   │   └── auth.js            # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js            # Registration, Login, Profile
│   │   ├── subscriptions.js   # Subscription CRUD
│   │   ├── wallet.js          # Wallet balance & transactions
│   │   ├── goals.js           # Financial goals + contributions
│   │   ├── dependants.js      # Dependants + tasks
│   │   ├── notifications.js   # User notifications
│   │   └── analytics.js       # Spending analytics
│   ├── db-remote-backup.js    # Backup of original remote DB config
│   └── package.json
├── scripts/                   # Frontend JavaScript
│   ├── api.js                 # Single API module (all fetch calls)
│   ├── layout.js              # Page navigation & header logic
│   ├── login.js               # Login/Register form handlers
│   ├── profile-panel.js       # Profile panel logic
│   ├── dashboard-ui.js        # Dashboard rendering
│   ├── subscriptions-ui.js    # Subscriptions page UI
│   ├── wallet-ui.js           # Wallet page UI
│   ├── goals-ui.js            # Goals page UI
│   ├── dependants-ui.js       # Dependants page UI
│   ├── analytics-ui.js        # Analytics page UI
│   └── notifications.page.js  # Notifications page
├── backend/                   # Client-side data stores (bridges UI ↔ API)
│   ├── subscriptions.js       # SubscriptionStore
│   ├── wallet.js              # WalletStore
│   ├── dependants.js          # DependantsStore
│   └── goals.js               # GoalsStore
├── pages/                     # HTML pages
│   ├── MASTER.html            # Main SPA shell
│   ├── login.html             # Login/Register page
│   └── ...
├── styles/                    # CSS files
└── flexscribe-local-database.sql  # Database creation script
```

---

## Data Flow (UI to Database)

### Writing data (e.g., adding a subscription):

```
1. User fills form in MASTER.html
2. UI script (subscriptions-ui.js) collects form values
3. Calls SubscriptionStore.add(fields) in backend/subscriptions.js
4. Store calls API.Subscriptions.add(data) in scripts/api.js
5. api.js makes fetch('POST', '/api/subscriptions', data) with JWT token
6. Express route (server/routes/subscriptions.js) validates input
7. Route calls query('INSERT INTO Subscription ...', params)
8. SQL Server inserts the row into FlexScribeDB
9. Route returns the new record as JSON
10. Store calls loadFromAPI() to refresh from DB
11. UI re-renders with fresh data
```

### Reading data (e.g., loading subscriptions):

```
1. User navigates to Subscriptions tab
2. subscriptions-ui.js calls SubscriptionStore.loadFromAPI()
3. Store calls API.Subscriptions.getAll()
4. api.js makes fetch('GET', '/api/subscriptions') with JWT token
5. Express route queries: SELECT * FROM Subscription WHERE subscriberID = @id
6. SQL Server returns the user's subscriptions
7. Route sends JSON array response
8. Store maps DB columns to UI-friendly field names
9. UI renders the subscription cards
```

---

## API Endpoints Reference

All endpoints (except register/login) require a JWT token in the `Authorization: Bearer <token>` header.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Create new account |
| POST | /api/auth/login | Login, returns JWT |
| GET | /api/auth/profile | Get current user's profile |
| PUT | /api/auth/profile | Update profile fields |

### Subscriptions

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/subscriptions | List user's subscriptions |
| GET | /api/subscriptions/stats | Get subscription statistics |
| POST | /api/subscriptions | Add new subscription |
| PUT | /api/subscriptions/:id | Update subscription |
| DELETE | /api/subscriptions/:id | Delete subscription |
| PATCH | /api/subscriptions/:id/toggle | Toggle active/paused |

### Wallet

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/wallet | Get wallet balance |
| GET | /api/wallet/transactions | Get transaction history |
| POST | /api/wallet/add-funds | Add funds to wallet |
| POST | /api/wallet/withdraw | Withdraw from wallet |
| POST | /api/wallet/transfer-to-goal | Transfer to a goal |

### Goals

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/goals | List user's goals |
| GET | /api/goals/:id | Get goal with contributions |
| POST | /api/goals | Create new goal |
| PUT | /api/goals/:id | Update goal |
| DELETE | /api/goals/:id | Delete goal |
| POST | /api/goals/:id/contribute | Add funds to goal |

### Dependants

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/dependants | List user's dependants |
| POST | /api/dependants | Add new dependant |
| PUT | /api/dependants/:id | Update dependant |
| DELETE | /api/dependants/:id | Remove dependant |
| POST | /api/dependants/:id/send-allowance | Send allowance |
| GET | /api/dependants/:id/tasks | Get dependant's tasks |
| POST | /api/dependants/:id/tasks | Add task |
| PUT | /api/dependants/:depId/tasks/:taskId | Update task |
| DELETE | /api/dependants/:depId/tasks/:taskId | Delete task |

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/notifications | Get all notifications |
| GET | /api/notifications/unread-count | Get unread count |
| PATCH | /api/notifications/:id/read | Mark one as read |
| PATCH | /api/notifications/mark-all-read | Mark all as read |

### Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/analytics/summary?range=30d | Spending summary |
| GET | /api/analytics/by-category | Spending by category |
| GET | /api/analytics/trend?range=6m | Monthly trend |
| GET | /api/analytics/insights | AI-generated insights |

---

## Database Schema Overview

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **Subscriber** | All users (main members + dependants) | subscriberID, firstName, lastName, email, passwordHash, userType, dateOfBirth |
| **MainMember** | Main member specialisation | mainMemberID (FK to Subscriber), planType |
| **Dependant** | Dependant specialisation | dependantID (FK to Subscriber), mainMemberID, age, relationship, allowance |
| **VirtualWallet** | One wallet per subscriber | walletID, subscriberID, balance, pendingIn, pendingOut |
| **WalletTransaction** | Wallet transaction history | transactionID, walletID, transactionType, transactionAmount, description |
| **Subscription** | User subscriptions | subscriptionID, subscriberID, categoryID, serviceName, billingAmount, billingCycle, subStatus |
| **SubscriptionCategory** | Subscription categories | categoryID, categoryName |
| **FinancialGoal** | Savings goals | goalID, subscriberID, goalName, targetAmount, currentProgress, goalStatus |
| **GoalContribution** | Goal deposits | contributionID, goalID, amount, source |
| **DependantTask** | Tasks assigned to dependants | dependantTaskID, dependantID, mainMemberID, taskName, reward, taskStatus |
| **Notification** | User notifications | notificationID, subscriberID, title, body, isRead, notificationType |
| **ScribeScore** | Financial health scores | scoreID, subscriberID, scoreValue |

### Relationships

```
Subscriber (1) ──── (1) MainMember
Subscriber (1) ──── (1) Dependant
Subscriber (1) ──── (1) VirtualWallet
Subscriber (1) ──── (N) Subscription
Subscriber (1) ──── (N) FinancialGoal
Subscriber (1) ──── (N) Notification
MainMember (1) ──── (N) Dependant
VirtualWallet (1) ── (N) WalletTransaction
FinancialGoal (1) ── (N) GoalContribution
Dependant (1) ────── (N) DependantTask
```

---

## Frontend-to-Backend Field Mapping

### Subscriptions

| Frontend (UI/Store) | Backend Route | Database Column |
|---------------------|---------------|-----------------|
| name | serviceName | serviceName |
| amount | billingAmount | billingAmount |
| category | categoryID (mapped) | categoryID |
| billingCycle | billingCycle | billingCycle |
| nextPaymentDate | billingDate | billingDate |
| active | subStatus ('active'/'paused') | subStatus |
| id | subscriptionID | subscriptionID |

### Goals

| Frontend (UI) | Backend Route | Database Column |
|---------------|---------------|-----------------|
| name | goalName | goalName |
| targetAmount | targetAmount | targetAmount |
| savedAmount | — (read only) | currentProgress |
| targetDate | deadline | deadline |
| category | category | category |
| status | goalStatus | goalStatus |
| id | goalID | goalID |

### Dependants

| Frontend (UI) | Backend Route | Database Column |
|---------------|---------------|-----------------|
| name | firstName + lastName | Subscriber.firstName, Subscriber.lastName |
| email | email | Subscriber.email |
| relationship | relationship | Dependant.relationship |
| allowance | allowance | Dependant.allowance |
| age | — (calculated from DOB) | Dependant.age |
| dateOfBirth | dateOfBirth | Subscriber.dateOfBirth |

---

## Authentication (JWT)

### How it works

1. User logs in with email + password
2. Backend verifies password against `passwordHash` (bcrypt)
3. Backend signs a JWT containing `{ subscriberID, email, userType }`
4. Frontend stores the token in `sessionStorage` (key: `flexscribe_token`)
5. Every API request includes header: `Authorization: Bearer <token>`
6. Backend middleware (`authenticateToken`) verifies the token and attaches `req.user`

### Token payload

```json
{
  "subscriberID": 7,
  "email": "user@example.com",
  "userType": "MainMember",
  "iat": 1687000000,
  "exp": 1687604800
}
```

Token expires after 7 days.

---

## Adding a New Feature (Step-by-Step)

Example: Adding a "Budget" feature.

### 1. Check if the database table exists

Look at `flexscribe-local-database.sql`. If the table doesn't exist, create it with proper constraints and foreign keys.

### 2. Create the backend route

Create `server/routes/budgets.js`:

```javascript
const express = require('express');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM Budget WHERE subscriberID = @id',
            { id: req.user.subscriberID }
        );
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
```

### 3. Register the route in server.js

```javascript
app.use('/api/budgets', require('./routes/budgets'));
```

### 4. Add the API method in scripts/api.js

Inside the API module, add:

```javascript
const Budgets = {
    async getAll() {
        return _fetch('GET', '/budgets');
    },
    async add(data) {
        return _fetch('POST', '/budgets', data);
    }
};
```

And include `Budgets` in the returned `Object.freeze({...})`.

### 5. Call it from the UI

```javascript
const result = await API.Budgets.getAll();
if (result.success) {
    // result.data is the array from the database
    renderBudgets(result.data);
}
```

---

## Common Issues and Troubleshooting

### "Login failed for user ''"
The `.env` file isn't being loaded. Make sure you run the server from the `server/` directory, or that `server.js` uses `require('dotenv').config({ path: require('path').join(__dirname, '.env') })`.

### "EADDRINUSE: address already in use :::3000"
Another server is already running on port 3000. Kill it:
```powershell
Stop-Process -Name "node" -Force
```

### "Failed to fetch" in the browser
- Is the server running?
- Are you accessing pages via `http://localhost:3000/` (not `file://`)?
- Check the browser console (F12) for the actual error.

### 401 Unauthorized
- The JWT token is missing or expired.
- Make sure you're logged in (token in sessionStorage).
- Log out and log back in to get a fresh token.

### 500 Internal Server Error
- Check the server terminal for the error message.
- Common cause: SQL query referencing a column that doesn't exist.
- Use `SELECT *` when unsure about column names.

### Data not persisting after refresh
- The frontend must call the API (not just update local state).
- Check that the store's `loadFromAPI()` is being called on page load.
- Verify the backend route actually executes an INSERT/UPDATE query.

---

## Testing

### Integration test script

Run from the `server/` directory:
```powershell
node test-integration.js
```

This tests: Register, Profile, Wallet, Subscriptions, Goals, Notifications, and Analytics.

### Manual testing checklist

1. Register a new account → verify in SSMS: `SELECT * FROM Subscriber`
2. Log in → verify JWT is stored in sessionStorage
3. Add a subscription → refresh page → verify it persists
4. Add wallet funds → refresh → balance persists
5. Create a goal → contribute → refresh → progress persists
6. Add a dependant → add a task → refresh → both persist
7. Edit profile → refresh → changes persist

### Checking data in SSMS

Connect to `localhost` with `FlexScribeApp` / `FlexScribe123!`, then right-click any table → **Select Top 1000 Rows**.

---

## Important Rules

1. **Database is the source of truth** — never rely on localStorage/sessionStorage for persistent data.
2. **Always use parameterized queries** — never concatenate user input into SQL strings.
3. **All protected routes use `authenticateToken` middleware** — ensures `req.user.subscriberID` is available.
4. **User isolation** — every query must filter by `subscriberID` so users only see their own data.
5. **Do not expose passwords** — delete `passwordHash` from any response sent to the frontend.
6. **Do not commit `.env`** — it contains database credentials.
7. **Restart the server after backend changes** — frontend changes only need a browser refresh.
8. **The remote database backup is preserved** in `server/db-remote-backup.js` — do not delete it.

---

## Category ID Reference

| ID | Category |
|----|----------|
| 1 | Entertainment |
| 2 | Music |
| 3 | Shopping |
| 4 | Productivity |
| 5 | Education |
| 6 | Utilities |
| 7 | Fitness |
| 8 | News |
| 9 | Gaming |
| 10 | Health |
| 11 | AI |
| 12 | Other |

---

## Contact

If you have questions about the database integration, check the existing route files in `server/routes/` for examples of how queries are structured, or run the test script to verify connectivity.
