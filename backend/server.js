const express = require("express");
const cors = require("cors");
const sql = require("mssql");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

/* ===========================================================
   CONFIG
=========================================================== */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("FATAL: JWT_SECRET is not defined in backend/.env — server cannot start.");
    process.exit(1);
}
const JWT_EXPIRES = "24h";

const dbConfig = {
    server: process.env.DB_SERVER,
    port: 1433,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    authentication: { type: "default" },
    options: { encrypt: true, trustServerCertificate: false }
};

/* ===========================================================
   DB POOL
=========================================================== */
let pool;
async function getPool() {
    if (!pool) pool = await sql.connect(dbConfig);
    return pool;
}

/* ===========================================================
   JWT + AUTH MIDDLEWARE
=========================================================== */
function generateToken(user) {
    return jwt.sign(
        { subscriberID: user.subscriberID, email: user.email, userType: user.userType },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
}

function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "No token provided" });
    }
    try {
        req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
}

/** Get walletIDNum for a subscriber */
async function getUserWalletID(p, subscriberID) {
    const r = await p.request().input("subID", sql.Int, subscriberID)
        .query("SELECT walletIDNum FROM VirtualWallet WHERE subscriberID = @subID");
    return r.recordset.length > 0 ? r.recordset[0].walletIDNum : null;
}

/* ===========================================================
   TEST ENDPOINTS
=========================================================== */
app.get("/", (req, res) => {
    res.json({ message: "FlexScribe backend is running!" });
});

app.get("/test-db", async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query("SELECT DB_NAME() AS databaseName");
        res.json({ success: true, database: result.recordset[0].databaseName });
    } catch (error) {
        console.error("Database connection error:", error);
        res.status(500).json({ success: false, message: "Could not connect to database" });
    }
});

app.get("/test-tables", async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().query(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
        );
        res.json({ success: true, tables: result.recordset });
    } catch (error) {
        console.error("Table query error:", error);
        res.status(500).json({ success: false, message: "Could not read database tables" });
    }
});

/* ===========================================================
   AUTH
   Schema: Subscriber(subscriberID PK, firstName, lastName, prefferedName, email, passwordHash, userType)
=========================================================== */
app.post("/auth/register", async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ success: false, message: "All required fields must be provided" });
        }
        const p = await getPool();
        const existing = await p.request().input("email", sql.VarChar(255), email)
            .query("SELECT subscriberID FROM Subscriber WHERE email = @email");
        if (existing.recordset.length > 0) {
            return res.status(409).json({ success: false, message: "Email is already registered" });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await p.request()
            .input("firstName", sql.VarChar(100), firstName)
            .input("lastName", sql.VarChar(100), lastName)
            .input("email", sql.VarChar(255), email)
            .input("passwordHash", sql.VarChar(255), passwordHash)
            .input("userType", sql.VarChar(50), "individual")
            .query(`
                INSERT INTO Subscriber (firstName, lastName, email, passwordHash, userType)
                OUTPUT INSERTED.subscriberID, INSERTED.firstName, INSERTED.lastName, INSERTED.email, INSERTED.userType
                VALUES (@firstName, @lastName, @email, @passwordHash, @userType)
            `);
        const user = result.recordset[0];
        const token = generateToken(user);
        // Create wallet
        try {
            await p.request().input("subID", sql.Int, user.subscriberID).input("bal", sql.Decimal(18, 2), 0)
                .query("INSERT INTO VirtualWallet (subscriberID, balance) VALUES (@subID, @bal)");
        } catch (we) { console.warn("Wallet creation note:", we.message); }
        res.status(201).json({ success: true, data: { token, user: { id: user.subscriberID, name: user.firstName + " " + user.lastName, email: user.email, userType: user.userType }, scribePoints: 500 } });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ success: false, message: "Registration failed" });
    }
});

app.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required" });
        const p = await getPool();
        const result = await p.request().input("email", sql.VarChar(255), email)
            .query("SELECT subscriberID, firstName, lastName, email, passwordHash, userType FROM Subscriber WHERE email = @email");
        if (result.recordset.length === 0) return res.status(401).json({ success: false, message: "Invalid email or password" });
        const user = result.recordset[0];
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) return res.status(401).json({ success: false, message: "Invalid email or password" });
        const token = generateToken(user);
        res.json({ success: true, data: { token, user: { id: user.subscriberID, name: user.firstName + " " + user.lastName, email: user.email, userType: user.userType } } });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: "Login failed" });
    }
});

app.post("/auth/check-email", async (req, res) => {
    try {
        const { email } = req.body;
        const p = await getPool();
        const r = await p.request().input("email", sql.VarChar(255), email)
            .query("SELECT subscriberID FROM Subscriber WHERE email = @email");
        res.json({ success: true, data: { exists: r.recordset.length > 0 } });
    } catch (error) {
        console.error("Check email error:", error);
        res.status(500).json({ success: false, message: "Could not check email" });
    }
});

app.post("/auth/logout", (req, res) => { res.json({ success: true, data: null }); });
app.post("/auth/forgot-password", (req, res) => { res.json({ success: true, data: { sent: true } }); });

app.get("/auth/me", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.request().input("id", sql.Int, req.user.subscriberID)
            .query("SELECT subscriberID, firstName, lastName, email, userType FROM Subscriber WHERE subscriberID = @id");
        if (r.recordset.length === 0) return res.status(404).json({ success: false, message: "User not found" });
        const u = r.recordset[0];
        res.json({ success: true, data: { id: u.subscriberID, name: u.firstName + " " + u.lastName, email: u.email, userType: u.userType } });
    } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({ success: false, message: "Could not fetch user" });
    }
});

/* ===========================================================
   SUBSCRIPTIONS
   Schema: Subscription(subscriptionID PK, subscriberID FK, categoryID FK(int), serviceName, billingAmount, billingDate, subStatus, autoRenew, amtDueAtDate, planType, subPriority)
   SubscriptionCategory(categoryID PK, categoryName)
=========================================================== */
app.get("/subscriptions", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query(`
                SELECT s.subscriptionID, s.serviceName, sc.categoryName, s.billingAmount,
                       s.billingDate, s.subStatus, s.autoRenew, s.planType, s.categoryID
                FROM Subscription s
                LEFT JOIN SubscriptionCategory sc ON s.categoryID = sc.categoryID
                WHERE s.subscriberID = @subID
                ORDER BY s.subscriptionID
            `);
        const data = result.recordset.map(function(s) {
            return {
                id: s.subscriptionID,
                name: s.serviceName,
                category: s.categoryName || "Other",
                amount: s.billingAmount,
                billingCycle: "monthly",
                nextPaymentDate: s.billingDate ? new Date(s.billingDate).toISOString().slice(0, 10) : "",
                active: s.subStatus === "active",
                logoClass: "default",
                logoText: (s.serviceName || "?").charAt(0).toUpperCase(),
                notes: s.planType || "",
                createdAt: ""
            };
        });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Get subscriptions error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve subscriptions" });
    }
});

