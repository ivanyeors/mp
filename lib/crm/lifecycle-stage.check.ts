/**
 * PRD-crm-retention-loop slice 03 parity check: the **Lifecycle stage** the
 * database computes is the one lib/crm/lifecycle-stage.ts computes.
 *
 * Run: CRM_CHECK_DATABASE_URL=postgresql://… npx tsx lib/crm/lifecycle-stage.check.ts
 *
 * CRM_CHECK_DATABASE_URL is a Postgres connection string for a database with
 * every migration applied (see lib/crm/purchase-lines.check.ts). `psql` must
 * be on the PATH. Everything runs in one transaction that is rolled back.
 *
 *   1. every row of lib/crm/__tests__/lifecycle-stage-cases.ts goes through
 *      `customer_lifecycle_stage` and `customer_lifecycle_delivery` with its
 *      own `now`, and must give the table's answer, as the TypeScript does;
 *   2. a fixture of Customers, Orders, lines and Shopify-era counts is
 *      inserted, and the overview's purchases, last_purchase_at, stage,
 *      delivery and undated must be what the TypeScript makes of the same
 *      Orders, and what the fixture says: a refund leaves a Lead, a paid
 *      re-adjustment fee is no purchase, a Shopify-only buyer is placed by
 *      count without dates;
 *   3. `stage=at-risk,lapsed` and `stage=lead`, mapped by
 *      `applyCustomerFilters`, list exactly the fixture's Customers in those
 *      stages, and *At risk* with *Lapsed* is exactly the dated buyers
 *      `last_order=over:12` lists;
 *   4. anon and authenticated cannot run either function or read the view.
 *
 * Without CRM_CHECK_DATABASE_URL it says so and stops; the TypeScript side is
 * covered by lib/crm/__tests__/lifecycle-stage.test.ts.
 */
import assert from "node:assert/strict";
import { applyCustomerFilters, parseCustomerFilters } from "@/lib/crm/customer-filters";
import { isCountedOrder } from "@/lib/crm/purchase-lines";
import {
  lifecycleDelivery,
  lifecycleStage,
  lifecycleUndated,
  type LifecycleDelivery,
  type LifecycleStage,
} from "@/lib/crm/lifecycle-stage";
import { LIFECYCLE_CASES } from "./__tests__/lifecycle-stage-cases";
import { SqlFilter, psqlJson as json, runPsql, sqlLiteral as lit } from "./__tests__/sql-check";

const url = process.env.CRM_CHECK_DATABASE_URL;
if (!url) {
  console.log("lifecycle-stage.check.ts: skipped — set CRM_CHECK_DATABASE_URL to a database with every migration applied");
  process.exit(0);
}
const psql = (sql: string) => runPsql(url, sql);

const DAY = 86_400_000;
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

