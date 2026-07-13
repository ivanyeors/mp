export type OrdersPaidAtRange = {
  from?: string;
  toExclusive?: string;
};

export type OrdersPaidAtRangeResult =
  | { ok: true; range: OrdersPaidAtRange }
  | { ok: false; error: string };

type PaidAtRangeQuery<T> = {
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
};

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

export function parseOrdersPaidAtRange(
  dateFrom: string | null,
  dateTo: string | null
): OrdersPaidAtRangeResult {
  const fromDate = dateFrom ? parseDate(dateFrom) : null;
  const toDate = dateTo ? parseDate(dateTo) : null;

  if (dateFrom && !fromDate) {
    return { ok: false, error: "date_from must be a valid YYYY-MM-DD date" };
  }
  if (dateTo && !toDate) {
    return { ok: false, error: "date_to must be a valid YYYY-MM-DD date" };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { ok: false, error: "From date must be on or before To date" };
  }

  if (toDate) toDate.setUTCDate(toDate.getUTCDate() + 1);

  return {
    ok: true,
    range: {
      from: fromDate?.toISOString(),
      toExclusive: toDate?.toISOString(),
    },
  };
}

export function applyOrdersPaidAtRange<T extends PaidAtRangeQuery<T>>(
  query: T,
  range: OrdersPaidAtRange,
  column = "paid_at"
): T {
  if (range.from) query = query.gte(column, range.from);
  if (range.toExclusive) query = query.lt(column, range.toExclusive);
  return query;
}
