/**
 * Slice 10 self-check: Product Builder overlay mapping.
 * Run: npx tsx lib/product-builder/overlays.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { OverlayFitSchema, overlayFrame } from "./overlays";

// --- overlayFrame math ---
assert.deepEqual(
  overlayFrame(null),
  { x: 0, y: 0, width: 664, height: 374 },
  "no fit → full viewBox fill",
);
assert.deepEqual(
  overlayFrame({}),
  { x: 0, y: 0, width: 664, height: 374 },
  "identity fit → full viewBox fill",
);
assert.deepEqual(
  overlayFrame({ scale: 0.5, x: 10, y: -20 }),
  { x: 176, y: 73.5, width: 332, height: 187 },
  "scaled + offset frame stays centered before offset",
);

// --- fit schema bounds ---
assert.ok(OverlayFitSchema.safeParse({ scale: 1.2, x: 30, y: -15 }).success);
assert.ok(!OverlayFitSchema.safeParse({ scale: 9 }).success, "scale out of bounds rejected");

// --- Product Builder + Rules Engine nested under Store > Products ---
readFileSync("app/[lang]/settings/product-builder/product-builder-client.tsx", "utf8");
const nav = readFileSync("components/settings/settings-sidebar-nav.tsx", "utf8");
const storeGroup = nav.slice(nav.indexOf('"Store"'), nav.indexOf('"Landing Site"'));
assert.match(storeGroup, /\/settings\/product-builder"/, "Product Builder in Store group");
assert.match(storeGroup, /Product Builder/, "Product Builder label registered");
assert.match(
  storeGroup,
  /\/settings\/product-builder\/rules-engine/,
  "Rules Engine is a sibling of Product Builder, not its child",
);
assert.match(
  storeGroup,
  /product-builder[^}]*perm: "page-builder"/,
  "perm gating unchanged by the move",
);

// --- Mapping API contract ---
const api = readFileSync("app/[lang]/settings/product-builder/mappings/route.ts", "utf8");
assert.match(api, /export async function GET/);
assert.match(api, /export async function POST/);
assert.match(api, /export async function DELETE/);
assert.match(api, /OverlayFitSchema/, "fit validated with OverlayFitSchema");
assert.match(api, /item_overlay_mappings/, "route reads item_overlay_mappings");

// --- Configurator preview renders clipped overlays ---
for (const [name, path] of [
  ["mp-config", "app/[lang]/mp-config/mp-config-client.tsx"],
  ["mbolster-config", "app/[lang]/mbolster-config/mbolster-config-client.tsx"],
] as const) {
  const src = readFileSync(path, "utf8");
  assert.match(src, /<clipPath id="[^"]*overlay-clip"/, `${name} clips overlay to silhouette`);
  assert.match(src, /overlayFrame\(/, `${name} uses overlayFrame for placement`);
  assert.match(src, /preserveAspectRatio="xMidYMid slice"/, `${name} covers the shape`);
}

console.log("product-builder overlays self-check ok");
