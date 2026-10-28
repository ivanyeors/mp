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
 *      `customer_lifecycle_stage` and `customer_lifecycle_detail` with its
 *      own `now`, and must give the table's answer, as the TypeScript does;
 *   2. a fixture of Customers, Orders, lines, Re-adjustment bookings,
 *      unsubscribes and Shopify-era counts is inserted, and the overview's
 *      purchases, last_purchase_at, attended_bookings, stage, sub-status and
 *      undated must be what the TypeScript makes of the same facts, and what
 *      the fixture says: a refund leaves a Lead, a paid re-adjustment fee is
 *      no purchase but its attended booking makes a Customer Loyal, an
 *      unattended booking counts for nothing, an unsubscribe is Lost until a
 *      later purchase, booking or re-subscribe, a Shopify-only buyer is placed
 *      by count without dates;
 *   3. `stage=` for each stage, mapped by `applyCustomerFilters`, lists
 *      exactly the fixture's Customers in that stage;
 *   4. anon and authenticated cannot run either function or read the view,
 *      and the six-stage functions are gone.
 *
 * Without CRM_CHECK_DATABASE_URL it says so and stops; the TypeScript side is
 * covered by lib/crm/__tests__/lifecycle-stage.test.ts.
 */
import assert from "node:assert/strict";
import { applyCustomerFilters, parseCustomerFilters } from "@/lib/crm/customer-filters";
import { isCountedOrder } from "@/lib/crm/purchase-lines";
import {
  LIFECYCLE_STAGES,
  lifecycleDetail,
  lifecycleStage,
  lifecycleUndated,
  type LifecycleDetail,
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

interface FixtureBooking {
  status: "attended" | "booked" | "no_show" | "cancelled";
  /** Days ago it started; negative for one still to come. */
  daysAgo: number;
}

interface FixtureCustomer {
  why: string;
  shopifyOrders?: number;
  orders: FixtureOrder[];
  bookings?: FixtureBooking[];
  /** Unsubscribed this many days ago. */
  unsubscribed?: { daysAgo: number; source?: "unsubscribe_link" | "complaint" | "account" | "support" };
  /** Turned email back on in their account this many days ago, after unsubscribing. */
  resubscribedDaysAgo?: number;
  stage: LifecycleStage;
  detail: LifecycleDetail | null;
  undated: boolean;
}

const paid = (paidDaysAgo: number, extra: Partial<FixtureOrder> = {}): FixtureOrder => ({
  status: "confirmed",
  paidDaysAgo,
  lines: ["goods"],
  ...extra,
});
const attended = (daysAgo: number): FixtureBooking => ({ status: "attended", daysAgo });

const FIXTURE: FixtureCustomer[] = [
  { why: "no Orders", orders: [], stage: "lead", detail: null, undated: false },
  { why: "a refunded Order leaves no purchase", orders: [paid(40, { status: "refunded" })], stage: "lead", detail: null, undated: false },
  { why: "a paid re-adjustment fee alone is no purchase", orders: [paid(10, { lines: ["service"] })], stage: "lead", detail: null, undated: false },
  { why: "unpaid and cancelled Orders are no purchase", orders: [{ status: "pending", paidDaysAgo: null, lines: ["goods"] }, paid(5, { status: "cancelled" })], stage: "lead", detail: null, undated: false },
  { why: "one purchase on its way", orders: [paid(5)], stage: "new", detail: "awaiting_delivery", undated: false },
  { why: "one purchase delivered 10 days ago", orders: [paid(20, { deliveredDaysAgo: 10 })], stage: "new", detail: "delivered", undated: false },
  {
    why: "a purchase then a re-adjustment fee, not yet attended, stays New, dated by the purchase",
    orders: [paid(90, { deliveredDaysAgo: 80 }), paid(30, { lines: ["service"] })],
    bookings: [{ status: "booked", daysAgo: -3 }],
    stage: "new",
    detail: "settled",
    undated: false,
  },
  { why: "partly refunded is still a purchase", orders: [paid(60, { status: "partially_refunded", deliveredDaysAgo: 55 })], stage: "new", detail: "settled", undated: false },
  { why: "a line of each kind is a purchase", orders: [paid(15, { lines: ["goods", "service"] }), paid(3)], stage: "loyal", detail: "repeat_purchases", undated: false },
  { why: "three purchases", orders: [paid(300), paid(200), paid(100)], stage: "loyal", detail: "repeat_purchases", undated: false },
  { why: "last purchase 11 and a half months ago", orders: [paid(700), paid(350)], stage: "loyal", detail: "repeat_purchases", undated: false },
  { why: "last purchase 14 months ago", orders: [paid(800), paid(425)], stage: "at_risk", detail: null, undated: false },
  { why: "last purchase 30 months ago", orders: [paid(913)], stage: "at_risk", detail: "lapsed", undated: false },
  { why: "two Shopify-era orders, none here", shopifyOrders: 2, orders: [], stage: "loyal", detail: "repeat_purchases", undated: true },
  { why: "one Shopify-era order and one purchase here", shopifyOrders: 1, orders: [paid(60)], stage: "loyal", detail: "repeat_purchases", undated: false },
  { why: "a Migrated customer with no Shopify-era order", shopifyOrders: 0, orders: [], stage: "lead", detail: null, undated: false },
  { why: "Shopify-era orders and a purchase 26 months ago", shopifyOrders: 4, orders: [paid(791)], stage: "at_risk", detail: "lapsed", undated: false },
  // Attended Re-adjustment bookings.
  {
    why: "a purchase and the re-adjustment its fee paid for, attended",
    orders: [paid(90, { deliveredDaysAgo: 80 }), paid(30, { lines: ["service"] })],
    bookings: [attended(30)],
    stage: "loyal",
    detail: "bookings",
    undated: false,
  },
  { why: "no-show and cancelled bookings count for nothing", orders: [], bookings: [{ status: "no_show", daysAgo: 20 }, { status: "cancelled", daysAgo: 10 }], stage: "lead", detail: null, undated: false },
  { why: "an attended booking and no purchase here", orders: [], bookings: [attended(150)], stage: "loyal", detail: "bookings", undated: false },
  { why: "a purchase 14 months ago, a booking attended 2 months ago", orders: [paid(425, { deliveredDaysAgo: 420 })], bookings: [attended(60)], stage: "loyal", detail: "bookings", undated: false },
  { why: "bookings attended 30 and 40 months ago only", orders: [], bookings: [attended(913), attended(1217)], stage: "at_risk", detail: "lapsed", undated: false },
  // Unsubscribes.
  { why: "a Lead who unsubscribed", orders: [], unsubscribed: { daysAgo: 10 }, stage: "lost", detail: null, undated: false },
  { why: "unsubscribed after their one purchase", orders: [paid(60, { deliveredDaysAgo: 55 })], unsubscribed: { daysAgo: 20 }, stage: "lost", detail: null, undated: false },
  { why: "bought after unsubscribing", orders: [paid(5)], unsubscribed: { daysAgo: 40 }, stage: "new", detail: "awaiting_delivery", undated: false },
  { why: "attended a booking after unsubscribing", orders: [paid(100, { deliveredDaysAgo: 95 })], bookings: [attended(3)], unsubscribed: { daysAgo: 40 }, stage: "loyal", detail: "bookings", undated: false },
  { why: "unsubscribed, then turned email back on", orders: [paid(60, { deliveredDaysAgo: 50 })], unsubscribed: { daysAgo: 40 }, resubscribedDaysAgo: 30, stage: "new", detail: "settled", undated: false },
  { why: "Shopify-era orders only, unsubscribed by Staff", shopifyOrders: 2, orders: [], unsubscribed: { daysAgo: 15, source: "support" }, stage: "lost", detail: null, undated: true },
  { why: "a spam complaint", orders: [paid(200, { deliveredDaysAgo: 190 })], unsubscribed: { daysAgo: 7, source: "complaint" }, stage: "lost", detail: null, undated: false },
];

const BATCH = "b0300000-0000-4000-8000-000000000001";

function fixtureSql(): string {
  const out: string[] = [];
  let order = 0;
  let item = 0;
  let booking = 0;
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
    for (const b of c.bookings ?? []) {
      const start = daysAgo(b.daysAgo);
      out.push(
        `insert into public.readjustment_bookings (id, customer_id, purchase_source, unlisted_where, product_label, product_type, complimentary, fee_amount, location_name, start_at, end_at, guest_name, phone, email, status) values (${lit(`0b030000-0000-4000-8000-${String(++booking).padStart(12, "0")}`)}, ${lit(id)}, 'unlisted', 'in_store', 'Fixture pillow', 'pillow', false, 0, 'Fixture studio', ${lit(start)}, ${lit(start)}::timestamptz + interval '30 minutes', 'Stage Fixture', '+6500000000', ${lit(email)}, ${lit(b.status)});`,
      );
    }
    if (c.unsubscribed) {
      out.push(`select public.set_marketing_email(${lit(id)}, 'unsubscribed', ${lit(c.unsubscribed.source ?? "unsubscribe_link")}, ${lit(daysAgo(c.unsubscribed.daysAgo))});`);
    }
    if (c.resubscribedDaysAgo != null) {
      out.push(`select public.set_marketing_email(${lit(id)}, 'subscribed', 'account', ${lit(daysAgo(c.resubscribedDaysAgo))});`);
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

const stageParam = (stage: LifecycleStage) => stage.replace("_", "-");

type OverviewRow = {
  id: string;
  purchases: number;
  last_purchase_at: string | null;
  attended_bookings: number;
  lifecycle_stage: string;
  lifecycle_detail: string | null;
  lifecycle_undated: boolean;
};

/** What the TypeScript reads from a fixture Customer: the facts the overview's columns hold. */
function factsOf(c: FixtureCustomer) {
  const purchases = c.orders.filter(
    (o) => o.paidDaysAgo != null && isCountedOrder({ paid_at: "x", status: o.status as never }) && o.lines.includes("goods"),
  );
  const latest = [...purchases].sort((a, b) => a.paidDaysAgo! - b.paidDaysAgo!)[0];
  const done = (c.bookings ?? []).filter((b) => b.status === "attended").sort((a, b) => a.daysAgo - b.daysAgo);
  return {
    purchases: purchases.length + (c.shopifyOrders ?? 0),
    lastPurchaseAt: latest ? daysAgo(latest.paidDaysAgo!) : null,
    lastPurchaseDeliveredAt: latest?.deliveredDaysAgo != null ? daysAgo(latest.deliveredDaysAgo) : null,
    bookings: done.length,
    lastBookingAt: done[0] ? daysAgo(done[0].daysAgo) : null,
    unsubscribedAt: c.unsubscribed && c.resubscribedDaysAgo == null ? daysAgo(c.unsubscribed.daysAgo) : null,
  };
}

function main() {
  const diffs: string[] = [];

  // --- 1. the table, through the functions ----------------------------------
  const ts = (v: string | null) => `${lit(v)}::timestamptz`;
  const caseSql = LIFECYCLE_CASES.map(
    (c, i) =>
      `select '@@case_${i}@@'::text || jsonb_build_object(
        'stage', public.customer_lifecycle_stage(${c.purchases}, ${ts(c.lastPurchaseAt)}, ${c.bookings}, ${ts(c.lastBookingAt)}, ${ts(c.unsubscribedAt)}, ${ts(c.now)}),
        'detail', public.customer_lifecycle_detail(${c.purchases}, ${ts(c.lastPurchaseAt)}, ${ts(c.lastPurchaseDeliveredAt)}, ${c.bookings}, ${ts(c.lastBookingAt)}, ${ts(c.unsubscribedAt)}, ${ts(c.now)}));`,
  );

  const stage6 = "int, timestamptz, int, timestamptz, timestamptz, timestamptz";
  const detail7 = "int, timestamptz, timestamptz, int, timestamptz, timestamptz, timestamptz";
  const results = psql(
    [
      "begin;",
      "set local time zone 'UTC';",
      ...caseSql,
      fixtureSql(),
      `select '@@overview@@'::text || coalesce(jsonb_agg(to_jsonb(o)), '[]') from (select id, purchases, last_purchase_at, attended_bookings, lifecycle_stage, lifecycle_detail, lifecycle_undated from public.admin_customer_overview where ${inFixture}) o;`,
      ...LIFECYCLE_STAGES.map((s) => filterQuery(`stage_${s}`, `stage=${stageParam(s)}`)),
      filterQuery("stage_loyal_new", "stage=loyal,new"),
      `select '@@grants@@'::text || jsonb_build_object(
        'anon_stage', has_function_privilege('anon', 'public.customer_lifecycle_stage(${stage6})', 'execute'),
        'auth_stage', has_function_privilege('authenticated', 'public.customer_lifecycle_stage(${stage6})', 'execute'),
        'anon_detail', has_function_privilege('anon', 'public.customer_lifecycle_detail(${detail7})', 'execute'),
        'auth_detail', has_function_privilege('authenticated', 'public.customer_lifecycle_detail(${detail7})', 'execute'),
        'service_stage', has_function_privilege('service_role', 'public.customer_lifecycle_stage(${stage6})', 'execute'),
        'service_detail', has_function_privilege('service_role', 'public.customer_lifecycle_detail(${detail7})', 'execute'),
        'old_stage_gone', to_regprocedure('public.customer_lifecycle_stage(int, timestamptz, timestamptz)') is null,
        'old_delivery_gone', to_regprocedure('public.customer_lifecycle_delivery(int, timestamptz, timestamptz, timestamptz)') is null,
        'anon_view', has_table_privilege('anon', 'public.admin_customer_overview', 'select'),
        'auth_view', has_table_privilege('authenticated', 'public.admin_customer_overview', 'select'));`,
      "rollback;",
    ].join("\n"),
  );

  LIFECYCLE_CASES.forEach((c, i) => {
    const sql = json<{ stage: string; detail: string | null }>(results, `case_${i}`);
    const at = new Date(c.now);
    const ts = { stage: lifecycleStage(c, at), detail: lifecycleDetail(c, at) };
    if (sql.stage !== ts.stage || sql.detail !== ts.detail) {
      diffs.push(`case "${c.name}": SQL ${JSON.stringify(sql)}, TypeScript ${JSON.stringify(ts)}`);
    }
    if (sql.stage !== c.stage || sql.detail !== c.detail) {
      diffs.push(`case "${c.name}": SQL ${JSON.stringify(sql)}, the table says ${JSON.stringify({ stage: c.stage, detail: c.detail })}`);
    }
  });

  // --- 2. the overview over the fixture -------------------------------------
  const overview = new Map(json<OverviewRow[]>(results, "overview").map((r) => [r.id, r]));
  FIXTURE.forEach((c, i) => {
    const row = overview.get(cid(i + 1));
    if (!row) return diffs.push(`fixture "${c.why}": no overview row`);
    const facts = factsOf(c);
    const ts = {
      purchases: facts.purchases,
      last_purchase_at: facts.lastPurchaseAt && Date.parse(facts.lastPurchaseAt),
      attended_bookings: facts.bookings,
      lifecycle_stage: lifecycleStage(facts, now),
      lifecycle_detail: lifecycleDetail(facts, now),
      lifecycle_undated: lifecycleUndated(facts),
    };
    // Built in the same key order: jsonb reorders keys.
    const sql = {
      purchases: row.purchases,
      last_purchase_at: row.last_purchase_at && Date.parse(row.last_purchase_at),
      attended_bookings: row.attended_bookings,
      lifecycle_stage: row.lifecycle_stage,
      lifecycle_detail: row.lifecycle_detail,
      lifecycle_undated: row.lifecycle_undated,
    };
    if (JSON.stringify(sql) !== JSON.stringify(ts)) diffs.push(`fixture "${c.why}": SQL ${JSON.stringify(sql)}, TypeScript ${JSON.stringify(ts)}`);
    const said = { lifecycle_stage: c.stage, lifecycle_detail: c.detail, lifecycle_undated: c.undated };
    const got = { lifecycle_stage: row.lifecycle_stage, lifecycle_detail: row.lifecycle_detail, lifecycle_undated: row.lifecycle_undated };
    if (JSON.stringify(got) !== JSON.stringify(said)) diffs.push(`fixture "${c.why}": ${JSON.stringify(got)}, the fixture says ${JSON.stringify(said)}`);
  });

  // --- 3. the stage filter --------------------------------------------------
  const ids = (pred: (c: FixtureCustomer) => boolean) =>
    FIXTURE.map((c, i) => ({ c, id: cid(i + 1) }))
      .filter(({ c }) => pred(c))
      .map(({ id }) => id)
      .sort();
  for (const s of LIFECYCLE_STAGES) {
    const got = json<string[]>(results, `stage_${s}`);
    const want = ids((c) => c.stage === s);
    if (want.length === 0) diffs.push(`stage=${stageParam(s)}: the fixture has no ${s} Customer`);
    if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`stage=${stageParam(s)}: ${got}, expected ${want}`);
  }
  const loyalNew = json<string[]>(results, "stage_loyal_new");
  if (JSON.stringify(loyalNew) !== JSON.stringify(ids((c) => c.stage === "loyal" || c.stage === "new"))) {
    diffs.push(`stage=loyal,new: ${loyalNew}`);
  }

  // --- 4. server-only, and the six-stage functions gone ---------------------
  const grants = json<Record<string, boolean>>(results, "grants");
  const expected = {
    anon_stage: false,
    auth_stage: false,
    anon_detail: false,
    auth_detail: false,
    service_stage: true,
    service_detail: true,
    old_stage_gone: true,
    old_delivery_gone: true,
    anon_view: false,
    auth_view: false,
  };
  for (const [key, want] of Object.entries(expected)) {
    if (grants[key] !== want) diffs.push(`privileges: ${key} is ${grants[key]}, expected ${want}`);
  }

  if (diffs.length) {
    console.error(`lifecycle-stage.check.ts: ${diffs.length} difference(s)\n  ${diffs.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    `compared ${LIFECYCLE_CASES.length} cases through the functions, ${FIXTURE.length} fixture Customers through the overview, and ${LIFECYCLE_STAGES.length + 1} stage filters`,
  );
  console.log("lifecycle-stage.check.ts: ok (rolled back; nothing written)");
}

main();
