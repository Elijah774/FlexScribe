# FlexScribe — System Environment & Setup (`systemEnv`)

Reference for the local development environment: runtime stack, database,
environment variables, startup assignments, and the login/credentials used
for local development.

> ⚠️ **Local development only.** The values below are the project's local dev
> credentials (as already defined in `server/.env` and `LOCAL-DATABASE-SETUP.md`).
> They are **not** production secrets. Rotate `JWT_SECRET` and the SQL password,
> and move them to a secrets manager, before any real deployment.

---

## 1. Technology stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (SPA shell `pages/MASTER.html`) |
| Backend | Node.js + Express (`server/`) |
| Database | Microsoft SQL Server (`FlexScribeDB`) |
| Auth | JWT (`jsonwebtoken`), passwords hashed with `bcryptjs` (10 salt rounds) |
| DB driver | `mssql` (SQL Server Authentication) |
| Secondary (unused by web app) | `flexscribe-backend/` is a separate Java/Spring project; **not** the live backend |

---

## 2. System environment variables (`server/.env`)

The server loads `server/.env` at startup (`require('dotenv').config()`).

| Variable | Value (local dev) | Purpose |
|---|---|---|
| `DB_SERVER` | `localhost` | SQL Server host |
| `DB_NAME` | `FlexScribeDB` | Database name |
| `DB_USER` | `FlexScribeApp` | SQL login used by the Node app |
| `DB_PASSWORD` | `FlexScribe123!` | SQL login password |
| `DB_TRUSTED` | `false` | Use SQL auth (not Windows auth) for the app connection |
| `PORT` | `3000` | HTTP port the Express server listens on |
| `JWT_SECRET` | `flexscribe_jwt_secret_change_in_production` | Secret for signing JWTs |

Fallback defaults in code (used only if `.env` is missing a value):
- `DB_SERVER` → `localhost`, `DB_NAME` → `FlexScribeDB`, `PORT` → `3000`
- `JWT_SECRET` → `flexscribe_jwt_secret` (middleware fallback)

---

## 3. Database connection (`server/db.js`)

```
server:   process.env.DB_SERVER || 'localhost'
database: process.env.DB_NAME   || 'FlexScribeDB'
user:     process.env.DB_USER            (FlexScribeApp)
password: process.env.DB_PASSWORD        (FlexScribe123!)
port:     1433
options:  { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 }
```

**SQL Server configuration**

| Setting | Value |
|---|---|
| Instance | `MSSQLSERVER` (default) |
| Authentication | Mixed Mode (Windows + SQL) |
| TCP/IP | Enabled on port **1433** |
| App SQL login | `FlexScribeApp` |
| App SQL password | `FlexScribe123!` |
| App login role | `db_owner` on `FlexScribeDB` |

Create the SQL login (run once in SSMS with Windows auth):

```sql
CREATE LOGIN FlexScribeApp WITH PASSWORD = 'FlexScribe123!';
GO
USE FlexScribeDB;
GO
CREATE USER FlexScribeApp FOR LOGIN FlexScribeApp;
GO
ALTER ROLE db_owner ADD MEMBER FlexScribeApp;
GO
```

---

## 4. Startup assignments & how to run

### Schema + migrations (first-time / after schema changes)
Run with Windows auth via `sqlcmd` (or SSMS):

```powershell
# Base schema
sqlcmd -S localhost -E -d FlexScribeDB -i "flexscribe-local-database.sql"

# Migrations (apply in order)
sqlcmd -S localhost -E -d FlexScribeDB -i "migrations\002-extend-notifications.sql"
sqlcmd -S localhost -E -d FlexScribeDB -i "migrations\004-merchant-wallet.sql"
sqlcmd -S localhost -E -d FlexScribeDB -i "migrations\005-unique-subscription-per-user.sql"
sqlcmd -S localhost -E -d FlexScribeDB -i "migrations\007-scribe-score-events.sql"
sqlcmd -S localhost -E -d FlexScribeDB -i "migrations\008-scribe-score-categories.sql"
sqlcmd -S localhost -E -d FlexScribeDB -i "migrations\009-scribescore-default-500.sql"
```
> Migrations are idempotent (`IF NOT EXISTS …`) and safe to re-run. There is
> no automatic migration runner — apply them manually.

