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
    rng.bands[1]!.minCm = 35;
    const errors = validateForPublish("premium-mpillow", g);
    expect(errors.some((e) => e.code === "band-invalid" && e.nodeId === "rng-shoulder")).toBe(
      true,
    );
  });

  it("rejects band gap with the Range node id", () => {
    const g = base();
    const rng = g.nodes.find((n) => n.id === "rng-shoulder");
    if (rng?.type !== "range") throw new Error("expected range");
    rng.bands[2]!.minCm = 41;
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

  it("rejects a Range edge with no band handle (silent-fallback guard)", () => {
    const g = base();
    const rangeIds = new Set(g.nodes.filter((n) => n.type === "range").map((n) => n.id));
    const e = g.edges.find((edge) => rangeIds.has(edge.source));
    if (!e) throw new Error("expected a range out-edge");
    delete (e as { handle?: string }).handle;
    expect(codes(g)).toContain("range-edge-no-band");
  });

  it("rejects unreachable Fallback when stranded behind a disconnected edge", () => {
    const g = base();
    g.nodes.push({ id: "orphan", type: "input", inputKey: "shoulder_length_cm" });
    g.nodes.push({ id: "ghost-sz", type: "size-output", size: "M" });
    g.edges.push({ id: "eg", source: "ghost-sz", target: "fb" });
    expect(codes(g)).toContain("unreachable-fallback");
  });
});