const cid = (n: number) => `c0300000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const oid = (n: number) => `0c030000-0000-4000-8000-${String(n).padStart(12, "0")}`;

interface FixtureOrder {
  status: string;
  /** Days ago it was paid; null for unpaid. */
  paidDaysAgo: number | null;
  deliveredDaysAgo?: number;
  /** goods, service (a re-adjustment fee), or both. */
  lines: ("goods" | "service")[];
}

interface FixtureCustomer {
  why: string;
  shopifyOrders?: number;
  orders: FixtureOrder[];
  stage: LifecycleStage;
  delivery: LifecycleDelivery | null;
  undated: boolean;
}

const paid = (paidDaysAgo: number, extra: Partial<FixtureOrder> = {}): FixtureOrder => ({
  status: "confirmed",
  paidDaysAgo,
  lines: ["goods"],
  ...extra,
});

const FIXTURE: FixtureCustomer[] = [
  { why: "no Orders", orders: [], stage: "lead", delivery: null, undated: false },
  { why: "a refunded Order leaves no purchase", orders: [paid(40, { status: "refunded" })], stage: "lead", delivery: null, undated: false },
  { why: "a paid re-adjustment fee alone is no purchase", orders: [paid(10, { lines: ["service"] })], stage: "lead", delivery: null, undated: false },
  { why: "unpaid and cancelled Orders are no purchase", orders: [{ status: "pending", paidDaysAgo: null, lines: ["goods"] }, paid(5, { status: "cancelled" })], stage: "lead", delivery: null, undated: false },
  { why: "one purchase on its way", orders: [paid(5)], stage: "new", delivery: "awaiting_delivery", undated: false },
  { why: "one purchase delivered 10 days ago", orders: [paid(20, { deliveredDaysAgo: 10 })], stage: "new", delivery: "delivered", undated: false },
  {
    why: "a purchase then a re-adjustment fee stays New, dated by the purchase",
    orders: [paid(90, { deliveredDaysAgo: 80 }), paid(30, { lines: ["service"] })],
    stage: "new",
    delivery: "settled",
    undated: false,
  },
  { why: "partly refunded is still a purchase", orders: [paid(60, { status: "partially_refunded", deliveredDaysAgo: 55 })], stage: "new", delivery: "settled", undated: false },
  { why: "a line of each kind is a purchase", orders: [paid(15, { lines: ["goods", "service"] }), paid(3)], stage: "repeat", delivery: null, undated: false },
  { why: "three purchases", orders: [paid(300), paid(200), paid(100)], stage: "loyal", delivery: null, undated: false },
  { why: "last purchase 11 and a half months ago", orders: [paid(700), paid(350)], stage: "repeat", delivery: null, undated: false },
  { why: "last purchase 14 months ago", orders: [paid(800), paid(425)], stage: "at_risk", delivery: null, undated: false },
  { why: "last purchase 30 months ago", orders: [paid(913)], stage: "lapsed", delivery: null, undated: false },
  { why: "two Shopify-era orders, none here", shopifyOrders: 2, orders: [], stage: "repeat", delivery: null, undated: true },
  { why: "one Shopify-era order and one purchase here", shopifyOrders: 1, orders: [paid(60)], stage: "repeat", delivery: null, undated: false },
  { why: "a Migrated customer with no Shopify-era order", shopifyOrders: 0, orders: [], stage: "lead", delivery: null, undated: false },
  { why: "Shopify-era orders and a purchase 26 months ago", shopifyOrders: 4, orders: [paid(791)], stage: "lapsed", delivery: null, undated: false },
];

const BATCH = "b0300000-0000-4000-8000-000000000001";

function fixtureSql(): string {
  const out: string[] = [];
  let order = 0;
  let item = 0;
  out.push(
    `insert into public.customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at) values (${lit(BATCH)}, 'shopify_customers_csv', 'lifecycle-check.csv', ${lit("0".repeat(64))}, 0, current_date);`,
  );
  FIXTURE.forEach((c, i) => {
    const id = cid(i + 1);
    const email = `crm03-${i + 1}@example.com`;
    out.push(`insert into public.customers (id, email, first_name, last_name) values (${lit(id)}, ${lit(email)}, 'Stage', ${lit(`Fixture ${i + 1}`)});`);
    if (c.shopifyOrders != null) {
      out.push(
        `insert into public.migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, shopify_orders_count) values (${lit(id)}, ${lit(BATCH)}, true, 'no', current_date, ${c.shopifyOrders});`,
      );
    }
    for (const o of c.orders) {
      const orderId = oid(++order);
      out.push(
        `insert into public.orders (id, order_number, customer_id, email, status, subtotal, total, shipping_address, paid_at, delivered_at) values (${lit(orderId)}, ${lit(`CRM03-${order}`)}, ${lit(id)}, ${lit(email)}, ${lit(o.status)}, 100, 100, '{}'::jsonb, ${o.paidDaysAgo == null ? "null" : lit(daysAgo(o.paidDaysAgo))}, ${o.deliveredDaysAgo == null ? "null" : lit(daysAgo(o.deliveredDaysAgo))});`,
      );
      for (const kind of o.lines) {
        out.push(
          `insert into public.order_items (id, order_id, sku, product_title, quantity, unit_price, total_price, kind, service_key) values (${lit(`0d030000-0000-4000-8000-${String(++item).padStart(12, "0")}`)}, ${lit(orderId)}, 'CRM03-FIX', 'Fixture line', 1, 100, 100, ${lit(kind)}, ${kind === "service" ? "'readjustment'" : "null"});`,
        );
      }
    }
  });
  return out.join("\n");
}

const inFixture = `id in (${FIXTURE.map((_, i) => lit(cid(i + 1))).join(", ")})`;

/** The overview filtered by a list URL, among the fixture Customers. */
function filterQuery(name: string, search: string): string {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(search));
  assert.deepEqual(ignored, [], `${search}: nothing ignored`);
  const q = applyCustomerFilters(new SqlFilter(), filters, { now, order: false });
  return `select '@@${name}@@'::text || coalesce(jsonb_agg(id order by id), '[]') from public.admin_customer_overview where ${[inFixture, ...q.where].join(" and ")};`;
}

type OverviewRow = {
  id: string;
  purchases: number;
  last_purchase_at: string | null;
  lifecycle_stage: string;
  lifecycle_delivery: string | null;
  lifecycle_undated: boolean;
};

function main() {
  const diffs: string[] = [];

  // --- 1. the table, through the functions ----------------------------------
  const caseSql = LIFECYCLE_CASES.map(
    (c, i) =>
      `select '@@case_${i}@@'::text || jsonb_build_object(
        'stage', public.customer_lifecycle_stage(${c.purchases}, ${lit(c.lastPurchaseAt)}::timestamptz, ${lit(c.now)}::timestamptz),
        'delivery', public.customer_lifecycle_delivery(${c.purchases}, ${lit(c.lastPurchaseAt)}::timestamptz, ${lit(c.lastPurchaseDeliveredAt)}::timestamptz, ${lit(c.now)}::timestamptz));`,
  );

  const results = psql(
    [
      "begin;",
      "set local time zone 'UTC';",
      ...caseSql,
      fixtureSql(),
      `select '@@overview@@'::text || coalesce(jsonb_agg(to_jsonb(o)), '[]') from (select id, purchases, last_purchase_at, lifecycle_stage, lifecycle_delivery, lifecycle_undated from public.admin_customer_overview where ${inFixture}) o;`,
      filterQuery("at_risk_lapsed", "stage=at-risk,lapsed"),
      filterQuery("lead", "stage=lead"),
      filterQuery("over_12", "last_order=over:12"),
      `select '@@grants@@'::text || jsonb_build_object(
        'anon_stage', has_function_privilege('anon', 'public.customer_lifecycle_stage(int, timestamptz, timestamptz)', 'execute'),
        'auth_stage', has_function_privilege('authenticated', 'public.customer_lifecycle_stage(int, timestamptz, timestamptz)', 'execute'),
        'anon_delivery', has_function_privilege('anon', 'public.customer_lifecycle_delivery(int, timestamptz, timestamptz, timestamptz)', 'execute'),
        'auth_delivery', has_function_privilege('authenticated', 'public.customer_lifecycle_delivery(int, timestamptz, timestamptz, timestamptz)', 'execute'),
        'service_stage', has_function_privilege('service_role', 'public.customer_lifecycle_stage(int, timestamptz, timestamptz)', 'execute'),
        'anon_view', has_table_privilege('anon', 'public.admin_customer_overview', 'select'),
        'auth_view', has_table_privilege('authenticated', 'public.admin_customer_overview', 'select'));`,
      "rollback;",
    ].join("\n"),
  );

  LIFECYCLE_CASES.forEach((c, i) => {
    const sql = json<{ stage: string; delivery: string | null }>(results, `case_${i}`);
    const facts = { purchases: c.purchases, lastPurchaseAt: c.lastPurchaseAt, lastPurchaseDeliveredAt: c.lastPurchaseDeliveredAt };
    const ts = { stage: lifecycleStage(facts, new Date(c.now)), delivery: lifecycleDelivery(facts, new Date(c.now)) };
    if (sql.stage !== ts.stage || sql.delivery !== ts.delivery) {
      diffs.push(`case "${c.name}": SQL ${JSON.stringify(sql)}, TypeScript ${JSON.stringify(ts)}`);
    }
    if (sql.stage !== c.stage || sql.delivery !== c.delivery) {
      diffs.push(`case "${c.name}": SQL ${JSON.stringify(sql)}, the table says ${JSON.stringify({ stage: c.stage, delivery: c.delivery })}`);
    }
  });

  // --- 2. the overview over the fixture -------------------------------------
  const overview = new Map(json<OverviewRow[]>(results, "overview").map((r) => [r.id, r]));
  FIXTURE.forEach((c, i) => {
    const row = overview.get(cid(i + 1));
    if (!row) return diffs.push(`fixture "${c.why}": no overview row`);
    // The TypeScript's reading of the same Orders: counted, with a goods line.
    const purchases = c.orders.filter(
      (o) => o.paidDaysAgo != null && isCountedOrder({ paid_at: "x", status: o.status as never }) && o.lines.includes("goods"),
    );
    const latest = [...purchases].sort((a, b) => a.paidDaysAgo! - b.paidDaysAgo!)[0];
    const facts = {
      purchases: purchases.length + (c.shopifyOrders ?? 0),
      lastPurchaseAt: latest ? daysAgo(latest.paidDaysAgo!) : null,
      lastPurchaseDeliveredAt: latest?.deliveredDaysAgo != null ? daysAgo(latest.deliveredDaysAgo) : null,
    };
    const ts = {
      purchases: facts.purchases,
      last_purchase_at: facts.lastPurchaseAt && Date.parse(facts.lastPurchaseAt),
      lifecycle_stage: lifecycleStage(facts, now),
      lifecycle_delivery: lifecycleDelivery(facts, now),
      lifecycle_undated: lifecycleUndated(facts),
    };
    // Built in the same key order: jsonb reorders keys.
    const sql = {
      purchases: row.purchases,
      last_purchase_at: row.last_purchase_at && Date.parse(row.last_purchase_at),
      lifecycle_stage: row.lifecycle_stage,
      lifecycle_delivery: row.lifecycle_delivery,
      lifecycle_undated: row.lifecycle_undated,
    };
    if (JSON.stringify(sql) !== JSON.stringify(ts)) diffs.push(`fixture "${c.why}": SQL ${JSON.stringify(sql)}, TypeScript ${JSON.stringify(ts)}`);
    const said = { lifecycle_stage: c.stage, lifecycle_delivery: c.delivery, lifecycle_undated: c.undated };
    const got = { lifecycle_stage: row.lifecycle_stage, lifecycle_delivery: row.lifecycle_delivery, lifecycle_undated: row.lifecycle_undated };
    if (JSON.stringify(got) !== JSON.stringify(said)) diffs.push(`fixture "${c.why}": ${JSON.stringify(got)}, the fixture says ${JSON.stringify(said)}`);
  });

  // --- 3. the stage filter --------------------------------------------------
  const ids = (pred: (c: FixtureCustomer) => boolean) =>
    FIXTURE.map((c, i) => ({ c, id: cid(i + 1) }))
      .filter(({ c }) => pred(c))
      .map(({ id }) => id)
      .sort();
  const atRiskLapsed = json<string[]>(results, "at_risk_lapsed");
  if (JSON.stringify(atRiskLapsed) !== JSON.stringify(ids((c) => c.stage === "at_risk" || c.stage === "lapsed"))) {
    diffs.push(`stage=at-risk,lapsed: ${atRiskLapsed}`);
  }
  const lead = json<string[]>(results, "lead");
  if (JSON.stringify(lead) !== JSON.stringify(ids((c) => c.stage === "lead"))) diffs.push(`stage=lead: ${lead}`);
  const over12 = json<string[]>(results, "over_12");
  if (JSON.stringify(over12) !== JSON.stringify(atRiskLapsed)) diffs.push(`last_order=over:12 ${over12} is not At risk and Lapsed ${atRiskLapsed}`);

  // --- 4. server-only -------------------------------------------------------
  const grants = json<Record<string, boolean>>(results, "grants");
  const expected = { anon_stage: false, auth_stage: false, anon_delivery: false, auth_delivery: false, service_stage: true, anon_view: false, auth_view: false };
  for (const [key, want] of Object.entries(expected)) {
    if (grants[key] !== want) diffs.push(`privileges: ${key} is ${grants[key]}, expected ${want}`);
  }

  if (diffs.length) {
    console.error(`lifecycle-stage.check.ts: ${diffs.length} difference(s)\n  ${diffs.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    `compared ${LIFECYCLE_CASES.length} cases through the functions, ${FIXTURE.length} fixture Customers through the overview, two stage filters and Last order`,
  );
  console.log("lifecycle-stage.check.ts: ok (rolled back; nothing written)");
}

main();