### Install dependencies (once)
```powershell
cd server
npm install
```

### Start the server
```powershell
# From the server/ directory
cd server
npm start          # -> node server.js
# or during development
npm run dev        # -> nodemon server.js
```
`npm` scripts (`server/package.json`): `start` → `node server.js`, `dev` → `nodemon server.js`.

On success the console prints: `✓ Connected to SQL Server: FlexScribeDB` and the server listens on `http://localhost:3000`.

### Open the app
- App shell: `http://localhost:3000/pages/MASTER.html`
- Landing: `http://localhost:3000/landing.html`
- Login/Register: `http://localhost:3000/pages/login.html`
- Health check: `http://localhost:3000/api/health` → `{"status":"ok","database":"connected"}`

### VS Code launch (`.vscode/launch.json`)
| Config | What it does |
|---|---|
| **FlexScribe Server** | Launches `server/server.js` (cwd `server/`) |
| **FlexScribe Backend** | Launches `server/server.js` with `server/.env`, auto-opens `landing.html` when the "running on http://localhost:PORT" line appears |
| **Open MASTER.html** | Opens the SPA shell in Edge |
| **Run FlexScribe** (compound) | Runs the FlexScribe Backend config |

### Restart pattern (Windows / PowerShell)
```powershell
# Stop whatever holds port 3000, then start fresh
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object -Expand OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
cd server; node server.js
```
> Backend code changes require a server restart. Frontend changes only need a
> browser hard-refresh (Ctrl+F5).

---

## 5. Authentication & login

- **Register:** `POST /api/auth/register` — creates the Subscriber (+ MainMember,
  VirtualWallet, ScribeScore seeded to **500**), returns a JWT.
- **Login:** `POST /api/auth/login` — validates email + password, returns a JWT.
- **Token:** signed with `JWT_SECRET`, payload `{ subscriberID, email, userType }`,
  **expires in 7 days**. Stored client-side in `sessionStorage['flexscribe_token']`
  and sent as `Authorization: Bearer <token>` on every API call.
- **Passwords:** hashed with bcrypt (10 salt rounds); never stored in plain text.
- **Isolation:** every query filters by `subscriberID` from the JWT.

### Application accounts (local)
There are **no pre-seeded demo application users** — the schema seeds only
reference/lookup data (subscription categories). Create accounts via the
Register screen. Known local test account used during development:

| Field | Value |
|---|---|
| Email | `mntiviso@gmail.com` |
| Subscriber ID | `1` |
| Password | set at registration (not stored in the repo) |

> If you need a throwaway account, register a new one; the first registered
> user becomes `subscriberID = 1`.

### Database login (SQL Server)
| Field | Value |
|---|---|
| Login | `FlexScribeApp` |
| Password | `FlexScribe123!` |
| Database | `FlexScribeDB` |
| Access | `db_owner` |

> SSMS can also connect with **Windows Authentication** (used for running
> migrations via `sqlcmd -S localhost -E`).

---

## 6. API surface (base `/api`)

| Area | Mount |
|---|---|
| Auth | `/api/auth` (register, login, profile) |
| Subscriptions | `/api/subscriptions` |
| Wallet | `/api/wallet` |
| Goals | `/api/goals` |
| Dependants | `/api/dependants` |
| Notifications | `/api/notifications` |
| Analytics | `/api/analytics` |
| Reports | `/api/reports` |
| Bank statements | `/api/bank-statements` |
| Scribe Score | `/api/score` |
| Health | `/api/health` |

---

## 7. Common issues

| Error | Cause | Fix |
|---|---|---|
| `Login failed for user ''` | `.env` not loaded | Run from the `server/` directory; confirm `server/.env` exists |
| `Login failed for user 'FlexScribeApp'` | SQL login missing / wrong password | Recreate the login (section 3) |
| `Cannot connect to localhost:1433` | TCP/IP disabled or SQL Server stopped | Enable TCP/IP, start the `MSSQLSERVER` service |
| `EADDRINUSE: port 3000` | A server is already running | Stop the process on port 3000 (section 4), then restart |
