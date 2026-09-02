/**
 * Slice 11 self-check: filling color overrides — Product Builder editing,
 * gated API, and CSS-variable wiring into the x-ray.
 * Run: npx tsx lib/spatial-fillings/color-overrides.check.ts
 */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

import { effectiveFillingColors, xrayColorVarStyle } from "./color-overrides";
import { fillingVisual } from "./visuals";

// --- Resolution: default → override → cleared --------------------------------
const subtypes = ["3D (S)", "6D (Round)", "6D+ (Folded)"];
const defaults = effectiveFillingColors(subtypes, []);
assert.ok(defaults.every((r) => !r.overridden), "no rows → all defaults");
const withOverride = effectiveFillingColors(subtypes, [{ subtype: "3D (S)", color: "#123456" }]);
assert.equal(withOverride[0].color, "#123456", "override wins");
assert.equal(withOverride[0].shape, fillingVisual("3D (S)").shape, "override never touches shape");
assert.deepEqual(
  xrayColorVarStyle([{ subtype: "3D (S)", color: "#123456" }]),
  { "--xray-fill-3d-s": "#123456" },
  "style object defines exactly the overridden CSS variable",
);
assert.deepEqual(xrayColorVarStyle([]), {}, "cleared → variable absent, var() falls back");

// --- Product Builder: shape thumbnail read-only, color editable ---------------
const page = readFileSync("app/[lang]/settings/product-builder/product-builder-client.tsx", "utf8");
assert.match(page, /FILLING_SHAPE_PATHS\[row\.shape\]/, "thumbnail uses the one asset pipeline");
assert.match(page, /Read-only fluid-shape thumbnail/, "shape rendered as read-only thumbnail");
assert.match(page, /type="color"/, "native color input edits the override");
assert.match(page, /row\.overridden \? "Override" : "Default"/, "default vs override distinguished");
assert.doesNotMatch(page, /onChange[^\n]*shape/i, "no control writes shape");

// --- API: shape never accepted; mutations admin-gated -------------------------
const route = readFileSync("app/[lang]/settings/product-builder/filling-visuals/route.ts", "utf8");
assert.doesNotMatch(route, /shape\s*:/i, "API accepts no shape field — color only");
assert.equal(
  route.match(/const denied = await requireAdmin\('page-builder'\)/g)?.length,
  3,
  "GET, POST, and DELETE are admin-gated (settings-route policy)",
);
assert.match(route, /export async function GET/, "read path for the settings table");

// --- Wiring: overrides flow assist route → panel → x-ray container ------------
const assist = readFileSync("app/api/mp-config/assist/route.ts", "utf8");
assert.match(assist, /filling_color_overrides/, "assist response includes overrides (no deploy needed)");
assert.match(assist, /colorOverrides/, "overrides surfaced to the panel fetch");

const panel = readFileSync("components/configurator/staff-assist-panel.tsx", "utf8");
assert.match(panel, /onColorOverridesChange\?\.\(d\.colorOverrides \?\? \[\]\)/, "panel lifts overrides");

const client = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");
assert.match(client, /\.\.\.xrayColorVars/, "CSS-variable style spread onto the container");
assert.ok(
  client.indexOf("...xrayColorVars") < client.indexOf("<XrayPillow"),
  "spread sits on the element containing <XrayPillow> so var() resolves",
);
assert.match(
  client,
  /xrayColorVarStyle\(\s*assistColorOverrides\.length \? assistColorOverrides : shopColorOverrides \?\? \[\]/,
  "style built by the shared resolver — staff overrides win, shop response covers guests",
);

console.log("color-overrides.check: all assertions passed");
