/**
 * ADR 0027: save the Premium Rule graph, rebuilt with size-keyed Template
 * outputs, as the draft. Reads the latest published version and refuses unless
 * the rebuild would publish and answers every boundary input exactly as that
 * version does. Never publishes — review it in the workbench, then Publish.
 *
 * Run it only once the engine change is deployed: an older Admin Panel cannot
 * draw these nodes, and an older server refuses to publish them.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/streamline-premium-rule-graph.ts           # dry run
 *   npx tsx --env-file=.env.local scripts/streamline-premium-rule-graph.ts --apply   # save as the draft
 */
import { getDraft, getLatestPublished, saveDraft, validateForPublish } from "@/lib/rules-engine";
import {
  equivalenceInputs,
  outcomeDiffs,
  streamlinePremiumGraph,
} from "@/lib/rules-engine/streamline-premium";
import type { RuleGraphJson } from "@/lib/rules-engine/types";

const FLOW = "premium-mpillow" as const;
const apply = process.argv.includes("--apply");

/** Key-sorted JSON, so equal values compare equal whatever order they were written in. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** The graph without canvas positions — opening the workbench rewrites those. */
const logic = (g: RuleGraphJson) =>
  canonical({ nodes: g.nodes.map((n) => ({ ...n, position: undefined })), edges: g.edges });

const combines = (g: RuleGraphJson) => g.nodes.filter((n) => n.type === "combine").length;

async function main() {
  const published = await getLatestPublished(FLOW);
  if (!published) throw new Error("Premium has no published Rule graph.");
  if (published.graph.nodes.some((n) => n.type === "template-by-size")) {
    console.log(`v${published.version} is already streamlined; nothing to do.`);
    return;
  }
  const draft = await getDraft(FLOW);
  if (draft && logic(draft.graph) !== logic(published.graph)) {
    throw new Error(
      `The Premium draft differs from v${published.version}. Publish or discard those changes first; this would overwrite them.`,
    );
  }

  const { graph, templateNodes } = streamlinePremiumGraph(published.graph);
  const errors = validateForPublish(FLOW, graph);
  if (errors.length > 0) {
    throw new Error(
      `The rebuild would not publish:\n${errors.map((e) => `  ${e.code} ${e.nodeId ?? ""} ${e.message}`).join("\n")}`,
    );
  }
  const inputs = equivalenceInputs(published.graph);
  const diffs = outcomeDiffs(published.graph, graph, inputs);
  if (diffs.count > 0) {
    throw new Error(
      `The rebuild answers ${diffs.count} of ${inputs.length} inputs differently, e.g.\n${JSON.stringify(diffs.examples, null, 2)}`,
    );
  }

  const g = published.graph;
  console.log(`v${published.version}: ${g.nodes.length} nodes, ${g.edges.length} edges, ${combines(g)} Combines`);
  console.log(
    `rebuild: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${combines(graph)} Combines, ${templateNodes} size-keyed Template outputs`,
  );
  console.log(`same answer on all ${inputs.length} inputs`);

  if (!apply) {
    console.log("Dry run — re-run with --apply to save it as the Premium draft.");
    return;
  }
  await saveDraft(FLOW, graph, null);
  console.log("Saved as the Premium draft. Review it in the workbench, then Publish.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
