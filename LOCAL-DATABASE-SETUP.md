# FlexScribe — Local Database Setup Guide

This guide explains how to set up the FlexScribe local SQL Server database from scratch so the application works with real data persistence.

---

## Database Credentials

| Setting | Value |
|---------|-------|
| **Server** | localhost |
| **Port** | 1433 |
| **Database** | FlexScribeDB |
| **Instance** | MSSQLSERVER (default) |
| **Authentication** | SQL Server Authentication AND Windows Authentication (Mixed Mode) |
| **SQL Login** | FlexScribeApp |
| **SQL Password** | FlexScribe123! |

The SQL Server instance uses **Mixed Mode Authentication** — this means both Windows Authentication (for SSMS access) and SQL Server Authentication (for the Node.js backend) are enabled.

- **Windows Authentication** — used when connecting via SSMS for administration/viewing data
- **SQL Server Authentication** — used by the Node.js backend to connect programmatically

---

## Prerequisites

Before starting, ensure you have:

1. **SQL Server** (Developer Edition is free)
   - Download: https://www.microsoft.com/en-us/sql-server/sql-server-downloads
   - During install, select **Mixed Mode Authentication** and set an `sa` password

2. **SQL Server Management Studio (SSMS)**
   - Download: https://learn.microsoft.com/en-us/ssms/download-sql-server-management-studio-ssms

3. **Node.js** (v18 or higher)
   - Download: https://nodejs.org/
   - After install, verify: open terminal and type `node --version`

---

## Step 1: Enable Mixed Mode Authentication

If SQL Server was installed with Windows Authentication only, you need to enable Mixed Mode:

1. Open **SSMS** → Connect with Windows Authentication
2. Right-click the server name → **Properties**
3. Go to **Security** page
4. Under "Server authentication", select **SQL Server and Windows Authentication mode**
5. Click OK
6. **Restart the SQL Server service** (right-click server → Restart)

---

## Step 2: Create the SQL Login

In SSMS, open a **New Query** window and run:

```sql
-- Create the login
CREATE LOGIN FlexScribeApp WITH PASSWORD = 'FlexScribe123!';
GO

-- After the database is created (Step 3), run this:
USE FlexScribeDB;
GO
CREATE USER FlexScribeApp FOR LOGIN FlexScribeApp;
GO
ALTER ROLE db_owner ADD MEMBER FlexScribeApp;
GO
```

This gives the `FlexScribeApp` login full access to FlexScribeDB.

---

## Step 3: Create the Database

1. In SSMS, open the file: `flexscribe-local-database.sql` (in the project root)
2. Press **F5** to execute
3. Verify: expand **Databases → FlexScribeDB → Tables** — you should see all tables

The script creates:
- FlexScribeDB database
- 17 tables (Subscriber, MainMember, Dependant, VirtualWallet, Subscription, FinancialGoal, etc.)
- All constraints, foreign keys, and seed data (subscription categories)
- IF NOT EXISTS guards so it can be re-run safely

---

## Step 4: Enable TCP/IP (Port 1433)

The Node.js backend connects via TCP. Ensure this is enabled:

1. Open **SQL Server Configuration Manager**
2. Expand **SQL Server Network Configuration** → **Protocols for MSSQLSERVER**
3. Right-click **TCP/IP** → **Enable**
4. Double-click TCP/IP → **IP Addresses** tab → scroll to **IPAll**
5. Set **TCP Port** to `1433`
6. Click OK
7. **Restart SQL Server service**

To verify: open PowerShell and run:
```powershell
Test-NetConnection -ComputerName localhost -Port 1433
```
It should show `TcpTestSucceeded: True`.

---

## Step 5: Configure the Backend

The backend configuration lives in `server/.env`:

```env
DB_SERVER=localhost
DB_NAME=FlexScribeDB
DB_USER=FlexScribeApp
DB_PASSWORD=FlexScribe123!
DB_TRUSTED=false
PORT=3000
JWT_SECRET=flexscribe_jwt_secret_change_in_production
```

**Important:** Do NOT commit this file to source control.

### How the connection works (`server/db.js`):

```javascript
const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'FlexScribeDB',
    user: process.env.DB_USER,          // FlexScribeApp
    password: process.env.DB_PASSWORD,  // FlexScribe123!
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};
```

This uses the `mssql` npm package with SQL Server Authentication (username/password) — NOT Windows Authentication for the app connection.

---

## Step 6: Install Dependencies

```powershell
cd C:\Users\MoulanaShaheen\Desktop\FlexScribe\server
npm install
```

