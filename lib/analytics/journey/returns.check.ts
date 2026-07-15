/**
 * Slice 08 — Returns: dashed re-entry + return metrics + New/Returning cohort.
 * Run: npx tsx lib/analytics/journey/returns.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNodeChrome, buildNodeSidePanel } from "./chrome";
import { DROP_OFF_NODE } from "./drop-off-sink";
import {
  buildReentryEdges,
  classifyVisitCohort,
  collectReturns,
  filterVisitIdsByCohort,
  priorEndedVisit,
  returnMetricsByPath,
  returnsForPath,
  type VisitMeta,
} from "./returns";
import { buildPageTransitions } from "./transitions";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const visitor = "vis-1";
const v1: VisitMeta = {
  id: "visit-1",
  visitorId: visitor,
  startedAt: "2026-07-14T10:00:00.000Z",
  endedAt: "2026-07-14T10:30:00.000Z",
  dropOffPath: "/shop",
};
const v2: VisitMeta = {
  id: "visit-2",
  visitorId: visitor,
  startedAt: "2026-07-15T12:00:00.000Z",
  endedAt: null,
  dropOffPath: null,
};
const other: VisitMeta = {
  id: "visit-other",
  visitorId: "vis-2",
  startedAt: "2026-07-15T09:00:00.000Z",
  endedAt: null,
  dropOffPath: null,
};

// --- Prior ended Visit / cohort ---
assert.equal(priorEndedVisit(v2, [v1, v2])?.id, "visit-1");
assert.equal(classifyVisitCohort(v1, [v1, v2]), "new");
assert.equal(classifyVisitCohort(v2, [v1, v2]), "returning");
assert.equal(classifyVisitCohort(other, [other]), "new");

const cohortNew = filterVisitIdsByCohort([v1, v2, other], [v1, v2, other], "new");
assert.deepEqual(cohortNew?.sort(), ["visit-1", "visit-other"]);
const cohortRet = filterVisitIdsByCohort([v1, v2, other], [v1, v2, other], "returning");
assert.deepEqual(cohortRet, ["visit-2"]);

// --- Return hit + dashed Drop-off → landing ---
const landings = new Map([
  ["visit-1", "/"],
  ["visit-2", "/"],
  ["visit-other", "/shop"],
]);
const returns = collectReturns([v1, v2, other], landings, new Set(["visit-2", "visit-other"]));
assert.equal(returns.length, 1);
assert.equal(returns[0]!.landingPath, "/");
assert.equal(returns[0]!.priorDropOffPath, "/shop");
assert.equal(returns[0]!.gapMs, Date.parse(v2.startedAt) - Date.parse(v1.endedAt!));

const reentry = buildReentryEdges(returns);
assert.equal(reentry.length, 1);
assert.equal(reentry[0]!.from, DROP_OFF_NODE);
assert.equal(reentry[0]!.to, "/");
assert.equal(reentry[0]!.dashed, true);
assert.equal(reentry[0]!.count, 1);

const metrics = returnMetricsByPath(returns);
assert.equal(metrics.get("/")?.returnHits, 1);
assert.equal(metrics.get("/")?.medianReturnGapMs, returns[0]!.gapMs);

// --- Same-session backtrack is solid, not a return ---
const loopEvents = [
  { visitId: "visit-1", path: "/", occurredAt: "2026-07-14T10:00:00.000Z" },
  { visitId: "visit-1", path: "/shop", occurredAt: "2026-07-14T10:01:00.000Z" },
  { visitId: "visit-1", path: "/", occurredAt: "2026-07-14T10:02:00.000Z" },
];
const { edges: solid } = buildPageTransitions(loopEvents);
assert.ok(solid.some((e) => e.from === "/shop" && e.to === "/" && !e.dashed));
assert.equal(
  collectReturns([v1], new Map([["visit-1", "/"]]), new Set(["visit-1"])).length,
  0,
);

// --- Chrome + side panel consume return fields ---
const chrome = buildNodeChrome({
  nodes: [
    { path: "/", views: 2 },
    { path: "/shop", views: 1 },
  ],
  events: [
    ...loopEvents,
    { visitId: "visit-2", path: "/", occurredAt: "2026-07-15T12:00:00.000Z" },
  ],
  dropOffsByPath: new Map([["/shop", 1]]),
  topSectionByPath: new Map(),
  returnHitsByPath: metrics,
});
assert.equal(chrome.find((n) => n.path === "/")?.returnHits, 1);
assert.ok(chrome.find((n) => n.path === "/")?.medianReturnGapMs != null);
assert.equal(chrome.find((n) => n.path === "/shop")?.returnHits, 0);

const panel = buildNodeSidePanel({
  path: "/",
  events: loopEvents,
  exitSections: [],
  returnTimeline: returnsForPath(returns, "/").map((r) => ({
    returnedAt: r.returnedAt,
    gapMs: r.gapMs,
    priorDropOffPath: r.priorDropOffPath,
  })),
});
assert.equal(panel.returnTimeline.length, 1);
assert.equal(panel.returnTimeline[0]!.priorDropOffPath, "/shop");

// --- UI wiring ---
const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /visitorCohort|New \/ Returning|returning/);
assert.match(card, /strokeDasharray|dashed/);
assert.match(card, /returnHits|returnTimeline|Return timeline/);
assert.doesNotMatch(card, /returns — \(slice 08\)/);
assert.doesNotMatch(card, /Return timeline lands in slice 08/);

const actions = readFileSync(
  join(root, "app/[lang]/settings/analytics/actions.ts"),
  "utf8",
);
assert.match(actions, /visitorCohort/);
assert.match(actions, /returnTimeline/);
assert.match(actions, /dashed/);

const aggregates = readFileSync(
  join(root, "lib/analytics/journey/aggregates.ts"),
  "utf8",
);
assert.match(aggregates, /buildReentryEdges/);
assert.match(aggregates, /visitorCohort/);
assert.match(aggregates, /collectReturns/);

console.log("returns.check.ts: ok");
