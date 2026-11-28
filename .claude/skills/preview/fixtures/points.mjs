// Loyalty points (ADR 0030): switched on and launched 60 days ago, with the
// seeded ladder, so the Profile shows a live Points card, Settings → Discounts
// shows the settings and what points cost, and a Customer's page shows their
// Points card. Points never expire (2026-10-31), so nothing here carries a
// date beyond when points become usable. Every name, order and figure is made
// up.
//
// Two Customers hold points: the signed-in preview user ("Jamie", reviews.mjs,
// for /account) and Mei, a uuid so the Staff endpoint takes her:
// /settings/customers/00000000-0000-4000-8000-0000000000c7.
//
// Mei's paid shop Order MP2003 used a code and points together (S$10 + 1,000
// points off a S$120 Slope Mattress, S$10.88 shipping, S$110.88 paid), for the
// confirmation page's separate Discount and Points used lines:
// /shop/checkout/confirmation?order_number=MP2003&session_id=cs_preview_points
//
// Scenarios, for the Profile's Points card (/account):
//  - `--scenario points-bonus-only`: Jamie holds a Welcome bonus and Flower
//    points and has earned nothing from orders, so the balance is 1,004 while
//    the milestone bar is empty.
//  - `--scenario points-soon`: the launch is 30 days away, so the Profile
//    shows the "Coming soon" card with the empty ladder.

export const POINTS_CUSTOMER = "00000000-0000-4000-8000-0000000000c7";
const JAMIE = "cust-preview-owner";
const POINTS_ORDER = "0f0f0f0f-0000-4000-8000-000000002003";