app.post("/subscriptions", authenticate, async (req, res) => {
    try {
        const { name, category, amount, billingCycle, nextPaymentDate, notes } = req.body;
        if (!name || !amount) return res.status(400).json({ success: false, message: "Name and amount required" });
        const p = await getPool();
        // Resolve categoryID from name, default to 1 if not found
        var catID = 1;
        if (category) {
            const catResult = await p.request().input("catName", sql.VarChar(100), category)
                .query("SELECT categoryID FROM SubscriptionCategory WHERE categoryName = @catName");
            if (catResult.recordset.length > 0) catID = catResult.recordset[0].categoryID;
        }
        const result = await p.request()
            .input("subID", sql.Int, req.user.subscriberID)
            .input("catID", sql.Int, catID)
            .input("name", sql.VarChar(200), name)
            .input("amount", sql.Decimal(10, 2), parseFloat(amount))
            .input("date", sql.Date, nextPaymentDate || null)
            .input("status", sql.VarChar(50), "active")
            .input("plan", sql.VarChar(50), notes || "")
            .query(`
                INSERT INTO Subscription (subscriberID, categoryID, serviceName, billingAmount, billingDate, subStatus, planType)
                OUTPUT INSERTED.subscriptionID
                VALUES (@subID, @catID, @name, @amount, @date, @status, @plan)
            `);
        res.status(201).json({ success: true, data: { id: result.recordset[0].subscriptionID, name: name, category: category || "Other", amount: parseFloat(amount), active: true } });
    } catch (error) {
        console.error("Add subscription error:", error);
        res.status(500).json({ success: false, message: "Could not add subscription" });
    }
});

app.patch("/subscriptions/:id", authenticate, async (req, res) => {
    try {
        const { name, amount, nextPaymentDate, notes, category } = req.body;
        const p = await getPool();
        const check = await p.request().input("id", sql.Int, req.params.id).input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT subscriptionID FROM Subscription WHERE subscriptionID = @id AND subscriberID = @subID");
        if (check.recordset.length === 0) return res.status(404).json({ success: false, message: "Not found" });
        var sets = [];
        var request = p.request().input("id", sql.Int, req.params.id);
        if (name !== undefined) { sets.push("serviceName = @n"); request.input("n", sql.VarChar(200), name); }
        if (amount !== undefined) { sets.push("billingAmount = @a"); request.input("a", sql.Decimal(10, 2), parseFloat(amount)); }
        if (nextPaymentDate !== undefined) { sets.push("billingDate = @d"); request.input("d", sql.Date, nextPaymentDate); }
        if (notes !== undefined) { sets.push("planType = @p"); request.input("p", sql.VarChar(50), notes); }
        if (category !== undefined) {
            var catLookup = await p.request().input("catName", sql.VarChar(100), category)
                .query("SELECT categoryID FROM SubscriptionCategory WHERE categoryName = @catName");
            if (catLookup.recordset.length > 0) { sets.push("categoryID = @c"); request.input("c", sql.Int, catLookup.recordset[0].categoryID); }
        }
        if (sets.length === 0) return res.status(400).json({ success: false, message: "No fields to update" });
        await request.query("UPDATE Subscription SET " + sets.join(", ") + " WHERE subscriptionID = @id");
        res.json({ success: true, data: { id: parseInt(req.params.id) } });
    } catch (error) {
        console.error("Edit subscription error:", error);
        res.status(500).json({ success: false, message: "Could not update subscription" });
    }
});

app.delete("/subscriptions/:id", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        await p.request().input("id", sql.Int, req.params.id).input("subID", sql.Int, req.user.subscriberID)
            .query("DELETE FROM Subscription WHERE subscriptionID = @id AND subscriberID = @subID");
        res.json({ success: true, data: { deleted: true } });
    } catch (error) {
        console.error("Delete subscription error:", error);
        res.status(500).json({ success: false, message: "Could not delete subscription" });
    }
});

app.post("/subscriptions/:id/toggle", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        const cur = await p.request().input("id", sql.Int, req.params.id).input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT subStatus FROM Subscription WHERE subscriptionID = @id AND subscriberID = @subID");
        if (cur.recordset.length === 0) return res.status(404).json({ success: false, message: "Not found" });
        var newStatus = cur.recordset[0].subStatus === "active" ? "paused" : "active";
        await p.request().input("id", sql.Int, req.params.id).input("s", sql.VarChar(50), newStatus)
            .query("UPDATE Subscription SET subStatus = @s WHERE subscriptionID = @id");
        res.json({ success: true, data: { id: parseInt(req.params.id), active: newStatus === "active" } });
    } catch (error) {
        console.error("Toggle subscription error:", error);
        res.status(500).json({ success: false, message: "Could not toggle subscription" });
    }
});

app.get("/subscriptions/providers", (req, res) => {
    // No provider catalogue table exists in the DB; return empty array
    res.json({ success: true, data: [] });
});

/* ===========================================================
   GOALS
   Schema: FinancialGoal(goalID PK, subscriberID FK, goalName, targetAmount, currentProgress, deadLine, lastTopUpDate, riskFlagStatus)
   Note: Frontend uses savedCents/targetCents. We map currentProgress↔savedCents, deadLine↔targetDate.
   No goalStatus column exists; we derive status from currentProgress vs targetAmount.
=========================================================== */
app.get("/goals", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT goalID, goalName, targetAmount, currentProgress, deadLine, lastTopUpDate FROM FinancialGoal WHERE subscriberID = @subID ORDER BY goalID DESC");
        var data = result.recordset.map(function(g) {
            var saved = g.currentProgress || 0;
            var target = g.targetAmount || 0;
            var status = saved >= target && target > 0 ? "completed" : "active";
            return {
                id: g.goalID,
                name: g.goalName,
                targetCents: Math.round(target * 100),
                savedCents: Math.round(saved * 100),
                targetDate: g.deadLine ? new Date(g.deadLine).toISOString().slice(0, 10) : null,
                status: status,
                createdAt: g.lastTopUpDate ? new Date(g.lastTopUpDate).toISOString().slice(0, 10) : ""
            };
        });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Get goals error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve goals" });
    }
});

app.post("/goals", authenticate, async (req, res) => {
    try {
        const { name, targetCents, targetDate } = req.body;
        if (!name || !targetCents) return res.status(400).json({ success: false, message: "Name and target required" });
        var target = targetCents / 100;
        const p = await getPool();
        const result = await p.request()
            .input("subID", sql.Int, req.user.subscriberID)
            .input("name", sql.VarChar(200), name)
            .input("target", sql.Decimal(18, 2), target)
            .input("progress", sql.Decimal(18, 2), 0)
            .input("deadline", sql.Date, targetDate || null)
            .query("INSERT INTO FinancialGoal (subscriberID, goalName, targetAmount, currentProgress, deadLine) OUTPUT INSERTED.goalID VALUES (@subID, @name, @target, @progress, @deadline)");
        res.status(201).json({ success: true, data: { id: result.recordset[0].goalID, name: name, targetCents: targetCents, savedCents: 0, status: "active" } });
    } catch (error) {
        console.error("Add goal error:", error);
        res.status(500).json({ success: false, message: "Could not create goal" });
    }
});

