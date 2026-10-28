/**
 * CRM 04 parity check: `classifyOrderLine` (TypeScript) and
 * `customer_purchase_lines` (SQL) say the same of every line, and the Customer
 * overview and the list's filters return what a hand-written query does.
 *
 * Run: CRM_CHECK_DATABASE_URL=postgresql://… npx tsx lib/crm/purchase-lines.check.ts
 *
 * CRM_CHECK_DATABASE_URL is a Postgres connection string for a database with
 * every migration applied: a development project (Supabase dashboard → Connect
 * → direct connection string) or a local one. `psql` must be on the PATH.
 *
 * Everything runs in one transaction that is rolled back, so nothing is left
 * behind, on any database:
 *   1. the fixture (lib/crm/__tests__/purchase-lines-fixture.ts) is inserted;
 *   2. every Order line in the database, the fixture's and the database's own,
 *      is classified in TypeScript and read from the view, and any difference
 *      fails;
 *   3. the overview's paid_orders, first/last_paid_at, bought,
 *      last_readjusted_at and search_text are checked for the fixture Customers;
 *   4. `bought=premium&last_order=over:12&readjusted=never`, mapped by
 *      `applyCustomerFilters`, returns exactly what a hand-written SQL query
 *      over the base tables returns;
 *   5. the searches `Tan, Mei`, `(test)`, `a%b` and others run, and find
 *      exactly the fixture Customers they should.
 *
 * Without CRM_CHECK_DATABASE_URL it says so and stops; the TypeScript side is
 * covered by lib/crm/__tests__/purchase-lines.test.ts.
 */
import assert from "node:assert/strict";
import { applyCustomerFilters, parseCustomerFilters } from "@/lib/crm/customer-filters";
import { boughtClasses, isCountedOrder, purchaseLine, type PurchaseLine } from "@/lib/crm/purchase-lines";
import type { OrderRow } from "@/lib/readjustment/purchases";
import {
  BOOKINGS,
  BOUGHT,
  CUSTOMERS,
  LINES,
  ORDERS,
  PRODUCTS,
  SEARCHES,
  VARIANTS,
  lineRow,
  monthsAgo,
  type PillowIds,
} from "./__tests__/purchase-lines-fixture";
import { SqlFilter, psqlJson as json, runPsql, sqlJsonLiteral as jsonLit, sqlLiteral as lit } from "./__tests__/sql-check";

const url = process.env.CRM_CHECK_DATABASE_URL;
if (!url) {
  console.log("purchase-lines.check.ts: skipped — set CRM_CHECK_DATABASE_URL to a database with every migration applied");
  process.exit(0);
}

const psql = (sql: string) => runPsql(url!, sql);

const now = new Date();
const fixtureCustomerIds = Object.values(CUSTOMERS).map((c) => c.id);
const inFixture = `id in (${fixtureCustomerIds.map(lit).join(", ")})`;

/** The overview filtered by a list URL, among the fixture Customers. */
function filterQuery(name: string, search: string): string {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(search));
  assert.deepEqual(ignored, [], `${search}: nothing ignored`);
  const q = applyCustomerFilters(new SqlFilter(), filters, { now });
  const where = [inFixture, ...q.where].join("\n   and ");
  return `select '@@${name}@@'::text || coalesce(jsonb_agg(id order by id), '[]') from public.admin_customer_overview where ${where};`;
}

