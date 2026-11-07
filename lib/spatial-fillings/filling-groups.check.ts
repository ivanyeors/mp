/**
 * Run: npx tsx lib/spatial-fillings/filling-groups.check.ts
 */
import assert from "node:assert/strict";
import { fillingFamily, fillingItemsToSunburst, fillingLabel, type FillingItemLike } from "./filling-groups";

// Family derivation — parenthetical (seed), legacy hyphen, premium, lowercase.
assert.deepEqual(fillingFamily("3D (S)"), { key: "3d", label: "3D" });
assert.deepEqual(fillingFamily("6D (L)"), { key: "6d", label: "6D" });
assert.deepEqual(fillingFamily("6D+ (Folded)"), { key: "6d+", label: "6D+" }); // ")" no longer hides "+"
assert.deepEqual(fillingFamily("6D-L+"), { key: "6d+", label: "6D+" }); // legacy trailing "+"
assert.deepEqual(fillingFamily("6d (s)"), { key: "6d", label: "6D" }); // case-insensitive
assert.equal(fillingFamily(null).key, "other");
assert.equal(fillingFamily("Mystery Fluff").key, "other");

// Seed shape: name="filling", the type lives in subtype. Plus a name-carried density.
const items: FillingItemLike[] = [
  { id: 5, name: "filling", subtype: "3D (S)", size: null },
  { id: 3, name: "filling", subtype: "6D (L)", size: null },
  { id: 2, name: "filling", subtype: "6D (M)", size: null },
  { id: 7, name: "filling", subtype: "6D+ (Folded)", size: null }, // premium, own family
  { id: 9, name: "6D Firm", subtype: null, size: null }, // density in NAME, subtype null
  { id: 8, name: "Mystery Fluff", subtype: null, size: null }, // truly uncategorised
];
const tree = fillingItemsToSunburst(items);

// Families present and ordered 3D, 6D, 6D+, Other.
assert.deepEqual(tree.map((n) => n.label), ["3D", "6D", "6D+", "Other"]);

// Leaves are the variant within a family (not the useless name="filling").
assert.deepEqual(tree.find((n) => n.id === "fam:3d")!.children!.map((c) => c.label), ["S"]);
assert.deepEqual(
  tree.find((n) => n.id === "fam:6d")!.children!.map((c) => c.label).sort(),
  ["Firm", "L", "M"], // "L"/"M" from subtype, "Firm" from the name-carried density
);
// Premium item lands in 6D+, not 6D.
assert.deepEqual(tree.find((n) => n.id === "fam:6d+")!.children!.map((c) => c.label), ["Folded"]);
assert.ok(!tree.find((n) => n.id === "fam:6d")!.children!.some((c) => c.id === "7"));
// Other keeps the item name (no density to extract).
assert.deepEqual(tree.find((n) => n.id === "fam:other")!.children!.map((c) => c.label), ["Mystery Fluff"]);

// Live inventory names the type and keeps the size apart: under its family a
// leaf is only what tells it apart (never "6D" again), plain sizes first.
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

// Leaf ids map straight back to item ids.
assert.deepEqual(tree.flatMap((n) => n.children!.map((c) => c.id)).sort(), ["2", "3", "5", "7", "8", "9"]);

// When every item has a density, there is no "Other" bucket at all.
const clean = fillingItemsToSunburst([
  { id: 1, name: "filling", subtype: "3D (S)", size: null },
  { id: 2, name: "filling", subtype: "6D (L)", size: null },
]);
assert.ok(!clean.some((n) => n.id === "fam:other"));

// Exact duplicate rows collapse to one leaf (lowest id kept).
const deduped = fillingItemsToSunburst([
  { id: 9, name: "filling", subtype: "6D (L)", size: null },
  { id: 2, name: "filling", subtype: "6D (L)", size: null },
]);
assert.equal(deduped[0].children!.length, 1);
assert.equal(deduped[0].children![0].id, "2");

// Chip label: the clean type descriptor, not the "filling" placeholder name.
assert.equal(fillingLabel({ id: 3, name: "filling", subtype: "6D (L)", size: null }), "6D (L)");
assert.equal(fillingLabel({ id: 9, name: "6D Firm", subtype: null, size: null }), "6D Firm");
assert.equal(fillingLabel({ id: 8, name: "Mystery Fluff", subtype: null, size: null }), "Mystery Fluff");

console.log("filling-groups.check.ts: ok");
