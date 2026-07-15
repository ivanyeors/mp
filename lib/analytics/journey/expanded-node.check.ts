/**
 * Slice 14 — Expanded node dig-in (replace side panel).
 * Run: npx tsx lib/analytics/journey/expanded-node.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNodeSidePanel } from "./chrome";
import { exitSectionHref, isSectionChildPath } from "./paths";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// --- share % + outbound ---
const panel = buildNodeSidePanel({
  path: "/",
  events: [
    { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:00:00.000Z" },
    { visitId: "v1", path: "/shop", occurredAt: "2026-07-15T10:01:00.000Z" },
  ],
  exitSections: [
    { sectionId: "pick-your-mpillow", count: 2 },
    { sectionId: "hero", count: 1 },
  ],
  pageDropOffTotal: 4,
  outbound: [
    { to: "/shop", count: 5 },
    { to: "__drop_off__", count: 2 },
  ],
  visitEndedAt: new Map([["v1", "2026-07-15T10:02:00.000Z"]]),
});
assert.equal(panel.exitSections[0]!.sectionId, "pick-your-mpillow");
assert.equal(panel.exitSections[0]!.sharePct, 50);
assert.equal(panel.exitSections[1]!.sharePct, 25);
assert.deepEqual(panel.outbound.map((o) => o.to), ["/shop", "__drop_off__"]);

// --- anchor href uses Admin lang ---
assert.equal(
  exitSectionHref("en-US", "/", "pick-your-mpillow"),
  "/en-US#pick-your-mpillow",
);
assert.equal(
  exitSectionHref("zh-CN", "/shop", "buy-box"),
  "/zh-CN/shop#buy-box",
);
assert.equal(isSectionChildPath("/#hero"), true);
assert.equal(isSectionChildPath("/"), false);
assert.equal(isSectionChildPath("__converted__"), false);

// --- UI: Expanded node, no drawer, split detail fetch ---
const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /ExpandedPageDigIn/);
assert.match(card, /ExpandedConvertedDigIn/);
assert.match(card, /foreignObject/);
assert.match(card, /getProspectJourneyNodeDetail/);
assert.match(card, /exitSectionHref/);
assert.match(card, /canExpandNode/);
assert.match(card, /expandedNodeBox/);
assert.match(card, /pageDigInH/);
assert.doesNotMatch(card, /overflow-y-auto/);
assert.doesNotMatch(card, /function DetailPanel/);
assert.doesNotMatch(card, /function ConvertedDetailPanel/);
assert.doesNotMatch(card, /translate-x-full/);
assert.doesNotMatch(card, /absolute inset-y-0 right-0 z-20/);

const actions = readFileSync(
  join(root, "app/[lang]/settings/analytics/actions.ts"),
  "utf8",
);
assert.match(actions, /getProspectJourneyNodeDetail/);
assert.match(actions, /sharePct/);
assert.match(actions, /outbound/);
assert.doesNotMatch(actions, /detailPath\?:/);

const aggregates = readFileSync(
  join(root, "lib/analytics/journey/aggregates.ts"),
  "utf8",
);
assert.match(aggregates, /loadNodeDetailFromDb/);
assert.match(aggregates, /pageDropOffTotal/);
assert.match(aggregates, /outbound/);

// --- storefront ids match data-section ---
const home = readFileSync(join(root, "app/[lang]/page.tsx"), "utf8");
assert.match(home, /id=\{section\.slug\} data-section=\{section\.slug\}/);

const pdp = readFileSync(
  join(root, "app/[lang]/shop/[slug]/product-detail-client.tsx"),
  "utf8",
);
assert.match(pdp, /id="gallery" data-section="gallery"/);
assert.match(pdp, /id="buy-box" data-section="buy-box"/);

const checkout = readFileSync(
  join(root, "app/[lang]/shop/checkout/page.tsx"),
  "utf8",
);
assert.match(checkout, /id="payment" data-section="payment"/);

const results = readFileSync(
  join(root, "app/[lang]/results/[id]/page.tsx"),
  "utf8",
);
assert.match(results, /id="status-journey" data-section="status-journey"/);
assert.match(results, /id=\{`status-\$\{status\}`\}/);

const mpConfig = readFileSync(
  join(root, "app/[lang]/mp-config/mp-config-client.tsx"),
  "utf8",
);
assert.match(mpConfig, /id=\{currentStep\}/);

const mbolster = readFileSync(
  join(root, "app/[lang]/mbolster-config/mbolster-config-client.tsx"),
  "utf8",
);
assert.match(mbolster, /id=\{state\.step\}/);

console.log("expanded-node.check.ts: ok");
