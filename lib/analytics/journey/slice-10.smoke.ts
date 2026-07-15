/**
 * Live DB smoke for slice 10 (Converted sink). Inserts disposable rows, asserts, deletes.
 * Run: npx tsx --env-file=.env.local lib/analytics/journey/slice-10.smoke.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadPageTransitionsFromDb } from "./aggregates";
import { CONVERTED_NODE } from "./converted-sink";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("slice-10.smoke.ts: skip (no Supabase env)");
  process.exit(0);
}

const db = createClient(url, key);
const TAG = `smoke-10-${Date.now()}`;
const visitorId = crypto.randomUUID();
const visitProspect = crypto.randomUUID();
const visitPrior = crypto.randomUUID();
const visitPaid = crypto.randomUUID();
const orderId = crypto.randomUUID();
const visitIds = [visitProspect, visitPrior, visitPaid];

async function cleanup() {
  await db.from("analytics_events").delete().in("visit_id", visitIds);
  await db.from("analytics_visits").delete().in("id", visitIds);
  await db.from("analytics_visitors").delete().eq("id", visitorId);
  await db.from("orders").delete().eq("id", orderId);
}

async function main() {
  const { error: vErr } = await db.from("analytics_visitors").insert({ id: visitorId });
  if (vErr) throw new Error(vErr.message);

  const tProspect0 = "2026-07-20T10:00:00.000Z";
  const tProspect1 = "2026-07-20T10:05:00.000Z";
  const tPrior = "2026-07-19T09:00:00.000Z";
  const tPaid0 = "2026-07-20T14:00:00.000Z";
  const tPaid1 = "2026-07-20T14:20:00.000Z";
  const tPaid2 = "2026-07-20T14:45:00.000Z";
  const tPaidAt = "2026-07-20T15:00:00.000Z";
  const journeyDurationMs = Date.parse(tPaidAt) - Date.parse(tPaid0);

  const { error: oErr } = await db.from("orders").insert({
    id: orderId,
    order_number: `${TAG}-ord`,
    email: `${TAG}@smoke.example`,
    subtotal: 299,
    total: 299,
    paid_at: tPaidAt,
    shipping_address: { line1: "smoke" },
  });
  if (oErr) throw new Error(oErr.message);

  const { error: visErr } = await db.from("analytics_visits").insert([
    {
      id: visitProspect,
      visitor_id: visitorId,
      entry_source: TAG,
      started_at: tProspect0,
      ended_at: tProspect1,
      drop_off_path: "/shop",
    },
    {
      id: visitPrior,
      visitor_id: visitorId,
      entry_source: `${TAG}-google`,
      started_at: tPrior,
      ended_at: "2026-07-19T09:30:00.000Z",
      drop_off_path: "/",
    },
    {
      id: visitPaid,
      visitor_id: visitorId,
      entry_source: TAG,
      started_at: tPaid0,
      ended_at: tPaid2,
      drop_off_path: "/checkout",
      converted_order_id: orderId,
    },
  ]);
  if (visErr) throw new Error(visErr.message);

  const { error: eErr } = await db.from("analytics_events").insert([
    { visit_id: visitProspect, visitor_id: visitorId, type: "page_view", path: "/", occurred_at: tProspect0 },
    { visit_id: visitProspect, visitor_id: visitorId, type: "page_view", path: "/shop", occurred_at: tProspect1 },
    { visit_id: visitPrior, visitor_id: visitorId, type: "page_view", path: "/", occurred_at: tPrior },
    { visit_id: visitPaid, visitor_id: visitorId, type: "page_view", path: "/", occurred_at: tPaid0 },
    { visit_id: visitPaid, visitor_id: visitorId, type: "page_view", path: "/shop", occurred_at: tPaid1 },
    { visit_id: visitPaid, visitor_id: visitorId, type: "page_view", path: "/checkout", occurred_at: tPaid2 },
  ]);
  if (eErr) throw new Error(eErr.message);

  const from = "2026-07-01T00:00:00.000Z";
  const to = "2026-07-31T23:59:59.000Z";
  const base = { from, to, entrySource: TAG };

  const defaultGraph = await loadPageTransitionsFromDb(db, base);
  assert.ok(
    !defaultGraph.nodes.some((n) => n.path === CONVERTED_NODE),
    `default graph must exclude Converted sink: ${JSON.stringify(defaultGraph.nodes.map((n) => n.path))}`,
  );
  assert.ok(defaultGraph.nodes.some((n) => n.path === "/shop"), "prospect path should remain in default cohort");

  const withConverted = await loadPageTransitionsFromDb(db, { ...base, includeConverted: true });
  assert.ok(
    withConverted.nodes.some((n) => n.path === CONVERTED_NODE),
    "includeConverted must attach Converted sink",
  );
  assert.ok(
    withConverted.edges.some((e) => e.from === "/checkout" && e.to === CONVERTED_NODE && e.count >= 1),
    `expected feed edge /checkout -> Converted: ${JSON.stringify(withConverted.edges)}`,
  );

  const convertedPanel = await loadPageTransitionsFromDb(db, {
    ...base,
    includeConverted: true,
    detailPath: CONVERTED_NODE,
  });
  assert.ok(convertedPanel.convertedDetail, "convertedDetail required when detailPath is Converted");
  const detail = convertedPanel.convertedDetail!;
  assert.equal(detail.count, 1);
  assert.equal(detail.totalValue, 299);
  assert.equal(detail.byEntrySource[0]!.entrySource, TAG, "last-touch credits paying Visit entry source");
  assert.notEqual(detail.byEntrySource[0]!.entrySource, `${TAG}-google`);
  assert.equal(detail.samples[0]!.orderValue, 299);
  assert.equal(detail.samples[0]!.journeyDurationMs, journeyDurationMs);
  assert.deepEqual(detail.samples[0]!.shortPath, ["/", "/shop", "/checkout"]);

  await cleanup();
  console.log("slice-10.smoke.ts: ok");
}

main().catch(async (e) => {
  await cleanup().catch(() => {});
  console.error(e);
  process.exit(1);
});
