import assert from "node:assert/strict";
import { combineTemplateSaleLines } from "./template-sale-lines";

const combined = combineTemplateSaleLines(
  [{ item_id: 10, quantity: 1 }, { item_id: 20, quantity: 2 }],
  [{ item_id: 30, quantity: 3 }],
  2,
);

assert.deepEqual(combined, [
  { item_id: 10, quantity_signed: -2 },
  { item_id: 20, quantity_signed: -4 },
  { item_id: 30, quantity_signed: -6 },
]);

const merged = combineTemplateSaleLines(
  [{ item_id: 10, quantity: 1 }],
  [{ item_id: 10, quantity: 2 }],
  1,
);
assert.deepEqual(merged, [{ item_id: 10, quantity_signed: -3 }]);

console.log("template-sale-lines.check.ts: ok");
