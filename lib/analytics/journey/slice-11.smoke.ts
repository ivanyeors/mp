import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadPageTransitionsFromDb } from "./aggregates";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("slice-11.smoke.ts: skip (no Supabase env)");
  process.exit(0);
}

const db = createClient(url, key);
const TAG = `smoke-11-${Date.now()}`;
const visitorId = crypto.randomUUID();
const visitPdp = crypto.randomUUID();
const visitConfig = crypto.randomUUID();
const visitCheckout = crypto.randomUUID();
const visitResults = crypto.randomUUID();
const visitIds = [visitPdp, visitConfig, visitCheckout, visitResults];

const taggedSurfaces = [
  { path: "/shop/example", sectionId: "buy-box", visitId: visitPdp },
  { path: "/mp-config", sectionId: "size", visitId: visitConfig },
  { path: "/shop/checkout", sectionId: "payment", visitId: visitCheckout },
  { path: "/results/example", sectionId: "status-accepted", visitId: visitResults },
] as const;

const from = "2026-07-15T00:00:00.000Z";
const to = "2026-07-15T23:59:59.000Z";
const t0 = "2026-07-15T10:00:00.000Z";

async function cleanup() {
  await db.from("analytics_events").delete().in("visit_id", visitIds);
  await db.from("analytics_visits").delete().in("id", visitIds);
  await db.from("analytics_visitors").delete().eq("id", visitorId);
}

async function main() {
  const { error: vErr } = await db.from("analytics_visitors").insert({ id: visitorId });
  if (vErr) throw new Error(vErr.message);

  const { error: visErr } = await db.from("analytics_visits").insert([
    {
      id: visitPdp,
      visitor_id: visitorId,
      entry_source: TAG,
      started_at: t0,
      ended_at: "2026-07-15T10:05:00.000Z",
      drop_off_path: "/shop/example",
      drop_off_section: "buy-box",
    },
    {
      id: visitConfig,
      visitor_id: visitorId,
      entry_source: TAG,
      started_at: "2026-07-15T11:00:00.000Z",
      ended_at: "2026-07-15T11:10:00.000Z",
      drop_off_path: null,
      drop_off_section: null,
    },
    {
      id: visitCheckout,
      visitor_id: visitorId,
      entry_source: TAG,
      started_at: "2026-07-15T12:00:00.000Z",
      ended_at: "2026-07-15T12:15:00.000Z",
      drop_off_path: "/shop/checkout",
      drop_off_section: "payment",
    },
    {
      id: visitResults,
      visitor_id: visitorId,
      entry_source: TAG,
      started_at: "2026-07-15T13:00:00.000Z",
      ended_at: "2026-07-15T13:20:00.000Z",
      drop_off_path: "/results/example",
      drop_off_section: "status-accepted",
    },
  ]);
  if (visErr) throw new Error(visErr.message);

  const events = [
    {
      visit_id: visitPdp,
      visitor_id: visitorId,
      type: "page_view" as const,
      path: "/shop/example",
      section_id: null,
      occurred_at: "2026-07-15T10:00:00.000Z",
    },
    {
      visit_id: visitPdp,
      visitor_id: visitorId,
      type: "section_view" as const,
      path: "/shop/example",
      section_id: "buy-box",
      occurred_at: "2026-07-15T10:01:00.000Z",
    },
    {
      visit_id: visitConfig,
      visitor_id: visitorId,
      type: "page_view" as const,
      path: "/mp-config",
      section_id: null,
      occurred_at: "2026-07-15T11:00:00.000Z",
    },
    {
      visit_id: visitConfig,
      visitor_id: visitorId,
      type: "section_view" as const,
      path: "/mp-config",
      section_id: "size",
      occurred_at: "2026-07-15T11:01:00.000Z",
    },
    {
      visit_id: visitCheckout,
      visitor_id: visitorId,
      type: "page_view" as const,
      path: "/shop/checkout",
      section_id: null,
      occurred_at: "2026-07-15T12:00:00.000Z",
    },
    {
      visit_id: visitCheckout,
      visitor_id: visitorId,
      type: "section_view" as const,
      path: "/shop/checkout",
      section_id: "payment",
      occurred_at: "2026-07-15T12:01:00.000Z",
    },
    {
      visit_id: visitResults,
      visitor_id: visitorId,
      type: "page_view" as const,
      path: "/results/example",
      section_id: null,
      occurred_at: "2026-07-15T13:00:00.000Z",
    },
    {
      visit_id: visitResults,
      visitor_id: visitorId,
      type: "section_view" as const,
      path: "/results/example",
      section_id: "status-accepted",
      occurred_at: "2026-07-15T13:01:00.000Z",
    },
  ];

  const { error: eErr } = await db.from("analytics_events").insert(events);
  if (eErr) throw new Error(eErr.message);

  const base = { from, to, entrySource: TAG };

  const graph = await loadPageTransitionsFromDb(db, base);
  for (const surface of taggedSurfaces) {
    assert.ok(
      graph.expandablePaths.includes(surface.path),
      `expandablePaths missing ${surface.path}: ${JSON.stringify(graph.expandablePaths)}`,
    );
    assert.ok(
      graph.sections.some(
        (s) => s.path === surface.path && s.sectionId === surface.sectionId && s.views >= 1,
      ),
      `section aggregate missing ${surface.path}#${surface.sectionId}`,
    );
  }

  for (const surface of taggedSurfaces) {
    const expanded = await loadPageTransitionsFromDb(db, {
      ...base,
      expandPath: surface.path,
    });
    assert.ok(
      expanded.nodes.some((n) => n.path === `${surface.path}#${surface.sectionId}`),
      `expand ${surface.path} missing section node ${surface.sectionId}`,
    );
  }

  const checkoutDetail = await loadPageTransitionsFromDb(db, {
    ...base,
    detailPath: "/shop/checkout",
  });
  assert.ok(checkoutDetail.detail);
  assert.ok(
    checkoutDetail.detail!.exitSections.some(
      (s) => s.sectionId === "payment" && s.count >= 1,
    ),
    `checkout drop-off section missing: ${JSON.stringify(checkoutDetail.detail!.exitSections)}`,
  );
  assert.equal(
    checkoutDetail.sections.find(
      (s) => s.path === "/shop/checkout" && s.sectionId === "payment",
    )?.dropOffs,
    1,
  );

  const resultsDetail = await loadPageTransitionsFromDb(db, {
    ...base,
    detailPath: "/results/example",
  });
  assert.ok(resultsDetail.detail);
  assert.ok(
    resultsDetail.detail!.exitSections.some(
      (s) => s.sectionId === "status-accepted" && s.count >= 1,
    ),
    `results drop-off section missing: ${JSON.stringify(resultsDetail.detail!.exitSections)}`,
  );

  await cleanup();
  console.log("slice-11.smoke.ts: ok");
}

main().catch(async (e) => {
  await cleanup().catch(() => {});
  console.error(e);
  process.exit(1);
});