app.patch("/goals/:id", authenticate, async (req, res) => {
    try {
        const { name, targetCents, targetDate } = req.body;
        const p = await getPool();
        const check = await p.request().input("id", sql.Int, req.params.id).input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT goalID FROM FinancialGoal WHERE goalID = @id AND subscriberID = @subID");
        if (check.recordset.length === 0) return res.status(404).json({ success: false, message: "Goal not found" });
        var sets = [];
        var request = p.request().input("id", sql.Int, req.params.id);
        if (name !== undefined) { sets.push("goalName = @n"); request.input("n", sql.VarChar(200), name); }
        if (targetCents !== undefined) { sets.push("targetAmount = @t"); request.input("t", sql.Decimal(18, 2), targetCents / 100); }
        if (targetDate !== undefined) { sets.push("deadLine = @d"); request.input("d", sql.Date, targetDate); }
        if (sets.length === 0) return res.status(400).json({ success: false, message: "No fields to update" });
        await request.query("UPDATE FinancialGoal SET " + sets.join(", ") + " WHERE goalID = @id");
        res.json({ success: true, data: { id: parseInt(req.params.id) } });
    } catch (error) {
        console.error("Edit goal error:", error);
        res.status(500).json({ success: false, message: "Could not update goal" });
    }
});

app.delete("/goals/:id", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        await p.request().input("id", sql.Int, req.params.id).input("subID", sql.Int, req.user.subscriberID)
            .query("DELETE FROM FinancialGoal WHERE goalID = @id AND subscriberID = @subID");
        res.json({ success: true, data: { deleted: true } });
    } catch (error) {
        console.error("Delete goal error:", error);
        res.status(500).json({ success: false, message: "Could not delete goal" });
    }
});

app.post("/goals/:id/contribute", authenticate, async (req, res) => {
    try {
        const { amountCents } = req.body;
        if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, message: "Amount must be > 0" });
        var amount = amountCents / 100;
        const p = await getPool();
        const goal = await p.request().input("id", sql.Int, req.params.id).input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT goalID, currentProgress, targetAmount FROM FinancialGoal WHERE goalID = @id AND subscriberID = @subID");
        if (goal.recordset.length === 0) return res.status(404).json({ success: false, message: "Goal not found" });
        var g = goal.recordset[0];
        var newProgress = (g.currentProgress || 0) + amount;
        await p.request().input("id", sql.Int, req.params.id)
            .input("progress", sql.Decimal(18, 2), newProgress)
            .input("topUp", sql.Date, new Date().toISOString().slice(0, 10))
            .query("UPDATE FinancialGoal SET currentProgress = @progress, lastTopUpDate = @topUp WHERE goalID = @id");
        var status = newProgress >= g.targetAmount ? "completed" : "active";
        res.json({ success: true, data: { id: g.goalID, savedCents: Math.round(newProgress * 100), status: status } });
    } catch (error) {
        console.error("Contribute error:", error);
        res.status(500).json({ success: false, message: "Could not contribute to goal" });
    }
});

/* ===========================================================
   WALLET
   Schema: VirtualWallet(walletIDNum PK, subscriberID FK, balance, availableBal, amtDueAtDate, lastTopUpDate, totalDeposits, firstName, lastName)
   WalletTransaction(transactionID PK, walletIDNum FK, subscriptionID, spendingReportID, scoreID, transactionType, transactionDate, transactionAmount)
   Note: WalletTransaction links to wallet via walletIDNum, NOT subscriberID.
=========================================================== */
app.get("/wallet/balance", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT walletIDNum, balance, availableBal FROM VirtualWallet WHERE subscriberID = @subID");
        if (result.recordset.length === 0) return res.json({ success: true, data: { balanceCents: 0, pendingInCents: 0, pendingOutCents: 0 } });
        var w = result.recordset[0];
        res.json({ success: true, data: { balanceCents: Math.round((w.balance || 0) * 100), pendingInCents: 0, pendingOutCents: 0 } });
    } catch (error) {
        console.error("Get wallet error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve wallet" });
    }
});

app.get("/wallet/history", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        var walletID = await getUserWalletID(p, req.user.subscriberID);
        if (!walletID) return res.json({ success: true, data: [] });
        const result = await p.request().input("wid", sql.Int, walletID)
            .query("SELECT transactionID, transactionType, transactionAmount, transactionDate FROM WalletTransaction WHERE walletIDNum = @wid ORDER BY transactionDate DESC");
        var data = result.recordset.map(function(t) {
            return {
                date: t.transactionDate ? new Date(t.transactionDate).toISOString().slice(0, 10) : "",
                amountCents: Math.round((t.transactionAmount || 0) * 100),
                type: t.transactionType || "debit",
                label: t.transactionType || ""
            };
        });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Wallet history error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve history" });
    }
});

app.post("/wallet/add-funds", authenticate, async (req, res) => {
    try {
        const { amountCents } = req.body;
        if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, message: "Amount must be > 0" });
        var amount = amountCents / 100;
        const p = await getPool();
        var walletID = await getUserWalletID(p, req.user.subscriberID);
        if (!walletID) return res.status(404).json({ success: false, message: "Wallet not found" });
        // Update balance
        await p.request().input("wid", sql.Int, walletID).input("amt", sql.Decimal(18, 2), amount)
            .query("UPDATE VirtualWallet SET balance = balance + @amt, lastTopUpDate = CAST(GETDATE() AS date), totalDeposits = ISNULL(totalDeposits, 0) + @amt WHERE walletIDNum = @wid");
        // Record transaction
        await p.request().input("wid", sql.Int, walletID).input("type", sql.VarChar(100), "credit").input("amt", sql.Decimal(18, 2), amount)
            .query("INSERT INTO WalletTransaction (walletIDNum, transactionType, transactionAmount, transactionDate) VALUES (@wid, @type, @amt, GETDATE())");
        // Return new balance
        var bal = await p.request().input("wid", sql.Int, walletID).query("SELECT balance FROM VirtualWallet WHERE walletIDNum = @wid");
        res.json({ success: true, data: { balanceCents: Math.round((bal.recordset[0].balance || 0) * 100) } });
    } catch (error) {
        console.error("Add funds error:", error);
        res.status(500).json({ success: false, message: "Could not add funds" });
    }
});

app.post("/wallet/withdraw", authenticate, async (req, res) => {
    try {
        const { amountCents } = req.body;
        if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, message: "Amount must be > 0" });
        var amount = amountCents / 100;
        const p = await getPool();
        var walletID = await getUserWalletID(p, req.user.subscriberID);
        if (!walletID) return res.status(404).json({ success: false, message: "Wallet not found" });
        var balCheck = await p.request().input("wid", sql.Int, walletID).query("SELECT balance FROM VirtualWallet WHERE walletIDNum = @wid");
        if (balCheck.recordset[0].balance < amount) return res.status(422).json({ success: false, message: "Insufficient funds" });
        await p.request().input("wid", sql.Int, walletID).input("amt", sql.Decimal(18, 2), amount)
            .query("UPDATE VirtualWallet SET balance = balance - @amt WHERE walletIDNum = @wid");
        await p.request().input("wid", sql.Int, walletID).input("type", sql.VarChar(100), "debit").input("amt", sql.Decimal(18, 2), amount)
            .query("INSERT INTO WalletTransaction (walletIDNum, transactionType, transactionAmount, transactionDate) VALUES (@wid, @type, @amt, GETDATE())");
        var newBal = await p.request().input("wid", sql.Int, walletID).query("SELECT balance FROM VirtualWallet WHERE walletIDNum = @wid");
        res.json({ success: true, data: { balanceCents: Math.round((newBal.recordset[0].balance || 0) * 100) } });
    } catch (error) {
        console.error("Withdraw error:", error);
        res.status(500).json({ success: false, message: "Could not withdraw" });
    }
});

