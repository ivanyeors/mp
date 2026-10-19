/**
 * The allowlist is the safety property of a reorder, so it gets asserted rather
 * than trusted. A clone that inherited a PaymentIntent, an Order or an
 * authorized amount would look like a legitimate new sale while pointing at
 * money that belongs to a different one.
 */
import { describe, expect, it } from "vitest";

import { REORDERABLE_STATUSES, REORDER_CARRIED_COLUMNS } from "../reorder";

const MUST_NEVER_CARRY = [
  "id",
  "access_token",
  "status",
  "reordered_from",
  "order_id",
  "order_item_id",
  "authorized_amount",
  "final_amount",
  "payment_intent_id",
  "topup_payment_intent_id",
  "topup_paid_at",
  "assigned_at",
  "last_reminder_at",
  "payment_reminder_last_at",
  "payment_reminder_count",
  "is_pre_order",
  "pre_order_restock_notified_at",
  // A reordered Mbolster ships on its own; its old pair's hold is not its money.
  "paired_build_id",
  "created_at",
  "updated_at",
];

describe("reorder column allowlist", () => {
  it("carries nothing that ties a Result to money or fulfilment", () => {
    for (const column of MUST_NEVER_CARRY) {
      expect(
        (REORDER_CARRIED_COLUMNS as readonly string[]).includes(column),
        `${column} must not be carried into a reordered Result`,
      ).toBe(false);
    }
  });

  it("carries the build, or the clone is not the same pillow", () => {
    for (const column of [
      "assigned_size",
      "assigned_tier",
      "assigned_length",
      "filling_template_id",
      "filling_fingerprint",
      "preference_lines",
      "addon_lines",
      "shipping_method",
      "shipping_address",
      "currency",
      "customer_email",
    ]) {
      expect(
        (REORDER_CARRIED_COLUMNS as readonly string[]).includes(column),
        `${column} must survive a reorder`,
      ).toBe(true);
    }
  });

  it("keeps partner attribution, so a rebuilt sale still pays its referrer", () => {
    for (const column of ["partner_id", "ref_code", "attribution_source"]) {
      expect((REORDER_CARRIED_COLUMNS as readonly string[]).includes(column)).toBe(true);
    }
  });

  it("has no duplicates", () => {
    const seen = new Set(REORDER_CARRIED_COLUMNS);
    expect(seen.size).toBe(REORDER_CARRIED_COLUMNS.length);
  });

  it("only starts from a finished, unpaid, terminal build", () => {
    expect([...REORDERABLE_STATUSES].sort()).toEqual(["declined", "expired"]);
    for (const live of ["held", "assigned", "accepted", "captured"]) {
      expect(REORDERABLE_STATUSES.has(live)).toBe(false);
    }
  });
});
