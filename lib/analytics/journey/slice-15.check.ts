/**
 * Slice 15 — Dig-in viz + Section expand on-node chrome.
 * Run: npx tsx lib/analytics/journey/slice-15.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { binDwellHistogram, buildNodeSidePanel } from "./chrome";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// --- ranked routes (not uncounted sample list) ---
const panel = buildNodeSidePanel({
  path: "/",
  events: [
    { visitId: "a", path: "/", occurredAt: "2026-07-15T10:00:00.000Z" },
    { visitId: "a", path: "/shop", occurredAt: "2026-07-15T10:01:00.000Z" },
    { visitId: "b", path: "/", occurredAt: "2026-07-15T11:00:00.000Z" },
    { visitId: "b", path: "/shop", occurredAt: "2026-07-15T11:01:00.000Z" },
    { visitId: "c", path: "/", occurredAt: "2026-07-15T12:00:00.000Z" },
  ],
  exitSections: [],
});
assert.equal(panel.routes[0]!.count, 2);
assert.deepEqual(panel.routes[0]!.pathSeq, ["/", "/shop"]);
assert.equal(panel.routes[1]!.count, 1);

// --- histogram caps + markers inputs ---
const hist = binDwellHistogram([1_000, 11_000, 700_000]);
assert.equal(hist.maxAxisMs, 600_000);
assert.ok(hist.bins.some((b) => b.overflow && b.count === 1));
assert.ok(hist.medianMs != null && hist.meanMs != null);

const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /onDive/);
assert.match(card, /Dive into sections/);
assert.match(card, /Time on page/);
assert.match(card, /TimeOnPageChart/);
assert.match(card, /RoutesChart/);
assert.match(card, /Return timeline/);
assert.doesNotMatch(card, /Expand \{p\}/);
assert.doesNotMatch(card, /Collapse \{expandPath\}/);
assert.doesNotMatch(card, /onToggleSectionExpand/);
assert.doesNotMatch(card, /Dwell samples/);
assert.doesNotMatch(card, /Sample paths/);
assert.doesNotMatch(card, /samplePaths/);

const viz = readFileSync(
  join(root, "app/[lang]/settings/analytics/DigInViz.tsx"),
  "utf8",
);
assert.match(viz, /binDwellHistogram/);
assert.match(viz, /Show top 10/);
assert.match(viz, /strokeDasharray/); // mean dotted
assert.match(viz, /median/);
assert.match(viz, /TooltipWithBounds/);
assert.match(viz, /showTooltip/);
assert.match(viz, /createPortal/); // tips escape SVG foreignObject

const actions = readFileSync(
  join(root, "app/[lang]/settings/analytics/actions.ts"),
  "utf8",
);
assert.match(actions, /routes: \{ pathSeq: string\[\]; count: number \}\[\]/);
assert.doesNotMatch(actions, /samplePaths/);

console.log("slice-15.check.ts: ok");
