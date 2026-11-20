import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachEntrySources,
  DIRECT_ENTRY,
  entryNodePath,
  entrySourceOf,
  isEntryNode,
  normalizeEntrySource,
  OTHER_ENTRY,
  rankEntrySources,
} from "./entry-nodes";
import { buildGroupDetail } from "./chrome";
import { layoutJourneyGraph } from "./layout";

const graph = {
  nodes: [
    { path: "/", views: 40 },
    { path: "/shop", views: 25 },
    { path: "__drop_off__", views: 12 },
  ],
  edges: [
    { from: "/", to: "/shop", count: 20 },
    { from: "/shop", to: "__drop_off__", count: 12 },
  ],
};

assert.equal(isEntryNode("/shop"), false);
assert.equal(isEntryNode(entryNodePath("google.com")), true);
assert.equal(entrySourceOf(entryNodePath("google.com")), "google.com");
assert.equal(entrySourceOf("/shop"), null);
assert.equal(normalizeEntrySource(null), DIRECT_ENTRY);
assert.equal(normalizeEntrySource("  "), DIRECT_ENTRY);
assert.equal(normalizeEntrySource(" ig "), "ig");

const one = attachEntrySources(graph, [
  { entrySource: "google.com", landingPath: "/", count: 1 },
  { entrySource: "google.com", landingPath: "/", count: 1 },
  { entrySource: null, landingPath: "/shop", count: 1 },
]);
const google = one.nodes.find((n) => n.path === entryNodePath("google.com"));
const direct = one.nodes.find((n) => n.path === entryNodePath(DIRECT_ENTRY));
assert.equal(google?.views, 2);
assert.equal(direct?.views, 1);
assert.equal(
  one.edges.find((e) => e.from === entryNodePath("google.com"))?.to,
  "/",
);
assert.equal(
  one.edges.find((e) => e.from === entryNodePath("google.com"))?.count,
  2,
);
assert.ok(one.edges.some((e) => e.from === "/" && e.to === "/shop" && e.count === 20));

const many = attachEntrySources(
  graph,
  ["a", "b", "c", "d", "e"].map((s, i) => ({
    entrySource: s,
    landingPath: "/",
    count: 5 - i,
  })),
  { topN: 2 },
);
const other = many.nodes.find((n) => n.path === entryNodePath(OTHER_ENTRY));
assert.equal(other?.views, 3 + 2 + 1);
assert.equal(many.nodes.filter((n) => isEntryNode(n.path)).length, 3);

const all = attachEntrySources(
  graph,
  ["a", "b", "c"].map((s) => ({ entrySource: s, landingPath: "/", count: 1 })),
  { topN: 0 },
);
assert.equal(all.nodes.filter((n) => isEntryNode(n.path)).length, 3);

const dangling = attachEntrySources(graph, [
  { entrySource: "x", landingPath: "/gone", count: 4 },
]);
assert.equal(dangling.nodes.filter((n) => isEntryNode(n.path)).length, 0);
assert.equal(dangling.edges.length, graph.edges.length);

assert.equal(attachEntrySources(graph, []), graph);

const byCountry = attachEntrySources(graph, [
  { entrySource: "ig", landingPath: "/", count: 2, country: "MY" },
  { entrySource: "ig", landingPath: "/", count: 1, country: "SG" },
]);
const igEdges = byCountry.edges.filter((e) => e.from === entryNodePath("ig"));
assert.equal(igEdges.length, 2);
assert.deepEqual(
  igEdges.map((e) => e.country).sort(),
  ["MY", "SG"],
);

const tailFeeds = ["a", "b", "c", "d", "e"].map((s, i) => ({
  entrySource: s,
  landingPath: "/",
  count: 5 - i,
}));
const rank = rankEntrySources(tailFeeds, 2);
assert.deepEqual(rank.kept, ["a", "b"]);
assert.deepEqual(rank.rolled, ["c", "d", "e"]);
const rolledTotal = rank.rolled.reduce((n, s) => n + rank.totals.get(s)!, 0);
assert.equal(
  many.nodes.find((n) => n.path === entryNodePath(OTHER_ENTRY))?.views,
  rolledTotal,
);
assert.deepEqual(rankEntrySources(tailFeeds, 0).rolled, []);

const breakdown = buildGroupDetail(
  "sources",
  rank.rolled.map((s) => [s, rank.totals.get(s)!] as const),
);
assert.equal(breakdown.kind, "sources");
assert.equal(breakdown.total, rolledTotal);
assert.deepEqual(breakdown.members.map((m) => m.label), ["c", "d", "e"]);
assert.deepEqual(breakdown.members.map((m) => m.count), [3, 2, 1]);
assert.equal(breakdown.members[0]!.sharePct, 50);
assert.equal(buildGroupDetail("pages", [["/x", 0]]).members.length, 0);
assert.equal(buildGroupDetail("pages", []).total, 0);

const laid = layoutJourneyGraph(one.nodes, one.edges, 640, 400);
const entryX = laid
  .filter((n) => isEntryNode(n.path))
  .map((n) => n.x);
const homeX = laid.find((n) => n.path === "/")!.x;
assert.ok(entryX.length > 0);
assert.ok(Math.max(...entryX) < homeX);

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /isEntryNode/);
assert.match(card, /onPickEntrySource/);
assert.match(card, /entrySharePct/);
assert.match(card, /GroupBreakdown/);
assert.match(card, /ExpandedEntryDigIn/);
assert.match(card, /groupDetailByPath/);
const aggregatesSrc = readFileSync(
  join(root, "lib/analytics/journey/aggregates.ts"),
  "utf8",
);
assert.match(aggregatesSrc, /buildGroupDetail/);
assert.match(aggregatesSrc, /groupDetail/);
assert.match(card, /aria-controls="journey-filters"/);
assert.match(card, /id="journey-filters"/);
assert.match(card, /filterPanel/);
assert.match(card, /filterChips/);
assert.match(card, /activeFilterCount/);
assert.doesNotMatch(card, /filterBar/);

const actions = readFileSync(
  join(root, "app/[lang]/settings/analytics/actions.ts"),
  "utf8",
);
assert.match(actions, /entryNodes/);
assert.match(actions, /entryTopN/);

const aggregates = readFileSync(
  join(root, "lib/analytics/journey/aggregates.ts"),
  "utf8",
);
assert.match(aggregates, /attachEntrySources/);
assert.match(aggregates, /expandPageToSections\(withReturns, sectionGraph, expandPath\)/);

console.log("entry-nodes.check.ts: ok");
