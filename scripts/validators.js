/* =============================================================
   FlexScribe — Shared Validators
   scripts/validators.js

   A single source of truth for front-end form validation so the
   same rules can be reused across dependant forms (and any other
   form that needs them) without duplicating logic.

   Exposes window.Validators with:
   • MAX_AMOUNT                 numeric ceiling for monetary fields
   • isValidEmail(value)        plausible email format check
   • validateEmail(value)       -> { valid, message }
   • validateAmount(value, o)   -> { valid, value, message }
   • validateDateOfBirth(value) -> { valid, value, message }
   • yesterdayISO()             'YYYY-MM-DD' for date-picker max
   • todayISO()                 'YYYY-MM-DD' for comparisons

   Validation messages match the wording agreed for FlexScribe.
============================================================= */

'use strict';

const Validators = (() => {

    /* ----------------------------------------------------------
       MONETARY CONSTANTS
       R100,000.00 is the maximum permitted value for both the
       spending limit and allowance fields.
    ---------------------------------------------------------- */
    const MAX_AMOUNT = 100000;

    const MSG = {
        AMOUNT_REQUIRED: 'Please enter an amount.',
        AMOUNT_NEGATIVE: 'The amount cannot be negative.',
        AMOUNT_INVALID:  'Please enter a valid amount using numbers and up to two decimal places.',
        AMOUNT_MAX:      'The amount cannot exceed R100,000.00.',
        EMAIL_INVALID:   'Please enter a valid email address, for example, name@example.com.',
        DOB_INVALID:     'Please enter a valid date of birth in the past. Future dates are not allowed.',
        PASSWORD_REQUIRED: 'Please enter a password.',
        PASSWORD_WEAK:   'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.'
    };

    /* ----------------------------------------------------------
       PASSWORD
       A strong password must satisfy ALL FIVE criteria:
         1. At least 8 characters
         2. At least one uppercase letter (A-Z)
         3. At least one lowercase letter (a-z)
         4. At least one number (0-9)
         5. At least one special character (non-alphanumeric)
    ---------------------------------------------------------- */
    const PASSWORD_MIN_LENGTH = 8;

    function checkPassword(value) {
        const pw = value == null ? '' : String(value);
        return {
            length:  pw.length >= PASSWORD_MIN_LENGTH,
            upper:   /[A-Z]/.test(pw),
            lower:   /[a-z]/.test(pw),
            number:  /[0-9]/.test(pw),
            special: /[^A-Za-z0-9]/.test(pw),
        };
    }

    /**
     * Validate a password against all five strength criteria.
     * Returns { valid, checks, message } where checks exposes each
     * individual criterion so UIs can highlight what is missing.
     */
    function validatePassword(value) {
        const pw = value == null ? '' : String(value);
        if (!pw) return { valid: false, checks: checkPassword(''), message: MSG.PASSWORD_REQUIRED };
        const checks = checkPassword(pw);
        const valid = checks.length && checks.upper && checks.lower && checks.number && checks.special;
        return { valid, checks, message: valid ? '' : MSG.PASSWORD_WEAK };
    }

    /* ----------------------------------------------------------
       EMAIL
       Plausible-format check (not an existence check):
       • exactly one @
       • non-empty local part, no spaces, no leading/trailing dot,
         no consecutive dots
       • a domain with at least one dot-separated label and a
         TLD of 2+ letters
       Rejects: test, test@, @gmail.com, test@gmail,
                test@@gmail.com, "test @gmail.com", test@gmail..com
       Accepts: test@gmail.com
    ---------------------------------------------------------- */
    // Local part: letters/digits and common specials, dots allowed but
    // not leading/trailing or doubled. Domain: labels separated by single
    // dots, ending in a 2+ letter TLD.
    const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

    function isValidEmail(value) {
        if (typeof value !== 'string') return false;
        const email = value.trim();
        if (!email || email.length > 254) return false;
        if (email.indexOf(' ') !== -1) return false;
        return EMAIL_RE.test(email);
    }

    function validateEmail(value) {
        const email = (value == null ? '' : String(value)).trim();
        if (!email) return { valid: false, value: email, message: 'Please enter an email.' };
        if (!isValidEmail(email)) return { valid: false, value: email, message: MSG.EMAIL_INVALID };
        return { valid: true, value: email, message: '' };
    }

    /* ----------------------------------------------------------
       MONEY
       Accepts whole or decimal amounts (max two decimal places),
       >= 0 and <= MAX_AMOUNT. Does NOT silently coerce bad input
       into a number — invalid strings are rejected outright.

       options:
         required (bool)  when false, empty is treated as valid 0
         max (number)     override ceiling (defaults to MAX_AMOUNT)
    ---------------------------------------------------------- */
    function validateAmount(value, options) {
        const opts = options || {};
        const required = !!opts.required;
        const max = typeof opts.max === 'number' ? opts.max : MAX_AMOUNT;

        const raw = (value == null ? '' : String(value)).trim();

        if (raw === '') {
            if (required) return { valid: false, value: null, message: MSG.AMOUNT_REQUIRED };
            return { valid: true, value: 0, message: '' };
        }

        // A leading minus means a negative amount — report that specifically.
        if (/^-/.test(raw)) {
            // Only treat as "negative" if the rest is otherwise numeric,
            // otherwise it's just invalid input.
            if (/^-\d+(\.\d+)?$/.test(raw)) return { valid: false, value: null, message: MSG.AMOUNT_NEGATIVE };
            return { valid: false, value: null, message: MSG.AMOUNT_INVALID };
        }

        // Strictly numeric with at most two decimal places. No currency
        // symbols, letters, thousands separators or whitespace inside.
        if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
            return { valid: false, value: null, message: MSG.AMOUNT_INVALID };
        }

        const num = parseFloat(raw);
        if (!isFinite(num)) return { valid: false, value: null, message: MSG.AMOUNT_INVALID };
        if (num < 0) return { valid: false, value: null, message: MSG.AMOUNT_NEGATIVE };
        if (num > max) return { valid: false, value: null, message: MSG.AMOUNT_MAX };

        return { valid: true, value: num, message: '' };
    }

    /* ----------------------------------------------------------
       DATES
    ---------------------------------------------------------- */
    function _pad(n) { return (n < 10 ? '0' : '') + n; }

    function _toISO(date) {
        return date.getFullYear() + '-' + _pad(date.getMonth() + 1) + '-' + _pad(date.getDate());
    }

    function todayISO() {
        return _toISO(new Date());
    }

    function yesterdayISO() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return _toISO(d);
    }

    /**
     * Date of birth must be a real calendar date strictly before today.
     * Works regardless of the browser's locale because the comparison is
     * done on the ISO (YYYY-MM-DD) value the date input provides.
     */
    function validateDateOfBirth(value) {
        const raw = (value == null ? '' : String(value)).trim();
        if (!raw) return { valid: false, value: '', message: 'Please enter a date of birth.' };

        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        if (!m) return { valid: false, value: raw, message: MSG.DOB_INVALID };

        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);

        // Reject impossible calendar dates (e.g. 2020-02-31).
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
            return { valid: false, value: raw, message: MSG.DOB_INVALID };
        }

        // Must be strictly in the past — today and future are not allowed.
        if (raw >= todayISO()) {
            return { valid: false, value: raw, message: MSG.DOB_INVALID };
        }

        return { valid: true, value: raw, message: '' };
    }

    /* ----------------------------------------------------------
       PUBLIC API
    ---------------------------------------------------------- */
    return Object.freeze({
        MAX_AMOUNT,
        PASSWORD_MIN_LENGTH,
        MSG,
        isValidEmail,
        validateEmail,
        validateAmount,
        validateDateOfBirth,
        checkPassword,
        validatePassword,
        todayISO,
        yesterdayISO,
    });

})();

// Expose globally for non-module scripts.
if (typeof window !== 'undefined') {
    window.Validators = Validators;
}
