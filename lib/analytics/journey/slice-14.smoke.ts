/**
 * Live DB smoke for slice 14 dig-in.
 * Run: npx tsx --env-file=.env.local lib/analytics/journey/slice-14.smoke.ts
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  loadNodeDetailFromDb,
  loadPageTransitionsFromDb,
} from "./aggregates";
import { exitSectionHref } from "./paths";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, "need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");

  const db = createClient(url, key);
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 30 * 864e5).toISOString();

  const graph = await loadPageTransitionsFromDb(db, { from, to });
  assert.ok(graph.detail === null, "graph load must not attach dig-in by default");

  const home = graph.nodes.find((n) => n.path === "/");
  assert.ok(home, "expected Home node in last 30d");

  const dig = await loadNodeDetailFromDb(db, { path: "/", from, to });
  assert.ok(dig.detail, "Home dig-in required");
  assert.equal(dig.detail!.path, "/");
  assert.ok(Array.isArray(dig.detail!.outbound));
  assert.ok(Array.isArray(dig.detail!.exitSections));
  for (const s of dig.detail!.exitSections) {
    assert.ok(typeof s.sharePct === "number");
    const href = exitSectionHref("en-US", "/", s.sectionId);
    assert.match(href, new RegExp(`^/en-US#${s.sectionId}$`));
  }

  console.log("slice-14.smoke.ts: ok", {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    exits: dig.detail!.exitSections.slice(0, 3),
    outbound: dig.detail!.outbound.slice(0, 5),
    topRoute: dig.detail!.routes[0],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
