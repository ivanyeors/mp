/**
 * Section dive graph (Houdini-style focused view).
 * Run: npx tsx lib/analytics/journey/dive.check.ts
 */
import assert from "node:assert/strict";
import {
  DIVE_ENTRY,
  DIVE_EXIT,
  buildDiveGraph,
  isDivePort,
  layoutDiveGraph,
} from "./dive";

const pagePath = "/";
const nodes = [
  { path: "/", views: 10 },
  { path: "/shop", views: 4 },
  { path: "/#hero", views: 8 },
  { path: "/#size", views: 5 },
  { path: "__drop_off__", views: 3 },
];
const edges = [
  { from: "/shop", to: "/", count: 2 },
  { from: "/", to: "__drop_off__", count: 3 },
  { from: "/#hero", to: "/#size", count: 4 },
];

const dive = buildDiveGraph(pagePath, nodes, edges);
assert.equal(dive.nodes.some((n) => n.path === "/"), false);
assert.equal(dive.nodes.some((n) => n.path === "/shop"), false);
assert.ok(dive.nodes.some((n) => n.path === "/#hero"));
assert.ok(dive.nodes.some((n) => n.path === DIVE_ENTRY));
assert.ok(dive.nodes.some((n) => n.path === DIVE_EXIT));
assert.ok(dive.edges.some((e) => e.from === "/#hero" && e.to === "/#size"));
assert.ok(dive.edges.some((e) => e.from === DIVE_ENTRY));
assert.ok(dive.edges.some((e) => e.to === DIVE_EXIT));
assert.equal(dive.nodes.find((n) => n.path === DIVE_ENTRY)?.views, 2);
assert.equal(dive.nodes.find((n) => n.path === DIVE_EXIT)?.views, 3);

assert.equal(isDivePort(DIVE_ENTRY), true);
assert.equal(isDivePort("/#hero"), false);

const laid = layoutDiveGraph(dive.nodes, 640, 400);
const ex = laid.find((n) => n.path === DIVE_ENTRY)!;
const xo = laid.find((n) => n.path === DIVE_EXIT)!;
assert.ok(ex.x < xo.x);

const empty = buildDiveGraph("/none", nodes, edges);
assert.equal(empty.nodes.length, 0);

console.log("dive.check.ts: ok");
