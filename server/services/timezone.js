/* ===========================================================
   timezone.js
   Timezone + quiet-hours helpers for the notification scheduler.

   Uses the built-in Intl.DateTimeFormat (no dependency) to convert
   a UTC instant into a user's local wall-clock time given their
   IANA timezone (e.g. 'Africa/Johannesburg').

   Quiet hours are stored on the Subscriber row as minutes-from-
   midnight (quietHoursStart / quietHoursEnd), e.g. 1320 = 22:00,
   420 = 07:00. A window that wraps past midnight (start > end) is
   handled correctly.
=========================================================== */

'use strict';

const DEFAULT_TIMEZONE = 'Africa/Johannesburg';
const DEFAULT_QUIET_START = 1320; // 22:00
const DEFAULT_QUIET_END = 420;    // 07:00

/* -----------------------------------------------------------
   getLocalParts(date, timezone)
   Returns the wall-clock parts of `date` as seen in `timezone`:
   { year, month, day, hour, minute, weekday, minutesOfDay, dateKey }
   - month is 1-12, day 1-31, hour 0-23, minute 0-59
   - weekday: 0=Sun ... 6=Sat
   - minutesOfDay: hour*60 + minute
   - dateKey: 'YYYY-MM-DD' in that timezone (useful for dedupe/day compares)
----------------------------------------------------------- */
function getLocalParts(date, timezone) {
    const tz = timezone || DEFAULT_TIMEZONE;
    let fmt;
    try {
        fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
            weekday: 'short'
        });
    } catch (e) {
        // Invalid timezone string — fall back to default
        fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: DEFAULT_TIMEZONE,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
            weekday: 'short'
        });
    }

    const parts = {};
    for (const p of fmt.formatToParts(date)) {
        parts[p.type] = p.value;
    }

    const year = parseInt(parts.year, 10);
    const month = parseInt(parts.month, 10);
    const day = parseInt(parts.day, 10);
    let hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0; // some engines emit 24 for midnight
    const minute = parseInt(parts.minute, 10);

    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[parts.weekday] != null ? weekdayMap[parts.weekday] : new Date(date).getUTCDay();

    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;

    return {
        year, month, day, hour, minute, weekday,
        minutesOfDay: hour * 60 + minute,
        dateKey
    };
}

/* -----------------------------------------------------------
   isInQuietHours(minutesOfDay, quietStart, quietEnd)
   True if the given time falls inside the quiet window.
   Handles windows that wrap past midnight (start > end),
   e.g. 22:00 (1320) -> 07:00 (420).
----------------------------------------------------------- */
function isInQuietHours(minutesOfDay, quietStart, quietEnd) {
    const start = (quietStart == null) ? DEFAULT_QUIET_START : quietStart;
    const end = (quietEnd == null) ? DEFAULT_QUIET_END : quietEnd;

    if (start === end) return false; // zero-length window => never quiet

    if (start < end) {
        // Same-day window, e.g. 01:00 -> 06:00
        return minutesOfDay >= start && minutesOfDay < end;
    }
    // Wrapping window, e.g. 22:00 -> 07:00
    return minutesOfDay >= start || minutesOfDay < end;
}

/* -----------------------------------------------------------
   shouldSendNow(user, now, options)
   Decides whether a scheduled notification may be delivered to
   this user at the instant `now`, honouring quiet hours.

   @param user    { timezone, quietHoursEnabled, quietHoursStart, quietHoursEnd }
   @param now     Date (defaults to new Date())
   @param options { critical: bool }  critical bypasses quiet hours
   @returns { allowed: bool, reason: string, local: {...} }
----------------------------------------------------------- */
function shouldSendNow(user, now, options = {}) {
    const when = now || new Date();
    const tz = (user && user.timezone) || DEFAULT_TIMEZONE;
    const local = getLocalParts(when, tz);

    // Critical notifications (e.g. payment failures) bypass quiet hours
    if (options.critical) {
        return { allowed: true, reason: 'critical-bypass', local };
    }

    const quietEnabled = user ? (user.quietHoursEnabled === true || user.quietHoursEnabled === 1) : true;
    if (!quietEnabled) {
        return { allowed: true, reason: 'quiet-hours-disabled', local };
    }

    const inQuiet = isInQuietHours(
        local.minutesOfDay,
        user ? user.quietHoursStart : DEFAULT_QUIET_START,
        user ? user.quietHoursEnd : DEFAULT_QUIET_END
    );

    if (inQuiet) {
        return { allowed: false, reason: 'quiet-hours', local };
    }
    return { allowed: true, reason: 'ok', local };
}

/* -----------------------------------------------------------
   isLocalHour(user, now, targetHour)
   True if the user's local wall-clock hour equals targetHour
   (used by jobs that should run "at 08:00 / 09:00 local").
----------------------------------------------------------- */
function isLocalHour(user, now, targetHour) {
    const tz = (user && user.timezone) || DEFAULT_TIMEZONE;
    const local = getLocalParts(now || new Date(), tz);
    return local.hour === targetHour;
}

module.exports = {
    DEFAULT_TIMEZONE,
    DEFAULT_QUIET_START,
    DEFAULT_QUIET_END,
    getLocalParts,
    isInQuietHours,
    shouldSendNow,
    isLocalHour
};