Key dependencies:
- `mssql` — SQL Server connection
- `express` — HTTP server
- `bcryptjs` — password hashing
- `jsonwebtoken` — JWT authentication
- `dotenv` — environment variables
- `cors` — cross-origin requests

---

## Step 7: Start the Server

```powershell
cd C:\Users\MoulanaShaheen\Desktop\FlexScribe\server
node server.js
```

Expected output:
```
✓ Connected to SQL Server: FlexScribeDB
🚀 FlexScribe API running on http://localhost:3000
📁 Frontend: http://localhost:3000/landing.html
📁 App:      http://localhost:3000/pages/MASTER.html
```

If you get `Login failed for user ''`, the `.env` file is not being loaded. Make sure you run from the `server/` directory.

---

## Step 8: Open the Application

Navigate to: **http://localhost:3000/pages/MASTER.html**

Or start from the landing page: **http://localhost:3000/landing.html**

---

## VS Code Run & Debug

Instead of using the terminal manually, you can use the Run & Debug panel:

1. Press **Ctrl+Shift+D**
2. Select **"Run FlexScribe"** from the dropdown
3. Click the green play button

This starts the server and opens the app in Edge automatically.

---

## How to Verify the Database is Working

### Registration test:
1. Go to `http://localhost:3000/pages/login.html`
2. Click "Create Account" and register
3. In SSMS: `SELECT * FROM Subscriber` → your user should appear
4. Also check: `SELECT * FROM MainMember` and `SELECT * FROM VirtualWallet`

### Subscription test:
1. Log in → go to Subscriptions → add one
2. In SSMS: `SELECT * FROM Subscription` → it should appear
3. Refresh the browser page → it should still be there

### Goal test:
1. Go to Goals → create a goal
2. In SSMS: `SELECT * FROM FinancialGoal` → verify
3. Contribute funds → `SELECT * FROM GoalContribution`

### Quick SSMS check (no query needed):
Right-click any table → **Select Top 1000 Rows**

---

## Architecture

```
Browser (http://localhost:3000)
    │
    │  JavaScript fetch() calls with JWT token
    ▼
Express.js Backend (server/server.js, port 3000)
    │
    │  Parameterized SQL queries via mssql package
    ▼
SQL Server (localhost:1433)
    │
    ▼
FlexScribeDB
    ├── Subscriber (users)
    ├── MainMember (main member specialisation)
    ├── Dependant (dependant specialisation)
    ├── VirtualWallet (one per user)
    ├── WalletTransaction (transaction history)
    ├── Subscription (user subscriptions)
    ├── SubscriptionCategory (Netflix=Entertainment, etc.)
    ├── FinancialGoal (savings goals)
    ├── GoalContribution (deposits into goals)
    ├── DependantTask (tasks assigned to dependants)
    ├── Notification (user notifications)
    ├── ScribeScore (financial health scores)
    ├── PaymentSchedule (upcoming payments)
    └── SpendingReport (generated reports)
```

---

## API Endpoints

All protected endpoints require header: `Authorization: Bearer <jwt_token>`

| Area | Method | Endpoint | Description |
|------|--------|----------|-------------|
| Auth | POST | /api/auth/register | Create account |
| Auth | POST | /api/auth/login | Login (returns JWT) |
| Auth | GET | /api/auth/profile | Get profile |
| Auth | PUT | /api/auth/profile | Update profile |
| Subscriptions | GET | /api/subscriptions | List all |
| Subscriptions | POST | /api/subscriptions | Add new |
| Subscriptions | PUT | /api/subscriptions/:id | Edit |
| Subscriptions | DELETE | /api/subscriptions/:id | Delete |
| Wallet | GET | /api/wallet | Get balance |
| Wallet | GET | /api/wallet/transactions | Transaction history |
| Wallet | POST | /api/wallet/add-funds | Deposit |
| Wallet | POST | /api/wallet/withdraw | Withdraw |
| Goals | GET | /api/goals | List goals |
| Goals | POST | /api/goals | Create goal |
| Goals | PUT | /api/goals/:id | Edit goal |
| Goals | DELETE | /api/goals/:id | Delete goal |
| Goals | POST | /api/goals/:id/contribute | Fund a goal |
| Dependants | GET | /api/dependants | List dependants |
| Dependants | POST | /api/dependants | Add dependant |
| Dependants | PUT | /api/dependants/:id | Edit dependant |
| Dependants | DELETE | /api/dependants/:id | Remove dependant |
| Tasks | GET | /api/dependants/:id/tasks | Get tasks |
| Tasks | POST | /api/dependants/:id/tasks | Add task |
| Tasks | PUT | /api/dependants/:depId/tasks/:taskId | Edit task |
| Tasks | DELETE | /api/dependants/:depId/tasks/:taskId | Delete task |
| Notifications | GET | /api/notifications | Get all |
| Notifications | PATCH | /api/notifications/:id/read | Mark read |
| Analytics | GET | /api/analytics/summary | Spending summary |
| Analytics | GET | /api/analytics/by-category | By category |
| Analytics | GET | /api/analytics/trend | Monthly trend |

