/* ===========================================================
   Helper: Update UserAnalytics & ScribeScore for a subscriber
   Called after any financial change (subscription, wallet, goal)
=========================================================== */
const { query } = require('../db');

async function updateUserAnalytics(subscriberID) {
    try {
        const sid = parseInt(subscriberID);
        if (!sid) { console.error('updateUserAnalytics: invalid subscriberID', subscriberID); return; }
        console.log('updateUserAnalytics: calculating for subscriberID', sid);

        // 1. Calculate subscription efficiency (% of budget used by active subs)
        const subsResult = await query(`
            SELECT
                COUNT(*) AS totalSubs,
                SUM(CASE WHEN subStatus = 'active' THEN 1 ELSE 0 END) AS activeSubs,
                ISNULL(SUM(CASE WHEN subStatus = 'active' THEN
                    CASE billingCycle
                        WHEN 'weekly' THEN billingAmount * 4.33
                        WHEN 'monthly' THEN billingAmount
                        WHEN 'quarterly' THEN billingAmount / 3
                        WHEN 'yearly' THEN billingAmount / 12
                        ELSE billingAmount
                    END
                ELSE 0 END), 0) AS monthlyCost
            FROM Subscription WHERE subscriberID = @sid
        `, { sid });

        const { totalSubs, activeSubs, monthlyCost } = subsResult.recordset[0];

        // 2. Calculate wallet/savings info
        const walletResult = await query(`
            SELECT ISNULL(balance, 0) AS balance FROM VirtualWallet WHERE subscriberID = @sid
        `, { sid });
        const balance = walletResult.recordset.length > 0 ? parseFloat(walletResult.recordset[0].balance) : 0;

        // Total income (credits) in last 30 days
        const incomeResult = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS totalIncome
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid AND t.transactionType = 'credit'
              AND t.transactionDate >= DATEADD(DAY, -30, GETDATE())
        `, { sid });
        const totalIncome = parseFloat(incomeResult.recordset[0].totalIncome);

        // Total spending (debits) in last 30 days
        const spendResult = await query(`
            SELECT ISNULL(SUM(t.transactionAmount), 0) AS totalSpent
            FROM WalletTransaction t
            JOIN VirtualWallet w ON t.walletID = w.walletID
            WHERE w.subscriberID = @sid AND t.transactionType IN ('debit', 'transfer')
              AND t.transactionDate >= DATEADD(DAY, -30, GETDATE())
        `, { sid });
        const totalSpent = parseFloat(spendResult.recordset[0].totalSpent);

        // 3. Calculate goals progress
        const goalsResult = await query(`
            SELECT
                COUNT(*) AS totalGoals,
                SUM(CASE WHEN goalStatus = 'completed' THEN 1 ELSE 0 END) AS completedGoals,
                ISNULL(SUM(currentProgress), 0) AS totalSaved,
                ISNULL(SUM(targetAmount), 0) AS totalTarget
            FROM FinancialGoal WHERE subscriberID = @sid
        `, { sid });
        const { totalGoals, completedGoals, totalSaved, totalTarget } = goalsResult.recordset[0];

        // 4. Calculate score components (0-100 each)
        // Subscription efficiency: lower monthly cost relative to income = better
        const subscriptionPct = totalIncome > 0
            ? Math.max(0, Math.min(100, Math.round((1 - (parseFloat(monthlyCost) / totalIncome)) * 100)))
            : (parseFloat(monthlyCost) === 0 ? 100 : 50);

        // Budget/spending discipline: spending less than income = better
        const budgetPct = totalIncome > 0
            ? Math.max(0, Math.min(100, Math.round((1 - (totalSpent / totalIncome)) * 100)))
            : (totalSpent === 0 ? 100 : 50);

        // Savings: progress toward goals
        const savingsPct = parseFloat(totalTarget) > 0
            ? Math.max(0, Math.min(100, parseFloat(((parseFloat(totalSaved) / parseFloat(totalTarget)) * 100).toFixed(2))))
            : 0;

        // Runway: how many months the current wallet balance covers at the
        // recent (~30-day) monthly spend. 3+ months of buffer = full marks.
        // No spend with a positive balance = full marks; no spend and no
        // balance = unknown (50, matching the other no-data defaults).
        // Computed in memory only — not persisted as a ScribeScore column.
        const RUNWAY_TARGET_MONTHS = 3;
        let runwayPct;
        if (totalSpent > 0) {
            const runwayMonths = balance / totalSpent;
            runwayPct = Math.max(0, Math.min(100, Math.round((runwayMonths / RUNWAY_TARGET_MONTHS) * 100)));
        } else {
            runwayPct = balance > 0 ? 100 : 50;
        }

        // Overall score — four equally-weighted factors (0.25 each)
        const scoreValue = Math.round(
            subscriptionPct * 0.25 +
            budgetPct       * 0.25 +
            savingsPct      * 0.25 +
            runwayPct       * 0.25
        );

        // Risk score (inverse of financial health — higher = more risky)
        const riskScore = Math.max(0, Math.min(100, 100 - scoreValue));

        // 5. Get member type
        const memberResult = await query(`
            SELECT userType FROM Subscriber WHERE subscriberID = @sid
        `, { sid });
        const memberType = memberResult.recordset.length > 0 ? memberResult.recordset[0].userType : 'MainMember';

        // 6. Upsert ScribeScore
        const existingScore = await query(`
            SELECT scoreID FROM ScribeScore WHERE subscriberID = @sid
        `, { sid });

        // NOTE: scoreValue (the ScribeScore) is now a conduct-based, event
        // driven points total owned by helpers/scribe-score.js and stored on
        // Subscriber.scribeScore. This routine must NOT overwrite it — it only
        // refreshes the breakdown percentages used for the detailed view.
        let scoreID;
        if (existingScore.recordset.length > 0) {
            scoreID = existingScore.recordset[0].scoreID;
        } else {
            // Seed a row with the user's current authoritative score (not 0).
            const curRes = await query('SELECT scribeScore FROM Subscriber WHERE subscriberID = @sid', { sid });
            const seed = curRes.recordset.length ? (parseInt(curRes.recordset[0].scribeScore) || 0) : 0;
            const insertResult = await query(`
                INSERT INTO ScribeScore (subscriberID, scoreValue)
                OUTPUT INSERTED.scoreID
                VALUES (@sid, @seed)
            `, { sid, seed });
            scoreID = insertResult.recordset[0].scoreID;
        }

        // Update only the breakdown percentages — leave scoreValue untouched.
        await query(`
            UPDATE ScribeScore SET
                subscriptionPct = @subPct,
                budgetPct = @budPct,
                savingsPct = @savPct,
                generatedAt = GETDATE()
            WHERE scoreID = @scoreID
        `, { scoreID, subPct: parseFloat(subscriptionPct.toFixed(2)), budPct: parseFloat(budgetPct.toFixed(2)), savPct: parseFloat(savingsPct.toFixed(2)) });

        // 7. Upsert UserAnalytics
        const existingAnalytics = await query(`
            SELECT userAnalyticsID FROM UserAnalytics WHERE subscriberID = @sid
        `, { sid });

        if (existingAnalytics.recordset.length > 0) {
            await query(`
                UPDATE UserAnalytics SET
                    scoreID = @scoreID,
                    riskScore = @risk,
                    memberType = @type
                WHERE subscriberID = @sid
            `, { sid, scoreID, risk: riskScore, type: memberType });
        } else {
            await query(`
                INSERT INTO UserAnalytics (subscriberID, scoreID, riskScore, memberType)
                VALUES (@sid, @scoreID, @risk, @type)
            `, { sid, scoreID, risk: riskScore, type: memberType });
        }

        // 8. Done - score is stored in ScribeScore table
        console.log('updateUserAnalytics: done for subscriberID', sid, '- score:', scoreValue);

    } catch (err) {
        console.error('updateUserAnalytics ERROR:', err.message, err.stack);
        // Non-fatal — don't crash the main request
    }
}

module.exports = { updateUserAnalytics };
