FLEXSCRIBE
> A virtual wallet system that manages subscriptions, automates payment simulation, forecasts financial outcomes, and helps users avoid running out of money.

FlexScribe: User Functionality Description

## 🔹 1. User Entry into System

1. User accesses the FlexScribe platform (web application).
2. User is presented with:

   * Landing page
   * Option to **Sign Up** or **Log In**

---

## 🔹 2. User Registration (Sign Up)

3. User selects **Sign Up**.

4. User enters required details:

   * First Name
   * Last Name
   * Preferred Name
   * Email Address
   * ID Number or Date of Birth
   * Password

5. System performs:

   * Input validation
   * Email uniqueness check
   * Password hashing

6. System creates user account.

---

## 🔹 3. Wallet & Virtual Card Creation

7. Upon successful registration:

   The system automatically:

   * Creates a **Virtual Wallet**
   * Generates a **Virtual Card** linked to the wallet

8. Virtual Card includes:

   * Card Number (system-generated)
   * Cardholder Name (Preferred Name or Full Name)
   * Expiry Date (e.g., +3 years from creation)
   * CVV (randomly generated)

9. Initial Wallet State:

   * Balance = R0.00
   * No transactions recorded

---

## 🔹 4. User Login

10. User logs into the system using:

* Email
* Password

11. System authenticates user and grants access to dashboard.

---

## 🔹 5. Dashboard Overview

12. After login, user sees:

* Wallet Balance
* Total Monthly Subscription Cost
* Upcoming Payments
* Risk Alerts (if applicable)
* Quick Actions (Add Subscription, Deposit Funds)

---

## 🔹 6. Adding Subscriptions (Hybrid Input Model)

13. User selects **“Add Subscription”**.

14. System presents a **hybrid subscription input interface** consisting of three options:

* **Search-Based Selection:**

  * User searches for a subscription (e.g., Netflix, Spotify).
  * System displays predefined subscription options.
  * User selects a service and chooses:

    * Plan
    * Billing date
    * Priority status
    * Auto-renewal indicator

* **Recommended Subscriptions:**

  * System displays commonly used or popular subscriptions.
  * User can quickly select and configure them with minimal input.

* **Manual Entry (Fallback):**

  * User manually enters:

    * Subscription name
    * Category (e.g., Entertainment, Utility, Lifestyle)
    * Cost
    * Billing date
    * Billing frequency
    * Priority status
    * Auto-renewal indicator

15. System stores the subscription.

16. System updates:

* Total monthly subscription cost
* Payment schedule
* Forecast calculations
)

15. System stores subscription.

16. System updates:

* Total monthly subscription cost
* Payment schedule
* Forecast calculations

---

## 🔹 7. Wallet Funding (Deposit)

17. User selects **“Deposit Funds”**.

18. User enters:

* Amount to deposit (e.g., R500)

19. System:

* Adds amount to wallet balance
* Records transaction in WalletTransaction log

20. Updated balance is displayed on dashboard.

---

## 🔹 8. Subscription Payment Processing

21. On each subscription’s billing date:

System automatically checks:

```CODE
If Wallet Balance ≥ Subscription Cost
    → Deduct amount
    → Mark payment as SUCCESS
Else
    → Mark payment as FAILED
    → Trigger risk alert
```

22. Successful payment:

* Deducted from wallet
* Logged as transaction

23. Failed payment:

* Flagged in system
* Displayed to user

---

## 🔹 9. Financial Forecasting

24. System continuously calculates projected balance:

```CODE
Projected Balance =
Wallet Balance
+ Expected Income (if provided)
- Fixed Expenses (if provided)
- Upcoming Subscription Costs
```

25. System evaluates:

* Whether user can afford upcoming subscriptions
* Future wallet balance over time

---

## 🔹 🔟 Risk Detection

26. System generates **Risk Flags** when:

* Wallet balance is insufficient for upcoming payments
* Projected balance becomes negative

27. Risk levels:

* Low Risk
* Moderate Risk
* High Risk

28. User is notified via dashboard alerts.

---

## 🔹 11. Timeline of Billing Cycles

29. System displays a **timeline view** showing:

* Upcoming subscription dates
* Payment amounts
* Wallet deductions over time

30. Helps user visualize:

* Cash flow
* High-expense periods

---

## 🔹 12. Subscription Prioritization

31. Each subscription has an **Essentiality / Priority Score**.

32. If funds are insufficient:

System:

* Pays **high-priority subscriptions first**
* Skips low-priority ones

---

## 🔹 13. Managing Subscriptions

33. User can:

* Update subscription details
* Change billing date
* Modify priority
* Toggle auto-renewal
* Deactivate subscription

34. System recalculates forecast after any change.

---

## 🔹 14. Optional Financial Inputs

35. User may optionally add:

* Monthly Salary
* Fixed Expenses
* Financial Goals

36. These improve:

* Forecast accuracy
* Risk detection

---

## 🔹 15. Bank Statement Upload (Optional Feature)

37. User uploads bank statement.

38. System:

* Scans for recurring transactions
* Identifies possible subscriptions
* Suggests adding them

---

## 🔹 16. Subscription Splitting (Optional Advanced Feature)

39. User creates shared subscription group.

40. System:

* Divides cost among members
* Tracks contributions

41. Each member:

* Pays their portion (simulated)

---

## 🔹 17. Withdraw Funds

42. User can withdraw money from wallet.

43. System:

* Deducts amount
* Logs transaction

---

## 🔹 18. Logout

44. User logs out securely.

---