function fixtureSql(pillow: PillowIds): string {
  const rows = (table: string, columns: string[], values: string[][]) =>
    values.length ? `insert into public.${table} (${columns.join(", ")}) values\n  ${values.map((v) => `(${v.join(", ")})`).join(",\n  ")};` : "";
  return [
    rows(
      "customers",
      ["id", "email", "first_name", "last_name"],
      Object.values(CUSTOMERS).map((c) => [lit(c.id), lit(c.email), lit(c.first_name), lit(c.last_name)]),
    ),
    rows(
      "products",
      ["id", "slug", "product_type"],
      Object.values(PRODUCTS).map((p) => [lit(p.id), lit(p.slug), lit(p.product_type)]),
    ),
    rows(
      "product_variants",
      ["id", "product_id", "option1", "price_key", "pillow_product_id", "price"],
      Object.values(VARIANTS).map((v) => [
        lit(v.id),
        lit(v.product_id),
        lit(v.option1),
        lit(v.price_key),
        lit(v.pillow ? pillow[v.pillow] : null),
        "100",
      ]),
    ),
    rows(
      "orders",
      ["id", "order_number", "customer_id", "email", "status", "subtotal", "total", "shipping_address", "paid_at"],
      ORDERS.map((o) => [
        lit(o.id),
        lit(o.order_number),
        lit(o.customer_id),
        lit(Object.values(CUSTOMERS).find((c) => c.id === o.customer_id)?.email ?? "crm04-guest@example.com"),
        lit(o.status),
        "100",
        "100",
        "'{}'::jsonb",
        o.paidMonthsAgo == null ? "null" : lit(monthsAgo(now, o.paidMonthsAgo)),
      ]),
    ),
    rows(
      "order_items",
      ["id", "order_id", "variant_id", "sku", "product_title", "quantity", "unit_price", "total_price", "kind", "service_key", "customization_snapshot"],
      LINES.map((l) => [
        lit(l.id),
        lit(l.order_id),
        lit(l.variant_id),
        lit("CRM04-FIX"),
        lit("Fixture line"),
        "1",
        "100",
        "100",
        lit(l.kind),
        l.kind === "service" ? lit("readjustment") : "null",
        jsonLit(l.snapshot(pillow)),
      ]),
    ),
    rows(
      "readjustment_bookings",
      ["id", "customer_id", "purchase_source", "unlisted_where", "product_label", "product_type", "complimentary", "fee_amount", "location_name", "start_at", "end_at", "guest_name", "phone", "email", "status"],
      BOOKINGS.map((b) => {
        const start = monthsAgo(now, b.startMonthsAgo);
        const end = new Date(new Date(start).getTime() + 3_600_000).toISOString();
        return [lit(b.id), lit(b.customer_id), lit("unlisted"), lit("other"), lit("Mpillow"), lit("pillow"), "false", "0", lit("Fixture"), lit(start), lit(end), lit("Fixture"), lit("+6500000000"), lit("crm04-booking@example.com"), lit(b.status)];
      }),
    ),
  ].join("\n");
}

/** Every Order with its lines, shaped as `loadReadjustmentContext`'s query returns them. */
const ORDERS_AS_THE_APP_READS_THEM = `
select '@@orders@@'::text || coalesce(jsonb_agg(jsonb_build_object(
  'id', o.id, 'order_number', o.order_number, 'paid_at', o.paid_at, 'status', o.status, 'customer_id', o.customer_id,
  'order_items', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'quantity', i.quantity, 'returned_quantity', i.returned_quantity,
      'product_title', i.product_title, 'variant_title', i.variant_title, 'image_url', i.image_url,
      'customization_snapshot', i.customization_snapshot,
      'product_variants', case when v.id is null then null else jsonb_build_object(
        'option1', v.option1, 'price_key', v.price_key, 'pillow_product_id', v.pillow_product_id,
        'products', jsonb_build_object('product_type', p.product_type)) end
    )), '[]'::jsonb)
    from public.order_items i
    left join public.product_variants v on v.id = i.variant_id
    left join public.products p on p.id = v.product_id
    where i.order_id = o.id)
)), '[]') from public.orders o;`;

// The hand-written query for the acceptance filter, over the base tables and
// not the views: a Premium pillow on a counted Order, the latest purchase (a
// counted Order with a goods line, PRD-crm-retention-loop slice 03) more than
// 12 months ago, and no attended Re-adjustment booking.
const HAND_WRITTEN = `
select '@@hand_written@@'::text || coalesce(jsonb_agg(c.id order by c.id), '[]')
from public.customers c
where c.${inFixture}
  and exists (
    select 1
      from public.orders o
      join public.order_items i on i.order_id = o.id
      left join public.product_variants v on v.id = i.variant_id
      left join public.products p on p.id = v.product_id
     where o.customer_id = c.id
       and o.paid_at is not null
       and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
       and i.kind = 'goods'
       and case
             when jsonb_typeof(i.customization_snapshot -> 'result_id') = 'string'
              and i.customization_snapshot ->> 'product_type' in ('pillow', 'bolster')
               then i.customization_snapshot ->> 'product_type' = 'pillow'
                and i.customization_snapshot ->> 'assigned_tier' = 'premium'
             when p.product_type = 'bolster' then false
             else exists (
               select 1 from public.pillow_products pp
                where pp.kind = 'premium'
                  and pp.id::numeric = coalesce(
                        v.pillow_product_id::numeric,
                        case when jsonb_typeof(i.customization_snapshot -> 'pillow_product_id') = 'number'
                             then (i.customization_snapshot ->> 'pillow_product_id')::numeric end))
           end)
  and (select max(o.paid_at)
         from public.orders o
        where o.customer_id = c.id
          and o.paid_at is not null
          and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
          and exists (select 1 from public.order_items i where i.order_id = o.id and i.kind = 'goods')) < now() - interval '12 months'
  and not exists (
    select 1 from public.readjustment_bookings b
     where b.customer_id = c.id and b.status = 'attended');`;

