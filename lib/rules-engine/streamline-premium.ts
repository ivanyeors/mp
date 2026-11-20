import { inputCatalog } from "./catalog";
import { evaluate } from "./evaluate";
import { layoutRuleGraph } from "./layout";
import type {
  EngineInputs,
  EvaluateResult,
  RangeBand,
  RangeNode,
  RuleEdge,
  RuleGraphJson,
  RuleNode,
  TemplateBySizeNode,
} from "./types";

const FLOW = "premium-mpillow" as const;
const SHOULDER = "shoulder_length_cm";
const NECK_STACK = "neck_to_back_cm";
const POSITION = "sleep_position";
const STOMACH = "stomach";

function bandValue(b: RangeBand): number {
  if (b.minCm != null && b.maxCm != null) return (b.minCm + b.maxCm) / 2;
  if (b.minCm != null) return b.minCm + 1;
  if (b.maxCm != null) return b.maxCm - 1;
  return 0;
}

const byMin = (a: RangeBand, b: RangeBand) =>
  (a.minCm ?? Number.NEGATIVE_INFINITY) - (b.minCm ?? Number.NEGATIVE_INFINITY);

function baseInputs(): EngineInputs {
  const out: EngineInputs = {};
  for (const d of inputCatalog(FLOW)) {
    if (d.valueType === "number") out[d.key] = 10;
    else if (d.valueType === "boolean") out[d.key] = false;
    else if (d.valueType === "string[]") out[d.key] = [d.values?.includes("none") ? "none" : d.values![0]!];
    else out[d.key] = d.values?.[0] ?? "";
  }
  return out;
}

function ancestors(graph: RuleGraphJson, ids: Iterable<string>): Set<string> {
  const pred = new Map<string, string[]>();
  for (const e of graph.edges) pred.set(e.target, [...(pred.get(e.target) ?? []), e.source]);
  const seen = new Set<string>();
  const q = [...ids];
  while (q.length) {
    const id = q.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    q.push(...(pred.get(id) ?? []));
  }
  return seen;
}

export type StreamlineResult = {
  graph: RuleGraphJson;
  templateNodes: number;
};

export function streamlinePremiumGraph(source: RuleGraphJson): StreamlineResult {
  const templates = source.nodes.filter((n) => n.type === "template-output");
  if (templates.length === 0) throw new Error("No Template outputs to streamline");

  const upstream = ancestors(source, templates.map((t) => t.id));
  const dropped = new Set(
    source.nodes
      .filter((n) => n.type === "template-output" || (n.type === "combine" && upstream.has(n.id)))
      .map((n) => n.id),
  );

  const ranges = source.nodes.filter(
    (n): n is RangeNode => n.type === "range" && upstream.has(n.id),
  );
  const shoulder = ranges.find((r) => r.inputKey === SHOULDER);
  const stack = ranges.find((r) => r.inputKey === NECK_STACK);
  const position = source.nodes.find(
    (n) => n.type === "match" && n.inputKey === POSITION && upstream.has(n.id),
  );
  if (!shoulder || !stack || !position) {
    throw new Error("Expected shoulder and neck-to-back Ranges and a sleep position Match before the templates");
  }
  const dims = ranges.filter((r) => r !== shoulder && r !== stack);
  const stackBands = [...stack.bands].sort(byMin);
  const positions = inputCatalog(FLOW).find((d) => d.key === POSITION)?.values ?? [];
  const others = positions.filter((p) => p !== STOMACH);

  const base = baseInputs();
  const sizeBands = [...shoulder.bands].sort(byMin);
  type Cell = { band: RangeBand; range: RangeNode }[];
  const cells: Cell[] = dims.reduce<Cell[]>(
    (acc, r) => acc.flatMap((c) => [...r.bands].sort(byMin).map((band) => [...c, { band, range: r }])),
    [[]],
  );
  const read = (sizeBand: RangeBand, cell: Cell, stackBand: RangeBand, pos: string) => {
    const inputs: EngineInputs = { ...base, [SHOULDER]: bandValue(sizeBand), [NECK_STACK]: bandValue(stackBand), [POSITION]: pos };
    for (const { band, range } of cell) inputs[range.inputKey] = bandValue(band);
    const r = evaluate(FLOW, source, inputs);
    if ("error" in r) throw new Error(r.error);
    return r;
  };

  const b = {
    nodes: source.nodes.filter((n) => !dropped.has(n.id)) as RuleNode[],
    edges: source.edges.filter((e) => !dropped.has(e.source) && !dropped.has(e.target)) as RuleEdge[],
  };
  const edge = (source: string, target: string, handle?: string) =>
    b.edges.push({ id: `e-${source}-${target}${handle ? `-${handle}` : ""}`, source, target, ...(handle ? { handle } : {}) });
  const slug = (band: RangeBand) => band.id.replace(/^b-/, "");

  b.nodes.push({ id: "not-stomach", type: "combine", mode: "any", label: "Not stomach" });
  for (const p of others) edge(position.id, "not-stomach", p);

  let templateNodes = 0;
  for (const cell of cells) {
    const cellSlug = cell.map(({ band }) => slug(band)).join("-");
    const cellLabel = cell.map(({ band }) => band.label);
    const classId = (s: RangeBand) => `tpl-${cellSlug}-stack-${slug(s)}`;

    stackBands.forEach((s, i) => {
      const slots: TemplateBySizeNode["templates"] = {};
      for (const sizeBand of sizeBands) {
        const r = read(sizeBand, cell, s, others[0]!);
        if (r.size && r.templateId) slots[r.size] = r.templateId;
        for (const p of positions) {
          const want = p === STOMACH ? stackBands[Math.max(0, i - 1)]! : s;
          const got = read(sizeBand, cell, s, p);
          const expect = read(sizeBand, cell, want, others[0]!);
          if (got.templateId !== expect.templateId || got.size !== expect.size) {
            throw new Error(
              `Sleep position "${p}" does more than shift the neck stack at ${sizeBand.label} · ${[...cellLabel, s.label].join(" · ")}: ` +
                `got ${got.templateId}, expected ${expect.templateId}`,
            );
          }
        }
      }
      if (Object.keys(slots).length === 0) return;
      b.nodes.push({
        id: classId(s),
        type: "template-by-size",
        label: [...cellLabel, `neck stack ${s.label}`].join(" · "),
        templates: slots,
      });
      templateNodes++;
    });

    const and = (id: string, target: string, s: RangeBand, extra?: [string, string?]) => {
      if (!b.nodes.some((n) => n.id === target)) return;
      b.nodes.push({ id, type: "combine" });
      for (const { band, range } of cell) edge(range.id, id, band.id);
      edge(stack.id, id, s.id);
      if (extra) edge(extra[0], id, extra[1]);
      edge(id, target);
    };
    stackBands.forEach((s, i) => {
      const id = `and-${cellSlug}-stack-${slug(s)}`;
      if (i === 0) return and(id, classId(s), s);
      and(`${id}-stomach`, classId(stackBands[i - 1]!), s, [position.id, STOMACH]);
      and(`${id}-not-stomach`, classId(s), s, ["not-stomach"]);
    });
  }

  const pos = layoutRuleGraph(b.nodes.map((n) => n.id), b.edges);
  const nodes = b.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
  return { graph: { nodes, edges: b.edges }, templateNodes };
}

