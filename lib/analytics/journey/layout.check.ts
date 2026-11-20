import assert from "node:assert/strict";
import { layoutJourneyGraph } from "./layout";

const nodes = [
  { path: "/", views: 10 },
  { path: "/shop", views: 6 },
  { path: "/checkout", views: 2 },
  { path: "__drop_off__", views: 8 },
  { path: "__converted__", views: 1 },
];
const edges = [
  { from: "/", to: "/shop", count: 4 },
  { from: "/shop", to: "/checkout", count: 2 },
  { from: "/checkout", to: "__converted__", count: 1 },
  { from: "/shop", to: "__drop_off__", count: 3 },
];

const laid = layoutJourneyGraph(nodes, edges, 640, 400);
const home = laid.find((n) => n.path === "/")!;
const shop = laid.find((n) => n.path === "/shop")!;
const checkout = laid.find((n) => n.path === "/checkout")!;
const drop = laid.find((n) => n.path === "__drop_off__")!;
const conv = laid.find((n) => n.path === "__converted__")!;

assert.ok(home.x < shop.x && shop.x < checkout.x);
assert.ok(checkout.x < drop.x);
assert.equal(drop.x, conv.x);
assert.ok(drop.y < conv.y);

const withReentry = layoutJourneyGraph(
  nodes,
  [...edges, { from: "__drop_off__", to: "/", count: 1, dashed: true }],
  640,
  400,
);
assert.ok(
  withReentry.find((n) => n.path === "/")!.x <
    withReentry.find((n) => n.path === "__drop_off__")!.x,
);

console.log("layout.check.ts: ok");
