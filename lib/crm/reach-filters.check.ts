/**
 * PRD-campaign-audiences slice 05 check: the reach filters, through
 * `applyCustomerFilters`, against the Customer overview on real Postgres.
 *
 * Run: CRM_CHECK_DATABASE_URL=postgresql://… npx tsx lib/crm/reach-filters.check.ts
 *
 * CRM_CHECK_DATABASE_URL is a Postgres connection string for a database with
 * every migration applied (see lib/crm/purchase-lines.check.ts). `psql` must
 * be on the PATH. Everything runs in one transaction that is rolled back.
 *
 * A fixture of six Customers, their Orders, addresses, Points and campaign
 * sends is inserted. Then:
 *
 *   1. the overview's `ship_country`, `locale`, `points_expire_on`,
 *      `campaigns_sent`, `campaigns_clicked` and `last_emailed_at` are what
 *      the fixture says: the latest counted Order's country beats the
 *      address, a pending Order or a country that is not two letters counts
 *      for nothing, the default address beats a later one, a bounce is a
 *      send, a failed or pending one is not, never-emailed is '-infinity';
 *   2. each filter's URL, mapped by `applyCustomerFilters` (as PostgREST reads
 *      it), lists exactly the fixture's Customers it should, *Unknown* never
 *      among Singapore or outside it, and *not emailed in 30 days* keeping the
 *      never-emailed;
 *   3. with points off, nobody's points expire;
 *   4. anon and authenticated still cannot read the view.
 *
 * Without CRM_CHECK_DATABASE_URL it says so and stops; the TypeScript side is
 * covered by lib/crm/__tests__/customer-filters.test.ts.
 */
import assert from "node:assert/strict";
import { applyCustomerFilters, parseCustomerFilters } from "@/lib/crm/customer-filters";
import { SqlFilter, psqlJson as json, runPsql, sqlLiteral as lit } from "./__tests__/sql-check";

const url = process.env.CRM_CHECK_DATABASE_URL;
if (!url) {
  console.log("reach-filters.check.ts: skipped — set CRM_CHECK_DATABASE_URL to a database with every migration applied");
  process.exit(0);
}

const DAY = 86_400_000;
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY).toISOString();
const monthsAgo = (m: number) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - m);
  return d.toISOString();
};

