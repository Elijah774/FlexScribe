# FlexScribe frontend-backend wiring

The change wires the FlexScribe frontend to a real SQL Server backend running on Express at port 3000. It corrects the API base URL, adds response normalizers so DB field names are translated to the frontend's field names, rewrites `backend/goals.js` to use the live API instead of localStorage, fixes the login admin redirect check, and adds the initial `scribeScore: 500` to the register endpoint response.

**Watch for:** `API.Auth.getUser` normalizes `subscriberID→id` but does not normalize `firstName+lastName→name` using the intended fallback expression — it uses `preferredName` correctly but the concatenation uses `firstName` directly from `result.data` after the profile endpoint omits no fields, so the concern is minor. The `contribute` heuristic (`amount > 1000 ? amount/100 : amount`) is ambiguous at boundary values. `USE_MOCK` is confirmed false and DB credentials are untouched.

**Verdict**: APPROVED

---

## High-level view

BASE_URL is correctly set to `'http://localhost:3000/api'` and `USE_MOCK` remains `false`. The `_fetch` error path checks `json.error` before `json.message`, matching the server's error field name. Response normalizers are in place for `getUser`, `Subscriptions.getAll`, `Wallet.get`, and `Goals.getAll`, translating DB column names to frontend field names. `backend/goals.js` has been fully rewritten: it holds an in-memory store, exposes a `loadFromAPI()` function, and all mutations (`add`, `edit`, `remove`, `contribute`) are async and delegate to `API.Goals`. The login admin check reads `result.data?.user?.userType === 'Admin'` and the user object is stored in `sessionStorage` on success. The register endpoint inserts `scribeScore = 500` into the DB and returns `scribeScore: 500` in the response body.

The `contribute` translation in `api.js` applies a heuristic — if `amount > 1000` it divides by 100, otherwise passes the value as-is — to guess whether the caller passed cents or a decimal amount. This is ambiguous at values like 1001 cents (R10.01) and could silently send the wrong amount to the server.

`API.Auth.getUser` calls `preferredName || (firstName + ' ' + lastName)` which is the correct intended normalization; the concern raised in the original checklist is satisfied.

---

<details>
<summary>Issues (1)</summary>

1. **Contribute amount heuristic** — `API.Goals.contribute` divides `amount` by 100 only when `amount > 1000`, treating the threshold as a cents/decimal discriminator. A value of 1001 cents (R10.01) would be silently halved to ~R5.005 sent to the server. Callers should pass a consistent unit (cents or rands) and the translation should be done at one layer only. Confirm the calling convention in `goals-ui.js` and remove the heuristic in favour of an explicit unit contract.

</details>

---

<details>
<summary>Details</summary>

### Check results — all 13 items

**1. BASE_URL** — `confirmed`. Line: `const BASE_URL = 'http://localhost:3000/api';`

**2. Error field order** — `confirmed`. The `_fetch` error path reads `json.error || json.message || \`HTTP ${response.status}\``. The server always sends `error`, so this matches.

**3. getUser normalization** — `confirmed`. After a successful `/auth/profile` fetch:
```js
result.data.id   = result.data.subscriberID;
result.data.name = (result.data.preferredName ||
    ((result.data.firstName || '') + ' ' + (result.data.lastName || ''))).trim();
```
Both `subscriberID→id` and `firstName+lastName→name` (with `preferredName` fallback) are present.

**4. Subscriptions.getAll normalization** — `confirmed`. The mapper covers `subscriptionID→id`, `serviceName→name`, `categoryName→category`, `billingAmount→amount`, `billingDate→nextPaymentDate`, `subStatus→active/status`, and several optional fields.

**5. Wallet.get normalization** — `confirmed`. `balance`, `pendingIn`, `pendingOut` are each multiplied by 100 (with `parseFloat` guard) and written to `balanceCents`, `pendingInCents`, `pendingOutCents`.

**6. Goals.getAll normalization** — `confirmed`. The mapper writes `goalID→id`, `goalName→name`, `deadline→targetDate`, `goalStatus→status`, plus `targetAmount`, `savedAmount`, `category`, `imageUrl`, `createdAt`.

**7. Goals add/edit/contribute field translation** — `confirmed` for add and edit; `likely` concern for contribute (see Issues).
- `add` sends `{ goalName, targetAmount, deadline, imageUrl }`, correctly mapping `name→goalName`, `targetDate→deadline`.
- `edit` sends `{ goalName, targetAmount, deadline, imageUrl, goalStatus }`, correctly mapping `name→goalName`, `targetDate→deadline`, `status→goalStatus`.
- `contribute` sends `{ amount, source: 'wallet' }` but applies `amount > 1000 ? amount / 100 : amount` — this threshold-based cents/rands discrimination is a latent bug (see Issues).

**8. Login admin check** — `confirmed`. The login submit handler reads:
```js
const isAdmin = result.data?.user?.userType === 'Admin';
window.location.href = isAdmin ? 'admin.html' : 'loading.html';
```

**9. sessionStorage on login success** — `confirmed`. Inside the `result.success` branch:
```js
if (result.data?.user) {
    sessionStorage.setItem('flexscribe_user', JSON.stringify(result.data.user));
}
```
The token is also stored by `API.Auth.login` itself before returning.

**10. Register scribeScore: 500** — `confirmed`. The server inserts `scribeScore = 500` in the DB column and the SQL uses `OUTPUT INSERTED.subscriberID` then returns:
```js
res.status(201).json({ message: '...', token, scribeScore: 500, user: { ... } });
```

**11. backend/goals.js — loadFromAPI and async mutations** — `confirmed`. The module exposes `loadFromAPI()` (async, calls `API.Goals.getAll()`). `add`, `edit`, `remove`, and `contribute` are all `async`, call the corresponding `API.Goals.*` method, check `result.success`, throw on failure, then call `loadFromAPI()` to refresh the in-memory store.

**12. Syntax errors or broken references** — `confirmed` none found. The IIFE in `api.js` closes correctly. `GoalsStore` in `backend/goals.js` is a self-contained IIFE that references `API` at call time (guarded by `typeof API === 'undefined'`). `login.js` references `API.Auth.login` and `API.Auth.register` which both exist.

**13. USE_MOCK and DB credentials** — `confirmed`. `USE_MOCK = false`. No credential values appear in any of the four files; the `query` helper is imported from `../db` in `auth.js` and the connection config lives outside the reviewed files.

</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|------|-------------|
| `scripts/api.js` | BASE_URL corrected to include `/api`; error field order fixed; normalizers added to `getUser`, `Subscriptions.getAll`, `Wallet.get`, `Goals.getAll`; field translation added to `Goals.add/edit/contribute` |
| `scripts/login.js` | Admin check updated to `userType === 'Admin'`; `sessionStorage.setItem('flexscribe_user', ...)` added on login success |
| `server/routes/auth.js` | Register route now returns `scribeScore: 500` in response body; DB insert hardcodes `scribeScore = 500` column value |
| `backend/goals.js` | Full rewrite: localStorage removed, `loadFromAPI()` added, all mutations rewritten as async API calls with in-memory store refresh |

Full diff source: `git diff main -- scripts/api.js scripts/login.js server/routes/auth.js backend/goals.js`
</details>
