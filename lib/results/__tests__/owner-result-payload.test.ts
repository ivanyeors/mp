import { describe, expect, it } from "vitest";
import {
  toOwnerResultPayload,
  type MpConfigResponseDetailPayload,
} from "@/lib/results/admin/response-detail";

/** Everything the Staff payload carries, so the projection has something to drop. */
const full = {
  ok: true,
  response: {
    id: "r-1",
    data: { name: "Ada", shoulderLength: "42", bloodPressureLevel: "normal" },
    is_final: false,
    customer_email: "ada@example.test",
    customer_phone: "+6591234567",
    authorized_amount: 420,
    final_amount: 460,
    currency: "SGD",
    payment_intent_id: "pi_123",
    topup_payment_intent_id: "pi_456",
    order_id: "o-1",
    order_item_id: "oi-1",
    status: "held",
    discovery_source_label: "Instagram",
    recommendation_record: { graphVersionId: 7 },
  },
  order_number: "MP-20260909-0007",
  order: { id: "o-1", order_number: "MP-20260909-0007", total: 460, tracking_number: "SG123" },
  suggestion: {
    recommended: { size: "M", tier: "premium" },
    product: { id: 3, size: "M", tier: "premium" as const },
    bom: [{ quantity: 2, item: { id: 9, category: "filling", name: "Latex shred", size: null, subtype: "soft" } }],
    reasons: ["Rules Engine graph 7", "Shoulder → size M"],
    graph_version_id: 7,
    recommendation_record: { graphVersionId: 7 },
  },
} as unknown as MpConfigResponseDetailPayload;

describe("toOwnerResultPayload", () => {
  it("keeps exactly what the guest clients read", () => {
    expect(toOwnerResultPayload(full)).toEqual({
      ok: true,
      response: { id: "r-1", data: full.response.data, is_final: false },
      suggestion: {
        recommended: { size: "M", tier: "premium" },
        product: { id: 3, size: "M", tier: "premium" },
      },
    });
  });

  it.each([
    "customer_email",
    "customer_phone",
    "authorized_amount",
    "final_amount",
    "payment_intent_id",
    "topup_payment_intent_id",
    "order_id",
    "status",
    "recommendation_record",
  ])("drops response.%s", (key) => {
    expect(toOwnerResultPayload(full).response).not.toHaveProperty(key);
  });

  it("drops the linked order entirely", () => {
    const owner = toOwnerResultPayload(full) as unknown as Record<string, unknown>;
    expect(owner).not.toHaveProperty("order");
    expect(owner).not.toHaveProperty("order_number");
  });

  it.each(["bom", "reasons", "graph_version_id", "recommendation_record"])(
    "drops suggestion.%s",
    (key) => {
      expect(toOwnerResultPayload(full).suggestion).not.toHaveProperty(key);
    },
  );

  // The property that makes an allowlist worth having: a column added to the
  // query later is excluded by default rather than included by default.
  it("excludes a field nobody has thought of yet", () => {
    const withNewColumn = {
      ...full,
      response: { ...full.response, some_future_pii_column: "leak" },
    } as unknown as MpConfigResponseDetailPayload;
    expect(JSON.stringify(toOwnerResultPayload(withNewColumn))).not.toContain("leak");
  });
});
