/**
 * Determines the latest WIB calendar date whose regular-session close can
 * be trusted as final — without hardcoding a holiday calendar.
 *
 * The trick: this only returns a *ceiling* (an upper bound on "today").
 * Callers combine it with a query like
 *   `WHERE code = $1 AND date <= $ceiling ORDER BY date DESC LIMIT 1`
 * against `daily_bars`, which only ever contains rows for actual trading
 * days (Stockbit has no data for weekends/holidays, so none get ingested).
 * That query naturally lands on the last real trading day at or before the
 * ceiling — weekends and holidays are skipped automatically because they
 * simply have no row, not because we know in advance that they're closed.
 *
 * Before market close, "today" itself isn't final yet, so the ceiling
 * steps back to the previous calendar date — which then resolves the same
 * way (skipping back through any weekend/holiday) once combined with the
 * query above.
 */

// IDX regular market closes ~15:49–16:00 WIB. 16:15 WIB adds a buffer so
// the ceiling doesn't flip to "today" in the same few minutes the daily
// ingestion run (scheduled up to 16:00–16:45 WIB) is still landing.
const CLOSE_HOUR_WIB = 16;
const CLOSE_MINUTE_WIB = 15;

const wibFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface WibParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function getWibParts(date: Date): WibParts {
  const parts = wibFormatter.formatToParts(date);
  const map: Partial<Record<string, string>> = {};
  for (const part of parts) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** YYYY-MM-DD ceiling for "the last closing date we can trust", per the module doc above. */
export function getTradingDateCeiling(now: Date = new Date()): string {
  const wib = getWibParts(now);
  const marketClosedToday =
    wib.hour > CLOSE_HOUR_WIB ||
    (wib.hour === CLOSE_HOUR_WIB && wib.minute >= CLOSE_MINUTE_WIB);

  // Arithmetic-only Date, standing in for the WIB calendar date — never
  // used as a real instant/timestamp, just to get date-rollover math right.
  const calendarDate = new Date(Date.UTC(wib.year, wib.month - 1, wib.day));
  if (!marketClosedToday) {
    calendarDate.setUTCDate(calendarDate.getUTCDate() - 1);
  }

  return toIsoDate(
    calendarDate.getUTCFullYear(),
    calendarDate.getUTCMonth() + 1,
    calendarDate.getUTCDate()
  );
}
