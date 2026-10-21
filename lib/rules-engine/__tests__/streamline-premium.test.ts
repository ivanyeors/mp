import { describe, expect, it } from "vitest";
import { validateForPublish } from "../validate";
import { equivalenceInputs, outcomeDiffs, streamlinePremiumGraph } from "../streamline-premium";
import type { RangeBand, RuleEdge, RuleGraphJson, RuleNode } from "../types";

/**
 * The Premium graph's shape as published in v2 and v3 (October 2026): one Combine per size ×
 * neck length × head-to-back × neck-to-back × sleep position. Template ids per
 * size · neck length · head-to-back, for neck stack low / mid / high; stomach
 * sleepers take the stack one band lower.
 */
const TABLE: Record<string, [string, string, string]> = {
  "XS|short|low": ["100", "101", "103"], "XS|short|high": ["100", "102", "104"],
  "XS|long|low": ["68", "69", "88"], "XS|long|high": ["68", "71", "79"],
  "S|short|low": ["89", "89", "93"], "S|short|high": ["90", "90", "92"],
  "S|long|low": ["72", "72", "76"], "S|long|high": ["73", "73", "75"],
  "M|short|low": ["94", "94", "96"], "M|short|high": ["95", "95", "99"],
  "M|long|low": ["53", "53", "78"], "M|long|high": ["77", "77", "62"],
  "L|short|low": ["80", "80", "81"], "L|short|high": ["57", "57", "82"],
  "L|long|low": ["80", "80", "81"], "L|long|high": ["57", "57", "82"],
  "XL|short|low": ["84", "84", "85"], "XL|short|high": ["59", "59", "86"],
  "XL|long|low": ["84", "84", "85"], "XL|long|high": ["59", "59", "86"],
};
const SIZES = ["XS", "S", "M", "L", "XL"] as const;
const STACK = ["low", "mid", "high"] as const;
const POSITIONS = ["side", "back", "stomach", "mixed"];

const band = (id: string, label: string, minCm: number | null, maxCm: number | null): RangeBand => ({ id, label, minCm, maxCm });

function cellPerCombination(table = TABLE): RuleGraphJson {
  const nodes: RuleNode[] = [
    { id: "in-shoulder", type: "input", inputKey: "shoulder_length_cm" },
    { id: "in-ntb", type: "input", inputKey: "neck_to_back_cm" },
    { id: "in-htb", type: "input", inputKey: "head_to_back_cm" },
    { id: "in-nl", type: "input", inputKey: "neck_length_cm" },
    { id: "in-pos", type: "input", inputKey: "sleep_position" },
    {
      id: "rng-shoulder", type: "range", inputKey: "shoulder_length_cm",
      bands: [band("b-xs", "XS", 2.54, 36.01), band("b-s", "S", 36.01, 40.01), band("b-m", "M", 40.01, 46.01), band("b-l", "L", 46.01, 52.01), band("b-xl", "XL", 52.01, null)],
    },
    { id: "rng-ntb", type: "range", inputKey: "neck_to_back_cm", bands: [band("b-low", "low", null, 4.445), band("b-mid", "mid", 4.445, 6.35), band("b-high", "high", 6.35, null)] },
    { id: "rng-htb", type: "range", inputKey: "head_to_back_cm", bands: [band("b-head-low", "head low", null, 3.81), band("b-head-high", "head high", 3.81, null)] },
    { id: "rng-nl", type: "range", inputKey: "neck_length_cm", bands: [band("b-nl-short", "short neck", null, 7.62), band("b-nl-long", "long neck", 7.62, null)] },
    { id: "m-pos", type: "match", inputKey: "sleep_position" },
    { id: "in-reflux", type: "input", inputKey: "acid_reflux" },
    { id: "m-reflux", type: "match", inputKey: "acid_reflux" },
    { id: "in-pain", type: "input", inputKey: "sleep_pain_areas" },
    { id: "m-pain", type: "match", inputKey: "sleep_pain_areas" },
    { id: "tier-premium", type: "tier-suggestion", tier: "premium" },
    { id: "fb", type: "fallback", size: "M", templateId: "53" },
    { id: "in-bolster", type: "input", inputKey: "uses_bolster" },
    { id: "m-bolster", type: "match", inputKey: "uses_bolster" },
    { id: "route-mbolster", type: "flow-route", targetFlow: "mbolster", reason: "Pair it with an Mbolster.", fallbackSiblingId: "fb" },
  ];
  const edges: RuleEdge[] = [];
  const edge = (source: string, target: string, handle?: string) =>
    edges.push({ id: `e${edges.length}`, source, target, ...(handle ? { handle } : {}) });
  for (const k of ["shoulder", "ntb", "htb", "nl"]) edge(`in-${k}`, `rng-${k}`);
  edge("in-pos", "m-pos");
  edge("in-reflux", "m-reflux");
  edge("m-reflux", "tier-premium", "true");
  edge("in-pain", "m-pain");
  edge("m-pain", "tier-premium", "neck");
  edge("in-bolster", "m-bolster");
  edge("m-bolster", "route-mbolster", "true");

  const tpl = new Set<string>();
  for (const size of SIZES) {
    const sz = `sz-${size.toLowerCase()}`;
    nodes.push({ id: sz, type: "size-output", size });
    edge("rng-shoulder", sz, `b-${size.toLowerCase()}`);
    for (const nl of ["short", "long"]) {
      const gate = `gate-${size.toLowerCase()}-${nl}`;
      nodes.push({ id: gate, type: "combine" });
      edge(sz, gate);
      edge("rng-nl", gate, `b-nl-${nl}`);
      for (const htb of ["low", "high"]) {
        const row = table[`${size}|${nl}|${htb}`]!;
        STACK.forEach((ntb, i) => {
          for (const pos of POSITIONS) {
            const id = row[pos === "stomach" ? Math.max(0, i - 1) : i]!;
            const t = `tpl-${size.toLowerCase()}-${id}`;
            if (!tpl.has(t)) {
              tpl.add(t);
              nodes.push({ id: t, type: "template-output", size, templateId: id });
            }
            const cell = `c-${size}-${nl}-${htb}-${ntb}-${pos}`;
            nodes.push({ id: cell, type: "combine" });
            edge(gate, cell);
            edge("rng-htb", cell, `b-head-${htb}`);
            edge("rng-ntb", cell, `b-${ntb}`);
            edge("m-pos", cell, pos);
            edge(cell, t);
          }
        });
      }
    }
  }
  return { nodes, edges };
}

