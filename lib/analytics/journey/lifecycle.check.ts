/**
 * Slice 03 — Visit lifecycle / Drop-off.
 * Run: npx tsx lib/analytics/journey/lifecycle.check.ts
 */
import assert from "node:assert/strict";
import {
  resolveExplicitDropOff,
  resolveInactivityDropOff,
  shouldStartNewVisit,
  VISIT_INACTIVITY_MS,
} from "./lifecycle";
import { buildPageTransitions } from "./transitions";
import { attachDropOffSink } from "./drop-off-sink";

const t0 = "2026-07-15T10:00:00.000Z";
const t1 = "2026-07-15T10:05:00.000Z";
const afterGap = new Date(Date.parse(t1) + VISIT_INACTIVITY_MS).toISOString();
const beforeGap = new Date(Date.parse(t1) + VISIT_INACTIVITY_MS - 1).toISOString();

assert.equal(shouldStartNewVisit(null, t0), true);
assert.equal(shouldStartNewVisit(t1, beforeGap), false);
assert.equal(shouldStartNewVisit(t1, afterGap), true);

const events = [
  { type: "page_view" as const, path: "/", occurredAt: t0 },
  { type: "page_view" as const, path: "/shop", sectionId: "hero", occurredAt: t1 },
];

assert.equal(resolveInactivityDropOff(events, beforeGap), null);

const drop = resolveInactivityDropOff(events, afterGap);
assert.ok(drop);
assert.equal(drop!.path, "/shop");
assert.equal(drop!.sectionId, "hero");
assert.equal(drop!.dwellMs, Date.parse(t1) - Date.parse(t0));

const explicit = resolveExplicitDropOff(events, "2026-07-15T10:06:00.000Z");
assert.ok(explicit);
assert.equal(explicit!.path, "/shop");
assert.equal(explicit!.endedAt, "2026-07-15T10:06:00.000Z");

const base = buildPageTransitions([
  { visitId: "v1", path: "/", occurredAt: t0 },
  { visitId: "v1", path: "/shop", occurredAt: t1 },
]);
const withSink = attachDropOffSink(base, [{ lastPath: "/shop", count: 1 }]);
assert.ok(withSink.nodes.some((n) => n.path === "__drop_off__"));
assert.ok(withSink.edges.some((e) => e.from === "/shop" && e.to === "__drop_off__" && e.count === 1));

console.log("lifecycle.check.ts: ok");
