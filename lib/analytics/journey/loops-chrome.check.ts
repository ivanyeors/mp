/**
 * Slice 07 — unique-node loops + node chrome + side panel.
 * Run: npx tsx lib/analytics/journey/loops-chrome.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNodeChrome,
  buildNodeSidePanel,
  edgeStrokeWidth,
  median,
} from "./chrome";
import { attachDropOffSink } from "./drop-off-sink";
import { buildPageTransitions } from "./transitions";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// --- Unique-node loop: Home→Shop→Home is one Home + back-edge ---
const loopEvents = [
  { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:00:00.000Z" },
  { visitId: "v1", path: "/shop", occurredAt: "2026-07-15T10:01:00.000Z" },
  { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:02:00.000Z" },
];
const { nodes: loopNodes, edges: loopEdges } = buildPageTransitions(loopEvents);
assert.equal(loopNodes.filter((n) => n.path === "/").length, 1);
assert.equal(loopNodes.find((n) => n.path === "/")?.views, 2);
assert.ok(loopEdges.some((e) => e.from === "/" && e.to === "/shop"));
assert.ok(loopEdges.some((e) => e.from === "/shop" && e.to === "/")); // back-edge

// --- Edge thickness ∝ count ---
assert.ok(Math.abs(edgeStrokeWidth(1, 10) - 1.7) < 1e-9);
assert.ok(edgeStrokeWidth(10, 10) > edgeStrokeWidth(1, 10));
assert.equal(edgeStrokeWidth(0, 10), 1);

// --- Node chrome metrics ---
assert.equal(median([10, 30, 20]), 20);
assert.equal(median([10, 20]), 15);

const chrome = buildNodeChrome({
  nodes: loopNodes,
  events: loopEvents,
  dropOffsByPath: new Map([["/", 1]]),
  topSectionByPath: new Map([["/", "pick-your-mpillow"]]),
  visitEndedAt: new Map([["v1", "2026-07-15T10:03:00.000Z"]]),
});
const home = chrome.find((n) => n.path === "/")!;
assert.equal(home.prospects, 1);
assert.equal(home.dropOffs, 1);
assert.equal(home.dropOffPct, 100);
assert.equal(home.topDropOffSection, "pick-your-mpillow");
assert.equal(home.returnHits, 0);
assert.equal(home.medianReturnGapMs, null);
assert.ok(home.medianDwellMs != null && home.medianDwellMs > 0);

const withSink = attachDropOffSink(
  { nodes: loopNodes, edges: loopEdges },
  [{ lastPath: "/", count: 1 }],
);
assert.ok(withSink.nodes.some((n) => n.path === "__drop_off__"));
assert.ok(withSink.edges.some((e) => e.from === "/" && e.to === "__drop_off__"));

// --- Side panel: exits, dwell, sample paths (loop reuses Home) ---
const panel = buildNodeSidePanel({
  path: "/",
  events: loopEvents,
  exitSections: [{ sectionId: "pick-your-mpillow", count: 1 }],
  visitEndedAt: new Map([["v1", "2026-07-15T10:03:00.000Z"]]),
});
assert.deepEqual(panel.exitSections, [{ sectionId: "pick-your-mpillow", count: 1 }]);
assert.ok(panel.dwellMsSamples.length >= 1);
assert.deepEqual(panel.samplePaths[0], ["/", "/shop", "/"]);
assert.deepEqual(panel.returnTimeline, []);

// --- UI: graph chrome + side panel + above Product Configuration ---
const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /JourneyGraph/);
assert.match(card, /edgeStrokeWidth/);
assert.match(card, /prospects/);
assert.match(card, /dropOffPct/);
assert.match(card, /medianDwellMs/);
assert.match(card, /topDropOffSection/);
assert.match(card, /DetailPanel/);
assert.match(card, /ConvertedDetailPanel/);
assert.match(card, /includeConverted/);
assert.match(card, /exitSections/);
assert.match(card, /samplePaths/);
assert.match(card, /detailPath/);
assert.match(card, /returnTimeline/);

const client = readFileSync(
  join(root, "app/[lang]/settings/analytics/AnalyticsClient.tsx"),
  "utf8",
);
assert.match(client, /<ProspectJourneyCard[\s\S]*?<ProductConfigurationCard/);

const actions = readFileSync(
  join(root, "app/[lang]/settings/analytics/actions.ts"),
  "utf8",
);
assert.match(actions, /detailPath/);
assert.match(actions, /JourneyNodeDetail/);
assert.doesNotMatch(actions, /analytics_ga|bigquery|googleapis|gtag/i);

const aggregates = readFileSync(
  join(root, "lib/analytics/journey/aggregates.ts"),
  "utf8",
);
assert.match(aggregates, /buildNodeChrome/);
assert.match(aggregates, /buildNodeSidePanel/);
assert.doesNotMatch(aggregates, /analytics_ga|bigquery|googleapis|gtag/i);

console.log("loops-chrome.check.ts: ok");
