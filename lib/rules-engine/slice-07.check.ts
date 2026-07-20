/**
 * RE slice 07 self-check: read-only x-ray on the completed preview + fallback.
 * Run: npx tsx lib/rules-engine/slice-07.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { previewMixMode } from "./preview-xray";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

// --- Fallback selection: spatial → x-ray, legacy-flat → text -----------------
assert.equal(
  previewMixMode([{ section: "left", sub_section: "front", slot: 1, item_id: 1 }]),
  "xray",
  "spatially-defined template renders the x-ray",
);
assert.equal(previewMixMode([]), "text", "legacy-flat template keeps the text mix");
assert.equal(previewMixMode(null), "text", "missing placements keep the text mix");
assert.equal(previewMixMode(undefined), "text", "no template keeps the text mix");

// --- Renderer read-only mode flag: no items/onPlacementsChange → no editing ---
for (const rel of ["components/spatial/xray-pillow.tsx", "components/spatial/xray-bolster.tsx"]) {
  assert.match(
    read(rel),
    /const editable = Boolean\(items && onPlacementsChange\)/,
    `${rel}: read-only when items/onPlacementsChange omitted`,
  );
}

// --- mp-config: one shared mount, guests view but never edit ------------------
const mp = read("app/[lang]/mp-config/mp-config-client.tsx");
assert.equal(mp.match(/<XrayPillow/g)?.length, 1, "one renderer, two consumers (shared mount)");
assert.match(mp, /previewMixMode\(guestPlacements\) === "xray"/, "fallback selection via previewMixMode");
assert.match(mp, /const guestXray = revealNow &&/, "slice-05 reveal gate applies unchanged");
assert.match(mp, /\{xrayVisible && \(\s*<XrayPillow/, "x-ray mounts only when staff edit or guest reveal");
assert.match(mp, /placements=\{staffAssist \? assistPlacements : guestPlacements\}/, "identical prop path for staff and guest mixes");
assert.match(mp, /items=\{staffAssist \? assistItems : undefined\}/, "guests get no picker");
assert.match(mp, /onPlacementsChange=\{staffAssist \? setAssistPlacements : undefined\}/, "guests get no edits");
assert.match(mp, /rowsToPillowPlacements\(tpl\?\.placements \?\? \[\]\)/, "recommended template rows drive the guest render");
assert.match(mp, /const mixLines = guestXray/, "text mix suppressed only while the x-ray shows");

// --- mbolster-config: bolster variant, same way -------------------------------
const mb = read("app/[lang]/mbolster-config/mbolster-config-client.tsx");
assert.equal(mb.match(/<XrayBolster/g)?.length, 1, "one bolster renderer, two consumers");
assert.match(mb, /previewMixMode\(recommendedTemplate\?\.placements\) === "xray"/, "bolster fallback selection via previewMixMode");
assert.match(mb, /const guestXray = revealNow &&/, "bolster reveal gate applies unchanged");
assert.match(mb, /\{xrayVisible && \(\s*<XrayBolster/, "bolster x-ray gated the same way");
assert.match(mb, /items=\{staffAssist \? assistItems : undefined\}/, "bolster guests get no picker");
assert.match(mb, /onPlacementsChange=\{staffAssist \? setAssistPlacements : undefined\}/, "bolster guests get no edits");
assert.match(mb, /rowsToBolsterPlacements\(recommendedTemplate\?\.placements \?\? \[\]\)/, "bolster template rows drive the guest render");
assert.match(mb, /const mixLines = guestXray/, "bolster text mix suppressed only while the x-ray shows");

// --- Graceful degradation: the legacy text path is intact, no renderer fork ---
const reveal = read("components/rules-engine/recommendation-reveal.tsx");
assert.match(reveal, /mixLines\.map/, "legacy text mix summary still renders");
assert.doesNotMatch(reveal, /Xray/, "reveal component stays visual-agnostic — no renderer fork");

// --- Guest data contract: placements + colors ship on guest-reachable routes --
const customize = read("app/api/shop/customize/route.ts");
assert.match(customize, /filling_template_placements/, "pillow placements ship to the preview");
assert.match(customize, /bolster_template_placements/, "bolster placements ship to the preview");
assert.match(customize, /filling_color_overrides/, "color overrides ship (identical colors vs Staff assist)");
const basic = read("app/api/mp-basic/recommend/route.ts");
assert.match(basic, /filling_template_placements/, "mp-basic ships placements too");
assert.match(basic, /filling_color_overrides/, "mp-basic ships color overrides too");

console.log("rules-engine slice 07 self-check ok");