app.post("/wallet/transfer", authenticate, async (req, res) => {
    try {
        const { amountCents, goalId } = req.body;
        if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, message: "Amount must be > 0" });
        var amount = amountCents / 100;
        const p = await getPool();
        var walletID = await getUserWalletID(p, req.user.subscriberID);
        if (!walletID) return res.status(404).json({ success: false, message: "Wallet not found" });
        var balCheck = await p.request().input("wid", sql.Int, walletID).query("SELECT balance FROM VirtualWallet WHERE walletIDNum = @wid");
        if (balCheck.recordset[0].balance < amount) return res.status(422).json({ success: false, message: "Insufficient funds" });
        // Debit wallet
        await p.request().input("wid", sql.Int, walletID).input("amt", sql.Decimal(18, 2), amount)
            .query("UPDATE VirtualWallet SET balance = balance - @amt WHERE walletIDNum = @wid");
        // Record transaction
        await p.request().input("wid", sql.Int, walletID).input("type", sql.VarChar(100), "transfer").input("amt", sql.Decimal(18, 2), amount)
            .query("INSERT INTO WalletTransaction (walletIDNum, transactionType, transactionAmount, transactionDate) VALUES (@wid, @type, @amt, GETDATE())");
        res.json({ success: true, data: { transferred: true, amountCents: amountCents } });
    } catch (error) {
        console.error("Transfer error:", error);
        res.status(500).json({ success: false, message: "Could not transfer" });
    }
});

/* ===========================================================
   DEPENDANTS
   Schema: Dependant(dependantID PK/FK→Subscriber, mainMemberID FK→MainMember, age, relationship, availableBal)
   MainMember(mainMemberID PK/FK→Subscriber, monthlyIncome, planType, riskFlagStatus)
   The dependantID IS a subscriberID. To get names we JOIN Subscriber.
   mainMemberID links to the MainMember table which itself links to Subscriber.
   Limitation: No dependantName/email/allowance/status columns exist. Names come from Subscriber table.
=========================================================== */
app.get("/dependants", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        // The authenticated user's subscriberID should match a mainMemberID
        const result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query(`
                SELECT d.dependantID, d.relationship, d.age, d.availableBal,
                       s.firstName, s.lastName, s.email
                FROM Dependant d
                JOIN Subscriber s ON d.dependantID = s.subscriberID
                WHERE d.mainMemberID = @subID
                ORDER BY s.firstName
            `);
        var data = result.recordset.map(function(d) {
            return {
                id: d.dependantID,
                name: d.firstName + " " + d.lastName,
                relationship: d.relationship || "Other",
                email: d.email || "",
                allowanceCents: Math.round((d.availableBal || 0) * 100),
                status: "active"
            };
        });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Get dependants error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve dependants" });
    }
});

app.post("/dependants", authenticate, async (req, res) => {
    try {
        const { name, relationship, email, allowanceCents } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "Name is required" });
        // Limitation: creating a dependant requires creating a Subscriber first (since dependantID FK→Subscriber)
        // and the mainMemberID must exist in MainMember. This is a complex multi-table insert.
        var parts = name.trim().split(/\s+/);
        var firstName = parts[0] || "Dependant";
        var lastName = parts.slice(1).join(" ") || "User";
        var availableBal = (allowanceCents || 0) / 100;
        const p = await getPool();
        // Ensure the authenticated user exists in MainMember
        var mmCheck = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT mainMemberID FROM MainMember WHERE mainMemberID = @subID");
        if (mmCheck.recordset.length === 0) {
            // Auto-create MainMember row for this subscriber
            await p.request().input("subID", sql.Int, req.user.subscriberID)
                .query("INSERT INTO MainMember (mainMemberID) VALUES (@subID)");
        }
        // Create a Subscriber record for the dependant
        var depEmail = email || (firstName.toLowerCase() + "." + lastName.toLowerCase().charAt(0) + "@flexscribe.local");
        var depHash = await bcrypt.hash("dependant123", 10);
        var subResult = await p.request()
            .input("fn", sql.VarChar(100), firstName)
            .input("ln", sql.VarChar(100), lastName)
            .input("em", sql.VarChar(255), depEmail)
            .input("ph", sql.VarChar(255), depHash)
            .input("ut", sql.VarChar(50), "dependant")
            .query("INSERT INTO Subscriber (firstName, lastName, email, passwordHash, userType) OUTPUT INSERTED.subscriberID VALUES (@fn, @ln, @em, @ph, @ut)");
        var newSubID = subResult.recordset[0].subscriberID;
        // Insert into Dependant table
        await p.request()
            .input("depID", sql.Int, newSubID)
            .input("mmID", sql.Int, req.user.subscriberID)
            .input("rel", sql.VarChar(100), relationship || "Other")
            .input("bal", sql.Decimal(18, 2), availableBal)
            .query("INSERT INTO Dependant (dependantID, mainMemberID, relationship, availableBal) VALUES (@depID, @mmID, @rel, @bal)");
        res.status(201).json({ success: true, data: { id: newSubID, name: name, status: "active" } });
    } catch (error) {
        console.error("Add dependant error:", error);
        res.status(500).json({ success: false, message: "Could not add dependant" });
    }
});

app.patch("/dependants/:id", authenticate, async (req, res) => {
    try {
        const { name, relationship, allowanceCents } = req.body;
        const p = await getPool();
        // Verify ownership
        var check = await p.request().input("id", sql.Int, req.params.id).input("mmID", sql.Int, req.user.subscriberID)
            .query("SELECT dependantID FROM Dependant WHERE dependantID = @id AND mainMemberID = @mmID");
        if (check.recordset.length === 0) return res.status(404).json({ success: false, message: "Not found" });
        // Update Dependant table fields
        if (relationship !== undefined || allowanceCents !== undefined) {
            var dSets = [];
            var dReq = p.request().input("id", sql.Int, req.params.id);
            if (relationship !== undefined) { dSets.push("relationship = @r"); dReq.input("r", sql.VarChar(100), relationship); }
            if (allowanceCents !== undefined) { dSets.push("availableBal = @b"); dReq.input("b", sql.Decimal(18, 2), allowanceCents / 100); }
            if (dSets.length > 0) await dReq.query("UPDATE Dependant SET " + dSets.join(", ") + " WHERE dependantID = @id");
        }
        // Update Subscriber name if provided
        if (name !== undefined) {
            var parts = name.trim().split(/\s+/);
            await p.request().input("id", sql.Int, req.params.id)
                .input("fn", sql.VarChar(100), parts[0] || "")
                .input("ln", sql.VarChar(100), parts.slice(1).join(" ") || "")
                .query("UPDATE Subscriber SET firstName = @fn, lastName = @ln WHERE subscriberID = @id");
        }
        res.json({ success: true, data: { id: parseInt(req.params.id) } });
    } catch (error) {
        console.error("Edit dependant error:", error);
        res.status(500).json({ success: false, message: "Could not update dependant" });
    }
});

