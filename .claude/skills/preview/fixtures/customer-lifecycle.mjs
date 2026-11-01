// The Customer lifecycle chart on the Customers page: the rows of
// `admin_customer_lifecycle_counts`, made up. One row per (stage, sub-status,
// no dates yet), as the function groups the Customer overview.
//
// The default is a base some months after the cutover, with someone in every
// stage and sub-status. `lifecycle-undated` is the day after the import:
// every buyer placed by their Shopify-era order count, nobody At risk or Lost.

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

export default function customerLifecycle({ scenario }) {
  const rows = scenario === "lifecycle-undated" ? UNDATED : SETTLED_IN;
  return {
    rpc: {
      admin_customer_lifecycle_counts: () => rows,
    },
  };
}
