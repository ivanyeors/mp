/**
 * Run: npx tsx lib/ecommerce/orders-paid-at-range.check.ts
 */
import assert from "node:assert/strict";
import {
  applyOrdersPaidAtRange,
  parseOrdersPaidAtRange,
} from "./orders-paid-at-range";

const parsed = parseOrdersPaidAtRange("2026-07-01", "2026-07-31");
assert.equal(parsed.ok, true);
if (!parsed.ok) throw new Error(parsed.error);
assert.deepEqual(parsed.range, {
  from: "2026-07-01T00:00:00.000Z",
  toExclusive: "2026-08-01T00:00:00.000Z",
});

type Row = { paid_at: string | null };
class FakeQuery {
  constructor(public rows: Row[]) {}

  gte(_column: string, value: string) {
    return new FakeQuery(
      this.rows.filter((row) => row.paid_at != null && row.paid_at >= value)
    );
  }

  lt(_column: string, value: string) {
    return new FakeQuery(
      this.rows.filter((row) => row.paid_at != null && row.paid_at < value)
    );
  }
}

const filtered = applyOrdersPaidAtRange(
  new FakeQuery([
    { paid_at: "2026-06-30T23:59:59.999Z" },
    { paid_at: "2026-07-01T00:00:00.000Z" },
    { paid_at: "2026-07-31T23:59:59.999Z" },
    { paid_at: "2026-08-01T00:00:00.000Z" },
    { paid_at: null },
  ]),
  parsed.range
);
assert.deepEqual(filtered.rows, [
  { paid_at: "2026-07-01T00:00:00.000Z" },
  { paid_at: "2026-07-31T23:59:59.999Z" },
]);

assert.deepEqual(parseOrdersPaidAtRange("2026-08-01", "2026-07-31"), {
  ok: false,
  error: "From date must be on or before To date",
});
assert.equal(parseOrdersPaidAtRange("2026-02-30", null).ok, false);

console.log("orders-paid-at-range.check.ts: ok");
