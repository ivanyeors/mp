import { describe, it, expect } from "vitest";
import { validateForPublish } from "../validate";
import { DEFAULT_TEMPLATE_IDS, premiumHandGraph } from "../fixtures";
import type { RuleGraphJson } from "../types";

const base = () => premiumHandGraph(DEFAULT_TEMPLATE_IDS);

function codes(graph: RuleGraphJson) {
  return validateForPublish("premium-mpillow", graph).map((e) => e.code);
}

describe("validateForPublish", () => {
  it("accepts the hand-written Premium graph", () => {
    expect(validateForPublish("premium-mpillow", base())).toEqual([]);
  });

  it("rejects a cycle with the offending node id", () => {
    const g = base();
    g.edges.push({ id: "cycle", source: "tpl-m", target: "rng-shoulder" });
    const errors = validateForPublish("premium-mpillow", g);
    expect(errors.some((e) => e.code === "cycle" && e.nodeId)).toBe(true);
  });

  it("rejects band overlap with the Range node id", () => {
    const g = base();
    const rng = g.nodes.find((n) => n.id === "rng-shoulder");
    if (rng?.type !== "range") throw new Error("expected range");
    rng.bands[1]!.minCm = 35; // overlaps XS
    const errors = validateForPublish("premium-mpillow", g);
    expect(errors.some((e) => e.code === "band-invalid" && e.nodeId === "rng-shoulder")).toBe(
      true,
    );
  });

  it("rejects band gap with the Range node id", () => {
    const g = base();
    const rng = g.nodes.find((n) => n.id === "rng-shoulder");
    if (rng?.type !== "range") throw new Error("expected range");
    rng.bands[2]!.minCm = 41; // gap after S (max 40)
    const errors = validateForPublish("premium-mpillow", g);
    expect(errors.some((e) => e.code === "band-invalid" && e.nodeId === "rng-shoulder")).toBe(
      true,
    );
  });

  it("rejects off-catalog input with the offending node id", () => {
    const g = base();
    g.nodes.push({ id: "bad-in", type: "input", inputKey: "favorite_color" });
    const errors = validateForPublish("premium-mpillow", g);
    expect(
      errors.some((e) => e.code === "off-catalog-input" && e.nodeId === "bad-in"),
    ).toBe(true);
  });

  it("rejects wrong-size template with the Template node id", () => {
    const g = base();
    const tpl = g.nodes.find((n) => n.id === "tpl-m");
    if (tpl?.type !== "template-output") throw new Error("expected template");
    tpl.size = "L";
    const errors = validateForPublish("premium-mpillow", g);
    expect(
      errors.some((e) => e.code === "wrong-size-template" && e.nodeId === "tpl-m"),
    ).toBe(true);
  });

  it("rejects Flow route without same-flow Fallback sibling", () => {
    const g = base();
    g.nodes.push({
      id: "route",
      type: "flow-route",
      targetFlow: "basic-mpillow",
      reason: "upsell",
      fallbackSiblingId: "missing-fb",
    });
    g.edges.push({ id: "er", source: "sz-m", target: "route" });
    const errors = validateForPublish("premium-mpillow", g);
    expect(
      errors.some((e) => e.code === "flow-route-no-fallback" && e.nodeId === "route"),
    ).toBe(true);
  });

  it("rejects unreachable Fallback when stranded behind a disconnected edge", () => {
    const g = base();
    g.nodes.push({ id: "orphan", type: "input", inputKey: "shoulder_length_cm" });
    // Remove orphan from catalog path — wait, shoulder is on catalog. Use a node
    // that has inbound only from a never-linked source: point fb inbound from a
    // brand-new size node that nothing reaches.
    g.nodes.push({ id: "ghost-sz", type: "size-output", size: "M" });
    g.edges.push({ id: "eg", source: "ghost-sz", target: "fb" });
    expect(codes(g)).toContain("unreachable-fallback");
  });
});
