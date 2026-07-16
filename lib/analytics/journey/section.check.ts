/**
 * Slice 06 — section tracer + expand/collapse.
 * Run: npx tsx lib/analytics/journey/section.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIngestBody } from "./ingest";
import { resolveExplicitDropOff } from "./lifecycle";
import {
  buildPageTransitions,
  buildSectionTransitions,
  expandPageToSections,
} from "./transitions";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const home = readFileSync(join(root, "app/[lang]/page.tsx"), "utf8");
assert.match(home, /data-section=\{section\.slug\}/);

const tracker = readFileSync(join(root, "components/analytics/journey-tracker.tsx"), "utf8");
assert.match(tracker, /IntersectionObserver/);
assert.match(tracker, /section_view/);
assert.match(tracker, /data-section/);

const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /divePath/);
assert.match(card, /onDive/);
assert.match(card, /onExitDive/);
assert.match(card, /Dive into sections/);
assert.match(card, /Journey breadcrumb/);
assert.doesNotMatch(card, /Expand \{p\}/);
assert.doesNotMatch(card, /Collapse \{expandPath\}/);
assert.doesNotMatch(card, /onToggleSectionExpand/);

const sectionOk = parseIngestBody({
  visitorId: "11111111-1111-4111-8111-111111111111",
  visitId: "22222222-2222-4222-8222-222222222222",
  events: [
    {
      type: "section_view",
      path: "/en-US/",
      sectionId: "hero",
      occurredAt: "2026-07-15T10:00:00.000Z",
    },
  ],
});
assert.equal(sectionOk.ok, true);
if (sectionOk.ok) {
  assert.equal(sectionOk.body.events[0]!.type, "section_view");
  assert.equal(sectionOk.body.events[0]!.sectionId, "hero");
  assert.equal(sectionOk.body.events[0]!.path, "/");
}

const drop = resolveExplicitDropOff(
  [
    { type: "page_view", path: "/", occurredAt: "2026-07-15T10:00:00.000Z" },
    {
      type: "section_view",
      path: "/",
      sectionId: "hero",
      occurredAt: "2026-07-15T10:01:00.000Z",
    },
    {
      type: "section_view",
      path: "/",
      sectionId: "size-matters",
      occurredAt: "2026-07-15T10:02:00.000Z",
    },
  ],
  "2026-07-15T10:03:00.000Z",
);
assert.ok(drop);
assert.equal(drop!.path, "/");
assert.equal(drop!.sectionId, "size-matters");

const sections = buildSectionTransitions(
  [
    {
      visitId: "v1",
      path: "/",
      sectionId: "hero",
      occurredAt: "2026-07-15T10:00:00.000Z",
    },
    {
      visitId: "v1",
      path: "/",
      sectionId: "size-matters",
      occurredAt: "2026-07-15T10:01:00.000Z",
    },
    {
      visitId: "v1",
      path: "/",
      sectionId: "hero",
      occurredAt: "2026-07-15T10:02:00.000Z",
    }, // loop back
  ],
  [{ path: "/", sectionId: "hero", count: 2 }],
);
assert.equal(sections.nodes.find((n) => n.sectionId === "hero")?.views, 2);
assert.equal(sections.nodes.find((n) => n.sectionId === "hero")?.dropOffs, 2);
assert.deepEqual(
  sections.edges.map((e) => `${e.fromSection}->${e.toSection}:${e.count}`).sort(),
  ["hero->size-matters:1", "size-matters->hero:1"].sort(),
);

const page = buildPageTransitions([
  { visitId: "v1", path: "/", occurredAt: "2026-07-15T10:00:00.000Z" },
  { visitId: "v1", path: "/shop", occurredAt: "2026-07-15T10:03:00.000Z" },
]);
const expanded = expandPageToSections(page, sections, "/");
assert.ok(expanded.nodes.some((n) => n.path === "/")); // page stays; children added
assert.ok(expanded.nodes.some((n) => n.path === "/#hero"));
assert.ok(expanded.nodes.some((n) => n.path === "/#size-matters"));
assert.ok(expanded.nodes.some((n) => n.path === "/shop"));
assert.ok(expanded.edges.some((e) => e.from === "/#hero" && e.to === "/#size-matters"));
// Untagged expand is a no-op (page-level only)
assert.deepEqual(expandPageToSections(page, sections, "/untagged"), page);

console.log("section.check.ts: ok");
