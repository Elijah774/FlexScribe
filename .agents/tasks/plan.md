# FlexScribe — Frontend ↔ Backend Wiring Implementation Plan

All routes on the server are mounted under `/api/`. The frontend `scripts/api.js` currently
sends every request to `http://localhost:3000` without the `/api` prefix, so every call hits
the static file server instead of Express. Fixing `BASE_URL` is the root cause that unblocks
everything else.

---

## Item 1 — Fix BASE_URL and error-extraction order in `scripts/api.js`

**What to do:**
Change `BASE_URL` from `'http://localhost:3000'` to `'http://localhost:3000/api'` so every
`_fetch(...)` call targets the correct Express route prefix. At the same time, flip the error
field priority in `_fetch`: the server always returns `json.error` (never `json.message`) on
error responses, so the fallback chain must be `json.error || json.message`.

**Files:** `scripts/api.js`

**Exact changes:**

```diff
- const BASE_URL = 'http://localhost:3000';
+ const BASE_URL = 'http://localhost:3000/api';
```

```diff
- return _err(
-     json.message ||
-     json.error ||
-     `HTTP ${response.status}`,
-     response.status
- );
+ return _err(
+     json.error ||
+     json.message ||
+     `HTTP ${response.status}`,
+     response.status
+ );
```

**Verify:**
Open the browser dev-tools Network tab and attempt a login. The request URL must now be
`http://localhost:3000/api/auth/login` (not `/auth/login`). A 200 or 401 response — not a
404 or an HTML page — confirms the prefix is correct.

---

## Item 2 — Fix admin detection and user storage in `scripts/login.js`

**What to do:**
The login success handler checks `result.data?.isAdmin` but the server login response is:
```json
{ "message": "...", "token": "...", "user": { "subscriberID", "firstName", "lastName",
  "email", "userType", "preferredName", "avatarUrl" } }
```
There is no `isAdmin` flag. The admin redirect must check `result.data?.user?.userType === 'Admin'`.
Additionally, store the returned user object in `sessionStorage` so later pages can read it
without a separate `/api/auth/profile` round-trip.

**Files:** `scripts/login.js`

**Exact change — inside the `if (result.success)` block of the login handler:**

```diff
- if (result.success) { setBtnSuccess(loginSubmit); setTimeout(() => { window.location.href = result.data?.isAdmin ? 'admin.html' : 'loading.html'; }, 1200); }
+ if (result.success) {
+     setBtnSuccess(loginSubmit);
+     // Persist user object for downstream pages
+     if (result.data?.user) {
+         sessionStorage.setItem('flexscribe_user', JSON.stringify(result.data.user));
+     }
+     setTimeout(() => {
+         const isAdmin = result.data?.user?.userType === 'Admin';
+         window.location.href = isAdmin ? 'admin.html' : 'loading.html';
+     }, 1200);
+ }
```

**Verify:**
Log in with a non-admin account. After redirect to `loading.html`, open DevTools → Application
→ Session Storage and confirm `flexscribe_user` is present with a `userType` field.
Log in as admin; confirm redirect goes to `admin.html`.

---

## Item 3 — Add `getUser` normalizer in `scripts/api.js` (`Auth.getUser`)

**What to do:**
`GET /api/auth/profile` returns a raw `Subscriber` row:
```json
{ "subscriberID": 1, "firstName": "Elijah", "lastName": "Makoetja", "preferredName": null, ... }
```
Downstream code (dashboard, profile pages) expects `result.data.id` and `result.data.name`.
Add a post-fetch normalizer inside `Auth.getUser` that synthesises both fields from the raw row.

**Files:** `scripts/api.js`

**Exact change — replace the `Auth.getUser` live path:**

```diff
  async getUser() {
      if (USE_MOCK) { ... }  // unchanged

-     return _fetch('GET', '/auth/profile');
+     const result = await _fetch('GET', '/auth/profile');
+     if (result.success && result.data) {
+         result.data.id   = result.data.subscriberID;
+         result.data.name = (
+             result.data.preferredName ||
+             ((result.data.firstName || '') + ' ' + (result.data.lastName || '')).trim()
+         );
+     }
+     return result;
  },
```

**Verify:**
After login, any page that calls `API.Auth.getUser()` and reads `result.data.name` should
display the user's name without error. Confirm in the browser console:
```js
API.Auth.getUser().then(r => console.log(r.data.name, r.data.id));
```

---

## Item 4 — Add `scribeScore` to register response in `server/routes/auth.js`

**What to do:**
The register success screen reads `result.data.scribeScore` to display the initial score (500).
The server currently omits `scribeScore` from the `201` response. Add it hardcoded — all new
accounts start at 500 (the DB `INSERT` already writes 500 to both `Subscriber.scribeScore`
and the `ScribeScore` table).

**Files:** `server/routes/auth.js`

