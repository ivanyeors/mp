/**
 * Slice 01 live round-trip: draft → publish → evaluate (same path as the API).
 * Run: npx tsx --env-file=.env.local lib/rules-engine/api-roundtrip.check.ts
 *
 * Cleans up rows it creates for flow premium-mpillow tagged in graph label.
 */
import assert from "node:assert/strict";
import { supabaseAdmin } from "@/lib/supabase/server";
import { evaluateOrThrow } from "./evaluate";
import {
  DEFAULT_TEMPLATE_IDS,
  premiumHandGraph,
  premiumSampleInputs,
} from "./fixtures";
import {
  getDraft,
  getLatestPublished,
  listVersions,
  publishDraft,
  restoreToDraft,
  saveDraft,
} from "./persist";

const FLOW = "premium-mpillow" as const;
const MARKER = "__slice01_roundtrip__";

async function cleanup() {
  const admin = supabaseAdmin();
  // Delete only rows whose graph JSON contains our marker label on the fallback.
  const { data } = await admin.from("rule_graphs").select("id, graph").eq("flow", FLOW);
  const ids = (data ?? [])
    .filter((r) => JSON.stringify(r.graph).includes(MARKER))
    .map((r) => r.id as string);
  if (ids.length) {
    await admin.from("rule_graphs").delete().in("id", ids);
  }
}

async function main() {
  assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL, "SUPABASE url required");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "service role key required");

  await cleanup();

  const graph = premiumHandGraph(DEFAULT_TEMPLATE_IDS);
  const fb = graph.nodes.find((n) => n.id === "fb");
  assert.ok(fb);
  fb.label = MARKER;

  // Save any pre-existing draft aside: if a real draft exists without marker, skip mutating it.
  const existing = await getDraft(FLOW);
  if (existing && !JSON.stringify(existing.graph).includes(MARKER)) {
    console.log(
      "skip: premium-mpillow already has an unrelated draft — not overwriting",
    );
    console.log("rules-engine api-roundtrip skipped (safe)");
    return;
  }

  const draft = await saveDraft(FLOW, graph, null);
  assert.equal(draft.status, "draft");
  assert.equal(draft.version, null);

  const published = await publishDraft(FLOW, null);
  assert.ok(published.ok, JSON.stringify(published));
  if (!published.ok) return;
  assert.equal(published.published.status, "published");
  assert.equal(published.published.version, 1);

  // Published is immutable: updating the draft must not change the published row.
  const mutated = structuredClone(graph);
  const tpl = mutated.nodes.find((n) => n.id === "tpl-m");
  assert.ok(tpl?.type === "template-output");
  tpl.templateId = "should-not-appear-on-published";
  await saveDraft(FLOW, mutated, null);

  const latest = await getLatestPublished(FLOW);
  assert.ok(latest);
  assert.equal(latest.id, published.published.id);
  const pubTpl = latest.graph.nodes.find((n) => n.id === "tpl-m");
  assert.ok(pubTpl?.type === "template-output");
  assert.equal(pubTpl.templateId, DEFAULT_TEMPLATE_IDS.M);

  const result = evaluateOrThrow(
    FLOW,
    latest.graph,
    premiumSampleInputs({ shoulder_length_cm: 42 }),
  );
  assert.equal(result.size, "M");
  assert.equal(result.templateId, DEFAULT_TEMPLATE_IDS.M);
  assert.ok(result.trace.length > 0);

  // Restore copies without mutating history
  const beforeRestore = structuredClone(latest.graph);
  const restored = await restoreToDraft(FLOW, latest.id, null);
  assert.ok(!("error" in restored));
  if ("error" in restored) return;
  const rTpl = restored.graph.nodes.find((n) => n.id === "tpl-m");
  assert.ok(rTpl?.type === "template-output");
  rTpl.templateId = "restored-draft-edit";
  await saveDraft(FLOW, restored.graph, null);

  const still = await getLatestPublished(FLOW);
  assert.ok(still);
  assert.deepEqual(still.graph, beforeRestore);

  const versions = await listVersions(FLOW);
  assert.ok(versions.some((v) => v.id === published.published.id));

  await cleanup();
  console.log("rules-engine api-roundtrip ok", {
    publishedId: published.published.id,
    size: result.size,
    templateId: result.templateId,
    fired: result.firedTerminals.map((t) => t.nodeId),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
