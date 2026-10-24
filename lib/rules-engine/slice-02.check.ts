/**
 * Slice 02 self-check: workbench mount, rules-engine gating, save/publish contract.
 * Run: npx tsx lib/rules-engine/slice-02.check.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { roleHasPermission } from "@/lib/auth/permissions";
import { evaluateOrThrow } from "./evaluate";
import { FLOW_LABELS } from "./flow-labels";
import {
  DEFAULT_TEMPLATE_IDS,
  premiumHandGraph,
  premiumSampleInputs,
} from "./fixtures";
import { canConnect, inputValuePort, sourcePort, targetPort } from "./ports";
import { cmToInches, inchesToCm, roundCm } from "./units";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// --- Mount: pages + entry + React Flow workbench ---
const flowPage =
  "app/[lang]/settings/product-builder/rules-engine/[flow]/page.tsx";
const indexPage = "app/[lang]/settings/product-builder/rules-engine/page.tsx";
const workbench = "components/rules-engine/workbench.tsx";
const productBuilder = "app/[lang]/settings/inventory/configure/product-visualize.tsx";

assert.ok(existsSync(join(ROOT, flowPage)), "flow page exists");
assert.ok(existsSync(join(ROOT, indexPage)), "rules-engine index exists");
assert.ok(existsSync(join(ROOT, workbench)), "workbench exists");

assert.match(read(flowPage), /requireAdminPage\("rules-engine"/);
assert.match(read(indexPage), /requireAdminPage\("rules-engine"/);
assert.match(read(workbench), /@xyflow\/react/);
assert.match(read(workbench), /MiniMap/);
assert.match(read(workbench), /from "@\/lib\/rules-engine\/evaluate"/);
assert.match(read(workbench), /validateForPublish/);
assert.match(read(workbench), /cmToInches|inchesToCm/);
assert.match(read(productBuilder), /Rules Engine/);
assert.match(
  read(productBuilder),
  /\/settings\/product-builder\/rules-engine/,
);

// --- Perm gating: rules-engine yes for owner, no for viewer ---
assert.equal(roleHasPermission("owner", "rules-engine"), true);
assert.equal(roleHasPermission("viewer", "rules-engine"), false);

const apiRoutes = [
  "app/api/settings/rules-engine/[flow]/route.ts",
  "app/api/settings/rules-engine/[flow]/publish/route.ts",
  "app/api/settings/rules-engine/[flow]/versions/route.ts",
  "app/api/settings/rules-engine/[flow]/versions/[id]/restore/route.ts",
  "app/api/settings/rules-engine/[flow]/evaluate/route.ts",
];
for (const r of apiRoutes) {
  assert.match(read(r), /requireAdminContext\("rules-engine"\)/);
}

// Save contract: PUT body { graph }; Publish: POST → ok | errors[]
const draftRoute = read("app/api/settings/rules-engine/[flow]/route.ts");
assert.match(draftRoute, /export async function PUT/);
assert.match(draftRoute, /graph:\s*GraphSchema|z\.object\(\{\s*graph/);
assert.match(draftRoute, /saveDraft/);

const publishRoute = read(
  "app/api/settings/rules-engine/[flow]/publish/route.ts",
);
assert.match(publishRoute, /export async function POST/);
assert.match(publishRoute, /publishDraft/);
assert.match(publishRoute, /status:\s*400/);

const restoreRoute = read(
  "app/api/settings/rules-engine/[flow]/versions/[id]/restore/route.ts",
);
assert.match(restoreRoute, /restoreToDraft/);

// --- Flow labels (breadcrumbs / switcher) ---
assert.equal(FLOW_LABELS["premium-mpillow"], "Premium Mpillow");
assert.equal(FLOW_LABELS["basic-mpillow"], "Basic Mpillow");
assert.equal(FLOW_LABELS.mbolster, "Mbolster");

// --- Type-checked ports ---
assert.equal(inputValuePort("number"), "number");
assert.equal(inputValuePort("enum"), "enum");
assert.equal(sourcePort({ type: "size-output" }), "size");
assert.equal(targetPort({ type: "range" }), "number");
assert.equal(targetPort({ type: "template-output" }), "size");
assert.equal(targetPort({ type: "input" }), null);
assert.equal(canConnect("number", "number"), true);
assert.equal(canConnect("number", "enum"), false);
assert.equal(canConnect("size", "size"), true);
assert.equal(canConnect("size", "signal"), false);
assert.equal(canConnect("signal", "signal"), true);
assert.equal(canConnect("enum", "enum"), true);

// --- Units: Range bands authored inches ↔ canonical cm ---
assert.equal(roundCm(inchesToCm(10)), 25.4);
assert.ok(Math.abs(cmToInches(25.4) - 10) < 1e-9);

// --- Test panel contract: evaluate() outputs for seeded Premium graph ---
const graph = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
const result = evaluateOrThrow(
  "premium-mpillow",
  graph,
  premiumSampleInputs({ shoulder_length_cm: 42 }),
);
assert.equal(result.size, "M");
assert.equal(result.templateId, DEFAULT_TEMPLATE_IDS.M);
assert.ok(result.trace.some((t) => t.nodeId === "rng-shoulder"));
assert.ok(result.firedTerminals.some((t) => t.nodeId === "tpl-m"));

// Workbench must call the same evaluate (not a parallel client engine)
assert.match(read(workbench), /evaluate\(flow,\s*graph,\s*inputs\)/);

console.log("rules-engine slice 02 self-check ok");
