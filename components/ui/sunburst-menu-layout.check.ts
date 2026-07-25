/**
 * Run: npx tsx components/ui/sunburst-menu-layout.check.ts
 */
import assert from "node:assert/strict";
import { arcPath, buildArcs, outerArcPath, type SunburstNode } from "./sunburst-menu-layout";

const opts = { cx: 100, cy: 100, holeRadius: 20, ringWidth: 30 };
const TAU = Math.PI * 2;

const tree: SunburstNode[] = [
  { id: "a", label: "A", children: [{ id: "a1", label: "A1" }, { id: "a2", label: "A2" }] },
  { id: "b", label: "B", disabled: true },
  { id: "c", label: "C" },
];

// Root ring: 3 wedges, equal spans, covering the full circle.
const root = buildArcs(tree, [], opts);
assert.equal(root.length, 3);
assert.ok(Math.abs(root[0].startAngle - 0) < 1e-9);
assert.ok(Math.abs(root[root.length - 1].endAngle - TAU) < 1e-9);
for (const arc of root) {
  assert.ok(Math.abs(arc.endAngle - arc.startAngle - TAU / 3) < 1e-9);
  assert.equal(arc.innerR, opts.holeRadius);
  assert.equal(arc.outerR, opts.holeRadius + opts.ringWidth);
}
assert.equal(root.find((a) => a.node.id === "b")!.hasChildren, false);

// Expanding "a" fans its 2 children out one ring, within a's wedge.
const drilled = buildArcs(tree, ["a"], opts);
const kids = drilled.filter((a) => a.depth === 2);
assert.equal(kids.length, 2);
const parent = drilled.find((a) => a.node.id === "a" && a.depth === 1)!;
for (const kid of kids) {
  assert.ok(kid.startAngle >= parent.startAngle - 1e-9);
  assert.ok(kid.endAngle <= parent.endAngle + 1e-9);
  assert.equal(kid.innerR, parent.outerR); // extends outward from the parent
  assert.deepEqual(kid.path.slice(0, 1), ["a"]); // path threads through the parent
}
// Siblings off the drilled path keep their ring-1 wedge.
assert.ok(drilled.some((a) => a.node.id === "c" && a.depth === 1));

// Drilling widens the drilled branch and shrinks its siblings to hug their
// labels, while the ring still covers the full circle with no gaps.
const aWedge = drilled.find((a) => a.node.id === "a" && a.depth === 1)!;
const cWedge = drilled.find((a) => a.node.id === "c" && a.depth === 1)!;
const aSpan = aWedge.endAngle - aWedge.startAngle;
const cSpan = cWedge.endAngle - cWedge.startAngle;
assert.ok(aSpan > TAU / 3, "drilled branch grows past its equal share");
assert.ok(cSpan < TAU / 3, "collapsed sibling shrinks below its equal share");
assert.ok(aSpan > cSpan);
const ring1Span = drilled
  .filter((a) => a.depth === 1)
  .reduce((s, a) => s + (a.endAngle - a.startAngle), 0);
assert.ok(Math.abs(ring1Span - TAU) < 1e-9, "ring still covers the full circle");

// A sibling with a longer label hugs a wider wedge than a shorter-labelled one.
const hugTree: SunburstNode[] = [
  { id: "d", label: "D", children: [{ id: "d1", label: "D1" }] },
  { id: "s", label: "S" },
  { id: "l", label: "Longer Label" },
];
const hugged = buildArcs(hugTree, ["d"], opts);
const spanOf = (id: string) => {
  const w = hugged.find((a) => a.node.id === id && a.depth === 1)!;
  return w.endAngle - w.startAngle;
};
assert.ok(spanOf("l") > spanOf("s"), "longer label hugs a wider wedge");

// arcPath produces a finite, well-formed sector path.
const d = arcPath(100, 100, 20, 50, 0, TAU / 3);
assert.ok(d.startsWith("M "));
assert.ok(!/NaN|Infinity/.test(d));

// outerArcPath is an open edge: one arc, no close, no inner radius.
const edge = outerArcPath(100, 100, 50, 0, TAU / 3);
assert.ok(edge.startsWith("M "));
assert.ok(!/NaN|Infinity/.test(edge));
assert.equal((edge.match(/A /g) || []).length, 1);
assert.ok(!edge.includes("Z"));

// Single-node ring: the wedge owns the whole circle. arcPath must draw a real
// donut (two arcs per edge, non-degenerate), not a 2π arc that vanishes.
const solo = buildArcs([{ id: "only", label: "Only", children: [{ id: "k", label: "K" }] }], [], opts);
const ring1 = solo.find((a) => a.depth === 1)!;
assert.ok(Math.abs(ring1.endAngle - ring1.startAngle - TAU) < 1e-9); // full circle
const full = arcPath(100, 100, 20, 50, ring1.startAngle, ring1.endAngle);
assert.ok(full.startsWith("M "));
assert.ok(!/NaN|Infinity/.test(full));
assert.equal((full.match(/A /g) || []).length, 4); // 2 outer + 2 inner half-arcs
assert.notEqual(full.match(/M ([\d.-]+) ([\d.-]+)/)![0], ""); // outer start point is real
// and the outer-edge highlight closes the circle with two half-arcs, still open.
const fullEdge = outerArcPath(100, 100, 50, ring1.startAngle, ring1.endAngle);
assert.equal((fullEdge.match(/A /g) || []).length, 2);
assert.ok(!fullEdge.includes("Z"));

console.log("sunburst-menu-layout.check.ts: ok");
