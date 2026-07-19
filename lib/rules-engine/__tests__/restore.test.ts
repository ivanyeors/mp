import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATE_IDS, premiumHandGraph } from "../fixtures";

describe("restore-to-draft copy semantics", () => {
  it("copies graph JSON without aliasing published history", () => {
    const published = { graph: premiumHandGraph(DEFAULT_TEMPLATE_IDS) };
    const draftGraph = structuredClone(published.graph);
    const node = draftGraph.nodes.find((n) => n.id === "tpl-m");
    if (node?.type !== "template-output") throw new Error("expected template");
    node.templateId = "mutated-in-draft";

    const publishedTpl = published.graph.nodes.find((n) => n.id === "tpl-m");
    if (publishedTpl?.type !== "template-output") throw new Error("expected template");
    expect(publishedTpl.templateId).toBe(DEFAULT_TEMPLATE_IDS.M);
    expect(node.templateId).toBe("mutated-in-draft");
  });
});