app.delete("/dependants/:id", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        // Verify ownership
        var check = await p.request().input("id", sql.Int, req.params.id).input("mmID", sql.Int, req.user.subscriberID)
            .query("SELECT dependantID FROM Dependant WHERE dependantID = @id AND mainMemberID = @mmID");
        if (check.recordset.length === 0) return res.status(404).json({ success: false, message: "Not found" });
        await p.request().input("id", sql.Int, req.params.id)
            .query("DELETE FROM Dependant WHERE dependantID = @id");
        res.json({ success: true, data: { deleted: true } });
    } catch (error) {
        console.error("Delete dependant error:", error);
        res.status(500).json({ success: false, message: "Could not delete dependant" });
    }
});

app.post("/dependants/:id/allowance", authenticate, async (req, res) => {
    try {
        const { amountCents } = req.body;
        if (!amountCents || amountCents <= 0) return res.status(400).json({ success: false, message: "Amount must be > 0" });
        var amount = amountCents / 100;
        const p = await getPool();
        // Verify ownership
        var check = await p.request().input("id", sql.Int, req.params.id).input("mmID", sql.Int, req.user.subscriberID)
            .query("SELECT dependantID FROM Dependant WHERE dependantID = @id AND mainMemberID = @mmID");
        if (check.recordset.length === 0) return res.status(404).json({ success: false, message: "Not found" });
        // Update the dependant's availableBal
        await p.request().input("id", sql.Int, req.params.id).input("amt", sql.Decimal(18, 2), amount)
            .query("UPDATE Dependant SET availableBal = ISNULL(availableBal, 0) + @amt WHERE dependantID = @id");
        res.json({ success: true, data: { sent: true, amountCents: amountCents } });
    } catch (error) {
        console.error("Send allowance error:", error);
        res.status(500).json({ success: false, message: "Could not send allowance" });
    }
});

/* ===========================================================
   NOTIFICATIONS
   Schema: Notification(notificationID PK, transactionID FK(NOT NULL), subscriberID FK, subscriptionID FK, notificationMessage, notificationDate, notificationStatus, riskFlagStatus)
   Note: No title/body/isRead/priority columns. We map: title→first line of notificationMessage, isRead→(notificationStatus='read')
=========================================================== */
app.get("/notifications", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT notificationID, notificationMessage, notificationDate, notificationStatus, riskFlagStatus FROM Notification WHERE subscriberID = @subID ORDER BY notificationDate DESC");
        var data = result.recordset.map(function(n) {
            var msg = n.notificationMessage || "";
            return {
                id: n.notificationID,
                type: n.riskFlagStatus || "general",
                title: msg.length > 80 ? msg.substring(0, 80) + "..." : msg,
                body: msg,
                isRead: n.notificationStatus === "read",
                priority: n.riskFlagStatus === "high" ? "high" : "low",
                createdAt: n.notificationDate ? new Date(n.notificationDate).toISOString() : ""
            };
        });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Get notifications error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve notifications" });
    }
});

app.post("/notifications/:id/read", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        await p.request().input("id", sql.Int, req.params.id).input("subID", sql.Int, req.user.subscriberID)
            .query("UPDATE Notification SET notificationStatus = 'read' WHERE notificationID = @id AND subscriberID = @subID");
        res.json({ success: true, data: { updated: true } });
    } catch (error) {
        console.error("Mark read error:", error);
        res.status(500).json({ success: false, message: "Could not mark as read" });
    }
});

app.post("/notifications/mark-all-read", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        var result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("UPDATE Notification SET notificationStatus = 'read' WHERE subscriberID = @subID AND (notificationStatus IS NULL OR notificationStatus != 'read')");
        res.json({ success: true, data: { updated: result.rowsAffected[0] } });
    } catch (error) {
        console.error("Mark all read error:", error);
        res.status(500).json({ success: false, message: "Could not mark all as read" });
    }
});

/* ===========================================================
   ANALYTICS
   Uses: WalletTransaction (via walletIDNum JOIN), Subscription, FinancialGoal
=========================================================== */
app.get("/analytics/summary", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        var walletID = await getUserWalletID(p, req.user.subscriberID);
        var totalSpentCents = 0;
        var totalIncomeCents = 0;
        if (walletID) {
            var spent = await p.request().input("wid", sql.Int, walletID)
                .query("SELECT ISNULL(SUM(transactionAmount), 0) AS total FROM WalletTransaction WHERE walletIDNum = @wid AND transactionType = 'debit' AND transactionDate >= DATEADD(day, -30, GETDATE())");
            var income = await p.request().input("wid", sql.Int, walletID)
                .query("SELECT ISNULL(SUM(transactionAmount), 0) AS total FROM WalletTransaction WHERE walletIDNum = @wid AND transactionType = 'credit' AND transactionDate >= DATEADD(day, -30, GETDATE())");
            totalSpentCents = Math.round((spent.recordset[0].total || 0) * 100);
            totalIncomeCents = Math.round((income.recordset[0].total || 0) * 100);
        }
        var rate = totalIncomeCents > 0 ? Math.round(((totalIncomeCents - totalSpentCents) / totalIncomeCents) * 1000) / 10 : 0;
        res.json({ success: true, data: { totalSpentCents: totalSpentCents, totalIncomeCents: totalIncomeCents, netSavingsRate: rate, vsLastMonth: { spent: 0, income: 0 } } });
    } catch (error) {
        console.error("Analytics summary error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve analytics" });
    }
});

app.get("/analytics/by-category", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        const result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query(`
                SELECT sc.categoryName AS category, SUM(s.billingAmount) AS total
                FROM Subscription s
                JOIN SubscriptionCategory sc ON s.categoryID = sc.categoryID
                WHERE s.subscriberID = @subID AND s.subStatus = 'active'
                GROUP BY sc.categoryName
                ORDER BY total DESC
            `);
        var totalAll = 0;
        result.recordset.forEach(function(r) { totalAll += (r.total || 0); });
        var data = result.recordset.map(function(r) {
            return {
                category: r.category,
                amountCents: Math.round((r.total || 0) * 100),
                pct: totalAll > 0 ? Math.round((r.total / totalAll) * 100) : 0
            };
        });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Analytics by-category error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve category data" });
    }
});

app.get("/analytics/trend", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        var walletID = await getUserWalletID(p, req.user.subscriberID);
        if (!walletID) return res.json({ success: true, data: [] });
        const result = await p.request().input("wid", sql.Int, walletID)
            .query(`
                SELECT FORMAT(transactionDate, 'MMM') AS month, MONTH(transactionDate) AS monthNum, SUM(transactionAmount) AS total
                FROM WalletTransaction
                WHERE walletIDNum = @wid AND transactionType = 'debit' AND transactionDate >= DATEADD(month, -6, GETDATE())
                GROUP BY FORMAT(transactionDate, 'MMM'), MONTH(transactionDate)
                ORDER BY monthNum
            `);
        var data = result.recordset.map(function(r) { return { month: r.month, amountCents: Math.round((r.total || 0) * 100) }; });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Analytics trend error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve trend" });
    }
});

