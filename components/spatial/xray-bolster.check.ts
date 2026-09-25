/**
 * Slice 13 (visual layer) self-check: bolster capsule + x-ray wiring.
 * Run: npx tsx components/spatial/xray-bolster.check.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import { bolsterCapsulePath } from "./xray-assets";
import { BOLSTER_CAPSULE_LENGTHS, bolsterStage } from "@/lib/spatial-fillings/xray-layout";
import { BOLSTER_DIMENSIONS } from "@/lib/spatial-fillings/dimensions";

// --- Capsule silhouette: a long pill whose length follows the Mbolster length -
for (const length of ["short", "medium", "long"] as const) {
  const d = bolsterCapsulePath(length);
  assert.match(d, /^M.*Z$/, `${length}: closed path`);
  assert.equal((d.match(/A/g) ?? []).length, 2, `${length}: two semicircular end caps`);
}
assert.ok(
  BOLSTER_CAPSULE_LENGTHS.short < BOLSTER_CAPSULE_LENGTHS.medium &&
    BOLSTER_CAPSULE_LENGTHS.medium < BOLSTER_CAPSULE_LENGTHS.long,
  "capsule grows with the recommended length",
);
// Slice 09: the capsule is the registry's, at each length's own scale.
for (const length of ["short", "medium", "long"] as const) {
  const stage = bolsterStage(length);
  assert.ok(Math.abs(stage.k - BOLSTER_CAPSULE_LENGTHS[length] / BOLSTER_DIMENSIONS[length].lengthMm) < 1e-9, `${length}: k = view length / lengthMm`);
  assert.ok(Math.abs(stage.heightView - Math.round(BOLSTER_DIMENSIONS[length].diameterMm * stage.k * 10) / 10) < 0.11, `${length}: the diameter sets the capsule height`);
  assert.ok(bolsterCapsulePath(length).includes(`A${stage.heightView / 2} ${stage.heightView / 2}`), `${length}: the capsule path's caps are the stage's radius`);
}

// --- Renderer guardrails (ADR 0009) ------------------------------------------
const renderer = readFileSync(join(process.cwd(), "components", "spatial", "xray-bolster.tsx"), "utf8");
assert.doesNotMatch(renderer, /<rect/, "no box crops (guardrail 1)");
assert.match(renderer, /clipPath=\{`url\(#\$\{uid\}-capsule\)`\}/, "shell art clips to the capsule");
assert.match(
  renderer,
  /conformPouchPath\(p, \[SHELL_REGIONS\[length\]\], 2, visual\.shape\)/,
  "pouch geometry deforms to the capsule (rounded, no cut corners)",
);
assert.match(renderer, /bolsterShellPolygon\(/, "capsule sampled for conform geometry");
assert.match(renderer, /layoutBolsterPlacements\(/, "deterministic layout engine renders the mix");
assert.match(renderer, /layoutBolsterPlacements\(placements, length, \{ dims: itemDims, fit \}\)/, "true scale (slice 09): the registry dimensions and the fit draw the pack");
assert.match(renderer, /fitProp \?\? fitBolster\(placements, length, \{ dims: itemDims \}\)/, "the host's fit wins; the x-ray computes its own only when none is passed");
assert.match(renderer, /const would = fitBolster\(next, length, \{ dims: itemDims \}\);\s*if \(would\.status === "over"\) \{\s*toast\.error\(bolsterFitMessage\(would, pieceLabel\)\);\s*return;/, "an add the bolster cannot fit is refused with the numbers; compressed goes through");
assert.match(renderer, /data-xray-bolster-ring=\{fit\.status\}/, "the capsule ring is a stroke on the capsule path, amber or red");
assert.match(renderer, /<BolsterGauge fit=\{fit\} label=\{pieceLabel\} \/>/, "the length gauge sits with the editor");
assert.match(renderer, /status=\{squeeze\.status\}/, "a squeezed pouch draws dashed");
assert.doesNotMatch(renderer, /MAX_BOLSTER|placements\.length >= \d/, "the cap is physical and derived — never a slot number (ADR 0008 amendment)");
assert.match(renderer, /addBolsterPiece\(placements, itemId\)/, "add goes through the shared lib");
assert.match(renderer, /removeBolsterPiece\(placements, p\.slot\)/, "remove goes through the shared lib");
assert.doesNotMatch(renderer, /MAX_PIECES_PER_CELL|Cell full/, "no pillow cap on the bolster (v1)");

// --- Wiring: staff-gated mount on /mbolster-config ----------------------------
const page = readFileSync(join(process.cwd(), "app", "[lang]", "mbolster-config", "page.tsx"), "utf8");
assert.match(page, /getAdminContext\(\)/, "page runs the Staff check");
assert.match(page, /staffAssist=\{Boolean\(staffCtx && roleHasPermission\(staffCtx\.role, "results"\)\)\}/, "gate passed as a boolean prop, on the results permission");

const client = readFileSync(
  join(process.cwd(), "app", "[lang]", "mbolster-config", "mbolster-config-client.tsx"),
  "utf8",
);
assert.match(client, /staffAssist = false/, "assist defaults off (guest)");
// RE slice 07: guests also see the x-ray (read-only) once the reveal fires.
assert.match(client, /\{xrayVisible && \(\s*<XrayBolster/, "x-ray mounts behind the staff / guest-reveal gate");
assert.match(client, /items=\{staffAssist \? assistItems : undefined\}/, "guests get no item picker (read-only renderer)");
assert.match(client, /onPlacementsChange=\{staffAssist \? setAssistPlacements : undefined\}/, "guests get no placement editing (read-only renderer)");
assert.equal(client.match(/<XrayBolster\b/g)?.length, 1, "single x-ray mount point");
// Slice 09: one fit per host, the confirm on hold, the end-on cut for Staff and guest.
assert.match(client, /fit=\{staffAssist \? assistBolsterFit : guestBolsterFit\}/, "the x-ray reads the host's fit");
assert.match(client, /if \(staffAssist && !confirmSaveWithBolsterFit\(assistBolsterFit, "Hold"\)\) return;/, "a mix the bolster cannot fit confirms the hold, never blocks it");
assert.match(client, /<BolsterCrossSection\s+fit=\{staffAssist \? assistBolsterFit : guestBolsterFit\}/, "the end-on cross-section is mounted for Staff and guest");
assert.match(client, /bolsterCapsulePath\(suggestedLength \?\? DEFAULT_BOLSTER_LENGTH\)/, "silhouette follows the recommended length");
assert.match(client, /xrayVisible && "opacity-80 saturate-50"/, "shell desaturates in x-ray mode");
assert.match(client, /\{staffAssist && suggestedLength \? \(\s*<StaffAssistBolsterPanel/, "assist panel gated to Staff");
assert.doesNotMatch(client, /fetch\(["'`]\/api\/mp-config\/assist/, "client makes no assist fetches itself — they live in the Staff-only panel");

// --- API: bolster length scope stays staff-gated ------------------------------
const route = readFileSync(join(process.cwd(), "app", "api", "mp-config", "assist", "route.ts"), "utf8");
assert.match(route, /Invalid length/, "present-but-invalid length still 400s");
assert.match(route, /select\("id,name,subtype,size[,"]/, "items carry size for the pouch scale");

console.log("xray-bolster.check: all assertions passed");