**Exact change — in the `POST /register` success `res.status(201).json(...)` call:**

```diff
  res.status(201).json({
      message: 'Account created successfully',
      token,
+     scribeScore: 500,
      user: { subscriberID, firstName, lastName, email, userType: 'MainMember' }
  });
```

**Verify:**
Register a new account in the browser. Check DevTools → Network → the `POST /api/auth/register`
response body — it must contain `"scribeScore": 500`. The success screen `success-points` element
should become visible.

---

## Item 5 — Rewrite `backend/goals.js` to load from API instead of localStorage

**What to do:**
`GoalsStore` currently seeds from `localStorage` SEED data and never touches the server.
`goals-ui.js` already calls `API.Goals.*` directly, but the dashboard (`dashboard-ui.js`) calls
`GoalsStore.getAll()` to render in-progress goals. The store must be rewritten to:

1. Replace `_load()` / `_save()` / `localStorage` with an async `loadFromAPI()` pattern
   matching `WalletStore` and `DependantsStore`.
2. Map the server's raw `FinancialGoal` row fields to the internal shape the rest of the UI
   already expects:

   | Server field       | Internal field    | Notes                                     |
   |--------------------|-------------------|-------------------------------------------|
   | `goalID`           | `id`              | String-coerced                            |
   | `goalName`         | `name`            |                                           |
   | `targetAmount`     | `targetAmount`    | `parseFloat`                              |
   | `currentProgress`  | `savedAmount`     | `parseFloat`, default 0                   |
   | `deadline`         | `targetDate`      | Strip `T` suffix if ISO datetime          |
   | `goalStatus`       | `status`          | `'active'` → `'in_progress'`, pass others |
   | `imageUrl`         | `imageUrl`        |                                           |
   | `createdAt`        | `createdAt`       | Strip `T` suffix if ISO datetime          |

3. Keep all existing public API methods (`getAll`, `getById`, `getStats`, `add`, `edit`,
   `remove`, `contribute`, `getForecast`, `onChange`, `offChange`, `fmtCurrency`, `fmtDate`,
   `CATEGORIES`). Mutations should call `API.Goals.*` and then call `loadFromAPI()` to refresh,
   exactly as `SubscriptionStore` does.

4. `add(fields)` must send `{ goalName, targetAmount, deadline, imageUrl }` to `API.Goals.add`.
5. `edit(id, updates)` must send `{ goalName, targetAmount, deadline, imageUrl, goalStatus }`
   to `API.Goals.edit`.
6. `contribute(id, amount, note)` must send `{ amount, source: note || 'manual' }` to
   `API.Goals.contribute`.
7. Remove all SEED data and the `localStorage.getItem / setItem` calls.
8. The module must **not** auto-call `loadFromAPI()` at startup — it is called by the page
   when it becomes active (same pattern as WalletStore and DependantsStore).
9. Keep `_notify()` calling `_listeners` with `getAll()` output (the dashboard listener
   receives this array).

**Files:** `backend/goals.js`

**Key structural skeleton (implement this pattern):**

```js
async function loadFromAPI() {
    if (typeof API === 'undefined') throw new Error('API not available');
    const result = await API.Goals.getAll();
    if (!result.success) throw new Error(result.error || 'Failed to load goals');
    const raw = Array.isArray(result.data) ? result.data : [];
    _data.goals = raw.map(function(g) {
        return {
            id: String(g.goalID || g.id),
            name: g.goalName || g.name || '',
            targetAmount: parseFloat(g.targetAmount) || 0,
            savedAmount: parseFloat(g.currentProgress) || 0,
            targetDate: g.deadline ? g.deadline.split('T')[0] : '',
            category: g.category || 'Other',
            imageUrl: g.imageUrl || '',
            status: g.goalStatus === 'active' ? 'in_progress' : (g.goalStatus || 'in_progress'),
            createdAt: g.createdAt ? g.createdAt.split('T')[0] : '',
            contributions: g.contributions || []
        };
    });
    _listeners.forEach(fn => fn(getAll()));
    return _data.goals;
}

async function add({ goalName, targetAmount, targetDate, imageUrl, category }) {
    if (!goalName || !goalName.trim()) throw new Error('Goal name is required.');
    if (!targetAmount || parseFloat(targetAmount) <= 0) throw new Error('Target amount must be greater than zero.');
    if (typeof API === 'undefined') throw new Error('API not available.');
    const result = await API.Goals.add({ goalName, targetAmount, deadline: targetDate, imageUrl });
    if (!result.success) throw new Error(result.error || 'Failed to add goal.');
    await loadFromAPI();
    return result.data;
}

async function edit(id, updates) {
    if (typeof API === 'undefined') throw new Error('API not available.');
    const payload = {};
    if (updates.name !== undefined)         payload.goalName     = updates.name;
    if (updates.goalName !== undefined)     payload.goalName     = updates.goalName;
    if (updates.targetAmount !== undefined) payload.targetAmount = updates.targetAmount;
    if (updates.targetDate !== undefined)   payload.deadline     = updates.targetDate;
    if (updates.deadline !== undefined)     payload.deadline     = updates.deadline;
    if (updates.imageUrl !== undefined)     payload.imageUrl     = updates.imageUrl;
    if (updates.goalStatus !== undefined)   payload.goalStatus   = updates.goalStatus;
    const result = await API.Goals.edit(id, payload);
    if (!result.success) throw new Error(result.error || 'Failed to edit goal.');
    await loadFromAPI();
    return getById(id);
}

async function remove(id) {
    if (typeof API === 'undefined') throw new Error('API not available.');
    const result = await API.Goals.remove(id);
    if (!result.success) throw new Error(result.error || 'Failed to delete goal.');
    await loadFromAPI();
}

async function contribute(id, amount, note) {
    amount = parseFloat(amount);
    if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');
    if (typeof API === 'undefined') throw new Error('API not available.');
    const result = await API.Goals.contribute(id, amount, { source: note || 'manual' });
    // API.Goals.contribute already sends { amount } — extend to pass source:
    // NOTE: goals-ui.js calls API.Goals.contribute(id, amount) directly, which sends
    //       { amount } only. The server accepts that (source defaults to 'manual').
    //       GoalsStore.contribute is called only by dashboard-ui.js which passes a note.
    if (!result.success) throw new Error(result.error || 'Failed to contribute.');
    await loadFromAPI();
    return result.data;
}
```

