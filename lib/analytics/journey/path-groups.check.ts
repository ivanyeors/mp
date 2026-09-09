/**
 * Detail-page grouping — /blog/<slug> collapses to one node.
 * Run: npx tsx lib/analytics/journey/path-groups.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collapseJourneyPath, isGroupedPath } from "./path-groups";
import { CONVERTED_NODE } from "./converted-sink";
import { DROP_OFF_NODE } from "./drop-off-sink";
import { entryNodePath } from "./entry-nodes";
import { buildPageTransitions } from "./transitions";

// posts collapse, the index and every other page do not
assert.equal(collapseJourneyPath("/blog/how-to-choose-a-pillow"), "/blog/*");
assert.equal(collapseJourneyPath("/blog/2024/deep/slug"), "/blog/*");
assert.equal(collapseJourneyPath("/blog"), "/blog");
assert.equal(collapseJourneyPath("/blog/"), "/blog/");
assert.equal(collapseJourneyPath("/"), "/");
assert.equal(collapseJourneyPath("/shop/cervical-neck-support"), "/shop/cervical-neck-support");
assert.equal(collapseJourneyPath("/blogging/x"), "/blogging/x");

// sinks and entry nodes must pass through untouched
assert.equal(collapseJourneyPath(DROP_OFF_NODE), DROP_OFF_NODE);
assert.equal(collapseJourneyPath(CONVERTED_NODE), CONVERTED_NODE);
assert.equal(
  collapseJourneyPath(entryNodePath("www.google.com")),
  entryNodePath("www.google.com"),
);

assert.equal(isGroupedPath("/blog/*"), true);
assert.equal(isGroupedPath("/blog"), false);
assert.equal(isGroupedPath("/"), false);

// collapsing before transitions merges views and edges onto the one node
const events = [
  { visitId: "v1", path: "/", occurredAt: "2026-09-01T10:00:00.000Z" },
  { visitId: "v1", path: "/blog/a", occurredAt: "2026-09-01T10:01:00.000Z" },
  { visitId: "v2", path: "/", occurredAt: "2026-09-01T11:00:00.000Z" },
  { visitId: "v2", path: "/blog/b", occurredAt: "2026-09-01T11:01:00.000Z" },
  { visitId: "v2", path: "/mp-config", occurredAt: "2026-09-01T11:02:00.000Z" },
].map((e) => ({ ...e, path: collapseJourneyPath(e.path) }));
const { nodes, edges } = buildPageTransitions(events);
const group = nodes.find((n) => n.path === "/blog/*");
assert.equal(group?.views, 2);
assert.equal(nodes.filter((n) => n.path.startsWith("/blog")).length, 1);
// the journey through the group survives: / → /blog/* → /mp-config
assert.equal(edges.find((e) => e.from === "/" && e.to === "/blog/*")?.count, 2);
assert.equal(
  edges.find((e) => e.from === "/blog/*" && e.to === "/mp-config")?.count,
  1,
);

// --- wiring ---
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const aggregates = readFileSync(join(root, "lib/analytics/journey/aggregates.ts"), "utf8");
assert.match(aggregates, /collapseJourneyPath/);
assert.match(aggregates, /groupPaths/);
const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /groupPaths/);
// a group has no single storefront URL — no broken deep link in the dig-in
assert.match(card, /isGroupedPath/);

console.log("path-groups.check.ts: ok");
