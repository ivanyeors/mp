import assert from "node:assert/strict";
import {
  normalizeVisitorEmail,
  parseVisitorId,
  pickVisitForConversion,
  planVisitorMerge,
} from "./identity";

const V1 = "11111111-1111-4111-8111-111111111111";
const O1 = "22222222-2222-4222-8222-222222222222";
const O2 = "33333333-3333-4333-8333-333333333333";

assert.equal(parseVisitorId(V1), V1);
assert.equal(parseVisitorId("  " + V1 + "  "), V1);
assert.equal(parseVisitorId("not-a-uuid"), null);
assert.equal(parseVisitorId(null), null);

assert.equal(normalizeVisitorEmail("  Alice@Example.COM "), "alice@example.com");
assert.equal(normalizeVisitorEmail("nope"), null);

assert.deepEqual(
  planVisitorMerge(
    { email: null, customer_id: null, merged_at: null },
    { email: "a@b.com", customerId: V1 },
    "2026-07-15T12:00:00.000Z",
  ),
  {
    email: "a@b.com",
    customer_id: V1,
    merged_at: "2026-07-15T12:00:00.000Z",
  },
);

assert.deepEqual(
  planVisitorMerge(
    { email: "a@b.com", customer_id: null, merged_at: "t0" },
    { email: "a@b.com", customerId: V1 },
  ),
  { customer_id: V1 },
);

assert.equal(
  planVisitorMerge(
    { email: "a@b.com", customer_id: null, merged_at: "t0" },
    { email: "other@b.com", customerId: V1 },
  ),
  null,
  "different email must not merge",
);

assert.equal(
  planVisitorMerge(
    { email: "a@b.com", customer_id: V1, merged_at: "t0" },
    { email: "a@b.com", customerId: V1 },
  ),
  null,
  "already complete → no write",
);

const open = {
  id: "open",
  ended_at: null,
  started_at: "2026-07-15T10:00:00.000Z",
  converted_order_id: null,
};
const olderEnded = {
  id: "old",
  ended_at: "2026-07-14T12:00:00.000Z",
  started_at: "2026-07-14T11:00:00.000Z",
  converted_order_id: null,
};
const newerEnded = {
  id: "new",
  ended_at: "2026-07-15T09:00:00.000Z",
  started_at: "2026-07-15T08:00:00.000Z",
  converted_order_id: null,
};

assert.deepEqual(pickVisitForConversion([olderEnded, open, newerEnded], O1), {
  visitId: "open",
  alreadyLinked: false,
});

assert.deepEqual(pickVisitForConversion([olderEnded, newerEnded], O1), {
  visitId: "new",
  alreadyLinked: false,
});

assert.deepEqual(
  pickVisitForConversion(
    [{ ...open, converted_order_id: O1 }, olderEnded],
    O1,
  ),
  { visitId: "open", alreadyLinked: true },
);

assert.deepEqual(
  pickVisitForConversion(
    [{ ...open, converted_order_id: O2 }, olderEnded],
    O1,
  ),
  { visitId: "old", alreadyLinked: false },
  "skip Visit already converted to a different Order",
);

assert.equal(pickVisitForConversion([], O1), null);
assert.equal(pickVisitForConversion([open], "not-uuid"), null);

console.log("identity.check.ts: ok");