> **Note on `API.Goals.contribute` signature:** `api.js` currently sends `{ amount }` only.
> The server's `POST /api/goals/:id/contribute` also accepts an optional `source` field.
> No change to `api.js` is needed — the existing call is sufficient. `GoalsStore.contribute`
> will call `API.Goals.contribute(id, amount)` (not the store contribute) when called from
> the UI, but since `goals-ui.js` already calls `API.Goals.contribute` directly, the store
> `contribute` method is only used from `dashboard-ui.js`. Keep `GoalsStore.contribute`
> async and have it call `API.Goals.contribute(id, amount)`.

**Verify:**
Navigate to the Goals panel in the running app. Goals saved to the DB must load and render
cards. Adding a new goal must persist to SQL Server (confirm via DB query or the Goals panel
reload). The dashboard "Goals Progress" section must also show live goal data.

---

## Item 6 — Verify `API.Goals.contribute` passes `source` (no change needed, just confirm)

**What to do:**
`scripts/api.js` `Goals.contribute(id, amount)` sends `{ amount }` to
`POST /api/goals/:id/contribute`. The server route accepts `{ amount, source }` and defaults
`source` to `'manual'` when absent. No change is required — confirm this works end-to-end.

**Files:** none

**Verify:**
In the Goals drawer, enter an amount and click "Add Funds". Confirm the network call is
`POST http://localhost:3000/api/goals/<id>/contribute` with body `{"amount": <n>}` and a
200 response. The `savedAmount` on the card must increase after reload.

---

## Item 7 — Smoke-test all other namespaces end-to-end

After items 1–5 are applied, all other API namespaces inherit the correct `BASE_URL` fix
automatically. Verify each area works with a logged-in session:

| Area           | Call                               | Expected                                 |
|----------------|------------------------------------|------------------------------------------|
| Subscriptions  | `API.Subscriptions.getAll()`       | Array of subscription rows               |
| Wallet         | `API.Wallet.get()`                 | `{ balance, pendingIn, pendingOut, ... }` |
| Dependants     | `API.Dependants.getAll()`          | Array of dependant rows                  |
| Notifications  | `API.Notifications.getAll()`       | Array of notification objects            |
| Notifications  | `API.Notifications.markAllRead()`  | `PATCH /api/notifications/mark-all-read` returns 200 |
| Analytics      | `API.Analytics.getSummary('30d')`  | Summary object                           |
| Reports        | `API.Reports.getAll()`             | Array of report records                  |

**Files:** none (verification only)

**Verify:**
Run each call from the browser console while logged in. None should return a 404 or HTML
response. A 200 or an empty array is a pass. A 401 means the token is missing (check
`sessionStorage.getItem('flexscribe_token')`). A 404 means BASE_URL is still wrong.

---

## Summary of files changed

| File                          | Change                                                        |
|-------------------------------|---------------------------------------------------------------|
| `scripts/api.js`              | Fix `BASE_URL`, flip error field order, add `getUser` normalizer |
| `scripts/login.js`            | Fix admin check, store user in sessionStorage                 |
| `server/routes/auth.js`       | Add `scribeScore: 500` to register `201` response            |
| `backend/goals.js`            | Full rewrite: localStorage → API-backed, async mutations      |
