import assert from "node:assert/strict";
import { computeOnHandValueKpis } from "./on-hand-value-kpis";

const empty = computeOnHandValueKpis([]);
assert.equal(empty.costValue, 0);
assert.equal(empty.msrpValue, 0);
assert.equal(empty.marginValue, 0);
assert.equal(empty.weightedMarginPct, null);
assert.equal(empty.totalItems, 0);

const fixture = computeOnHandValueKpis([
  { cost: 10, msrp: 25, onHand: 4 },
  { cost: 5, msrp: 10, onHand: -3 },
  { cost: null, msrp: 20, onHand: 2 },
  { cost: 8, msrp: null, onHand: 1 },
]);

assert.equal(fixture.costValue, 48);
assert.equal(fixture.msrpValue, 140);
assert.equal(fixture.marginValue, 92);
assert.equal(fixture.totalItems, 4);
assert.ok(fixture.weightedMarginPct !== null);
assert.equal(Number(fixture.weightedMarginPct!.toFixed(4)), Number(((92 / 140) * 100).toFixed(4)));

const underwater = computeOnHandValueKpis([{ cost: 50, msrp: 10, onHand: 2 }]);
assert.equal(underwater.costValue, 100);
assert.equal(underwater.msrpValue, 20);
assert.equal(underwater.marginValue, 0);
assert.equal(underwater.weightedMarginPct, 0);

const zeroMsrp = computeOnHandValueKpis([{ cost: 10, msrp: 0, onHand: 5 }]);
assert.equal(zeroMsrp.weightedMarginPct, null);

console.log("on-hand-value-kpis.check.ts: ok");