export function equivalenceInputs(graph: RuleGraphJson, opts?: { boundaries?: boolean }): EngineInputs[] {
  const boundaries = opts?.boundaries ?? true;
  const base = baseInputs();
  const values = new Map<string, number[]>();
  for (const n of graph.nodes) {
    if (n.type !== "range") continue;
    const v = new Set(values.get(n.inputKey) ?? []);
    for (const band of n.bands) {
      v.add(bandValue(band));
      if (boundaries && band.minCm != null) {
        v.add(band.minCm);
        v.add(Math.round((band.minCm - 0.001) * 1000) / 1000);
      }
    }
    values.set(n.inputKey, [...v].sort((a, b) => a - b));
  }
  let grid: EngineInputs[] = [{ ...base }];
  for (const [key, vs] of values) grid = grid.flatMap((i) => vs.map((v) => ({ ...i, [key]: v })));
  const positions = inputCatalog(FLOW).find((d) => d.key === POSITION)?.values ?? [];
  grid = grid.flatMap((i) => positions.map((p) => ({ ...i, [POSITION]: p })));

  const answers = inputCatalog(FLOW)
    .filter((d) => d.valueType !== "number" && d.key !== POSITION)
    .map((d): [string, unknown[]] => [
      d.key,
      d.valueType === "boolean"
        ? [false, true]
        : d.valueType === "string[]"
          ? [...(d.values ?? []).map((v) => [v]), (d.values ?? []).slice(1, 3)]
          : [...(d.values ?? [])],
    ]);
  const stride = Math.max(1, Math.floor(grid.length / 60));
  const crossed: EngineInputs[] = [];
  for (let i = 0; i < grid.length; i += stride) {
    let combos: EngineInputs[] = [grid[i]!];
    for (const [key, vs] of answers) {
      if (!graph.nodes.some((n) => n.type === "match" && n.inputKey === key)) continue;
      combos = combos.flatMap((c) => vs.map((v) => ({ ...c, [key]: v })));
    }
    crossed.push(...combos);
  }
  return [...grid, ...crossed];
}

function outcome(r: EvaluateResult | { error: string }) {
  if ("error" in r) return { error: r.error };
  return {
    size: r.size,
    templateId: r.templateId,
    tierSuggestion: r.tierSuggestion,
    flowRoute: r.flowRoute ? `${r.flowRoute.targetFlow}: ${r.flowRoute.reason}` : null,
    usedFallback: r.usedFallback,
  };
}

export function outcomeDiffs(
  a: RuleGraphJson,
  b: RuleGraphJson,
  inputs: EngineInputs[],
  limit = 5,
): { count: number; examples: { inputs: EngineInputs; a: unknown; b: unknown }[] } {
  let count = 0;
  const examples: { inputs: EngineInputs; a: unknown; b: unknown }[] = [];
  for (const i of inputs) {
    const oa = outcome(evaluate(FLOW, a, i));
    const ob = outcome(evaluate(FLOW, b, i));
    if (JSON.stringify(oa) === JSON.stringify(ob)) continue;
    count++;
    if (examples.length < limit) examples.push({ inputs: i, a: oa, b: ob });
  }
  return { count, examples };
}
