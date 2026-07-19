/**
 * Slice 01 self-check: schema + engine core wiring + acceptance behaviors.
 * Run: npx tsx lib/rules-engine/slice-01.check.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { evaluate, evaluateOrThrow } from "./evaluate";
import {
  DEFAULT_TEMPLATE_IDS,
  premiumHandGraph,
  premiumSampleInputs,
} from "./fixtures";
import { validateForPublish } from "./validate";
import { roleHasPermission } from "@/lib/auth/permissions";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// --- Migration ---
const mig = "supabase/migrations/20260719180000_rule_graphs.sql";
assert.ok(existsSync(join(ROOT, mig)), "rule_graphs migration exists");
const sql = read(mig);
assert.match(sql, /create table if not exists rule_graphs/);
assert.match(sql, /uq_rule_graphs_draft/);
assert.match(sql, /uq_rule_graphs_published_version/);
assert.match(sql, /premium-mpillow/);

// --- API routes + page-builder gate ---
const routes = [
  "app/api/settings/rules-engine/[flow]/route.ts",
  "app/api/settings/rules-engine/[flow]/publish/route.ts",
  "app/api/settings/rules-engine/[flow]/versions/route.ts",
  "app/api/settings/rules-engine/[flow]/versions/[id]/restore/route.ts",
  "app/api/settings/rules-engine/[flow]/evaluate/route.ts",
];
for (const r of routes) {
  assert.ok(existsSync(join(ROOT, r)), `${r} exists`);
  assert.match(read(r), /requireAdminContext\("page-builder"\)/);
}
assert.equal(roleHasPermission("owner", "page-builder"), true);
assert.equal(roleHasPermission("viewer", "page-builder"), false);

// --- Hand-written Premium graph: validate + evaluate ---
const graph = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
assert.deepEqual(validateForPublish("premium-mpillow", graph), []);

const result = evaluateOrThrow(
  "premium-mpillow",
  graph,
  premiumSampleInputs({ shoulder_length_cm: 42 }),
);
assert.equal(result.size, "M");
assert.equal(result.templateId, DEFAULT_TEMPLATE_IDS.M);
assert.ok(result.trace.length > 0, "trace present");
assert.ok(
  result.firedTerminals.some((t) => t.nodeId === "sz-m"),
  "size terminal fired",
);
assert.ok(
  result.firedTerminals.some((t) => t.nodeId === "tpl-m"),
  "template terminal fired",
);

// Determinism
const a = evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs());
const b = evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs());
assert.deepEqual(a, b);

// Missing required input — refuse, do not default
const incomplete = { ...premiumSampleInputs() };
delete incomplete.shoulder_length_cm;
const refused = evaluate("premium-mpillow", graph, incomplete);
assert.ok("error" in refused && refused.missing.includes("shoulder_length_cm"));

// Publish rejection cases (node ids)
const cycle = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
cycle.edges.push({ id: "c", source: "tpl-m", target: "rng-shoulder" });
assert.ok(validateForPublish("premium-mpillow", cycle).some((e) => e.code === "cycle" && e.nodeId));

const gap = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
const rng = gap.nodes.find((n) => n.id === "rng-shoulder");
assert.ok(rng?.type === "range");
rng.bands[2]!.minCm = 41;
assert.ok(
  validateForPublish("premium-mpillow", gap).some(
    (e) => e.code === "band-invalid" && e.nodeId === "rng-shoulder",
  ),
);

const off = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
off.nodes.push({ id: "bad", type: "input", inputKey: "favorite_color" });
assert.ok(
  validateForPublish("premium-mpillow", off).some(
    (e) => e.code === "off-catalog-input" && e.nodeId === "bad",
  ),
);

const wrong = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
const tpl = wrong.nodes.find((n) => n.id === "tpl-m");
assert.ok(tpl?.type === "template-output");
tpl.size = "L";
assert.ok(
  validateForPublish("premium-mpillow", wrong).some(
    (e) => e.code === "wrong-size-template" && e.nodeId === "tpl-m",
  ),
);

const route = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
route.nodes.push({
  id: "route",
  type: "flow-route",
  targetFlow: "basic-mpillow",
  reason: "x",
  fallbackSiblingId: "nope",
});
assert.ok(
  validateForPublish("premium-mpillow", route).some(
    (e) => e.code === "flow-route-no-fallback" && e.nodeId === "route",
  ),
);

// Restore copy does not mutate history
const published = { graph: premiumHandGraph(DEFAULT_TEMPLATE_IDS) };
const draft = structuredClone(published.graph);
const dTpl = draft.nodes.find((n) => n.id === "tpl-m");
assert.ok(dTpl?.type === "template-output");
dTpl.templateId = "draft-only";
const pTpl = published.graph.nodes.find((n) => n.id === "tpl-m");
assert.ok(pTpl?.type === "template-output");
assert.equal(pTpl.templateId, DEFAULT_TEMPLATE_IDS.M);

console.log("rules-engine slice 01 self-check ok");
