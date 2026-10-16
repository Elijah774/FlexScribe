/* ===========================================================
   /api/subscriptions — CRUD for user subscriptions
=========================================================== */
const express = require('express');
const { sql, query, getPool } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { updateUserAnalytics } = require('../helpers/update-analytics');
const notificationEvents = require('../services/notificationEvents');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES, ENTITY_TYPES } = require('../constants/notificationTypes');
const scribeScore = require('../helpers/scribe-score');

const router = express.Router();
router.use(authenticateToken);

/** Round to 2dp (avoid float drift on money). */
function money(n) {
    return Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100;
}
/** Reference like FS-SUB-000123. */
function makeReference(prefix, id) {
    return `FS-${prefix}-${String(id).padStart(6, '0')}`;
}
/** Normalise a billing amount to its monthly-equivalent charge. */
function monthlyCharge(amount, cycle) {
    const a = parseFloat(amount) || 0;
    switch (cycle) {
        case 'weekly':    return money(a * 52 / 12);
        case 'quarterly': return money(a / 3);
        case 'yearly':    return money(a / 12);
        default:          return money(a); // monthly
    }
}

// GET /api/subscriptions
router.get('/', async (req, res) => {
    try {
        const result = await query(`
            SELECT s.*, c.categoryName
            FROM Subscription s
            JOIN SubscriptionCategory c ON s.categoryID = c.categoryID
            WHERE s.subscriberID = @id
            ORDER BY s.createdAt DESC
        `, { id: req.user.subscriberID });
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/subscriptions/stats
router.get('/stats', async (req, res) => {
    try {
        const subs = await query(`
            SELECT s.*, c.categoryName
            FROM Subscription s
            JOIN SubscriptionCategory c ON s.categoryID = c.categoryID
            WHERE s.subscriberID = @id
        `, { id: req.user.subscriberID });

        const all = subs.recordset;
        const active = all.filter(s => s.subStatus === 'active');
        const monthly = active.reduce((sum, s) => {
            let amt = parseFloat(s.billingAmount);
            if (s.billingCycle === 'weekly') amt = amt * 52 / 12;
            else if (s.billingCycle === 'quarterly') amt = amt / 3;
            else if (s.billingCycle === 'yearly') amt = amt / 12;
            return sum + amt;
        }, 0);

        res.json({
            activeCount: active.length,
            totalCount: all.length,
            monthly: monthly.toFixed(2),
            annual: (monthly * 12).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/subscriptions
router.post('/', async (req, res) => {
    try {
        const { serviceName, categoryID, billingAmount, billingCycle, billingDate, notes, logoClass, logoText, colorTag, reminderDays, providerUrl } = req.body;

        if (!serviceName || !billingAmount) {
            return res.status(400).json({ error: 'Service name and amount are required.' });
        }

        // Prevent duplicate subscriptions for the same user (case-insensitive
        // match on the trimmed service name).
        const dupe = await query(
            `SELECT TOP 1 subscriptionID FROM Subscription
             WHERE subscriberID = @subscriberID
               AND LOWER(LTRIM(RTRIM(serviceName))) = LOWER(LTRIM(RTRIM(@serviceName)))`,
            { subscriberID: req.user.subscriberID, serviceName }
        );
        if (dupe.recordset.length > 0) {
            return res.status(409).json({ error: `You already have a "${serviceName}" subscription.` });
        }

        const result = await query(`
            INSERT INTO Subscription (subscriberID, categoryID, serviceName, billingAmount, billingCycle, billingDate, notes, logoClass, logoText, colorTag, reminderDays, providerUrl)
            OUTPUT INSERTED.*
            VALUES (@subscriberID, @categoryID, @serviceName, @billingAmount, @billingCycle, @billingDate, @notes, @logoClass, @logoText, @colorTag, @reminderDays, @providerUrl)
        `, {
            subscriberID: req.user.subscriberID,
            categoryID: categoryID || 12, // 'Other'
            serviceName, billingAmount,
            billingCycle: billingCycle || 'monthly',
            billingDate: billingDate || null,
            notes: notes || null,
            logoClass: logoClass || null,
            logoText: logoText || null,
            colorTag: colorTag || null,
            reminderDays: reminderDays || null,
            providerUrl: providerUrl || null
        });

        const created = result.recordset[0];
        res.status(201).json(created);
        updateUserAnalytics(req.user.subscriberID);
        // Fire-and-forget notification (never blocks the response)
        notificationEvents.subscriptionAdded(req.user.subscriberID, created);
        // Scribe Score: +10 once for adding a valid subscription (Subscription Management).
        scribeScore.awardSubAdded(req.user.subscriberID, created.subscriptionID)
            .catch(e => console.error('[score] sub_added:', e.message));
    } catch (err) {
        // Unique-index violation (duplicate subscription) → friendly 409.
        if (err && (err.number === 2601 || err.number === 2627)) {
            return res.status(409).json({ error: 'You already have this subscription.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/subscriptions/:id
router.put('/:id', async (req, res) => {
    try {
        const { serviceName, categoryID, billingAmount, billingCycle, billingDate, subStatus, notes, logoClass, logoText, colorTag, reminderDays, providerUrl } = req.body;

        // Build dynamic SET clause — only update fields that were actually sent
        const sets = [];
        const params = {
            subID: parseInt(req.params.id),
            subscriberID: req.user.subscriberID
        };

        if (serviceName !== undefined && serviceName !== null) { sets.push('serviceName = @serviceName'); params.serviceName = serviceName; }
        if (categoryID !== undefined && categoryID !== null) { sets.push('categoryID = @categoryID'); params.categoryID = parseInt(categoryID); }
        if (billingAmount !== undefined && billingAmount !== null) { sets.push('billingAmount = @billingAmount'); params.billingAmount = parseFloat(billingAmount); }
        if (billingCycle !== undefined && billingCycle !== null) { sets.push('billingCycle = @billingCycle'); params.billingCycle = billingCycle; }
        if (billingDate !== undefined) { sets.push('billingDate = @billingDate'); params.billingDate = billingDate || null; }
        if (subStatus !== undefined && subStatus !== null && subStatus !== '') { sets.push('subStatus = @subStatus'); params.subStatus = subStatus; }
        if (notes !== undefined) { sets.push('notes = @notes'); params.notes = notes || null; }
        if (logoClass !== undefined) { sets.push('logoClass = @logoClass'); params.logoClass = logoClass || null; }
        if (logoText !== undefined) { sets.push('logoText = @logoText'); params.logoText = logoText || null; }
        if (colorTag !== undefined) { sets.push('colorTag = @colorTag'); params.colorTag = colorTag || null; }
        if (reminderDays !== undefined) { sets.push('reminderDays = @reminderDays'); params.reminderDays = reminderDays ? parseInt(reminderDays) : null; }
        if (providerUrl !== undefined) { sets.push('providerUrl = @providerUrl'); params.providerUrl = providerUrl || null; }

        sets.push('updatedAt = GETDATE()');

        await query(`
            UPDATE Subscription SET ${sets.join(', ')}
            WHERE subscriptionID = @subID AND subscriberID = @subscriberID
        `, params);

        res.json({ message: 'Subscription updated' });
        updateUserAnalytics(req.user.subscriberID);

        // Scribe Score (Subscription Management):
        //   • A meaningful change to core details -> +5 (max once/sub/month).
        //   • A genuine cancellation (status -> cancelled) -> +10 (once/sub).
        const meaningful = [serviceName, categoryID, billingAmount, billingCycle, billingDate]
            .some(v => v !== undefined && v !== null && v !== '');
        if (subStatus === 'cancelled') {
            scribeScore.awardSubCancelled(req.user.subscriberID, params.subID)
                .catch(e => console.error('[score] sub_cancelled:', e.message));
        } else if (meaningful) {
            scribeScore.awardSubUpdated(req.user.subscriberID, params.subID)
                .catch(e => console.error('[score] sub_updated:', e.message));
        }

        // Resolve the service name for the notification (from body or DB)
        (async () => {
            let name = serviceName;
            if (!name) {
                const row = await query(
                    'SELECT serviceName FROM Subscription WHERE subscriptionID = @subID AND subscriberID = @sid',
                    { subID: params.subID, sid: req.user.subscriberID }
                );
                name = row.recordset[0] ? row.recordset[0].serviceName : null;
            }
            notificationEvents.subscriptionUpdated(req.user.subscriberID, params.subID, name);
        })().catch(e => console.error('[subscriptions] update notification error:', e.message));
    } catch (err) {
        console.error('Subscription update error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/subscriptions/:id
router.delete('/:id', async (req, res) => {
    try {
        const subID = parseInt(req.params.id);

        // Capture details BEFORE deleting so we can notify with the name/date
        const existing = await query(
            'SELECT serviceName, billingDate FROM Subscription WHERE subscriptionID = @id AND subscriberID = @subscriberID',
            { id: subID, subscriberID: req.user.subscriberID }
        );

        await query('DELETE FROM Subscription WHERE subscriptionID = @id AND subscriberID = @subscriberID', {
            id: subID,
            subscriberID: req.user.subscriberID
        });
        res.json({ message: 'Subscription deleted' });
        updateUserAnalytics(req.user.subscriberID);

        if (existing.recordset[0]) {
            const row = existing.recordset[0];
            const finalDate = row.billingDate ? new Date(row.billingDate).toISOString().slice(0, 10) : null;
            notificationEvents.subscriptionCancelled(req.user.subscriberID, subID, row.serviceName, finalDate);
            // Scribe Score: +10 once for recording a genuine cancellation.
            scribeScore.awardSubCancelled(req.user.subscriberID, subID)
                .catch(e => console.error('[score] sub_cancelled:', e.message));
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/subscriptions/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
    try {
        const subID = parseInt(req.params.id);
        await query(`
            UPDATE Subscription SET
                subStatus = CASE WHEN subStatus = 'active' THEN 'paused' ELSE 'active' END,
                updatedAt = GETDATE()
            WHERE subscriptionID = @id AND subscriberID = @subscriberID
        `, { id: subID, subscriberID: req.user.subscriberID });

        res.json({ message: 'Subscription toggled' });
        updateUserAnalytics(req.user.subscriberID);

        // Read the resulting state and only notify on transition to 'paused'
        (async () => {
            const row = await query(
                'SELECT serviceName, subStatus FROM Subscription WHERE subscriptionID = @id AND subscriberID = @sid',
                { id: subID, sid: req.user.subscriberID }
            );
            const sub = row.recordset[0];
            if (sub && sub.subStatus === 'paused') {
                notificationEvents.subscriptionPaused(req.user.subscriberID, subID, sub.serviceName);
            }
        })().catch(e => console.error('[subscriptions] toggle notification error:', e.message));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================================================
   POST /api/subscriptions/pay-month
   Pays this month's active subscriptions from the wallet, records
   each payment, then adjusts the ScribeScore from the ACTUAL result
   (the server decides paid-vs-unpaid — the client is not trusted):
     • every active subscription paid this month -> +10 (once/month)
     • one or more left unpaid (e.g. not enough funds) -> -10 (once/month)

   For each active sub not already paid this month it debits the
   wallet by the monthly-equivalent charge and writes a PaymentSchedule
   'paid' row + a wallet 'payment' transaction. Subs that can't be
   covered stay unpaid. Everything runs in one SQL transaction.
=========================================================== */
router.post('/pay-month', async (req, res) => {
    const subscriberID = req.user.subscriberID;
    let transaction;
    try {
        const pool = await getPool();
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const rq = () => new sql.Request(transaction);

        // Active subscriptions for this user.
        const subsRes = await rq()
            .input('sid', subscriberID)
            .query(`SELECT subscriptionID, serviceName, billingAmount, billingCycle
                    FROM Subscription WHERE subscriberID = @sid AND subStatus = 'active'`);
        const subs = subsRes.recordset;

        if (subs.length === 0) {
            await transaction.rollback();
            const score = await scribeScore.getScore(subscriberID);
            return res.json({ success: true, outcome: 'no_subscriptions', message: 'You have no active subscriptions to pay.', scribeScore: score, delta: 0, paidCount: 0, unpaidCount: 0 });
        }

        // Lock the wallet.
        const wRes = await rq()
            .input('sid', subscriberID)
            .query('SELECT walletID, balance FROM VirtualWallet WITH (UPDLOCK, HOLDLOCK) WHERE subscriberID = @sid');
        const wallet = wRes.recordset[0];
        if (!wallet) { await transaction.rollback(); return res.status(404).json({ success: false, error: 'Wallet not found' }); }

        let balance = parseFloat(wallet.balance) || 0;
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        let paidCount = 0;
        let unpaidCount = 0;
        const paidSubIds = [];   // subs that completed a verified payment this run
        const unpaidSubIds = []; // subs whose payment was missed this run

        for (const s of subs) {
            // Already paid this month?
            const already = await rq()
                .input('subid', s.subscriptionID)
                .input('mstart', monthStart)
                .query(`SELECT TOP 1 scheduleID FROM PaymentSchedule
                        WHERE subscriptionID = @subid AND scheduleStatus = 'paid'
                          AND nextPaymentDate >= @mstart`);
            if (already.recordset.length) { paidCount++; continue; }

            const charge = monthlyCharge(s.billingAmount, s.billingCycle);
            if (charge <= 0) { paidCount++; continue; } // nothing to charge

            if (balance >= charge) {
                const before = balance;
                const after = money(balance - charge);
                balance = after;

                await rq()
                    .input('bal', after).input('wid', wallet.walletID)
                    .query('UPDATE VirtualWallet SET balance = @bal WHERE walletID = @wid');

                const txIns = await rq()
                    .input('wid', wallet.walletID)
                    .input('amt', charge)
                    .input('after', after)
                    .input('before', before)
                    .input('desc', 'Subscription payment — ' + s.serviceName)
                    .query(`INSERT INTO WalletTransaction
                        (walletID, transactionType, transactionAmount, runningBalance,
                         balanceBefore, balanceAfter, status, description, category, completedAt)
                        OUTPUT INSERTED.transactionID
                        VALUES (@wid, 'payment', @amt, @after, @before, @after, 'completed', @desc, 'subscription', GETDATE())`);
                const txID = txIns.recordset[0].transactionID;
                await rq()
                    .input('ref', makeReference('SUB', txID)).input('id', txID)
                    .query('UPDATE WalletTransaction SET reference = @ref WHERE transactionID = @id');

                await rq()
                    .input('subid', s.subscriptionID)
                    .input('amt', charge)
                    .query(`INSERT INTO PaymentSchedule (subscriptionID, nextPaymentDate, amountDue, scheduleStatus)
                            VALUES (@subid, CAST(GETDATE() AS DATE), @amt, 'paid')`);
                paidCount++;
                paidSubIds.push(s.subscriptionID);
            } else {
                unpaidCount++;
                unpaidSubIds.push(s.subscriptionID);
            }
        }

        await transaction.commit();

        // The server decides the outcome from what actually got paid.
        const allPaid = unpaidCount === 0;
        const scoreRes = await scribeScore.evaluateSubscriptionPayment(subscriberID, allPaid);

        // Payment Readiness (300): each subscription that had funds ready and
        // completed a verified payment this cycle earns +10 ready and +10
        // success (idempotent per sub per month, capped at the category max).
        const period = scribeScore.monthKey();
        for (const subId of paidSubIds) {
            try {
                await scribeScore.awardPaymentReady(subscriberID, subId, period);
                await scribeScore.awardPaymentSuccess(subscriberID, subId, period);
            } catch (e) { console.error('[score] payment award:', e.message); }
        }

        // Conduct-based DECREASE: each subscription whose payment was missed
        // this cycle deducts points (idempotent per sub per month). This is a
        // genuine missed-commitment penalty — the score moves down for poor
        // conduct, not merely for having a low balance.
        let missedDelta = 0;
        for (const subId of unpaidSubIds) {
            try {
                const r = await scribeScore.awardPaymentMissed(subscriberID, subId, period);
                if (r.applied) missedDelta += r.delta;
            } catch (e) { console.error('[score] payment missed:', e.message); }
        }

        // Notify the user when their Scribe Score drops from missed payments
        // (post-award; fire-and-forget so a notification hiccup never fails
        // the payment run). Deduped per month via the eventToken.
        if (missedDelta < 0) {
            try {
                const scoreNow = await scribeScore.getScore(subscriberID);
                await notificationService.createNotification({
                    subscriberID,
                    type: NOTIFICATION_TYPES.SYSTEM,
                    title: 'Scribe Score dropped',
                    message: `${unpaidCount} subscription payment${unpaidCount === 1 ? '' : 's'} missed — your Scribe Score dropped ${missedDelta} to ${scoreNow}. Top up your wallet to stay payment-ready.`,
                    relatedEntityType: ENTITY_TYPES.NONE,
                    eventToken: `score_drop#${period}`,
                    metadata: { delta: missedDelta, score: scoreNow, unpaidCount }
                });
            } catch (nErr) {
                console.warn('[score] drop notification failed:', nErr.message);
            }
        }

        updateUserAnalytics(subscriberID);

        let message;
        if (allPaid) {
            message = scoreRes.applied
                ? 'All subscriptions paid for the month — ScribeScore +10.'
                : 'All subscriptions paid. (ScribeScore already updated this month.)';
        } else if (missedDelta < 0) {
            message = `${unpaidCount} subscription(s) couldn't be paid — ScribeScore ${missedDelta}.`;
        } else {
            message = `${unpaidCount} subscription(s) unpaid. (ScribeScore already updated this month.)`;
        }

        // Authoritative post-award score + net delta for the client toast
        // (+10 all-paid bonus if applied, plus any missed-payment penalty).
        const finalScore = await scribeScore.getScore(subscriberID);
        const netDelta = (allPaid && scoreRes.applied ? scoreRes.delta : 0) + missedDelta;
        res.json({
            success: true,
            outcome: allPaid ? 'all_paid' : 'unpaid',
            message,
            // Exact, user-facing message when one or more subscriptions could
            // not be charged because the available wallet balance was too low.
            // No money was deducted for those — the charge was blocked, not
            // partially applied.
            insufficientFundsMessage: unpaidCount > 0
                ? 'Insufficient wallet funds. You do not have enough available money to cover this subscription. Please request funds from your main member or wait until you have earned sufficient rewards or received your allowance.'
                : undefined,
            allPaid,
            paidCount,
            unpaidCount,
            walletBalance: balance,
            scribeScore: finalScore,
            delta: netDelta,
            applied: (allPaid && scoreRes.applied) || missedDelta < 0
        });
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) { /* already rolled back */ } }
        console.error('POST /subscriptions/pay-month error:', err.message);
        res.status(500).json({ success: false, error: 'Could not process subscription payments. No money was moved.' });
    }
});

module.exports = router;
