const SG_OFFSET_MS = 8 * 3_600_000;

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

export function sgDate(at: string | Date): string {
  const ms = typeof at === "string" ? Date.parse(at) : at.getTime();
  return new Date(ms + SG_OFFSET_MS).toISOString().slice(0, 10);
}

export function sgMonthKey(at: string | Date): MonthKey {
  return sgDate(at).slice(0, 7);
}

export function sgMonthStart(key: MonthKey): Date {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month - 1, 1) - SG_OFFSET_MS);
}

export function sgMonthEndExclusive(key: MonthKey): Date {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 1) - SG_OFFSET_MS);
}

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
  from: Date;
  toExclusive: Date;
  months: MonthKey[];
};

export function sgMonthRange(from: string, to: string): SgMonthRange {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new Error("Invalid date range");
  const fromMonth = sgMonthKey(new Date(fromMs));
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

export function sgMonthRangeIso(fromMonth: MonthKey, toMonth: MonthKey): { from: string; to: string } {
  return {
    from: sgMonthStart(fromMonth).toISOString(),
    to: new Date(sgMonthEndExclusive(toMonth).getTime() - 1).toISOString(),
  };
}
