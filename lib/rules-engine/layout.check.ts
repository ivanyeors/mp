import assert from "node:assert/strict";
import { layoutRuleGraph } from "./layout";

const ids = ["in", "rng", "sz", "tpl", "fb"];
const edges = [
  { source: "in", target: "rng" },
  { source: "rng", target: "sz" },
  { source: "sz", target: "tpl" },
  { source: "in", target: "fb" },
];

const pos = layoutRuleGraph(ids, edges);
assert.equal(pos.size, ids.length);

for (const e of edges) {
  assert.ok(
    pos.get(e.target)!.x > pos.get(e.source)!.x,
    `${e.source} → ${e.target} should go left-to-right`,
  );
}

const slots = new Set(
  [...pos.values()].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`),
);
assert.equal(slots.size, ids.length, "unique positions");

const orphan = layoutRuleGraph(["solo"], []);
assert.ok(orphan.has("solo"));

console.log("rules-engine layout self-check ok");