const cid = (n: number) => `0d050000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CAMPAIGN_A = "0d05ca00-0000-4000-8000-00000000000a";
const CAMPAIGN_B = "0d05ca00-0000-4000-8000-00000000000b";

/** The fixture, by Customer number. */
const C = {
  sgOrder: 1, // latest counted Order ships to SG; an older one to MY
  myOrder: 2, // latest Order MY beats a default SG address; reads Chinese
  defaultAddress: 3, // no Order; a default address ' my ' beats a later SG one
  latestAddress: 4, // no Order; no default: the address saved last, MY
  pendingOnly: 5, // only a pending Order to SG: Unknown
  badCountry: 6, // a paid Order to "Singapore", not two letters: Unknown
} as const;
const ALL = Object.values(C);

let orderN = 0;
function order(customer: number, country: string, opts: { status?: string; paidAt?: string | null } = {}): string {
  const id = `0d05a000-0000-4000-8000-${String(++orderN).padStart(12, "0")}`;
  const paidAt = opts.paidAt === undefined ? daysAgo(30) : opts.paidAt;
  return [
    `insert into public.orders (id, order_number, customer_id, email, status, subtotal, total, shipping_address, paid_at)`,
    ` values (${lit(id)}, ${lit(`CA05-${orderN}`)}, ${lit(cid(customer))}, ${lit(`c${customer}@ca05.test`)},`,
    ` ${lit(opts.status ?? "confirmed")}, 100, 100, ${lit(JSON.stringify({ recipient: "X", line1: "1 Road", city: "C", postal_code: "1", country }))}::jsonb,`,
    ` ${paidAt == null ? "null" : lit(paidAt)});`,
    `insert into public.order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind)`,
    ` values (${lit(id)}, 'CA05', 'Fixture line', 1, 100, 100, 'goods');`,
  ].join("");
}

function address(customer: number, country: string, isDefault: boolean, updatedDaysAgo: number): string {
  return (
    `insert into public.customer_addresses (customer_id, recipient, line1, city, postal_code, country, is_default, created_at, updated_at)` +
    ` values (${lit(cid(customer))}, 'X', '1 Road', 'C', '1', ${lit(country)}, ${isDefault}, ${lit(daysAgo(updatedDaysAgo))}, ${lit(daysAgo(updatedDaysAgo))});`
  );
}

function send(customer: number, campaign: string, status: string, sentDaysAgo: number, clicked = false): string {
  const at = lit(daysAgo(sentDaysAgo));
  return (
    `insert into public.customer_campaign_sends (customer_id, template, campaign_id, wave, status, sent_at, bounced_at, first_clicked_at, clicks)` +
    ` values (${lit(cid(customer))}, ${lit(`campaign:${campaign}`)}, ${lit(campaign)}, 'w1', ${lit(status)}, ${at},` +
    ` ${status === "bounced" ? at : "null"}, ${clicked ? lit(daysAgo(sentDaysAgo - 1)) : "null"}, ${clicked ? 1 : 0});`
  );
}

function fixture(): string {
  const out: string[] = [
    // Points on, 24 months, whatever the database had.
    `insert into public.site_settings (key, value) values ('points_enabled', 'true'), ('points_expiry_months', '24')
       on conflict (key) do update set value = excluded.value;`,
    `insert into public.email_campaigns (id, name, subject, body, audience) values
       (${lit(CAMPAIGN_A)}, 'CA05 launch', 'S', 'B', 'subscribed'),
       (${lit(CAMPAIGN_B)}, 'CA05 follow-up', 'S', 'B', 'subscribed');`,
  ];
  for (const n of ALL) {
    out.push(
      `insert into public.customers (id, email, first_name, locale) values (${lit(cid(n))}, ${lit(`c${n}@ca05.test`)}, 'C${n}', ${lit(n === C.myOrder ? "zh-CN" : "en-US")});`,
    );
  }
  // Where they are.
  out.push(order(C.sgOrder, "MY", { paidAt: monthsAgo(30) }));
  out.push(order(C.sgOrder, "sg", { paidAt: monthsAgo(22) }));
  out.push(order(C.myOrder, "MY", { paidAt: monthsAgo(1) }));
  out.push(address(C.myOrder, "SG", true, 5));
  out.push(address(C.defaultAddress, " my ", true, 40));
  out.push(address(C.defaultAddress, "SG", false, 2));
  out.push(address(C.latestAddress, "SG", false, 40));
  out.push(address(C.latestAddress, "MY", false, 2));
  out.push(order(C.pendingOnly, "SG", { status: "pending", paidAt: null }));
  out.push(order(C.badCountry, "Singapore"));
  // Points: Customer 1's clock is 22 months back, so they expire within 3 months;
  // Customer 2's is a month back; Customer 3 holds none.
  out.push(
    `insert into public.points_ledger (customer_id, kind, points, note) values
       (${lit(cid(C.sgOrder))}, 'adjust', 500, 'CA05'),
       (${lit(cid(C.myOrder))}, 'adjust', 300, 'CA05'),
       (${lit(cid(C.defaultAddress))}, 'adjust', 100, 'CA05'),
       (${lit(cid(C.defaultAddress))}, 'adjust', -100, 'CA05');`,
  );
  // Campaigns: A reached 1 (clicked), 2 and 3 (bounced: still a send); 4 is pending; B failed for 2.
  out.push(send(C.sgOrder, CAMPAIGN_A, "sent", 40, true));
  out.push(send(C.myOrder, CAMPAIGN_A, "sent", 10));
  out.push(send(C.defaultAddress, CAMPAIGN_A, "bounced", 5));
  out.push(send(C.latestAddress, CAMPAIGN_A, "pending", 1));
  out.push(send(C.myOrder, CAMPAIGN_B, "failed", 2));
  return out.join("\n");
}

const inFixture = `id in (${ALL.map((n) => lit(cid(n))).join(", ")})`;

/** The overview filtered by a list URL, among the fixture Customers. */
function filterQuery(name: string, search: string): string {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(search));
  assert.deepEqual(ignored, [], `${search}: nothing ignored`);
  const q = applyCustomerFilters(new SqlFilter(), filters, { now, order: false });
  return `select '@@${name}@@'::text || coalesce(jsonb_agg(id order by id), '[]') from public.admin_customer_overview where ${[inFixture, ...q.where].join(" and ")};`;
}

/** Each filter's URL and the fixture Customers it lists. */
const FILTERS: { search: string; lists: number[] }[] = [
  { search: "ships_to=sg", lists: [C.sgOrder] },
  { search: "ships_to=not-sg", lists: [C.myOrder, C.defaultAddress, C.latestAddress] },
  { search: "ships_to=unknown", lists: [C.pendingOnly, C.badCountry] },
  { search: "language=zh-cn", lists: [C.myOrder] },
  { search: "language=en", lists: ALL.filter((n) => n !== C.myOrder) },
  { search: "points_expire=within:3", lists: [C.sgOrder] },
  { search: "points_expire=within:1", lists: [] },
  { search: "points_expire=within:24", lists: [C.sgOrder, C.myOrder] },
  { search: `campaign=${CAMPAIGN_A}:sent`, lists: [C.sgOrder, C.myOrder, C.defaultAddress] },
  { search: `campaign=${CAMPAIGN_A}:not-sent`, lists: [C.latestAddress, C.pendingOnly, C.badCountry] },
  { search: `campaign=${CAMPAIGN_A}:clicked`, lists: [C.sgOrder] },
  { search: `campaign=${CAMPAIGN_A}:not-clicked`, lists: [C.myOrder, C.defaultAddress] },
  { search: `campaign=${CAMPAIGN_B}:sent`, lists: [] },
  { search: `campaign=${CAMPAIGN_B}:not-sent`, lists: ALL },
  { search: "emailed=within:14", lists: [C.myOrder, C.defaultAddress] },
  { search: "emailed=over:30", lists: [C.sgOrder, C.latestAddress, C.pendingOnly, C.badCountry] },
  { search: "emailed=never", lists: [C.latestAddress, C.pendingOnly, C.badCountry] },
  // The PRD's demo, less the stage: Singapore and not emailed in 30 days.
  { search: "ships_to=sg&emailed=over:30", lists: [C.sgOrder] },
];

type OverviewRow = {
  id: string;
  ship_country: string | null;
  locale: string;
  points_expire_on: string | null;
  campaigns_sent: string[];
  campaigns_clicked: string[];
  last_emailed_at: string;
  last_campaign_sent_at: string | null;
};

function main() {
  const r = runPsql(
    url!,
    [
      "begin;",
      "set client_min_messages = warning;",
      fixture(),
      `select '@@rows@@'::text || jsonb_agg(jsonb_build_object(
         'id', id, 'ship_country', ship_country, 'locale', locale, 'points_expire_on', points_expire_on,
         'campaigns_sent', campaigns_sent, 'campaigns_clicked', campaigns_clicked,
         'last_emailed_at', last_emailed_at::text, 'last_campaign_sent_at', last_campaign_sent_at) order by id)
         from public.admin_customer_overview where ${inFixture};`,
      `select '@@expiry@@'::text || to_jsonb(public.points_expires_on(${lit(monthsAgo(22))}::timestamptz, 24));`,
      ...FILTERS.map((f, i) => filterQuery(`f${i}`, f.search)),
      `update public.site_settings set value = 'false' where key = 'points_enabled';`,
      `select '@@off@@'::text || count(*) from public.admin_customer_overview where ${inFixture} and points_expire_on is not null;`,
      `select '@@anon@@'::text || has_table_privilege('anon', 'public.admin_customer_overview', 'select');`,
      `select '@@authenticated@@'::text || has_table_privilege('authenticated', 'public.admin_customer_overview', 'select');`,
      "rollback;",
    ].join("\n"),
  );

  // 1. The columns.
  const rows = new Map(json<OverviewRow[]>(r, "rows").map((row) => [row.id, row]));
  const row = (n: number) => rows.get(cid(n))!;
  assert.equal(rows.size, ALL.length, "every fixture Customer is on the overview");
  assert.deepEqual(
    ALL.map((n) => row(n).ship_country),
    ["SG", "MY", "MY", "MY", null, null],
    "ship_country: the latest counted Order, else the default address, else the latest; Unknown otherwise",
  );
  assert.deepEqual(ALL.map((n) => row(n).locale), ["en-US", "zh-CN", "en-US", "en-US", "en-US", "en-US"], "locale");
  assert.equal(row(C.sgOrder).points_expire_on, json<string>(r, "expiry"), "points expire on the Profile's date");
  assert.ok(row(C.myOrder).points_expire_on, "a balance with a clock has a date");
  assert.equal(row(C.defaultAddress).points_expire_on, null, "no balance, no date");
  assert.equal(row(C.latestAddress).points_expire_on, null, "no points, no date");
  assert.deepEqual(row(C.sgOrder).campaigns_sent, [CAMPAIGN_A], "a send");
  assert.deepEqual(row(C.sgOrder).campaigns_clicked, [CAMPAIGN_A], "a click");
  assert.deepEqual(row(C.myOrder).campaigns_sent, [CAMPAIGN_A], "a failed send is not one");
  assert.deepEqual(row(C.defaultAddress).campaigns_sent, [CAMPAIGN_A], "a bounce is a send, as the campaign's Sent counts it");
  assert.deepEqual(row(C.latestAddress).campaigns_sent, [], "a pending send is not one yet");
  assert.equal(row(C.latestAddress).last_emailed_at, "-infinity", "never emailed sorts before every date");
  assert.equal(row(C.latestAddress).last_campaign_sent_at, null, "and the column a page shows stays null");
  assert.equal(Date.parse(row(C.myOrder).last_emailed_at), Date.parse(row(C.myOrder).last_campaign_sent_at!), "the same date when emailed");

  // 2. The filters.
  FILTERS.forEach((f, i) => {
    assert.deepEqual(json<string[]>(r, `f${i}`), [...f.lists].sort((a, b) => a - b).map(cid), f.search);
  });

  // 3. Points off.
  assert.equal(r.get("off"), "0", "nobody's points expire while points are off");

  // 4. Grants.
  assert.equal(r.get("anon"), "false", "anon cannot read the overview");
  assert.equal(r.get("authenticated"), "false", "authenticated cannot read the overview");

  console.log(`reach-filters.check.ts: ok (${ALL.length} Customers, ${FILTERS.length} filters)`);
}

main();