const count = (g: RuleGraphJson, type: string) => g.nodes.filter((n) => n.type === type).length;

describe("streamlinePremiumGraph", () => {
  const source = cellPerCombination();
  const { graph, templateNodes } = streamlinePremiumGraph(source);

  it("starts from the shape it replaces", () => {
    expect(validateForPublish("premium-mpillow", source)).toEqual([]);
    expect(count(source, "combine")).toBe(250);
    expect(count(source, "template-output")).toBe(34);
  });

  it("needs 20 Combines, one OR and 12 size-keyed templates, and publishes", () => {
    expect(validateForPublish("premium-mpillow", graph)).toEqual([]);
    expect(templateNodes).toBe(12);
    expect(count(graph, "template-by-size")).toBe(12);
    expect(count(graph, "template-output")).toBe(0);
    expect(count(graph, "combine")).toBe(21);
    expect(graph.nodes.find((n) => n.id === "not-stomach")).toMatchObject({ mode: "any" });
    expect(graph.edges.length).toBeLessThan(source.edges.length / 8);
  });

  it("answers every input exactly as the source does", { timeout: 60_000 }, () => {
    const inputs = equivalenceInputs(source, { boundaries: false });
    expect(inputs.length).toBeGreaterThan(1000);
    expect(outcomeDiffs(source, graph, inputs)).toEqual({ count: 0, examples: [] });
  });

  it("keeps everything outside the template logic as it was", () => {
    for (const id of ["tier-premium", "route-mbolster", "fb", "m-bolster", "rng-shoulder", "sz-xl"]) {
      expect(graph.nodes.find((n) => n.id === id)).toEqual(
        expect.objectContaining(source.nodes.find((n) => n.id === id)!),
      );
    }
    expect(graph.edges.filter((e) => e.target === "tier-premium")).toHaveLength(2);
  });

  it("names each size-keyed template after the answers that choose it", () => {
    const n = graph.nodes.find((x) => x.id === "tpl-head-low-nl-short-stack-mid");
    expect(n).toMatchObject({
      type: "template-by-size",
      label: "head low · short neck · neck stack mid",
      templates: { XS: "101", S: "89", M: "94", L: "80", XL: "84" },
    });
  });

  it("refuses a graph where sleep position does more than shift the neck stack", () => {
    const g = cellPerCombination();
    // Back sleepers at M · short neck · head high · stack high now differ from side sleepers.
    g.edges.find((e) => e.source === "c-M-short-high-high-back")!.target = "tpl-m-95";
    expect(() => streamlinePremiumGraph(g)).toThrow(/does more than shift the neck stack/);
  });
});
