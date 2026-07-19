import { describe, it, expect } from "vitest";
import { evaluate, evaluateOrThrow } from "../evaluate";
import {
  DEFAULT_TEMPLATE_IDS,
  premiumHandGraph,
  premiumSampleInputs,
} from "../fixtures";

const graph = premiumHandGraph(DEFAULT_TEMPLATE_IDS);

describe("evaluate", () => {
  it("resolves size + size-scoped template with a trace (shoulder 42 → M)", () => {
    const r = evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs());
    expect(r.size).toBe("M");
    expect(r.templateId).toBe(DEFAULT_TEMPLATE_IDS.M);
    expect(r.firedTerminals.map((t) => t.nodeId)).toEqual(
      expect.arrayContaining(["sz-m", "tpl-m"]),
    );
    expect(r.trace.some((s) => s.nodeId === "rng-shoulder")).toBe(true);
    expect(r.usedFallback).toBe(false);
  });

  it("is deterministic for the same inputs", () => {
    const inputs = premiumSampleInputs({ shoulder_length_cm: 38 });
    const a = evaluateOrThrow("premium-mpillow", graph, inputs);
    const b = evaluateOrThrow("premium-mpillow", graph, inputs);
    expect(a).toEqual(b);
    expect(a.size).toBe("S");
    expect(a.templateId).toBe(DEFAULT_TEMPLATE_IDS.S);
  });

  it("refuses missing required inputs rather than defaulting", () => {
    const { shoulder_length_cm: _, ...rest } = premiumSampleInputs();
    const r = evaluate("premium-mpillow", graph, rest);
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.missing).toContain("shoulder_length_cm");
    }
  });

  it("only requires inputs the graph references", () => {
    const r = evaluate("premium-mpillow", graph, { shoulder_length_cm: 42 });
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.size).toBe("M");
  });

  it("maps boundary bands: 36 → S, 40 → M, 52 → XL", () => {
    expect(
      evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs({ shoulder_length_cm: 36 }))
        .size,
    ).toBe("S");
    expect(
      evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs({ shoulder_length_cm: 40 }))
        .size,
    ).toBe("M");
    expect(
      evaluateOrThrow("premium-mpillow", graph, premiumSampleInputs({ shoulder_length_cm: 52 }))
        .size,
    ).toBe("XL");
  });
});
