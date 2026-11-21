import { describe, expect, it } from "vitest";
import { evaluateOrThrow } from "../evaluate";
import { validateForPublish } from "../validate";
import { premiumSampleInputs } from "../fixtures";
import type { RuleGraphJson, TemplateBySizeNode } from "../types";

function graph(): RuleGraphJson {
  return {
    nodes: [
      { id: "in-shoulder", type: "input", inputKey: "shoulder_length_cm" },
      {
        id: "rng-shoulder",
        type: "range",
        inputKey: "shoulder_length_cm",
        bands: [
          { id: "b-s", minCm: 2.54, maxCm: 40, label: "S" },
          { id: "b-m", minCm: 40, maxCm: null, label: "M" },
        ],
      },
      { id: "sz-s", type: "size-output", size: "S" },
      { id: "sz-m", type: "size-output", size: "M" },
      { id: "in-pos", type: "input", inputKey: "sleep_position" },
      { id: "m-pos", type: "match", inputKey: "sleep_position" },
      { id: "not-stomach", type: "combine", mode: "any", label: "Not stomach" },
      { id: "tpl-flat", type: "template-by-size", templates: { S: "t-s-flat", M: "t-m-flat" } },
      { id: "tpl-lofted", type: "template-by-size", templates: { M: "t-m-lofted" } },
      { id: "fb", type: "fallback", size: "M", templateId: "t-fallback" },
    ],
    edges: [
      { id: "e0", source: "in-shoulder", target: "rng-shoulder" },
      { id: "e1", source: "rng-shoulder", target: "sz-s", handle: "b-s" },
      { id: "e2", source: "rng-shoulder", target: "sz-m", handle: "b-m" },
      { id: "e3", source: "in-pos", target: "m-pos" },
      { id: "e4", source: "m-pos", target: "not-stomach", handle: "side" },
      { id: "e5", source: "m-pos", target: "not-stomach", handle: "back" },
      { id: "e6", source: "m-pos", target: "not-stomach", handle: "mixed" },
      { id: "e7", source: "not-stomach", target: "tpl-lofted" },
      { id: "e8", source: "m-pos", target: "tpl-flat", handle: "stomach" },
    ],
  };
}

const run = (overrides: Record<string, unknown>) =>
  evaluateOrThrow("premium-mpillow", graph(), premiumSampleInputs(overrides));

describe("size-keyed Template output", () => {
  it("takes the template for the size the graph resolved", () => {
    expect(run({ shoulder_length_cm: 38, sleep_position: "stomach" })).toMatchObject({
      size: "S",
      templateId: "t-s-flat",
      usedFallback: false,
    });
    expect(run({ shoulder_length_cm: 44, sleep_position: "stomach" }).templateId).toBe("t-m-flat");
  });

  it("does not fire without a slot for that size, leaving the size on its own", () => {
    const r = run({ shoulder_length_cm: 38, sleep_position: "side" });
    expect(r).toMatchObject({ size: "S", templateId: null, usedFallback: false });
    expect(r.firedTerminals.map((t) => t.nodeId)).toEqual(["sz-s"]);
  });

  it("does not count as fired with no size at all, so the Fallback still answers", () => {
    const r = run({ shoulder_length_cm: 1, sleep_position: "stomach" });
    expect(r).toMatchObject({ size: "M", templateId: "t-fallback", usedFallback: true });
  });
});

describe("any Combine", () => {
  it("fires on any one of its branches", () => {
    for (const sleep_position of ["side", "back", "mixed"]) {
      expect(run({ shoulder_length_cm: 44, sleep_position }).templateId).toBe("t-m-lofted");
    }
  });

  it("stays quiet when none of its branches fire", () => {
    const r = run({ shoulder_length_cm: 44, sleep_position: "stomach" });
    expect(r.trace.some((s) => s.nodeId === "not-stomach")).toBe(false);
  });

  it("an all Combine (the default) still needs every branch", () => {
    const g = graph();
    const node = g.nodes.find((n) => n.id === "not-stomach");
    if (node?.type !== "combine") throw new Error("expected combine");
    delete node.mode;
    const r = evaluateOrThrow("premium-mpillow", g, premiumSampleInputs({ shoulder_length_cm: 44 }));
    expect(r.templateId).toBeNull();
  });
});

describe("validateForPublish with size-keyed Template outputs", () => {
  const codes = (g: RuleGraphJson) => validateForPublish("premium-mpillow", g).map((e) => e.code);
  const bySize = (g: RuleGraphJson, id: string) => {
    const n = g.nodes.find((x) => x.id === id);
    if (n?.type !== "template-by-size") throw new Error("expected template-by-size");
    return n as TemplateBySizeNode;
  };

  it("accepts the graph", () => {
    expect(codes(graph())).toEqual([]);
  });

  it("rejects one with no template for any size", () => {
    const g = graph();
    bySize(g, "tpl-lofted").templates = { M: "" };
    expect(codes(g)).toContain("template-by-size-empty");
  });

  it("rejects a slot for a size the flow does not sell", () => {
    const g = graph();
    bySize(g, "tpl-lofted").templates = { M: "t", long: "t" };
    expect(codes(g)).toContain("template-by-size-bad-size");
  });

  it("rejects one that no Size output could ever pick", () => {
    const g = graph();
    g.nodes = g.nodes.filter((n) => n.type !== "size-output");
    g.edges = g.edges.filter((e) => !e.target.startsWith("sz-"));
    g.nodes = g.nodes.filter((n) => n.id !== "rng-shoulder" && n.id !== "in-shoulder");
    g.edges = g.edges.filter((e) => e.source !== "in-shoulder");
    expect(codes(g)).toContain("template-by-size-no-size");
  });
});
