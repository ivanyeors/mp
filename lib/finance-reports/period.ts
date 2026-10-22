/**
 * Report periods for finance reports, in Singapore time.
 *
 * Accountants close books on the Singapore calendar, so a period is a pair of
 * inclusive `YYYY-MM-DD` dates read as Asia/Singapore days (UTC+8, no DST).
 * The existing Orders range helper reads dates as UTC days; an order paid at
 * 07:00 SGT on the 1st would land in the previous month there, so reports do
 * not reuse it.
 */

export type ReportPeriod = {
  /** First day, inclusive, `YYYY-MM-DD` (Singapore). */
  from: string;
  /** Last day, inclusive, `YYYY-MM-DD` (Singapore). */
  to: string;
};

export type ReportPeriodBounds = ReportPeriod & {
  /** UTC instant of 00:00 SGT on `from`. */
  fromIso: string;
  /** UTC instant of 00:00 SGT on the day after `to`. */
  toExclusiveIso: string;
};

/** A year is the longest period a report covers; a longer one is a typo. */
export const MAX_PERIOD_DAYS = 366;

const SGT_OFFSET = "+08:00";
const DAY_MS = 86_400_000;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function sgtMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000${SGT_OFFSET}`);
}

/** Validate a period and resolve it to UTC bounds. */
export function parseReportPeriod(
  from: string,
  to: string,
): { ok: true; period: ReportPeriodBounds } | { ok: false; error: string } {
  if (!isCalendarDate(from)) return { ok: false, error: "From must be a date (YYYY-MM-DD)" };
  if (!isCalendarDate(to)) return { ok: false, error: "To must be a date (YYYY-MM-DD)" };
  if (from > to) return { ok: false, error: "From must be on or before To" };

  const start = sgtMidnight(from);
  const end = new Date(sgtMidnight(to).getTime() + DAY_MS);
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_PERIOD_DAYS) {
    return { ok: false, error: `A report covers at most ${MAX_PERIOD_DAYS} days` };
  }
  return {
    ok: true,
    period: { from, to, fromIso: start.toISOString(), toExclusiveIso: end.toISOString() },
  };
}

/** The Singapore calendar date of an instant, `YYYY-MM-DD`. */
export function sgtDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** The Singapore wall-clock time of an instant, `HH:mm`. */
export function sgtTime(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(11, 16);
}

/** The whole calendar month before the one `now` falls in (Singapore). */
export function previousMonth(now: Date = new Date()): ReportPeriod {
  const [y, m] = sgtDate(now.toISOString()).split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return monthPeriod(year, month);
}

/** A whole calendar month; `month` is 1–12. */
export function monthPeriod(year: number, month: number): ReportPeriod {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/** Whether a period is exactly one calendar month. */
export function isWholeMonth(period: ReportPeriod): boolean {
  const [y, m] = period.from.split("-").map(Number);
  const whole = monthPeriod(y, m);
  return whole.from === period.from && whole.to === period.to;
}

function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`;
}

/** `October 2026` for a whole month, else `1 Oct 2026 – 15 Oct 2026`. */
export function periodLabel(period: ReportPeriod): string {
  if (isWholeMonth(period)) {
    const [y, m] = period.from.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (period.from === period.to) return shortDate(period.from);
  return `${shortDate(period.from)} – ${shortDate(period.to)}`;
}

/** `2026-10` for a whole month, else `2026-10-01_2026-10-15`; safe in a filename. */
export function periodSlug(period: ReportPeriod): string {
  return isWholeMonth(period) ? period.from.slice(0, 7) : `${period.from}_${period.to}`;
}
