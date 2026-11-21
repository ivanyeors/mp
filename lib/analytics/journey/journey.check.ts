import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { roleHasPermission } from "@/lib/auth/permissions";
import { isAdminJourneyPath, normalizeJourneyPath } from "./paths";
import { parseIngestBody } from "./ingest";
import { buildPageTransitions } from "./transitions";

assert.equal(roleHasPermission("staff", "analytics"), false);
assert.equal(roleHasPermission("viewer", "analytics"), true);

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
assert.match(layout, /JourneyTracker/);
const tracker = readFileSync(join(root, "components/analytics/journey-tracker.tsx"), "utf8");
assert.match(tracker, /isAdminJourneyPath/);
assert.match(tracker, /\/api\/analytics\/ingest/);

assert.equal(isAdminJourneyPath("/settings"), true);
assert.equal(isAdminJourneyPath("/settings/analytics"), true);
assert.equal(isAdminJourneyPath("/en-US/settings/orders"), true);
assert.equal(isAdminJourneyPath("/shop"), false);
assert.equal(isAdminJourneyPath("/en-US/mp-config"), false);

assert.equal(normalizeJourneyPath("/en-US/shop?x=1"), "/shop");
assert.equal(normalizeJourneyPath("/zh-CN/"), "/");
assert.equal(normalizeJourneyPath("/en-US/settings/analytics"), null);

const adminReject = parseIngestBody({
  visitorId: "11111111-1111-4111-8111-111111111111",
  visitId: "22222222-2222-4222-8222-222222222222",
  events: [{ type: "page_view", path: "/en-US/settings/analytics" }],
});
assert.equal(adminReject.ok, false);
if (!adminReject.ok) assert.match(adminReject.error, /admin/);

const ok = parseIngestBody({
  visitorId: "11111111-1111-4111-8111-111111111111",
  visitId: "22222222-2222-4222-8222-222222222222",
  events: [
    { type: "page_view", path: "/en-US/", occurredAt: "2026-07-15T10:00:00.000Z" },
    { type: "page_view", path: "/en-US/shop", occurredAt: "2026-07-15T10:01:00.000Z" },
  ],
  entry: { search: "?utm_source=ig", referrer: "https://t.co/x" },
});
assert.equal(ok.ok, true);
if (ok.ok) {
  assert.equal(ok.body.entry?.search, "?utm_source=ig");
  assert.equal(ok.body.entry?.referrer, "https://t.co/x");
}

const { nodes, edges } = buildPageTransitions([
  { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:00:00.000Z" },
  { visitId: "v1", path: "/shop", occurredAt: "2026-07-15T10:01:00.000Z" },
  { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:02:00.000Z" },
  { visitId: "v2", path: "/shop", occurredAt: "2026-07-15T11:00:00.000Z" },
  { visitId: "v2", path: "/shop", occurredAt: "2026-07-15T11:01:00.000Z" },
]);

assert.equal(nodes.find((n) => n.path === "/")?.views, 2);
assert.equal(nodes.find((n) => n.path === "/shop")?.views, 3);
assert.deepEqual(
  edges.map((e) => `${e.from}->${e.to}:${e.count}`).sort(),
  ["/->/shop:1", "/shop->/:1"].sort(),
);

console.log("journey.check.ts: ok");
