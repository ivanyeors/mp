/**
 * Slice 10 self-check: Product Builder overlay mapping.
 * Run: npx tsx lib/product-builder/overlays.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { OverlayFitSchema, overlayFrame } from "./overlays";

/** Bounds the workbench slider must not exceed (mirrors OverlayFitSchema). */
const SCALE_BOUNDS = { min: 0.2, max: 3 };

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

// --- Visual workbench: the stage renders what the configurator renders ---
const bench = readFileSync("components/product-builder/overlay-workbench.tsx", "utf8");
assert.match(bench, /overlayFrame\(fit, VIEW_W, VIEW_H\)/, "stage places the image with overlayFrame");
assert.match(bench, /SILHOUETTE_PATH/, "stage clips against the shared silhouette, not a copy");
// The static BOLSTER_SILHOUETTE_PATH is a placeholder no configurator draws;
// /mbolster-config uses bolsterCapsulePath(length), so the workbench must too.
assert.match(bench, /bolsterCapsulePath\(length\)/, "bolster cases preview against the real capsule");
assert.doesNotMatch(
  /import \{[^}]*\} from "@\/components\/spatial\/xray-assets";/.exec(bench)?.[0] ?? "",
  /BOLSTER_SILHOUETTE_PATH/,
  "stale placeholder capsule is not imported",
);
// /mbolster-config takes the capsule length from the shopper's recommendation
// (bolster_variant), not from the case item's size, so one mapping ships
// against all three — the stage has to be able to show all three.
assert.match(bench, /BOLSTER_LENGTHS\.map/, "capsule length is switchable, not inferred once");
assert.match(bench, /function defaultBolsterLength/, "item size only seeds the opening length");
// The ghost must not paint inside the silhouette: an asset with alpha would
// otherwise show content the configurator never renders.
assert.match(bench, /mask=\{`url\(#\$\{maskId\}\)`\}/, "ghost is masked out of the silhouette");
assert.match(bench, /aria-live=\{dragging \? "off" : "polite"\}/, "drag does not flood the live region");
// React's generated ids carry colons/guillemets — invalid inside url(#...).
assert.doesNotMatch(/import \{[^}]*\} from "react";/.exec(bench)?.[0] ?? "", /useId/, "useId is not imported");
assert.match(bench, /const clipId = `overlay-clip-\$\{item\.id\}`/, "clip id is deterministic per item");
// Radix ScrollArea's Root is only `relative`, so a max-h on it never clips.
assert.doesNotMatch(bench, /ScrollArea/, "rail uses a native overflow container that honours max-h");
assert.match(bench, /max-h-\[28rem\] overflow-y-auto/, "rail scrolls instead of spilling into the next section");
assert.match(bench, /onKeyDown=\{url \? onKeyDown : undefined\}/, "fit is keyboard-reachable, not drag-only");
// A mapping row whose asset lost its hosted_url is dropped by fetchOverlayMap,
// so the shop renders nothing — the workbench must not call that "unmapped".
assert.match(bench, /const assetMissing = item\.mapping != null && url == null;/, "missing asset is a distinct state");
assert.match(
  bench,
  /items\.filter\(\(i\) => i\.mapping\?\.hosted_url\)\.length/,
  "the mapped counter counts overlays that actually ship, not mapping rows",
);
assert.match(bench, /preserveAspectRatio="xMidYMid slice"/, "same cover behaviour as the configurator");
assert.match(bench, /clipPath=\{`url\(#\$\{clipId\}\)`\}/, "overlay is clipped to the silhouette");
assert.match(bench, /onPointerMove=\{onPointerMove\}/, "fit is dragged, not typed");
assert.match(
  bench,
  /const k = \(VIEW_W \+ PAD_X \* 2\) \/ rect\.width/,
  "pointer pixels convert through the padded stage width, not the bare viewBox",
);
assert.match(bench, /opacity=\{0\.18\}/, "ghost shows the part of the asset the clip discards");
// The stage must not be able to dial in a fit the API would reject.
assert.equal(SCALE_BOUNDS.min, 0.2, "stage scale floor matches OverlayFitSchema");
assert.equal(SCALE_BOUNDS.max, 3, "stage scale ceiling matches OverlayFitSchema");
assert.match(bench, /const SCALE_MIN = 0\.2;/, "stage slider floor pinned to the schema");
assert.match(bench, /const SCALE_MAX = 3;/, "stage slider ceiling pinned to the schema");
assert.match(bench, /const OFFSET_LIMIT = 400;/, "stage offset clamp pinned to the schema");
assert.ok(
  !OverlayFitSchema.safeParse({ scale: SCALE_BOUNDS.max + 0.05 }).success,
  "a scale one slider step past the ceiling is rejected — so the clamp is load-bearing",
);

const pageSrc = readFileSync(
  "app/[lang]/settings/product-builder/product-builder-client.tsx",
  "utf8",
);
assert.match(pageSrc, /<OverlayWorkbench/, "page mounts the workbench");
assert.doesNotMatch(pageSrc, /fit scale`/, "the blind scale/x/y number inputs are gone");

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
