import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachConvertedSink,
  buildConvertedRecords,
  buildConvertedSinkDetail,
  collectConvertedFeeds,
  CONVERTED_NODE,
  entrySourceForConversion,
  isProspectVisit,
} from "./converted-sink";
import { buildPageTransitions } from "./transitions";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

assert.equal(isProspectVisit(null), true);
assert.equal(isProspectVisit(""), true);
assert.equal(isProspectVisit("order-1"), false);

assert.equal(entrySourceForConversion({ entry_source: "instagram" }), "instagram");
assert.equal(entrySourceForConversion({ entry_source: null }), "Direct");
assert.equal(entrySourceForConversion({ entry_source: "  " }), "Direct");

const payingVisit = {
  id: "v-pay",
  entry_source: "instagram",
  started_at: "2026-07-15T11:00:00.000Z",
  converted_order_id: "o1",
};
const priorVisit = {
  id: "v-prior",
  entry_source: "google",
  started_at: "2026-07-14T10:00:00.000Z",
  converted_order_id: "o-unused",
};

const records = buildConvertedRecords({
  visits: [priorVisit, payingVisit],
  orders: new Map([
    ["o1", { paid_at: "2026-07-15T12:00:00.000Z", total: 299 }],
    ["o-unused", { paid_at: "2026-07-14T11:00:00.000Z", total: 99 }],
  ]),
  eventsByVisit: new Map([
    [
      "v-pay",
      [
        { visitId: "v-pay", path: "/", occurredAt: "2026-07-15T11:00:00.000Z" },
        { visitId: "v-pay", path: "/shop", occurredAt: "2026-07-15T11:30:00.000Z" },
        { visitId: "v-pay", path: "/checkout", occurredAt: "2026-07-15T11:45:00.000Z" },
      ],
    ],
    [
      "v-prior",
      [
        { visitId: "v-prior", path: "/", occurredAt: "2026-07-14T10:00:00.000Z" },
      ],
    ],
  ]),
});

const paid = records.find((r) => r.visitId === "v-pay")!;
assert.equal(paid.entrySource, "instagram", "last-touch credits paying Visit entry source");
assert.notEqual(paid.entrySource, "google");
assert.equal(paid.lastPath, "/checkout");
assert.equal(paid.orderValue, 299);
assert.equal(paid.journeyDurationMs, 3_600_000);
assert.deepEqual(paid.shortPath, ["/", "/shop", "/checkout"]);

const { nodes: pageNodes, edges: pageEdges } = buildPageTransitions([
  { visitId: "v1", path: "/shop", occurredAt: "2026-07-15T10:00:00.000Z" },
]);
const feeds = collectConvertedFeeds(records.filter((r) => r.visitId === "v-pay"));
assert.deepEqual(feeds, [{ lastPath: "/checkout", count: 1 }]);

const withConverted = attachConvertedSink({ nodes: pageNodes, edges: pageEdges }, feeds);
assert.ok(withConverted.nodes.some((n) => n.path === CONVERTED_NODE));
assert.ok(
  withConverted.edges.some((e) => e.from === "/checkout" && e.to === CONVERTED_NODE && e.count === 1),
);

const detail = buildConvertedSinkDetail(records.filter((r) => r.visitId === "v-pay"));
assert.equal(detail.count, 1);
assert.equal(detail.totalValue, 299);
assert.deepEqual(detail.byEntrySource, [{ entrySource: "instagram", count: 1, totalValue: 299 }]);
assert.equal(detail.samples[0]!.journeyDurationMs, 3_600_000);
assert.deepEqual(detail.samples[0]!.shortPath, ["/", "/shop", "/checkout"]);

const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /Include converted/);
assert.match(card, /includeConverted/);
assert.match(card, /useState\(false\)/);
assert.match(card, /CONVERTED/);
assert.match(card, /convertedDetail/);
assert.match(card, /journeyDurationMs/);
assert.match(card, /shortPath/);

const actions = readFileSync(
  join(root, "app/[lang]/settings/analytics/actions.ts"),
  "utf8",
);
assert.match(actions, /includeConverted/);
assert.match(actions, /JourneyConvertedDetail/);
assert.match(actions, /convertedDetail/);

const aggregates = readFileSync(
  join(root, "lib/analytics/journey/aggregates.ts"),
  "utf8",
);
assert.match(aggregates, /isProspectVisit/);
assert.match(aggregates, /includeConverted/);
assert.match(aggregates, /attachConvertedSink/);
assert.doesNotMatch(aggregates, /analytics_ga|bigquery|googleapis|gtag/i);

console.log("converted-sink.check.ts: ok");
