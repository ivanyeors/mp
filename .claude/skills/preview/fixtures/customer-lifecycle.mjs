// The Customer lifecycle chart on the Customers page: the rows of
// `admin_customer_lifecycle_counts`, made up. One row per (stage, sub-status,
// no dates yet), as the function groups the Customer overview.
//
// The default is a base some months after the cutover, with someone in every
// stage and sub-status. `lifecycle-undated` is the day after the import:
// every buyer placed by their Shopify-era order count, nobody At risk or Lost.
// The Returning customers card's cohorts are below (slice 06).

const row = (stage, detail, undated, customers) => ({ stage, detail, undated, customers });

const SETTLED_IN = [
  row("lead", null, false, 512),
  row("new", "awaiting_delivery", false, 18),
  row("new", "delivered", false, 41),
  row("new", "settled", false, 96),
  row("new", null, true, 1104),
  row("loyal", "repeat_purchases", false, 64),
  row("loyal", "repeat_purchases", true, 271),
  row("loyal", "bookings", false, 9),
  row("at_risk", null, false, 38),
  row("at_risk", "lapsed", false, 12),
  row("lost", null, false, 17),
  row("lost", null, true, 4),
];

const UNDATED = [
  row("lead", null, false, 538),
  row("new", null, true, 1266),
  row("loyal", "repeat_purchases", true, 352),
];

/**
 * PRD-crm-retention-loop slice 06: `admin_returning_customer_cohorts`, made
 * up. Eighteen months of first-time customers back from `now`, seeded so every
 * run draws the same table: the older months have had their full 12 months, the
 * last twelve are still open, and one closed month is under 20 people.
 */
function returningCohorts(now) {
  let a = 7;
  const draw = () => ((a = (a * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out = [];
  for (let back = 18; back >= 1; back--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const first = back === 15 ? 14 : Math.round(30 + draw() * 50);
    const open = back <= 12;
    const share = open ? (12 - back) / 12 : 1;
    const viaReadjustment = Math.round(first * (0.12 + draw() * 0.12) * share);
    const viaPurchase = Math.round(first * (0.08 + draw() * 0.08) * share);
    const both = Math.round(Math.min(viaReadjustment, viaPurchase) * 0.3);
    out.push({
      cohort_month: d.toISOString().slice(0, 10),
      first_buyers: first,
      came_back: viaReadjustment + viaPurchase - both,
      via_readjustment: viaReadjustment,
      via_purchase: viaPurchase,
    });
  }
  return out;
}

export default function customerLifecycle({ scenario, now }) {
  const rows = scenario === "lifecycle-undated" ? UNDATED : SETTLED_IN;
  return {
    rpc: {
      admin_customer_lifecycle_counts: () => rows,
      admin_returning_customer_cohorts: () => (scenario === "lifecycle-undated" ? [] : returningCohorts(now)),
    },
  };
}
