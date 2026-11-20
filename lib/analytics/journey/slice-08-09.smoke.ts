import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadPageTransitionsFromDb, listCountriesFromDb } from "./aggregates";
import { DROP_OFF_NODE } from "./drop-off-sink";
import { resolveCountryFromHeaders, UNKNOWN_COUNTRY } from "./country";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("slice-08-09.smoke.ts: skip (no Supabase env)");
  process.exit(0);
}

const db = createClient(url, key);
const TAG = `smoke-0809-${Date.now()}`;
const visitorId = crypto.randomUUID();
const visit1 = crypto.randomUUID();
const visit2 = crypto.randomUUID();
const visitOther = crypto.randomUUID();

async function cleanup() {
  await db.from("analytics_events").delete().in("visit_id", [visit1, visit2, visitOther]);
  await db.from("analytics_visits").delete().in("id", [visit1, visit2, visitOther]);
  await db.from("analytics_visitors").delete().eq("id", visitorId);
}

async function main() {
  assert.equal(resolveCountryFromHeaders({ "x-vercel-ip-country": "sg" }), "SG");
  assert.equal(resolveCountryFromHeaders({ cookie: "NEXT_LOCALE=ms" }), UNKNOWN_COUNTRY);

  const { error: vErr } = await db.from("analytics_visitors").insert({ id: visitorId });
  if (vErr) throw new Error(vErr.message);

  const t0 = "2026-07-10T10:00:00.000Z";
  const t1end = "2026-07-10T10:20:00.000Z";
  const t2 = "2026-07-12T15:00:00.000Z";

  const { error: visErr } = await db.from("analytics_visits").insert([
    {
      id: visit1,
      visitor_id: visitorId,
      entry_source: TAG,
      country: "SG",
      started_at: t0,
      ended_at: t1end,
      drop_off_path: "/shop",
    },
    {
      id: visit2,
      visitor_id: visitorId,
      entry_source: TAG,
      country: "MY",
      started_at: t2,
      ended_at: null,
      drop_off_path: null,
    },
    {
      id: visitOther,
      visitor_id: visitorId,
      entry_source: TAG,
      country: "Unknown",
      started_at: "2026-07-11T08:00:00.000Z",
      ended_at: "2026-07-11T08:05:00.000Z",
      drop_off_path: "/",
    },
  ]);
  if (visErr) throw new Error(visErr.message);

  const { error: eErr } = await db.from("analytics_events").insert([
    {
      visit_id: visit1,
      visitor_id: visitorId,
      type: "page_view",
      path: "/",
      occurred_at: t0,
    },
    {
      visit_id: visit1,
      visitor_id: visitorId,
      type: "page_view",
      path: "/shop",
      occurred_at: "2026-07-10T10:05:00.000Z",
    },
    {
      visit_id: visit2,
      visitor_id: visitorId,
      type: "page_view",
      path: "/",
      occurred_at: t2,
    },
    {
      visit_id: visitOther,
      visitor_id: visitorId,
      type: "page_view",
      path: "/shop",
      occurred_at: "2026-07-11T08:00:00.000Z",
    },
  ]);
  if (eErr) throw new Error(eErr.message);

  const { data: sample } = await db.from("analytics_visits").select("*").eq("id", visit1).single();
  assert.ok(sample);
  assert.equal(sample.country, "SG");
  assert.ok(!Object.keys(sample).some((k) => /^ip$|ip_address|client_ip/i.test(k)));

  const from = "2026-07-01T00:00:00.000Z";
  const to = "2026-07-31T23:59:59.000Z";

  const countries = await listCountriesFromDb(db);
  assert.ok(countries.includes("SG"));
  assert.ok(countries.includes("MY"));
  assert.ok(countries.includes(UNKNOWN_COUNTRY));

  const all = await loadPageTransitionsFromDb(db, {
    from,
    to,
    entrySource: TAG,
  });
  assert.ok(all.nodes.some((n) => n.path === "/"));
  const home = all.nodes.find((n) => n.path === "/");
  assert.ok(home && home.returnHits >= 1, `expected returnHits on /, got ${home?.returnHits}`);
  assert.ok(home.medianReturnGapMs != null && home.medianReturnGapMs > 0);
  const dashed = all.edges.filter((e) => e.dashed);
  assert.ok(
    dashed.some((e) => e.from === DROP_OFF_NODE && e.to === "/"),
    `dashed re-entry missing: ${JSON.stringify(dashed)}`,
  );

  const returning = await loadPageTransitionsFromDb(db, {
    from,
    to,
    entrySource: TAG,
    visitorCohort: "returning",
  });
  assert.ok(returning.nodes.length > 0);
  assert.ok(returning.edges.some((e) => e.dashed));

  const neu = await loadPageTransitionsFromDb(db, {
    from,
    to,
    entrySource: TAG,
    visitorCohort: "new",
  });
  assert.equal(
    neu.edges.filter((e) => e.dashed).length,
    0,
    "new cohort should not include return re-entry edges",
  );

  const sgOnly = await loadPageTransitionsFromDb(db, {
    from,
    to,
    entrySource: TAG,
    countries: ["SG"],
  });
  assert.equal(sgOnly.countryLegend.length, 0);
  assert.ok(sgOnly.nodes.length > 0);

  const colored = await loadPageTransitionsFromDb(db, {
    from,
    to,
    entrySource: TAG,
    countries: ["SG", "MY"],
  });
  assert.equal(colored.countryLegend.length, 2);
  assert.ok(colored.countryLegend.every((c) => c.color.startsWith("#")));
  assert.ok(
    colored.edges.some((e) => e.country === "SG" || e.country === "MY"),
    `expected country-colored edges: ${JSON.stringify(colored.edges.slice(0, 8))}`,
  );

  const detail = await loadPageTransitionsFromDb(db, {
    from,
    to,
    entrySource: TAG,
    detailPath: "/",
  });
  assert.ok(detail.detail);
  assert.ok(detail.detail!.returnTimeline.length >= 1);

  await cleanup();
  console.log("slice-08-09.smoke.ts: ok");
}

main().catch(async (e) => {
  await cleanup().catch(() => {});
  console.error(e);
  process.exit(1);
});
