/**
 * Live DB smoke for slice 12 — GA staging + ga_client_id stitch.
 * Run: npx tsx --env-file=.env.local lib/analytics/journey/slice-12.smoke.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadPageTransitionsFromDb } from "./aggregates";
import { persistJourneyIngest } from "./ingest";
import { runGaSync } from "./ga-sync";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("slice-12.smoke.ts: skip (no Supabase env)");
  process.exit(0);
}

const db = createClient(url, key);
const TAG = `smoke-12-${Date.now()}`;
const gaClientId = `${Date.now()}.4242424242`;
const visitorId = crypto.randomUUID();
const visitId = crypto.randomUUID();
const insertedGaIds: string[] = [];

async function cleanup() {
  if (insertedGaIds.length) {
    await db.from("analytics_ga_events").delete().in("id", insertedGaIds);
  }
  // Fixture rows may have been inserted without capturing ids — delete by client_id tag window
  await db.from("analytics_ga_events").delete().eq("client_id", gaClientId);
  await db.from("analytics_events").delete().eq("visit_id", visitId);
  await db.from("analytics_visits").delete().eq("id", visitId);
  await db.from("analytics_visitors").delete().eq("id", visitorId);
}

async function main() {
  // AC: Admin graph does not query GA live (static + runtime path)
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const aggregatesSrc = readFileSync(join(root, "lib/analytics/journey/aggregates.ts"), "utf8");
  assert.doesNotMatch(aggregatesSrc, /analytics_ga|bigquery|googleapis|gtag/i);

  // AC: Visitor stores ga_client_id via ingest set-if-null
  const ingest = await persistJourneyIngest(db, {
    visitorId,
    visitId,
    gaClientId,
    entry: { search: `?utm_source=${TAG}` },
    events: [{ type: "page_view", path: "/shop", occurredAt: "2026-07-15T12:00:00.000Z" }],
  });
  assert.equal(ingest.ok, true, ingest.ok === false ? ingest.error : "");

  const { data: visitor, error: vErr } = await db
    .from("analytics_visitors")
    .select("id, ga_client_id")
    .eq("id", visitorId)
    .single();
  if (vErr) throw new Error(vErr.message);
  assert.equal(visitor.ga_client_id, gaClientId);

  // Set-if-null: second ingest must not clobber
  const clobber = await persistJourneyIngest(db, {
    visitorId,
    visitId,
    gaClientId: "9999999999.8888888888",
    events: [],
  });
  assert.equal(clobber.ok, true);
  const { data: visitor2 } = await db
    .from("analytics_visitors")
    .select("ga_client_id")
    .eq("id", visitorId)
    .single();
  assert.equal(visitor2?.ga_client_id, gaClientId);

  // AC: Fixture/export rows land in analytics_ga_events + stitch to Visitor
  const sync = await runGaSync(db, {
    rows: [
      {
        clientId: gaClientId,
        eventName: "page_view",
        eventTimestamp: "2026-07-15T12:01:00.000Z",
        raw: { smoke: TAG },
      },
      {
        clientId: "0000000000.1111111111",
        eventName: "session_start",
        eventTimestamp: "2026-07-15T12:02:00.000Z",
        raw: { smoke: TAG, unmatched: true },
      },
    ],
  });
  assert.equal(sync.ok, true);
  assert.equal(sync.loaded, 2);
  assert.equal(sync.inserted, 2);
  assert.ok(sync.stitched >= 1, `expected ≥1 stitch, got ${sync.stitched}`);

  const { data: stitched, error: sErr } = await db
    .from("analytics_ga_events")
    .select("id, client_id, visitor_id")
    .eq("client_id", gaClientId);
  if (sErr) throw new Error(sErr.message);
  assert.ok(stitched && stitched.length >= 1);
  for (const row of stitched) {
    insertedGaIds.push(row.id as string);
    assert.equal(row.visitor_id, visitorId, "matching client_id must link to Visitor");
  }

  const { data: unmatched } = await db
    .from("analytics_ga_events")
    .select("id, visitor_id")
    .eq("client_id", "0000000000.1111111111")
    .is("visitor_id", null);
  if (unmatched?.length) {
    for (const row of unmatched) insertedGaIds.push(row.id as string);
  }
  assert.ok(
    unmatched && unmatched.length >= 1,
    "unmatched GA client_id must remain unstitched",
  );

  // AC: Admin journey still reads first-party aggregates only (smoke query succeeds)
  const graph = await loadPageTransitionsFromDb(db, {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-31T23:59:59.000Z",
    entrySource: TAG,
  });
  assert.ok(graph.nodes.some((n) => n.path === "/shop"));

  await cleanup();
  console.log("slice-12.smoke.ts: ok", {
    gaClientId,
    inserted: sync.inserted,
    stitched: sync.stitched,
  });
}

main().catch(async (e) => {
  await cleanup().catch(() => {});
  console.error(e);
  process.exit(1);
});