---

## Important Notes

1. **Database is the source of truth** — the UI retrieves all persistent data from FlexScribeDB, not localStorage

2. **JWT authentication** — after login, a token is stored in `sessionStorage`. It expires after 7 days. All API calls include this token.

3. **User data isolation** — every query filters by `subscriberID` from the JWT, so users only see their own data

4. **Passwords are hashed** — using bcrypt with 10 salt rounds. Never stored in plain text.

5. **Server restart required** for backend code changes — frontend changes only need a browser refresh

6. **The `.env` file contains credentials** — do NOT commit it to Git

7. **Remote database backup** — the original remote/Windows Auth configuration is preserved in `server/db-remote-backup.js`

---

## For Another Team Member

To get this working on a different machine:

1. Install SQL Server (Developer Edition, Mixed Mode Auth)
2. Install SSMS
3. Install Node.js (v18+)
4. Clone the project
5. In SSMS (Windows Auth):
   - Create login `FlexScribeApp` with password `FlexScribe123!`
   - Execute `flexscribe-local-database.sql`
   - Grant the login access (see Step 2 above)
6. Enable TCP/IP on port 1433 (see Step 4 above)
7. Create `server/.env` with the credentials shown in Step 5
8. Run `cd server && npm install && node server.js`
9. Open `http://localhost:3000`

No machine-specific paths or configuration needed — `localhost` works everywhere.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Login failed for user ''` | .env not loaded | Run from `server/` directory, or check the file exists |
| `Login failed for user 'FlexScribeApp'` | Login doesn't exist or wrong password | Create the login in SSMS (Step 2) |
| `Cannot connect to localhost:1433` | TCP/IP disabled or SQL Server not running | Enable TCP/IP, restart SQL Server (Step 4) |
| `EADDRINUSE: port 3000` | Another server already running | Run `Stop-Process -Name "node" -Force` then try again |
| `Invalid object name 'Subscriber'` | Database not created | Run `flexscribe-local-database.sql` in SSMS |
| `CHECK constraint violated` | Invalid value sent to a column | Check the constraint in the SQL script for allowed values |
| `Failed to fetch` in browser | Server not running or wrong port | Start the server, ensure it shows "running on port 3000" |
| 401 Unauthorized | Not logged in or token expired | Log out and log back in |

---

## Database Schema Reference

See `flexscribe-local-database.sql` for the full schema. Key constraints:

- `Subscription.subStatus`: must be `'active'`, `'paused'`, or `'cancelled'`
- `Subscription.billingCycle`: must be `'weekly'`, `'monthly'`, `'quarterly'`, or `'yearly'`
- `FinancialGoal.goalStatus`: must be `'active'`, `'completed'`, or `'paused'`
- `DependantTask.taskStatus`: must be `'pending'`, `'in_progress'`, `'completed'`, `'overdue'`, or `'cancelled'`
- `Dependant.status`: must be `'active'`, `'invited'`, or `'suspended'`
- `Subscriber.userType`: must be `'MainMember'`, `'Dependant'`, `'Admin'`, `'individual'`, or `'dependant'`

---

## Files Overview

| File | Purpose |
|------|---------|
| `server/.env` | Database credentials (DO NOT COMMIT) |
| `server/db.js` | Connection pool (mssql package) |
| `server/server.js` | Express app entry point |
| `server/middleware/auth.js` | JWT verification |
| `server/routes/auth.js` | Register, Login, Profile |
| `server/routes/subscriptions.js` | Subscription CRUD |
| `server/routes/wallet.js` | Wallet operations |
| `server/routes/goals.js` | Goals + contributions |
| `server/routes/dependants.js` | Dependants + tasks |
| `server/routes/notifications.js` | Notifications |
| `server/routes/analytics.js` | Analytics (calculated from real data) |
| `server/db-remote-backup.js` | Backup of original remote DB config |
| `flexscribe-local-database.sql` | Database creation script |
| `scripts/api.js` | Frontend API module (all fetch calls) |
| `DATABASE-INTEGRATION.md` | Detailed integration reference |