app.get("/analytics/insights", authenticate, async (req, res) => {
    try {
        const p = await getPool();
        var subs = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT COUNT(*) AS cnt FROM Subscription WHERE subscriberID = @subID AND subStatus = 'active'");
        var goals = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT COUNT(*) AS cnt, SUM(currentProgress) AS totalSaved FROM FinancialGoal WHERE subscriberID = @subID");
        var insights = [];
        var subCount = subs.recordset[0].cnt;
        var goalCount = goals.recordset[0].cnt;
        if (subCount > 5) insights.push({ id: 1, text: "You have " + subCount + " active subscriptions. Consider reviewing for potential savings.", action: "Review", linkTo: "subscription" });
        if (goalCount > 0) insights.push({ id: 2, text: "You have " + goalCount + " savings goal(s). Keep contributing regularly.", action: "View goals", linkTo: "goals" });
        if (insights.length === 0) insights.push({ id: 3, text: "Start tracking subscriptions and setting goals to unlock insights.", action: "Get started", linkTo: "subscription" });
        res.json({ success: true, data: insights });
    } catch (error) {
        console.error("Analytics insights error:", error);
        res.status(500).json({ success: false, message: "Could not generate insights" });
    }
});

/* ===========================================================
   SUPPORT
=========================================================== */
app.post("/support/contact", (req, res) => {
    var body = req.body || {};
    console.log("Support contact received:", { name: body.name, email: body.email, message: body.message });
    res.json({ success: true, data: { submitted: true } });
});

app.get("/support/faq", (req, res) => {
    res.json({ success: true, data: [] });
});

/* ===========================================================
   COMPILE FINANCIAL REPORT
   Uses: FinancialReport, SpendingReport, VirtualWallet,
         WalletTransaction, Subscription, FinancialGoal, ScribeScore
=========================================================== */
app.post("/reports/compile", authenticate, async (req, res) => {
    try {
        var { period, reportType } = req.body;
        var p = await getPool();
        var endDate = new Date();
        var startDate = new Date();
        switch (period) {
            case 'Last Month': startDate.setMonth(startDate.getMonth() - 1); startDate.setDate(1); endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0); break;
            case 'Last 3 Months': startDate.setMonth(startDate.getMonth() - 3); break;
            case 'Last 6 Months': startDate.setMonth(startDate.getMonth() - 6); break;
            case 'This Year': startDate = new Date(endDate.getFullYear(), 0, 1); break;
            default: startDate.setDate(1);
        }
        var startStr = startDate.toISOString().slice(0, 10);
        var endStr = endDate.toISOString().slice(0, 10);
        var walletResult = await p.request().input("subID", sql.Int, req.user.subscriberID).query("SELECT balance FROM VirtualWallet WHERE subscriberID = @subID");
        var balance = walletResult.recordset.length > 0 ? walletResult.recordset[0].balance : 0;
        var subResult = await p.request().input("subID", sql.Int, req.user.subscriberID).query("SELECT ISNULL(SUM(billingAmount), 0) AS total FROM Subscription WHERE subscriberID = @subID AND subStatus = 'active'");
        var totalSubCost = subResult.recordset[0].total || 0;
        var walletID = await getUserWalletID(p, req.user.subscriberID);
        var totalWithdrawals = 0; var totalIncome = 0; var transactions = [];
        if (walletID) {
            var txResult = await p.request().input("wid", sql.Int, walletID).input("start", sql.Date, startStr).input("end", sql.Date, endStr)
                .query("SELECT transactionType, transactionAmount, transactionDate FROM WalletTransaction WHERE walletIDNum = @wid AND transactionDate BETWEEN @start AND @end ORDER BY transactionDate DESC");
            txResult.recordset.forEach(function(t) {
                if (t.transactionType === 'credit') totalIncome += (t.transactionAmount || 0);
                else totalWithdrawals += (t.transactionAmount || 0);
                transactions.push({ type: t.transactionType, amount: t.transactionAmount, date: t.transactionDate ? new Date(t.transactionDate).toISOString().slice(0, 10) : '' });
            });
        }
        var savings = totalIncome - totalWithdrawals;
        var goalsResult = await p.request().input("subID", sql.Int, req.user.subscriberID).query("SELECT goalName, targetAmount, currentProgress FROM FinancialGoal WHERE subscriberID = @subID");
        var goals = goalsResult.recordset.map(function(g) { return { name: g.goalName, target: g.targetAmount, saved: g.currentProgress, pct: g.targetAmount > 0 ? Math.round((g.currentProgress / g.targetAmount) * 100) : 0 }; });
        var catResult = await p.request().input("subID", sql.Int, req.user.subscriberID).query("SELECT sc.categoryName, SUM(s.billingAmount) AS total FROM Subscription s JOIN SubscriptionCategory sc ON s.categoryID = sc.categoryID WHERE s.subscriberID = @subID AND s.subStatus = 'active' GROUP BY sc.categoryName ORDER BY total DESC");
        var categories = catResult.recordset.map(function(c) { return { category: c.categoryName, amount: c.total }; });
        var scoreResult = await p.request().input("subID", sql.Int, req.user.subscriberID).query("SELECT scoreID, scoreValue FROM ScribeScore WHERE subscriberID = @subID ORDER BY generateDate DESC");
        var scribeScore = scoreResult.recordset.length > 0 ? scoreResult.recordset[0].scoreValue : 0;
        var scoreID = scoreResult.recordset.length > 0 ? scoreResult.recordset[0].scoreID : null;
        var riskLevel = 'low';
        if (totalIncome > 0) { var sr = savings / totalIncome; if (sr < 0) riskLevel = 'high'; else if (sr < 0.1) riskLevel = 'medium'; }
        else if (totalWithdrawals > 0) riskLevel = 'high';
        var mmCheck = await p.request().input("subID", sql.Int, req.user.subscriberID).query("SELECT mainMemberID FROM MainMember WHERE mainMemberID = @subID");
        if (mmCheck.recordset.length === 0) await p.request().input("subID", sql.Int, req.user.subscriberID).query("INSERT INTO MainMember (mainMemberID) VALUES (@subID)");
        var insertResult = await p.request()
            .input("mmID", sql.Int, req.user.subscriberID).input("scoreID", sql.Int, scoreID)
            .input("startDate", sql.Date, startStr).input("endDate", sql.Date, endStr)
            .input("subCost", sql.Decimal(18, 2), totalSubCost).input("withdrawals", sql.Decimal(18, 2), totalWithdrawals)
            .input("balance", sql.Decimal(18, 2), balance).input("risk", sql.VarChar(50), riskLevel)
            .input("income", sql.Decimal(18, 2), totalIncome).input("expenses", sql.Decimal(18, 2), totalWithdrawals)
            .input("savings", sql.Decimal(18, 2), savings).input("riskFlag", sql.VarChar(50), riskLevel)
            .query("INSERT INTO FinancialReport (mainMemberID, scoreID, startDate, endDate, totalSubscriptionCost, totalWithdrawals, remainingBalance, riskLevel, income, expenses, savings, riskFlagStatus) OUTPUT INSERTED.reportID VALUES (@mmID, @scoreID, @startDate, @endDate, @subCost, @withdrawals, @balance, @risk, @income, @expenses, @savings, @riskFlag)");
        await p.request()
            .input("subID", sql.Int, req.user.subscriberID).input("genDate", sql.Date, new Date().toISOString().slice(0, 10))
            .input("startDate", sql.Date, startStr).input("endDate", sql.Date, endStr)
            .input("subCost", sql.Decimal(18, 2), totalSubCost).input("totalSpend", sql.Decimal(18, 2), totalWithdrawals)
            .input("catJson", sql.VarChar(sql.MAX), JSON.stringify(categories))
            .input("subBreak", sql.VarChar(sql.MAX), JSON.stringify(categories))
            .input("txList", sql.VarChar(sql.MAX), JSON.stringify(transactions.slice(0, 100)))
            .query("INSERT INTO SpendingReport (subscriberID, reportDateGenerate, startDate, endDate, totalSubscriptionCost, totalSpending, spendingPerCategory, subscriptionBreakdown, transactionList) VALUES (@subID, @genDate, @startDate, @endDate, @subCost, @totalSpend, @catJson, @subBreak, @txList)");
        res.status(201).json({ success: true, data: { reportID: insertResult.recordset[0].reportID, period: { start: startStr, end: endStr }, reportType: reportType || 'Detailed', walletBalance: balance, totalSubscriptionCost: totalSubCost, totalWithdrawals: totalWithdrawals, totalIncome: totalIncome, savings: savings, riskLevel: riskLevel, scribeScore: scribeScore, goals: goals, categories: categories, transactions: transactions.slice(0, 50), transactionCount: transactions.length } });
    } catch (error) {
        console.error("Compile report error:", error);
        res.status(500).json({ success: false, message: "Could not compile report" });
    }
});

