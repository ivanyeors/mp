import { describe, it, expect } from "vitest";
import { evaluateOrThrow } from "../evaluate";
import { validateForPublish } from "../validate";
import { DEFAULT_TEMPLATE_IDS, premiumHandGraph, premiumSampleInputs } from "../fixtures";
import type { RuleGraphJson } from "../types";

function withBolsterRoute(graph: RuleGraphJson): RuleGraphJson {
  return {
    nodes: [
      ...graph.nodes,
      { id: "in-bolster", type: "input", inputKey: "uses_bolster", label: "Uses a bolster" },
      { id: "m-bolster", type: "match", inputKey: "uses_bolster", label: "Uses a bolster → Mbolster" },
      {
        id: "route-mbolster",
        type: "flow-route",
        label: "Mbolster cross-sell",
        targetFlow: "mbolster",
        reason: "You already sleep with a bolster — pair it with an Mbolster sized to you.",
        fallbackSiblingId: "fb",
      },
    ],
    edges: [
      ...graph.edges,
      { id: "e-in-bolster-m-bolster", source: "in-bolster", target: "m-bolster" },
      { id: "e-m-bolster-route-mbolster-true", source: "m-bolster", target: "route-mbolster", handle: "true" },
    ],
  };
}

const graph = withBolsterRoute(premiumHandGraph(DEFAULT_TEMPLATE_IDS));

describe("Mbolster cross-sell route", () => {
  it("is publishable", () => {
    expect(validateForPublish("premium-mpillow", graph)).toEqual([]);
  });

  it("fires for a shopper who uses a bolster, alongside their size", () => {
    const r = evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs({ uses_bolster: true }));
    expect(r.flowRoute).toMatchObject({ targetFlow: "mbolster", nodeId: "route-mbolster" });
    expect(r.size).toBe("M");
    expect(r.usedFallback).toBe(false);
  });

  it("stays quiet for one who does not", () => {
    const r = evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs({ uses_bolster: false }));
    expect(r.flowRoute).toBeNull();
    expect(r.size).toBe("M");
  });

  it("requires the bolster answer once the graph asks it", () => {
    const { uses_bolster: _, ...rest } = premiumSampleInputs();
    expect(() => evaluateOrThrow("premium-mpillow", graph, rest)).toThrow(/uses_bolster/);
  });
});
