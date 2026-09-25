/**
 * Slice 13 (visual layer) self-check: bolster capsule + x-ray wiring.
 * Run: npx tsx components/spatial/xray-bolster.check.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import { bolsterCapsulePath } from "./xray-assets";
import { BOLSTER_CAPSULE_LENGTHS } from "@/lib/spatial-fillings/xray-layout";

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
assert.match(renderer, /d\.dims\.widthMm/, "registry width weights the pouch (slice 09 gives the bolster true scale)");
assert.match(renderer, /addBolsterPiece\(placements, itemId\)/, "add goes through the shared lib");
assert.match(renderer, /removeBolsterPiece\(placements, p\.slot\)/, "remove goes through the shared lib");
assert.doesNotMatch(renderer, /MAX_PIECES_PER_CELL|Cell full/, "no pillow cap on the bolster (v1)");

// --- Wiring: staff-gated mount on /mbolster-config ----------------------------
const page = readFileSync(join(process.cwd(), "app", "[lang]", "mbolster-config", "page.tsx"), "utf8");
assert.match(page, /getAdminContext\(\)/, "page runs the Staff check");
assert.match(page, /staffAssist=\{Boolean\(staffCtx\)\}/, "gate passed as a boolean prop");

const client = readFileSync(
  join(process.cwd(), "app", "[lang]", "mbolster-config", "mbolster-config-client.tsx"),
  "utf8",
);
assert.match(client, /staffAssist = false/, "assist defaults off (guest)");
// RE slice 07: guests also see the x-ray (read-only) once the reveal fires.
assert.match(client, /\{xrayVisible && \(\s*<XrayBolster/, "x-ray mounts behind the staff / guest-reveal gate");
assert.match(client, /items=\{staffAssist \? assistItems : undefined\}/, "guests get no item picker (read-only renderer)");
assert.match(client, /onPlacementsChange=\{staffAssist \? setAssistPlacements : undefined\}/, "guests get no placement editing (read-only renderer)");
assert.equal(client.match(/<XrayBolster/g)?.length, 1, "single x-ray mount point");
assert.match(client, /bolsterCapsulePath\(suggestedLength \?\? DEFAULT_BOLSTER_LENGTH\)/, "silhouette follows the recommended length");
assert.match(client, /xrayVisible && "opacity-80 saturate-50"/, "shell desaturates in x-ray mode");
assert.match(client, /\{staffAssist && suggestedLength \? \(\s*<StaffAssistBolsterPanel/, "assist panel gated to Staff");
assert.doesNotMatch(client, /fetch\(["'`]\/api\/mp-config\/assist/, "client makes no assist fetches itself — they live in the Staff-only panel");

// --- API: bolster length scope stays staff-gated ------------------------------
const route = readFileSync(join(process.cwd(), "app", "api", "mp-config", "assist", "route.ts"), "utf8");
assert.match(route, /Invalid length/, "present-but-invalid length still 400s");
assert.match(route, /select\("id,name,subtype,size"\)/, "items carry size for the pouch scale");

console.log("xray-bolster.check: all assertions passed");
