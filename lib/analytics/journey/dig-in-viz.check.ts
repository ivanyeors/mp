/**
 * Slice 15 — ranked routes + dwell histogram helpers.
 * Run: npx tsx lib/analytics/journey/dig-in-viz.check.ts
 */
import assert from "node:assert/strict";
import {
  binDwellHistogram,
  buildNodeSidePanel,
  mean,
} from "./chrome";

// --- Routes: aggregate identical sequences, rank by count ---
const routeEvents = [
  { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:00:00.000Z" },
  { visitId: "v1", path: "/shop", occurredAt: "2026-07-15T10:01:00.000Z" },
  { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:02:00.000Z" },
  { visitId: "v2", path: "/", occurredAt: "2026-07-15T11:00:00.000Z" },
  { visitId: "v2", path: "/shop", occurredAt: "2026-07-15T11:01:00.000Z" },
  { visitId: "v2", path: "/", occurredAt: "2026-07-15T11:02:00.000Z" },
  { visitId: "v3", path: "/", occurredAt: "2026-07-15T12:00:00.000Z" },
  { visitId: "v3", path: "/about", occurredAt: "2026-07-15T12:01:00.000Z" },
];
const routesPanel = buildNodeSidePanel({
  path: "/",
  events: routeEvents,
  exitSections: [],
});
assert.deepEqual(routesPanel.routes, [
  { pathSeq: ["/", "/shop", "/"], count: 2 },
  { pathSeq: ["/", "/about"], count: 1 },
]);

// --- Histogram: 10s bins, overflow, stats on raw samples ---
const samples = [5_000, 15_000, 25_000, 12 * 60_000];
const hist = binDwellHistogram(samples);
assert.equal(hist.maxAxisMs, 600_000);
assert.equal(hist.medianMs, 20_000);
assert.equal(hist.meanMs, mean(samples));
const overflow = hist.bins.find((b) => b.overflow);
assert.ok(overflow);
assert.equal(overflow!.count, 1);
assert.equal(overflow!.startMs, 600_000);
assert.equal(overflow!.endMs, null);
assert.equal(hist.bins.find((b) => b.startMs === 0)!.count, 1);
assert.equal(hist.bins.find((b) => b.startMs === 10_000)!.count, 1);
assert.equal(hist.bins.find((b) => b.startMs === 20_000)!.count, 1);

// --- Empty samples ---
const empty = binDwellHistogram([]);
assert.deepEqual(empty.bins, []);
assert.equal(empty.medianMs, null);
assert.equal(empty.meanMs, null);
assert.equal(empty.maxAxisMs, 0);

// --- Boundary: sample === maxAxisMs must not throw (exact 10s multiples) ---
const edge = binDwellHistogram([10_000, 20_000, 30_000]);
assert.equal(edge.maxAxisMs, 30_000);
assert.equal(edge.bins.length, 3);
assert.equal(edge.bins[1]!.count, 1); // 10s
assert.equal(edge.bins[2]!.count, 2); // 20s + 30s (last bin inclusive of max)
assert.equal(
  edge.bins.reduce((s, b) => s + b.count, 0),
  3,
);

// Negative / non-finite ignored
const messy = binDwellHistogram([5_000, -1, Number.NaN, 15_000]);
assert.equal(
  messy.bins.reduce((s, b) => s + b.count, 0),
  2,
);

console.log("dig-in-viz.check.ts: ok");
