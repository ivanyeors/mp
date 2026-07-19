/**
 * Slice 13 self-check: Mbolster spatial wiring — own schema (never pillow
 * enums), staff gating, single mount, capsule guardrails (ADR 0008/0009).
 * Run: npx tsx components/spatial/xray-bolster.check.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import { BOLSTER_SILHOUETTE_PATH } from "./xray-assets";
import {
  rowsToBolsterPlacements,
  validateBolsterPlacements,
} from "@/lib/spatial-fillings/core";
import { addBolsterPiece, removeBolsterPiece } from "@/lib/configurator/staff-assist";
import { BOLSTER_FRAME, layoutBolsterPlacements } from "@/lib/spatial-fillings/xray-layout";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

// --- Own schema: bolster placements never touch the pillow enums, no cap -----
const categories = new Map([[1, "filling"]]);
const rows = [
  { slot: 1, item_id: 1 },
  { slot: 40, item_id: 1 }, // slot ≥ 1, unbounded — NO cap in v1
];
assert.deepEqual(
  validateBolsterPlacements(rowsToBolsterPlacements(rows), categories),
  { ok: true },
  "bolster validation passes without any cell address and without a cap",
);
for (const file of [
  ["components", "spatial", "xray-bolster.tsx"],
  ["components", "spatial", "bolster-compartment-list.tsx"],
  ["components", "configurator", "staff-assist-bolster-panel.tsx"],
]) {
  const src = read(...file);
  assert.doesNotMatch(src, /SubSection|sub_section|SECTIONS|PILLOW_CELLS/, `${file.join("/")} never references the pillow Section/sub-section enums`);
}

// --- Compartment editor rules: lowest free slot, remove by slot, no cap ------
let mix = addBolsterPiece([], 1);
for (let i = 0; i < 9; i++) mix = addBolsterPiece(mix, 1);
assert.equal(mix.length, 10, "10th piece fits — no cap");
assert.deepEqual(mix.map((p) => p.slot), Array.from({ length: 10 }, (_, i) => i + 1), "slots fill 1→n");
mix = removeBolsterPiece(mix, 3);
assert.equal(addBolsterPiece(mix, 2).find((p) => p.slot === 3)?.itemId, 2, "re-add reuses lowest free slot");

// --- Deterministic capsule layout (ADR 0009 guardrail 3) ---------------------
const big = Array.from({ length: 23 }, (_, i) => ({ slot: i + 1, itemId: 1 }));
assert.deepEqual(
  layoutBolsterPlacements(big),
  layoutBolsterPlacements([...big].reverse()),
  "same placements → identical layout",
);
for (const p of layoutBolsterPlacements(big)) {
  assert.ok(
    p.cx >= BOLSTER_FRAME.x && p.cx <= BOLSTER_FRAME.x + BOLSTER_FRAME.w,
    "pieces stay inside the capsule frame",
  );
}

// --- Capsule renderer guardrails (ADR 0009) ----------------------------------
const renderer = read("components", "spatial", "xray-bolster.tsx");
assert.doesNotMatch(renderer, /<rect/, "no box crops (guardrail 1)");
assert.doesNotMatch(renderer, /d="M/, "no hard-coded paths — assets only (guardrail 5)");
assert.match(renderer, /BOLSTER_SILHOUETTE_PATH/, "clips against the capsule asset");
assert.match(renderer, /clipPath=\{`url\(#\$\{uid\}-sil\)`\}/, "silhouette clipPath (single region)");
assert.match(renderer, /layoutBolsterPlacements\(placements\)/, "deterministic layout engine renders the mix");
assert.match(renderer, /MorphPiece/, "pieces reuse the prepared-morph piece (one pipeline)");
assert.doesNotMatch(renderer, /SECTION_HIT_PATHS|CELL_CLIP_PATHS|Dive|dived/, "no Section hover/dive — single compartment");
assert.match(BOLSTER_SILHOUETTE_PATH, /^M80 40/, "capsule asset is the shared configurator path");

// --- Staff gating on /mbolster-config: guests never see assist chrome --------
const page = read("app", "[lang]", "mbolster-config", "page.tsx");
assert.match(page, /getAdminContext/, "server page resolves the Staff check");
assert.match(page, /staffAssist=\{Boolean\(staffCtx\)\}/, "page passes the gate as a boolean prop");

const client = read("app", "[lang]", "mbolster-config", "mbolster-config-client.tsx");
assert.match(client, /staffAssist = false/, "assist defaults off (guest)");
assert.match(client, /\{staffAssist && \(\s*<XrayBolster/, "x-ray mounts only for Staff");
assert.equal(client.match(/<XrayBolster/g)?.length, 1, "single x-ray mount point");
assert.match(client, /staffAssist && suggestedLength \? \(\s*<StaffAssistBolsterPanel/, "panel renders only for Staff");
assert.equal(client.match(/<StaffAssistBolsterPanel/g)?.length, 1, "single assist mount point");
assert.match(client, /placements=\{assistPlacements\}/, "renders the assist session mix live");
assert.match(client, /onPlacementsChange=\{setAssistPlacements\}/, "panel edits land in the lifted session mix");
assert.match(client, /bolsterPlacementsToRows\(assistPlacements\)/, "hold payload sends slot-only rows");
assert.match(client, /const BOLSTER_PATH = BOLSTER_SILHOUETTE_PATH/, "one silhouette source (guardrail 5)");
assert.doesNotMatch(client, /sub_section|pillowPlacementsToRows|PillowPlacement/, "client never builds pillow cell payloads for the bolster");

// --- Assist endpoint: staff-gated, length mode, bolster table ----------------
const assist = read("app", "api", "mp-config", "assist", "route.ts");
assert.match(assist, /getAdminContext/, "assist endpoint uses the Staff check");
assert.match(assist, /status: 401/, "assist endpoint denies guests");
assert.match(assist, /isBolsterLength/, "length-based template scoping");
assert.match(assist, /bolster_template_placements/, "bolster placements come from the bolster table");

// --- Admin surfaces: Configure editor + Result assign go spatial for bolster --
const configure = read("app", "[lang]", "settings", "inventory", "configure", "[card]", "page.tsx");
assert.match(configure, /kind === "pillow" \? \(\s*<Section title="Spatial recipe/, "3×3 grid stays pillow-only");
assert.match(configure, /<BolsterCompartmentList/, "bolster Filling Config tab uses the compartment list");
assert.match(configure, /kind=\$\{kind\}/, "unpromoted ranking fetched per kind (bolster length cards included)");

const results = read("app", "[lang]", "settings", "results", "[id]", "page.tsx");
assert.match(results, /<BolsterCompartmentList/, "Result assign edits the bolster compartment spatially");
assert.match(results, /bolsterPlacementsToRows\(bolsterMix\)/, "assign body sends slot-only rows");

const unpromoted = read("app", "[lang]", "settings", "inventory", "configure", "unpromoted", "route.ts");
assert.match(unpromoted, /requireAdmin\('inventory'\)/, "ranking route stays admin-gated");
assert.match(unpromoted, /z\.enum\(\['pillow', 'bolster'\]\)/, "bolster scope accepted");
assert.match(unpromoted, /result_bolster_filling_placements/, "bolster snapshots ranked from the bolster table");
assert.match(unpromoted, /verifyPromotedBolsterMix/, "Promote re-verifies via the bolster path");

console.log("xray-bolster.check: all assertions passed");