app.get("/reports", authenticate, async (req, res) => {
    try {
        var p = await getPool();
        var result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT reportID, startDate, endDate, totalSubscriptionCost, totalWithdrawals, remainingBalance, riskLevel, income, expenses, savings FROM FinancialReport WHERE mainMemberID = @subID ORDER BY endDate DESC");
        var data = result.recordset.map(function(r) { return { id: r.reportID, startDate: r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : '', endDate: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : '', totalSubscriptionCost: r.totalSubscriptionCost || 0, totalWithdrawals: r.totalWithdrawals || 0, balance: r.remainingBalance || 0, riskLevel: r.riskLevel || 'low', income: r.income || 0, expenses: r.expenses || 0, savings: r.savings || 0 }; });
        res.json({ success: true, data: data });
    } catch (error) {
        console.error("Get reports error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve reports" });
    }
});

/* ===========================================================
   BANK STATEMENTS
   Schema: BankStatement(statementID PK, subscriberID FK, uploadDate, fileReference,
           statementPeriodStart, statementPeriodEnd, totalIncome, totalExpenses,
           netCashFlow, transactionCount, parsedData, financialStatus, monthlyBreakdown)
   Rules: 1 upload per year per user. +100 ScribeScore on upload.
=========================================================== */
const multer = require("multer");
const pdfParse = require("pdf-parse");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Parse CSV text into transaction objects */
function _parseCSV(text) {
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
    if (lines.length < 2) return [];
    // Detect header
    var header = lines[0].toLowerCase();
    var hasHeader = header.includes('date') || header.includes('description') || header.includes('amount');
    var startIdx = hasHeader ? 1 : 0;
    var transactions = [];
    for (var i = startIdx; i < lines.length; i++) {
        var parts = lines[i].split(',');
        if (parts.length < 3) continue;
        var date = parts[0].trim().replace(/"/g, '');
        var description = parts[1].trim().replace(/"/g, '');
        var amountStr = parts[2].trim().replace(/"/g, '').replace(/\s/g, '');
        var amount = parseFloat(amountStr) || 0;
        if (amount === 0 && parts.length >= 4) {
            amountStr = parts[3].trim().replace(/"/g, '').replace(/\s/g, '');
            amount = parseFloat(amountStr) || 0;
        }
        if (date && description) {
            transactions.push({ date: date, description: description, amount: amount });
        }
    }
    return transactions;
}

/** Parse PDF buffer into transaction objects */
async function _parsePDF(buffer) {
    var data = await pdfParse(buffer);
    var text = data.text || '';
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
    var transactions = [];
    // Look for lines with date patterns and amounts
    var datePattern = /(\d{4}[\/-]\d{2}[\/-]\d{2}|\d{2}[\/-]\d{2}[\/-]\d{4}|\d{2}\s+\w+\s+\d{4})/;
    var amountPattern = /(-?\d[\d\s]*[.,]\d{2})/;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        var dateMatch = line.match(datePattern);
        var amountMatch = line.match(amountPattern);
        if (dateMatch && amountMatch) {
            var date = dateMatch[1];
            var amtStr = amountMatch[1].replace(/\s/g, '').replace(',', '.');
            var amount = parseFloat(amtStr) || 0;
            var desc = line.replace(dateMatch[0], '').replace(amountMatch[0], '').trim();
            desc = desc.replace(/^[\s,\-]+|[\s,\-]+$/g, '') || 'Transaction';
            transactions.push({ date: date, description: desc, amount: amount });
        }
    }
    return transactions;
}

/** Analyze transactions and build report */
function _analyzeTransactions(transactions, subscriptionCost) {
    var totalIncome = 0;
    var totalExpenses = 0;
    var monthlyMap = {};
    transactions.forEach(function(t) {
        if (t.amount > 0) totalIncome += t.amount;
        else totalExpenses += Math.abs(t.amount);
        // Group by month
        var monthKey = (t.date || '').substring(0, 7) || 'unknown';
        if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { income: 0, expenses: 0 };
        if (t.amount > 0) monthlyMap[monthKey].income += t.amount;
        else monthlyMap[monthKey].expenses += Math.abs(t.amount);
    });
    // Factor in FlexScribe subscription cost
    var months = Object.keys(monthlyMap).length || 1;
    totalExpenses += subscriptionCost * months;
    Object.keys(monthlyMap).forEach(function(k) {
        monthlyMap[k].expenses += subscriptionCost;
        monthlyMap[k].flexscribeCost = subscriptionCost;
    });
    var netCashFlow = totalIncome - totalExpenses;
    // Determine financial status
    var financialStatus = 'safe';
    if (totalIncome > 0) {
        var savingsRate = netCashFlow / totalIncome;
        if (savingsRate < 0) financialStatus = 'danger';
        else if (savingsRate < 0.2) financialStatus = 'warning';
    } else if (totalExpenses > 0) {
        financialStatus = 'danger';
    }
    // Period
    var dates = transactions.map(function(t) { return t.date; }).filter(Boolean).sort();
    var periodStart = dates[0] || null;
    var periodEnd = dates[dates.length - 1] || null;
    return {
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netCashFlow: Math.round(netCashFlow * 100) / 100,
        transactionCount: transactions.length,
        financialStatus: financialStatus,
        periodStart: periodStart,
        periodEnd: periodEnd,
        monthlyBreakdown: monthlyMap,
        transactions: transactions
    };
}

// POST /bank-statements/upload
app.post("/bank-statements/upload", authenticate, upload.single("statement"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
        var ext = (req.file.originalname || '').split('.').pop().toLowerCase();
        if (ext !== 'csv' && ext !== 'pdf') {
            return res.status(400).json({ success: false, message: "Only PDF and CSV files are accepted" });
        }
        var p = await getPool();
        // Check once-per-year rule
        var recent = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT statementID, uploadDate FROM BankStatement WHERE subscriberID = @subID AND uploadDate >= DATEADD(year, -1, GETDATE()) ORDER BY uploadDate DESC");
        if (recent.recordset.length > 0) {
            var lastDate = new Date(recent.recordset[0].uploadDate).toISOString().slice(0, 10);
            return res.status(409).json({ success: false, message: "You already uploaded a statement on " + lastDate + ". You can upload again after one year." });
        }
        // Parse file
        var transactions = [];
        if (ext === 'csv') {
            var csvText = req.file.buffer.toString('utf-8');
            transactions = _parseCSV(csvText);
        } else {
            transactions = await _parsePDF(req.file.buffer);
        }
        if (transactions.length === 0) {
            return res.status(422).json({ success: false, message: "Could not extract any transactions from the file. Please check the format." });
        }
        // Get user's subscription cost for financial analysis
        var subCostResult = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT ISNULL(SUM(billingAmount), 0) AS totalSubs FROM Subscription WHERE subscriberID = @subID AND subStatus = 'active'");
        var subscriptionCost = subCostResult.recordset[0].totalSubs || 0;
        // Analyze
        var report = _analyzeTransactions(transactions, subscriptionCost);
        // Store in BankStatement
        await p.request()
            .input("subID", sql.Int, req.user.subscriberID)
            .input("uploadDate", sql.Date, new Date().toISOString().slice(0, 10))
            .input("fileRef", sql.VarChar(500), req.file.originalname)
            .input("periodStart", sql.Date, report.periodStart)
            .input("periodEnd", sql.Date, report.periodEnd)
            .input("totalIncome", sql.Decimal(18, 2), report.totalIncome)
            .input("totalExpenses", sql.Decimal(18, 2), report.totalExpenses)
            .input("netCashFlow", sql.Decimal(18, 2), report.netCashFlow)
            .input("txCount", sql.Int, report.transactionCount)
            .input("parsedData", sql.NVarChar(sql.MAX), JSON.stringify(report.transactions))
            .input("status", sql.VarChar(50), report.financialStatus)
            .input("monthly", sql.NVarChar(sql.MAX), JSON.stringify(report.monthlyBreakdown))
            .query(`INSERT INTO BankStatement (subscriberID, uploadDate, fileReference, statementPeriodStart, statementPeriodEnd, totalIncome, totalExpenses, netCashFlow, transactionCount, parsedData, financialStatus, monthlyBreakdown)
                    VALUES (@subID, @uploadDate, @fileRef, @periodStart, @periodEnd, @totalIncome, @totalExpenses, @netCashFlow, @txCount, @parsedData, @status, @monthly)`);
        // Increment ScribeScore by 100
        var existingScore = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT scoreID, scoreValue FROM ScribeScore WHERE subscriberID = @subID ORDER BY generateDate DESC");
        if (existingScore.recordset.length > 0) {
            var currentScore = existingScore.recordset[0].scoreValue || 0;
            await p.request().input("id", sql.Int, existingScore.recordset[0].scoreID)
                .input("newScore", sql.Decimal(10, 4), currentScore + 100)
                .input("genDate", sql.Date, new Date().toISOString().slice(0, 10))
                .query("UPDATE ScribeScore SET scoreValue = @newScore, generateDate = @genDate WHERE scoreID = @id");
        } else {
            await p.request().input("subID", sql.Int, req.user.subscriberID)
                .input("score", sql.Decimal(10, 4), 100)
                .input("genDate", sql.Date, new Date().toISOString().slice(0, 10))
                .query("INSERT INTO ScribeScore (subscriberID, scoreValue, generateDate) VALUES (@subID, @score, @genDate)");
        }
        res.status(201).json({
            success: true,
            data: {
                totalIncome: report.totalIncome,
                totalExpenses: report.totalExpenses,
                netCashFlow: report.netCashFlow,
                transactionCount: report.transactionCount,
                financialStatus: report.financialStatus,
                periodStart: report.periodStart,
                periodEnd: report.periodEnd,
                monthlyBreakdown: report.monthlyBreakdown,
                subscriptionImpact: subscriptionCost,
                scribeScoreBonus: 100
            }
        });
    } catch (error) {
        console.error("Bank statement upload error:", error);
        res.status(500).json({ success: false, message: "Could not process bank statement" });
    }
});

// GET /bank-statements/report
app.get("/bank-statements/report", authenticate, async (req, res) => {
    try {
        var p = await getPool();
        var result = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT statementID, uploadDate, fileReference, statementPeriodStart, statementPeriodEnd, totalIncome, totalExpenses, netCashFlow, transactionCount, parsedData, financialStatus, monthlyBreakdown FROM BankStatement WHERE subscriberID = @subID ORDER BY uploadDate DESC");
        if (result.recordset.length === 0) {
            return res.json({ success: true, data: null });
        }
        var row = result.recordset[0];
        var parsedData = [];
        var monthlyBreakdown = {};
        try { parsedData = JSON.parse(row.parsedData || '[]'); } catch (e) {}
        try { monthlyBreakdown = JSON.parse(row.monthlyBreakdown || '{}'); } catch (e) {}
        // Get current subscription cost for context
        var subCostResult = await p.request().input("subID", sql.Int, req.user.subscriberID)
            .query("SELECT ISNULL(SUM(billingAmount), 0) AS totalSubs FROM Subscription WHERE subscriberID = @subID AND subStatus = 'active'");
        res.json({
            success: true,
            data: {
                statementID: row.statementID,
                uploadDate: row.uploadDate ? new Date(row.uploadDate).toISOString().slice(0, 10) : null,
                fileReference: row.fileReference,
                periodStart: row.statementPeriodStart ? new Date(row.statementPeriodStart).toISOString().slice(0, 10) : null,
                periodEnd: row.statementPeriodEnd ? new Date(row.statementPeriodEnd).toISOString().slice(0, 10) : null,
                totalIncome: row.totalIncome || 0,
                totalExpenses: row.totalExpenses || 0,
                netCashFlow: row.netCashFlow || 0,
                transactionCount: row.transactionCount || 0,
                financialStatus: row.financialStatus || 'unknown',
                transactions: parsedData,
                monthlyBreakdown: monthlyBreakdown,
                subscriptionImpact: subCostResult.recordset[0].totalSubs || 0
            }
        });
    } catch (error) {
        console.error("Bank statement report error:", error);
        res.status(500).json({ success: false, message: "Could not retrieve report" });
    }
});

/* ===========================================================
   START SERVER
=========================================================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, function() {
    console.log("FlexScribe backend running on http://localhost:" + PORT);
});
