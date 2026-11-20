export const MIN_RATE_BASE = 20;
export const RETURN_WINDOW_MONTHS = 12;

export interface CohortRow {
  cohort_month: string;
  first_buyers: number;
  came_back: number;
  via_readjustment: number;
  via_purchase: number;
}

export interface Cohort {
  month: string;
  label: string;
  firstBuyers: number;
  cameBack: number;
  viaReadjustment: number;
  viaPurchase: number;
  open: boolean;
  closesOn: string;
  rate: { cameBack: number; viaReadjustment: number; viaPurchase: number } | null;
}

export interface ReturningSummary {
  cohorts: Cohort[];
  headline: Cohort | null;
  firstClosesOn: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

function monthsAfter(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

const pct = (part: number, whole: number) => Math.round((part / whole) * 100);

export function returningSummary(rows: readonly CohortRow[], now: Date): ReturningSummary {
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cohorts = [...rows]
    .map((r) => String(r.cohort_month).slice(0, 7))
    .map((month, i) => ({ month, r: rows[i]! }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ month, r }): Cohort => {
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

export function returningHeadline(s: ReturningSummary): string {
  const h = s.headline;
  if (h?.rate) {
    return `Of customers who first bought in ${h.label}, ${h.rate.cameBack}% came back within 12 months (re-adjustment ${h.rate.viaReadjustment}%, second purchase ${h.rate.viaPurchase}%).`;
  }
  if (!s.cohorts.length) return "No purchases on this site yet.";
  const closes = s.firstClosesOn ? ` The first full year ends on ${dayLabel(s.firstClosesOn)}.` : "";
  return `No month has had its full 12 months with ${MIN_RATE_BASE} or more first-time customers yet, so the counts show without a rate.${closes}`;
}

export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
