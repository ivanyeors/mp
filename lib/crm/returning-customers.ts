/**
 * The retention scorecard's headline (PRD-crm-retention-loop slice 06): the
 * **Returning customer rate** by first-purchase month. Of the Customers whose
 * first Purchase was in a month, the share who came back within 12 months for
 * an attended re-adjustment or a second Purchase (lifecycle-and-metrics.md).
 *
 * Pure: `admin_returning_customer_cohorts()` (20261101150000) counts, and this
 * decides what may be shown as a rate. A cohort whose 12 months are not over
 * for all of it is *still open*: its counts show, never a rate, so a young
 * month never reads as a bad one. Under {@link MIN_RATE_BASE} people, counts
 * only. Purchases on this site only, until retention slice 09 imports the
 * Shopify-era orders.
 */

/** The fewest first-time customers a cohort's rate is shown for. */
export const MIN_RATE_BASE = 20;
/** How long a customer has to come back. */
export const RETURN_WINDOW_MONTHS = 12;

export interface CohortRow {
  /** The month's first day, YYYY-MM-DD (Singapore). */
  cohort_month: string;
  first_buyers: number;
  came_back: number;
  via_readjustment: number;
  via_purchase: number;
}

export interface Cohort {
  /** YYYY-MM. */
  month: string;
  /** *Mar 2026*. */
  label: string;
  firstBuyers: number;
  cameBack: number;
  viaReadjustment: number;
  viaPurchase: number;
  /** Some of it still has time to come back. */
  open: boolean;
  /** When the last of it has had 12 months: the first day after the window, YYYY-MM-DD. */
  closesOn: string;
  /** Percent, whole, when it may be shown: closed and {@link MIN_RATE_BASE} or more people. */
  rate: { cameBack: number; viaReadjustment: number; viaPurchase: number } | null;
}

export interface ReturningSummary {
  cohorts: Cohort[];
  /** The latest closed cohort with a rate: the headline. */
  headline: Cohort | null;
  /** When none has a rate yet, the month the first cohort's window closes. */
  firstClosesOn: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** *Mar 2026* for 2026-03. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

/** The first day of the month `n` months after `month` (YYYY-MM), YYYY-MM-DD. */
function monthsAfter(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

const pct = (part: number, whole: number) => Math.round((part / whole) * 100);

/** Pure — the cohorts, oldest first, each with a rate only where one may be shown. */
export function returningSummary(rows: readonly CohortRow[], now: Date): ReturningSummary {
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cohorts = [...rows]
    .map((r) => String(r.cohort_month).slice(0, 7))
    .map((month, i) => ({ month, r: rows[i]! }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ month, r }): Cohort => {
      // Its last customer bought on the month's last day: 12 months on is the
      // first day of the month after, a year later.
      const closesOn = monthsAfter(month, RETURN_WINDOW_MONTHS + 1);
      const open = today < closesOn;
      const firstBuyers = Number(r.first_buyers) || 0;
      const cameBack = Number(r.came_back) || 0;
      const viaReadjustment = Number(r.via_readjustment) || 0;
      const viaPurchase = Number(r.via_purchase) || 0;
      return {
        month,
        label: monthLabel(month),
        firstBuyers,
        cameBack,
        viaReadjustment,
        viaPurchase,
        open,
        closesOn,
        rate:
          !open && firstBuyers >= MIN_RATE_BASE
            ? { cameBack: pct(cameBack, firstBuyers), viaReadjustment: pct(viaReadjustment, firstBuyers), viaPurchase: pct(viaPurchase, firstBuyers) }
            : null,
      };
    });
  const headline = [...cohorts].reverse().find((c) => c.rate) ?? null;
  return { cohorts, headline, firstClosesOn: headline ? null : (cohorts.find((c) => c.open)?.closesOn ?? null) };
}

/** The headline in words, or why there is none yet. */
export function returningHeadline(s: ReturningSummary): string {
  const h = s.headline;
  if (h?.rate) {
    return `Of customers who first bought in ${h.label}, ${h.rate.cameBack}% came back within 12 months (re-adjustment ${h.rate.viaReadjustment}%, second purchase ${h.rate.viaPurchase}%).`;
  }
  if (!s.cohorts.length) return "No purchases on this site yet.";
  const closes = s.firstClosesOn ? ` The first full year ends on ${dayLabel(s.firstClosesOn)}.` : "";
  return `No month has had its full 12 months with ${MIN_RATE_BASE} or more first-time customers yet, so the counts show without a rate.${closes}`;
}

/** *1 Apr 2027*. */
export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