type ViewRow = { customer_id: string | null; order_id: string; order_item_id: string; paid_at: string } & PurchaseLine;
type OverviewRow = {
  id: string;
  paid_orders: number;
  first_paid_at: string | null;
  last_paid_at: string | null;
  bought: string[];
  last_readjusted_at: string | null;
  search_text: string;
};
type DbOrder = OrderRow & { customer_id: string | null };

const sameTime = (a: string | null, b: string | null) => (a == null || b == null ? a === b : Date.parse(a) === Date.parse(b));

function main() {
  const ids = json<Record<keyof PillowIds, number | null>>(
    psql(`select '@@pillow@@'::text || jsonb_build_object(
      'premium', (select min(id) from public.pillow_products where kind = 'premium'),
      'basic', (select min(id) from public.pillow_products where kind = 'basic'),
      'missing', (select coalesce(max(id), 0) + 1000 from public.pillow_products));`),
    "pillow",
  );
  assert.ok(ids.premium != null && ids.basic != null, "the database needs a Premium and a Basic pillow product");
  const pillow = ids as PillowIds;

  const searches = SEARCHES.map((s, i) => filterQuery(`search_${i}`, new URLSearchParams({ search: s.search }).toString()));
  const results = psql(
    [
      "begin;",
      fixtureSql(pillow),
      ORDERS_AS_THE_APP_READS_THEM,
      `select '@@pillows@@'::text || coalesce(jsonb_agg(jsonb_build_object('id', id, 'size', size, 'kind', kind)), '[]') from public.pillow_products;`,
      `select '@@view@@'::text || coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.customer_purchase_lines l;`,
      `select '@@overview@@'::text || coalesce(jsonb_agg(to_jsonb(o)), '[]') from public.admin_customer_overview o where o.${inFixture};`,
      HAND_WRITTEN,
      filterQuery("acceptance", "bought=premium&last_order=over:12&readjusted=never"),
      ...searches,
      "rollback;",
    ].join("\n"),
  );

  // --- 2. every line, TypeScript against the view ---------------------------
  const pillowById = new Map(
    json<{ id: number; size: string; kind: string }[]>(results, "pillows").map((p) => [Number(p.id), { size: String(p.size), kind: String(p.kind) }]),
  );
  const view = new Map(json<ViewRow[]>(results, "view").map((r) => [r.order_item_id, r]));
  const fixtureLineIds = new Set(LINES.map((l) => l.id));
  const diffs: string[] = [];
  let compared = 0;
  let fixtureCompared = 0;
  for (const order of json<DbOrder[]>(results, "orders")) {
    for (const line of order.order_items ?? []) {
      compared += 1;
      if (fixtureLineIds.has(line.id)) fixtureCompared += 1;
      const ts = isCountedOrder(order) ? purchaseLine(line, pillowById) : null;
      const sql = view.get(line.id) ?? null;
      view.delete(line.id);
      const label = `${order.order_number} line ${line.id}`;
      if (!ts || !sql) {
        if (ts || sql) diffs.push(`${label}: TypeScript ${JSON.stringify(ts)}, SQL ${JSON.stringify(sql && { product_type: sql.product_type, tier: sql.tier })}`);
        continue;
      }
      if (ts.product_type !== sql.product_type || ts.tier !== sql.tier) {
        diffs.push(`${label}: TypeScript ${JSON.stringify(ts)}, SQL ${JSON.stringify({ product_type: sql.product_type, tier: sql.tier })}`);
      }
      if (sql.customer_id !== order.customer_id || sql.order_id !== order.id || !sameTime(sql.paid_at, order.paid_at)) {
        diffs.push(`${label}: the view's keys do not match its Order`);
      }
    }
  }
  for (const id of view.keys()) diffs.push(`view row ${id} has no Order line`);
  for (const l of LINES) {
    const sql = json<ViewRow[]>(results, "view").find((r) => r.order_item_id === l.id) ?? null;
    const got = sql && { product_type: sql.product_type, tier: sql.tier };
    if (JSON.stringify(got) !== JSON.stringify(l.expect)) diffs.push(`fixture "${l.why}": SQL ${JSON.stringify(got)}, expected ${JSON.stringify(l.expect)}`);
  }

  // --- 3. the overview's columns for the fixture Customers -----------------
  const overview = new Map(json<OverviewRow[]>(results, "overview").map((r) => [r.id, r]));
  for (const [name, c] of Object.entries(CUSTOMERS) as [keyof typeof CUSTOMERS, (typeof CUSTOMERS)[keyof typeof CUSTOMERS]][]) {
    const row = overview.get(c.id);
    if (!row) {
      diffs.push(`overview: no row for ${name}`);
      continue;
    }
    const counted = ORDERS.filter((o) => o.customer_id === c.id && o.paidMonthsAgo != null && isCountedOrder({ paid_at: "x", status: o.status }));
    const paidAt = counted.map((o) => Date.parse(monthsAgo(now, o.paidMonthsAgo!))).sort((a, b) => a - b);
    const lines = LINES.filter((l) => counted.some((o) => o.id === l.order_id))
      .map((l) => purchaseLine(lineRow(l, pillow), pillowById))
      .filter((l): l is PurchaseLine => l !== null);
    const attended = BOOKINGS.filter((b) => b.customer_id === c.id && b.status === "attended").map((b) => Date.parse(monthsAgo(now, b.startMonthsAgo)));
    const expected = {
      paid_orders: counted.length,
      first_paid_at: paidAt[0] ?? null,
      last_paid_at: paidAt.at(-1) ?? null,
      bought: boughtClasses(lines),
      last_readjusted_at: attended.length ? Math.max(...attended) : null,
      search_text: `${c.email} ${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase(),
    };
    const actual = {
      paid_orders: row.paid_orders,
      first_paid_at: row.first_paid_at && Date.parse(row.first_paid_at),
      last_paid_at: row.last_paid_at && Date.parse(row.last_paid_at),
      bought: row.bought,
      last_readjusted_at: row.last_readjusted_at && Date.parse(row.last_readjusted_at),
      search_text: row.search_text,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      diffs.push(`overview ${name}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
    if (JSON.stringify(row.bought) !== JSON.stringify(BOUGHT[name])) diffs.push(`overview ${name}: bought ${row.bought}, fixture says ${BOUGHT[name]}`);
  }

  // --- 4. the acceptance filter against the hand-written query -------------
  const wanted = Object.values(CUSTOMERS)
    .filter((c) => c.premiumLapsedNeverReadjusted)
    .map((c) => c.id)
    .sort();
  const handWritten = json<string[]>(results, "hand_written");
  const mapped = json<string[]>(results, "acceptance");
  if (JSON.stringify(handWritten) !== JSON.stringify(wanted)) diffs.push(`hand-written query: ${handWritten}, fixture says ${wanted}`);
  if (JSON.stringify(mapped) !== JSON.stringify(handWritten)) diffs.push(`bought=premium&last_order=over:12&readjusted=never: ${mapped}, hand-written ${handWritten}`);

  // --- 5. searches ----------------------------------------------------------
  SEARCHES.forEach((s, i) => {
    const found = json<string[]>(results, `search_${i}`);
    const want = s.finds.map((c) => c.id).sort();
    if (JSON.stringify(found) !== JSON.stringify(want)) diffs.push(`search ${JSON.stringify(s.search)}: ${found}, expected ${want}`);
  });

  console.log(
    `compared ${compared} order lines (${fixtureCompared} fixture, ${compared - fixtureCompared} the database's own), ` +
      `${overview.size} overview rows, the acceptance filter (${mapped.length} Customers) and ${SEARCHES.length} searches`,
  );
  for (const d of diffs) console.log(`FAIL  ${d}`);
  assert.equal(diffs.length, 0, `${diffs.length} difference(s)`);
  console.log("purchase-lines.check.ts: ok (rolled back; nothing written)");
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
