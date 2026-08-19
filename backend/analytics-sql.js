/* =============================================================
   FlexScribe — Analytics SQL Statements
   backend/analytics-sql.js

   SQL statements for retrieving analytics data from the
   FlexScribeDB. These aggregate data from WalletTransaction,
   Subscription, SubscriptionCategory, and VirtualWallet tables
   to power the analytics dashboard.

   NOTE: Database integration is not yet active. These are
   prepared statements using named parameters (e.g. @paramName)
   following SQL Server / SSMS conventions.
============================================================= */

'use strict';

const AnalyticsSQL = (() => {

    /* ==========================================================
       ── SUMMARY STATISTICS ──
       Total spent, total income, and savings rate for a
       given date range.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Total spending for a subscriber in date range
    ---------------------------------------------------------- */
    const GET_TOTAL_SPENT = `
        SELECT
            ISNULL(SUM(transactionAmount), 0) AS totalSpent
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'debit'
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Total income (credits) for a subscriber in date range
    ---------------------------------------------------------- */
    const GET_TOTAL_INCOME = `
        SELECT
            ISNULL(SUM(transactionAmount), 0) AS totalIncome
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'credit'
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Summary (spent + income + savings rate) combined
    ---------------------------------------------------------- */
    const GET_SUMMARY = `
        SELECT
            ISNULL(SUM(CASE WHEN wt.transactionType = 'debit' THEN wt.transactionAmount ELSE 0 END), 0) AS totalSpent,
            ISNULL(SUM(CASE WHEN wt.transactionType = 'credit' THEN wt.transactionAmount ELSE 0 END), 0) AS totalIncome,
            CASE
                WHEN SUM(CASE WHEN wt.transactionType = 'credit' THEN wt.transactionAmount ELSE 0 END) > 0
                THEN CAST(
                    (1.0 - (SUM(CASE WHEN wt.transactionType = 'debit' THEN wt.transactionAmount ELSE 0 END)
                           / SUM(CASE WHEN wt.transactionType = 'credit' THEN wt.transactionAmount ELSE 0 END)))
                    * 100 AS DECIMAL(5,1))
                ELSE 0
            END AS savingsRate
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate;
    `;


    /* ==========================================================
       ── SPENDING BY CATEGORY ──
       Aggregate spending grouped by subscription category.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Spending breakdown by category
    ---------------------------------------------------------- */
    const GET_SPENDING_BY_CATEGORY = `
        SELECT
            sc.categoryName AS category,
            ISNULL(SUM(wt.transactionAmount), 0) AS amount,
            CAST(
                (SUM(wt.transactionAmount) * 100.0) /
                NULLIF((SELECT SUM(wt2.transactionAmount)
                        FROM WalletTransaction wt2
                        INNER JOIN VirtualWallet vw2 ON vw2.walletID = wt2.walletID
                        WHERE vw2.subscriberID = @subscriberID
                          AND wt2.transactionType = 'debit'
                          AND wt2.transactionDate >= @startDate
                          AND wt2.transactionDate <= @endDate), 0)
            AS DECIMAL(5,1)) AS percentage
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        INNER JOIN Subscription sub ON sub.subscriptionID = wt.subscriptionID
        INNER JOIN SubscriptionCategory sc ON sc.categoryID = sub.categoryID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'debit'
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate
        GROUP BY sc.categoryName
        ORDER BY amount DESC;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Spending by category including non-subscription
       transactions (uses the category field on WalletTransaction)
    ---------------------------------------------------------- */
    const GET_SPENDING_BY_TRANSACTION_CATEGORY = `
        SELECT
            ISNULL(wt.category, 'Other') AS category,
            ISNULL(SUM(wt.transactionAmount), 0) AS amount,
            CAST(
                (SUM(wt.transactionAmount) * 100.0) /
                NULLIF((SELECT SUM(wt2.transactionAmount)
                        FROM WalletTransaction wt2
                        INNER JOIN VirtualWallet vw2 ON vw2.walletID = wt2.walletID
                        WHERE vw2.subscriberID = @subscriberID
                          AND wt2.transactionType = 'debit'
                          AND wt2.transactionDate >= @startDate
                          AND wt2.transactionDate <= @endDate), 0)
            AS DECIMAL(5,1)) AS percentage
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'debit'
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate
        GROUP BY ISNULL(wt.category, 'Other')
        ORDER BY amount DESC;
    `;


    /* ==========================================================
       ── MONTHLY SPENDING TREND ──
       Aggregated spending per month over the last N months.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Monthly spending trend (last 6 months)
    ---------------------------------------------------------- */
    const GET_MONTHLY_TREND = `
        SELECT
            FORMAT(wt.transactionDate, 'yyyy-MM') AS monthKey,
            FORMAT(wt.transactionDate, 'MMM') AS monthLabel,
            ISNULL(SUM(wt.transactionAmount), 0) AS amount
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'debit'
          AND wt.transactionDate >= @trendStartDate
          AND wt.transactionDate <= @endDate
        GROUP BY FORMAT(wt.transactionDate, 'yyyy-MM'), FORMAT(wt.transactionDate, 'MMM')
        ORDER BY monthKey ASC;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Monthly income trend (last 6 months)
    ---------------------------------------------------------- */
    const GET_MONTHLY_INCOME_TREND = `
        SELECT
            FORMAT(wt.transactionDate, 'yyyy-MM') AS monthKey,
            FORMAT(wt.transactionDate, 'MMM') AS monthLabel,
            ISNULL(SUM(wt.transactionAmount), 0) AS amount
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'credit'
          AND wt.transactionDate >= @trendStartDate
          AND wt.transactionDate <= @endDate
        GROUP BY FORMAT(wt.transactionDate, 'yyyy-MM'), FORMAT(wt.transactionDate, 'MMM')
        ORDER BY monthKey ASC;
    `;


    /* ==========================================================
       ── TOP MERCHANTS ──
       Most transacted-with services/merchants.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Top merchants by total spend
    ---------------------------------------------------------- */
    const GET_TOP_MERCHANTS = `
        SELECT TOP 10
            ISNULL(sub.serviceName, wt.description) AS merchantName,
            SUM(wt.transactionAmount) AS totalSpent,
            COUNT(*) AS transactionCount
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        LEFT JOIN Subscription sub ON sub.subscriptionID = wt.subscriptionID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'debit'
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate
        GROUP BY ISNULL(sub.serviceName, wt.description)
        ORDER BY totalSpent DESC;
    `;


    /* ==========================================================
       ── BUDGET VS ACTUAL ──
       Compare actual spending against budget per category.
       Note: Budget data would come from a user-defined budget
       table. For now, we calculate actual spend per category
       to compare against any configured limits.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Actual spending per category (for budget comparison)
    ---------------------------------------------------------- */
    const GET_ACTUAL_SPENDING_PER_CATEGORY = `
        SELECT
            sc.categoryName AS category,
            ISNULL(SUM(wt.transactionAmount), 0) AS actualSpent
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        INNER JOIN Subscription sub ON sub.subscriptionID = wt.subscriptionID
        INNER JOIN SubscriptionCategory sc ON sc.categoryID = sub.categoryID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'debit'
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate
        GROUP BY sc.categoryName
        ORDER BY actualSpent DESC;
    `;


    /* ==========================================================
       ── SUBSCRIPTION-SPECIFIC ANALYTICS ──
       Deeper insights based on subscription activity.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Total subscription costs for current period
    ---------------------------------------------------------- */
    const GET_TOTAL_SUBSCRIPTION_COSTS = `
        SELECT
            ISNULL(SUM(sub.billingAmount), 0) AS totalSubscriptionCost,
            COUNT(*) AS activeSubscriptionCount
        FROM Subscription sub
        WHERE sub.subscriberID = @subscriberID
          AND sub.subStatus = 'active';
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Subscription spending history (per subscription)
    ---------------------------------------------------------- */
    const GET_SUBSCRIPTION_SPENDING_HISTORY = `
        SELECT
            sub.serviceName,
            sc.categoryName AS category,
            sub.billingAmount,
            sub.billingCycle,
            COUNT(wt.transactionID) AS paymentCount,
            ISNULL(SUM(wt.transactionAmount), 0) AS totalPaid
        FROM Subscription sub
        INNER JOIN SubscriptionCategory sc ON sc.categoryID = sub.categoryID
        LEFT JOIN WalletTransaction wt ON wt.subscriptionID = sub.subscriptionID
            AND wt.transactionDate >= @startDate
            AND wt.transactionDate <= @endDate
        WHERE sub.subscriberID = @subscriberID
        GROUP BY sub.serviceName, sc.categoryName, sub.billingAmount, sub.billingCycle
        ORDER BY totalPaid DESC;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Month-over-month spending comparison
    ---------------------------------------------------------- */
    const GET_MONTH_OVER_MONTH_COMPARISON = `
        SELECT
            currentMonth.totalSpent AS currentMonthSpent,
            previousMonth.totalSpent AS previousMonthSpent,
            CASE
                WHEN previousMonth.totalSpent > 0
                THEN CAST(
                    ((currentMonth.totalSpent - previousMonth.totalSpent) * 100.0 / previousMonth.totalSpent)
                AS DECIMAL(5,1))
                ELSE 0
            END AS percentageChange
        FROM (
            SELECT ISNULL(SUM(wt.transactionAmount), 0) AS totalSpent
            FROM WalletTransaction wt
            INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
            WHERE vw.subscriberID = @subscriberID
              AND wt.transactionType = 'debit'
              AND wt.transactionDate >= @currentMonthStart
              AND wt.transactionDate <= @currentMonthEnd
        ) currentMonth,
        (
            SELECT ISNULL(SUM(wt.transactionAmount), 0) AS totalSpent
            FROM WalletTransaction wt
            INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
            WHERE vw.subscriberID = @subscriberID
              AND wt.transactionType = 'debit'
              AND wt.transactionDate >= @previousMonthStart
              AND wt.transactionDate <= @previousMonthEnd
        ) previousMonth;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Average daily spending
    ---------------------------------------------------------- */
    const GET_AVERAGE_DAILY_SPENDING = `
        SELECT
            CAST(ISNULL(SUM(wt.transactionAmount), 0) /
                NULLIF(DATEDIFF(DAY, @startDate, @endDate) + 1, 0)
            AS DECIMAL(18,2)) AS averageDailySpend
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionType = 'debit'
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Transaction count and frequency
    ---------------------------------------------------------- */
    const GET_TRANSACTION_FREQUENCY = `
        SELECT
            COUNT(*) AS totalTransactions,
            SUM(CASE WHEN transactionType = 'debit' THEN 1 ELSE 0 END) AS debitCount,
            SUM(CASE WHEN transactionType = 'credit' THEN 1 ELSE 0 END) AS creditCount,
            SUM(CASE WHEN transactionType = 'transfer' THEN 1 ELSE 0 END) AS transferCount
        FROM WalletTransaction wt
        INNER JOIN VirtualWallet vw ON vw.walletID = wt.walletID
        WHERE vw.subscriberID = @subscriberID
          AND wt.transactionDate >= @startDate
          AND wt.transactionDate <= @endDate;
    `;


    /* ==========================================================
       ── GOAL ANALYTICS ──
       Progress and contribution insights for financial goals.
    ========================================================== */

    /* ----------------------------------------------------------
       RETRIEVE — Goal progress summary
    ---------------------------------------------------------- */
    const GET_GOAL_PROGRESS_SUMMARY = `
        SELECT
            COUNT(*) AS totalGoals,
            SUM(CASE WHEN goalStatus = 'active' THEN 1 ELSE 0 END) AS activeGoals,
            SUM(CASE WHEN goalStatus = 'completed' THEN 1 ELSE 0 END) AS completedGoals,
            ISNULL(SUM(targetAmount), 0) AS totalTargetAmount,
            ISNULL(SUM(currentProgress), 0) AS totalSaved,
            CASE
                WHEN SUM(targetAmount) > 0
                THEN CAST((SUM(currentProgress) * 100.0 / SUM(targetAmount)) AS DECIMAL(5,1))
                ELSE 0
            END AS overallProgressPct
        FROM FinancialGoal
        WHERE subscriberID = @subscriberID;
    `;

    /* ----------------------------------------------------------
       RETRIEVE — Monthly goal contributions
    ---------------------------------------------------------- */
    const GET_MONTHLY_GOAL_CONTRIBUTIONS = `
        SELECT
            FORMAT(gc.createdAt, 'yyyy-MM') AS monthKey,
            FORMAT(gc.createdAt, 'MMM') AS monthLabel,
            ISNULL(SUM(gc.amountCents), 0) AS totalContributedCents
        FROM GoalContribution gc
        INNER JOIN FinancialGoal fg ON fg.goalID = gc.goalID
        WHERE fg.subscriberID = @subscriberID
          AND gc.createdAt >= @trendStartDate
          AND gc.createdAt <= @endDate
        GROUP BY FORMAT(gc.createdAt, 'yyyy-MM'), FORMAT(gc.createdAt, 'MMM')
        ORDER BY monthKey ASC;
    `;


    /* ==========================================================
       PUBLIC API
    ========================================================== */
    return Object.freeze({
        // ── Summary ──
        GET_TOTAL_SPENT,
        GET_TOTAL_INCOME,
        GET_SUMMARY,

        // ── Spending by Category ──
        GET_SPENDING_BY_CATEGORY,
        GET_SPENDING_BY_TRANSACTION_CATEGORY,

        // ── Monthly Trends ──
        GET_MONTHLY_TREND,
        GET_MONTHLY_INCOME_TREND,

        // ── Top Merchants ──
        GET_TOP_MERCHANTS,

        // ── Budget vs Actual ──
        GET_ACTUAL_SPENDING_PER_CATEGORY,

        // ── Subscription Analytics ──
        GET_TOTAL_SUBSCRIPTION_COSTS,
        GET_SUBSCRIPTION_SPENDING_HISTORY,
        GET_MONTH_OVER_MONTH_COMPARISON,
        GET_AVERAGE_DAILY_SPENDING,
        GET_TRANSACTION_FREQUENCY,

        // ── Goal Analytics ──
        GET_GOAL_PROGRESS_SUMMARY,
        GET_MONTHLY_GOAL_CONTRIBUTIONS,
    });

})();
