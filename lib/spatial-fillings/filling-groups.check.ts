import assert from "node:assert/strict";
import { fillingFamily, fillingItemsToSunburst, fillingLabel, type FillingItemLike } from "./filling-groups";

assert.deepEqual(fillingFamily("3D (S)"), { key: "3d", label: "3D" });
assert.deepEqual(fillingFamily("6D (L)"), { key: "6d", label: "6D" });
assert.deepEqual(fillingFamily("6D+ (Folded)"), { key: "6d+", label: "6D+" });
assert.deepEqual(fillingFamily("6D-L+"), { key: "6d+", label: "6D+" });
assert.deepEqual(fillingFamily("6d (s)"), { key: "6d", label: "6D" });
assert.equal(fillingFamily(null).key, "other");
assert.equal(fillingFamily("Mystery Fluff").key, "other");

const items: FillingItemLike[] = [
  { id: 5, name: "filling", subtype: "3D (S)", size: null },
  { id: 3, name: "filling", subtype: "6D (L)", size: null },
  { id: 2, name: "filling", subtype: "6D (M)", size: null },
  { id: 7, name: "filling", subtype: "6D+ (Folded)", size: null },
  { id: 9, name: "6D Firm", subtype: null, size: null },
  { id: 8, name: "Mystery Fluff", subtype: null, size: null },
];
const tree = fillingItemsToSunburst(items);

assert.deepEqual(tree.map((n) => n.label), ["3D", "6D", "6D+", "Other"]);

assert.deepEqual(tree.find((n) => n.id === "fam:3d")!.children!.map((c) => c.label), ["S"]);
assert.deepEqual(
  tree.find((n) => n.id === "fam:6d")!.children!.map((c) => c.label).sort(),
  ["Firm", "L", "M"],
);
assert.deepEqual(tree.find((n) => n.id === "fam:6d+")!.children!.map((c) => c.label), ["Folded"]);
assert.ok(!tree.find((n) => n.id === "fam:6d")!.children!.some((c) => c.id === "7"));
assert.deepEqual(tree.find((n) => n.id === "fam:other")!.children!.map((c) => c.label), ["Mystery Fluff"]);

const live = fillingItemsToSunburst([
  { id: 55, name: "6D", subtype: null, size: "L" },
  { id: 67, name: "6D", subtype: null, size: "S" },
  { id: 72, name: "6D Corner", subtype: null, size: "S" },
  { id: 73, name: "6D Fold", subtype: null, size: "S" },
  { id: 74, name: "6D", subtype: null, size: "XL" },
  { id: 57, name: "6D+", subtype: null, size: "L" },
]);
assert.deepEqual(live.find((n) => n.id === "fam:6d")!.children!.map((c) => c.label), ["S", "L", "XL", "Corner S", "Fold S"]);
assert.deepEqual(live.find((n) => n.id === "fam:6d+")!.children!.map((c) => c.label), ["L"]);

assert.deepEqual(tree.flatMap((n) => n.children!.map((c) => c.id)).sort(), ["2", "3", "5", "7", "8", "9"]);

const clean = fillingItemsToSunburst([
  { id: 1, name: "filling", subtype: "3D (S)", size: null },
  { id: 2, name: "filling", subtype: "6D (L)", size: null },
]);
assert.ok(!clean.some((n) => n.id === "fam:other"));

const deduped = fillingItemsToSunburst([
  { id: 9, name: "filling", subtype: "6D (L)", size: null },
  { id: 2, name: "filling", subtype: "6D (L)", size: null },
]);
assert.equal(deduped[0].children!.length, 1);
assert.equal(deduped[0].children![0].id, "2");

assert.equal(fillingLabel({ id: 3, name: "filling", subtype: "6D (L)", size: null }), "6D (L)");
assert.equal(fillingLabel({ id: 9, name: "6D Firm", subtype: null, size: null }), "6D Firm");
assert.equal(fillingLabel({ id: 8, name: "Mystery Fluff", subtype: null, size: null }), "Mystery Fluff");

console.log("filling-groups.check.ts: ok");
