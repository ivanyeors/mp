import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPageTransitions,
  buildSectionTransitions,
  expandPageToSections,
} from "./transitions";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const tracker = read("components/analytics/journey-tracker.tsx");
assert.match(tracker, /data-section/);
assert.match(tracker, /data-step/);
assert.match(tracker, /\[data-section\], \[data-step\]/);
assert.match(tracker, /isAdminJourneyPath/);

const pdp = read("app/[lang]/shop/[slug]/product-detail-client.tsx");
for (const id of ["gallery", "buy-box", "description", "specifications", "reviews", "related"]) {
  assert.match(pdp, new RegExp(`data-section="${id}"`));
}

const mpConfig = read("app/[lang]/mp-config/mp-config-client.tsx");
assert.match(mpConfig, /data-section=\{currentStep\}/);
assert.match(mpConfig, /data-step=\{currentStep\}/);

const mpBasic = read("app/[lang]/mp-basic/page.tsx");
assert.match(mpBasic, /from ["']\.\.\/mp-config\/page["']/);

const mbolster = read("app/[lang]/mbolster-config/mbolster-config-client.tsx");
assert.match(mbolster, /data-section=\{state\.step\}/);
assert.match(mbolster, /data-step=\{state\.step\}/);

const checkout = read("app/[lang]/shop/checkout/page.tsx");
for (const id of ["contact", "shipping-address", "shipping-method", "payment", "order-summary"]) {
  assert.match(checkout, new RegExp(`data-section="${id}"`));
}

const results = read("app/[lang]/results/[id]/page.tsx");
assert.match(results, /data-section="status-journey"/);
assert.match(results, /data-section="build-details"/);
assert.match(results, /data-section=\{`status-\$\{status\}`\}/);
assert.match(results, /data-step=\{status\}/);
assert.match(results, /data-section="decide"/);

function* walkTsx(dir: string): Generator<string> {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) yield* walkTsx(p);
    else if (name.name.endsWith(".tsx") || name.name.endsWith(".ts")) yield p;
  }
}
const settingsDir = join(root, "app/[lang]/settings");
for (const file of walkTsx(settingsDir)) {
  const src = readFileSync(file, "utf8");
  assert.doesNotMatch(
    src,
    /data-section=|data-step=/,
    `settings must not tag journey sections: ${file}`,
  );
}

const taggedSurfaces = [
  { path: "/shop/example", sectionId: "buy-box" },
  { path: "/mp-config", sectionId: "size" },
  { path: "/shop/checkout", sectionId: "payment" },
  { path: "/results/example", sectionId: "status-accepted" },
];
const occurredAt = "2026-07-15T10:00:00.000Z";
const pages = buildPageTransitions(
  taggedSurfaces.map((surface, i) => ({
    visitId: `surface-${i}`,
    path: surface.path,
    occurredAt,
  })),
);
const sections = buildSectionTransitions(
  taggedSurfaces.map((surface, i) => ({
    visitId: `surface-${i}`,
    ...surface,
    occurredAt,
  })),
  taggedSurfaces.map((surface) => ({ ...surface, count: 1 })),
);
for (const surface of taggedSurfaces) {
  const expanded = expandPageToSections(pages, sections, surface.path);
  assert.ok(expanded.nodes.some((node) => node.path === `${surface.path}#${surface.sectionId}`));
  assert.equal(
    sections.nodes.find(
      (node) => node.path === surface.path && node.sectionId === surface.sectionId,
    )?.dropOffs,
    1,
  );
}

console.log("section-surfaces.check.ts: ok");
