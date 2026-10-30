/**
 * Analytics months are Singapore calendar months (UTC+8, no DST), wherever the
 * server or the browser runs. A sale at 1am on 1 May SGT is May's, not April's.
 *
 * The client picks months and sends the instants these helpers return; the
 * server reads months back off those instants, so a server in UTC cannot pull
 * the previous month in by re-snapping them to its own midnight.
 */

const SG_OFFSET_MS = 8 * 3_600_000;

/** `YYYY-MM`. */
export type MonthKey = string;

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const m = MONTH_KEY.exec(key);
  if (!m) throw new Error(`Invalid month "${key}"`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month "${key}"`);
  return { year, month };
}

/** The Singapore calendar date of an instant, `YYYY-MM-DD`. */
export function sgDate(at: string | Date): string {
  const ms = typeof at === "string" ? Date.parse(at) : at.getTime();
  return new Date(ms + SG_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Singapore month an instant falls in. */
export function sgMonthKey(at: string | Date): MonthKey {
  return sgDate(at).slice(0, 7);
}

/** Midnight on the 1st of the month, Singapore time, as an instant. */
export function sgMonthStart(key: MonthKey): Date {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month - 1, 1) - SG_OFFSET_MS);
}

/** Midnight on the 1st of the next month, Singapore time: the exclusive end. */
export function sgMonthEndExclusive(key: MonthKey): Date {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 1) - SG_OFFSET_MS);
}

/** Every month from `from` to `to`, both included. */
export function sgMonthKeysBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const a = parseMonthKey(from);
  const b = parseMonthKey(to);
  const out: MonthKey[] = [];
  for (let y = a.year, m = a.month; y < b.year || (y === b.year && m <= b.month); ) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export type SgMonthRange = {
  fromMonth: MonthKey;
  toMonth: MonthKey;
  /** Inclusive start instant. */
  from: Date;
  /** Exclusive end instant. */
  toExclusive: Date;
  months: MonthKey[];
};

/**
 * Whole Singapore months covering `from`..`to` (ISO instants, as the client
 * sends them). `to` may be inclusive (`…T15:59:59.999Z`) or exclusive: either
 * reads back as the month the user picked.
 */
export function sgMonthRange(from: string, to: string): SgMonthRange {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new Error("Invalid date range");
  const fromMonth = sgMonthKey(new Date(fromMs));
  // An exclusive end lands exactly on the next month's first instant.
  const toMonth = sgMonthKey(new Date(toMs - 1));
  if (toMonth < fromMonth) throw new Error("Invalid date range");
  return {
    fromMonth,
    toMonth,
    from: sgMonthStart(fromMonth),
    toExclusive: sgMonthEndExclusive(toMonth),
    months: sgMonthKeysBetween(fromMonth, toMonth),
  };
}

/** The instants a client sends for a picked month range: start, and the last millisecond. */
export function sgMonthRangeIso(fromMonth: MonthKey, toMonth: MonthKey): { from: string; to: string } {
  return {
    from: sgMonthStart(fromMonth).toISOString(),
    to: new Date(sgMonthEndExclusive(toMonth).getTime() - 1).toISOString(),
  };
}
