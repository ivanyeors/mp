/**
 * `now` less `months` calendar months, the way Postgres's
 * `now() - interval 'N months'` counts in UTC: the day is kept, or clamped to
 * the last day of a shorter month (31 March less one month is 28 February).
 * Shared by the *Last order* filter (lib/crm/customer-filters) and the
 * **Lifecycle stage** (lib/crm/lifecycle-stage), so both cut where the SQL does.
 */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