export default function points({ scenario, now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const entry = (id, customer_id, kind, points, days, extra = {}) => ({
    id,
    customer_id,
    kind,
    points,
    order_id: null,
    refund_id: null,
    note: null,
    created_by_profile_id: null,
    milestone: null,
    created_at: ago(days),
    ...extra,
  });

  const bonusOnly = scenario === "points-bonus-only";
  const jamie = bonusOnly
    ? [entry("pts-j-1", JAMIE, "welcome_bonus", 1000, 3, { welcome_step: 1 }), entry("pts-j-2", JAMIE, "explore_flower", 4, 2)]
    : [
        entry("pts-j-1", JAMIE, "earn", 1170, 40, { order_id: "pts-order-j1" }),
        entry("pts-j-2", JAMIE, "milestone_bonus", 100, 40, { milestone: 1, note: "Milestone 1: 1,000 points earned from orders" }),
        entry("pts-j-3", JAMIE, "spend", -500, 20, { order_id: "pts-order-j2" }),
        entry("pts-j-4", JAMIE, "earn", 600, 6, { order_id: "pts-order-j2" }),
      ];

  const ledger = [
    // ADR 0030 (2026-11-08): Mei was imported from Shopify, and given points for what she spent there.
    entry("pts-m-0", POINTS_CUSTOMER, "past_purchases", 458, 58, {
      note: "S$458.00 spent on the old shop",
      created_by_profile_id: "00000000-0000-4000-8000-0000000000a5",
    }),
    ...jamie,
    entry("pts-m-1", POINTS_CUSTOMER, "claim_bonus", 1000, 55),
    entry("pts-m-2", POINTS_CUSTOMER, "earn", 870, 30, { order_id: "pts-order-m1" }),
    entry("pts-m-3", POINTS_CUSTOMER, "adjust", 300, 12, { note: "Goodwill: late delivery" }),
    entry("pts-m-4", POINTS_CUSTOMER, "spend", -1000, 9, { order_id: "pts-order-m2" }),
    entry("pts-m-5", POINTS_CUSTOMER, "spend_release", 1000, 8, { order_id: "pts-order-m2" }),
    entry("pts-m-6", POINTS_CUSTOMER, "spend", -1000, 1, { order_id: POINTS_ORDER }),
  ];

  const candidates = [
    ...(bonusOnly
      ? []
      : [{ order_id: "pts-order-j3", customer_id: JAMIE, order_number: "MP-20417", paid_at: ago(9), delivered_at: ago(5), base: 180, points: 540, release_at: ago(5 - 30) }]),
    { order_id: "pts-order-m3", customer_id: POINTS_CUSTOMER, order_number: "MP-20431", paid_at: ago(2), delivered_at: null, base: 89, points: 267, release_at: null },
  ];

  const sum = (rows, test = () => true) => rows.filter(test).reduce((n, r) => n + r.points, 0);
  const held = (customerId) => sum(ledger, (r) => r.customer_id === customerId);
  const pending = (customerId) => sum(candidates, (r) => r.customer_id === customerId);

  return {
    tables: {
      site_settings: [
        { key: "points_enabled", value: "true" },
        { key: "points_launch_at", value: ago(scenario === "points-soon" ? -30 : 60) },
        { key: "points_earn_per_dollar", value: "1" },
        { key: "points_min_redeem", value: "500" },
        { key: "points_max_share", value: "0.5" },
        { key: "points_claim_bonus", value: "1000" },
        { key: "points_claim_bonus_months", value: "3" },
        { key: "points_milestones", value: "1000:100,2500:300,5000:800,10000:2000" },
      ],
      points_ledger: ledger,
      orders: [
        {
          id: POINTS_ORDER,
          order_number: "MP2003",
          customer_id: POINTS_CUSTOMER,
          email: "mei.tan@example.test",
          phone: null,
          status: "confirmed",
          currency: "SGD",
          subtotal: 120,
          shipping_amount: 10.88,
          tax_amount: 0,
          // The code's S$10 and the points' S$10, together (ADR 0030).
          discount_amount: 20,
          coupon_id: null,
          coupon_code: "SAMPLE10",
          points_spent: 1000,
          points_discount: 10,
          total: 110.88,
          amount_captured: 110.88,
          amount_refunded: 0,
          shipping_address: { recipient: "Mei Tan", line1: "12 Example Road", city: "Singapore", postal_code: "000000", country: "SG" },
          billing_address: null,
          notes: null,
          payment_method: "stripe",
          payment_reference: "pi_preview_points",
          stripe_session_id: "cs_preview_points",
          paid_at: ago(1),
          needs_attention: false,
          locale: "en-US",
          created_at: ago(1),
          updated_at: ago(1),
        },
      ],
      order_items: [
        {
          id: "0f0f0f0f-1000-4000-8000-000000002031",
          order_id: POINTS_ORDER,
          kind: "goods",
          sku: "SLOPE-MATTRESS",
          product_title: "Slope Mattress",
          variant_title: null,
          quantity: 1,
          returned_quantity: 0,
          unit_price: 120,
          total_price: 120,
          unit_cost: 40,
          total_cost: 40,
          created_at: ago(1),
        },
      ],
      customers: [
        {
          id: POINTS_CUSTOMER,
          email: "mei.tan@example.test",
          first_name: "Mei",
          last_name: "Tan",
          // The mobile on her fitting record (fittings.mjs): the Customer page's WhatsApp and Call buttons need one.
          phone: "9123 0007",
          locale: "en-US",
          tags: ["side sleeper"],
          marketing_email: "subscribed",
          total_orders: 2,
          total_spent: 379,
          created_at: ago(400),
          updated_at: ago(2),
        },
      ],
    },
    views: {
      points_order_candidates: () => candidates,
      points_milestone_progress: () =>
        [JAMIE, POINTS_CUSTOMER].map((customer_id) => ({
          customer_id,
          earned: sum(ledger, (r) => r.customer_id === customer_id && (r.kind === "earn" || r.kind === "clawback")),
          granted: ledger.filter((r) => r.customer_id === customer_id && r.kind === "milestone_bonus").length,
        })),
      admin_points_summary: () => {
        const month = (r) => r.created_at >= ago(now.getUTCDate() - 1).slice(0, 10);
        const spent = (test) => -sum(ledger, (r) => (r.kind === "spend" || r.kind === "spend_release") && test(r));
        return [
          {
            outstanding_points: sum(ledger),
            pending_points: sum(candidates),
            spent_points: spent(() => true),
            spent_points_month: spent(month),
            clawed_back_points: 0,
            clawed_back_points_month: 0,
            earned_points: sum(ledger, (r) => r.kind === "earn"),
            claim_bonuses: ledger.filter((r) => r.kind === "claim_bonus").length,
            customers_with_entries: new Set(ledger.map((r) => r.customer_id)).size,
            milestone_bonuses: ledger.filter((r) => r.kind === "milestone_bonus").length,
            milestone_bonus_points: sum(ledger, (r) => r.kind === "milestone_bonus"),
            past_purchase_grants: ledger.filter((r) => r.kind === "past_purchases").length,
            past_purchase_points: sum(ledger, (r) => r.kind === "past_purchases"),
            welcome_bonuses: ledger.filter((r) => r.kind === "welcome_bonus").length,
            welcome_bonus_points: sum(ledger, (r) => r.kind === "welcome_bonus"),
            flower_points: sum(ledger, (r) => r.kind === "explore_flower"),
          },
        ];
      },
    },
    rpc: {
      // 20261108100100_past_purchase_points.sql: made-up customers still to be given points for past purchases.
      past_purchase_points_preview: () => [
        {
          customers: 412,
          points: 187730,
          spend: 187730.42,
          median: 430,
          largest: 4960,
          granted_customers: ledger.filter((r) => r.kind === "past_purchases").length,
          granted_points: sum(ledger, (r) => r.kind === "past_purchases"),
          partners_left_out: 2,
          earn_per_dollar: 1,
        },
      ],
      grant_past_purchase_points: ({ p_expect_customers, p_expect_points }) => [{ customers: p_expect_customers, points: p_expect_points }],
      // Summed from the live rows, so points granted during a run (a Welcome bonus, a flower) show in the balance.
      points_balance: ({ p_customer_id }, { tables }) => [
        { available: sum(tables?.points_ledger ?? ledger, (r) => r.customer_id === p_customer_id), pending: pending(p_customer_id) },
      ],
      is_partner_customer: () => false,
    },
  };
}
