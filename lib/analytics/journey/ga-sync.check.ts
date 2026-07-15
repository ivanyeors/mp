/**
 * Slice 12 — GA sync parse + stitch (no live BigQuery).
 * Run: npx tsx lib/analytics/journey/ga-sync.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIngestBody } from "./ingest";
import {
  defaultGaFixturePath,
  loadGaExportFixture,
  parseGaClientIdFromCookie,
  parseGaExportRows,
  stitchGaRowsToVisitors,
} from "./ga-sync";

assert.equal(parseGaClientIdFromCookie("GA1.2.1234567890.0987654321"), "1234567890.0987654321");
assert.equal(parseGaClientIdFromCookie("GA1.1.111.222"), "111.222");
assert.equal(parseGaClientIdFromCookie(null), null);
assert.equal(parseGaClientIdFromCookie("not-a-ga-cookie"), null);

const parsed = parseGaExportRows({
  rows: [
    {
      user_pseudo_id: "1234567890.0987654321",
      event_name: "page_view",
      event_timestamp: "2026-07-14T12:00:00.000Z",
    },
    { client_id: "x", event_name: "x" }, // skipped — too short / invalid
    {
      client_id: "1112223334.5556667778",
      event_name: "session_start",
      event_timestamp: 1720958400000000,
    },
  ],
});
assert.equal(parsed.length, 2);
assert.equal(parsed[0]!.clientId, "1234567890.0987654321");
assert.equal(parsed[0]!.eventName, "page_view");
assert.equal(parsed[1]!.clientId, "1112223334.5556667778");
assert.match(parsed[1]!.eventTimestamp, /^2024-07-14/);

const fixture = loadGaExportFixture(defaultGaFixturePath());
assert.ok(fixture.length >= 2, "fixture should load BQ-shaped rows");

const stitches = stitchGaRowsToVisitors(
  [
    { id: "e1", clientId: "1234567890.0987654321", visitorId: null },
    { id: "e2", clientId: "no-match", visitorId: null },
    { id: "e3", clientId: "1234567890.0987654321", visitorId: "already" },
  ],
  [
    { id: "v1", gaClientId: "1234567890.0987654321" },
    { id: "v2", gaClientId: null },
  ],
);
assert.deepEqual(stitches, [{ id: "e1", visitorId: "v1" }]);

// Ingest accepts gaClientId (set-if-null path covered in persist; parse only here)
const ingest = parseIngestBody({
  visitorId: "11111111-1111-4111-8111-111111111111",
  visitId: "22222222-2222-4222-8222-222222222222",
  gaClientId: "1234567890.0987654321",
  events: [{ type: "page_view", path: "/en-US/shop" }],
});
assert.equal(ingest.ok, true);
if (ingest.ok) assert.equal(ingest.body.gaClientId, "1234567890.0987654321");

const badGa = parseIngestBody({
  visitorId: "11111111-1111-4111-8111-111111111111",
  visitId: "22222222-2222-4222-8222-222222222222",
  gaClientId: "!!!",
  events: [{ type: "page_view", path: "/shop" }],
});
assert.equal(badGa.ok, true);
if (badGa.ok) assert.equal(badGa.body.gaClientId, null);

// Admin graph stays first-party only — no live GA / staging table reads
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const aggregates = readFileSync(join(root, "lib/analytics/journey/aggregates.ts"), "utf8");
assert.doesNotMatch(aggregates, /analytics_ga|bigquery|googleapis|gtag/i);
const actions = readFileSync(join(root, "app/[lang]/settings/analytics/actions.ts"), "utf8");
assert.doesNotMatch(actions, /analytics_ga|bigquery|googleapis/i);
assert.match(actions, /loadPageTransitionsFromDb/);

const sla = readFileSync(join(root, "app/api/cron/results-sla/route.ts"), "utf8");
assert.match(sla, /runGaSync/);

const tracker = readFileSync(join(root, "components/analytics/journey-tracker.tsx"), "utf8");
assert.match(tracker, /gaClientId/);
assert.match(tracker, /_ga/);

console.log("ga-sync.check.ts: ok");
