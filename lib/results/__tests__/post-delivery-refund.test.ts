import { describe, it, expect } from "vitest";
import {
  customerCancelDeniedReason,
  customerRefundRequestDeniedReason,
  isPostDelivery,
  isResultCustomisedOrder,
  operatorApproveDeniedReason,
  operatorRejectDeniedReason,
  staffRefundDeniedReason,
} from "@/lib/results/post-delivery-refund";

const resultItems = [
  {
    customization_snapshot: {
      result_id: "res-1",
      product_type: "pillow",
      build_lines: [{ item_id: 1, quantity: 1, role: "filling" }],
    },
  },
];

const accessoryItems = [
  { customization_snapshot: { config_lines: [], summary: "legacy" } },
];

describe("slice 11 — post-delivery refund policy", () => {
  it("AC1: customer cancel is denied for Result orders before delivery", () => {
    expect(customerCancelDeniedReason(resultItems)).toMatch(/cannot be cancelled/i);
    expect(customerCancelDeniedReason(accessoryItems)).toMatch(/cannot cancel/i);
  });

  it("AC2: refund request only after shipped/delivered", () => {
    expect(
      customerRefundRequestDeniedReason(
        { status: "confirmed", refund_request_status: null },
        resultItems,
      ),
    ).toMatch(/after the order has shipped/i);

    expect(
      customerRefundRequestDeniedReason(
        { status: "shipped", shipped_at: "2026-07-01", refund_request_status: null },
        resultItems,
      ),
    ).toBeNull();

    expect(
      customerRefundRequestDeniedReason(
        { status: "delivered", delivered_at: "2026-07-02", refund_request_status: null },
        resultItems,
      ),
    ).toBeNull();
  });

  it("blocks duplicate refund requests and non-Result orders", () => {
    expect(
      customerRefundRequestDeniedReason(
        { status: "shipped", refund_request_status: "requested" },
        resultItems,
      ),
    ).toMatch(/already pending/i);

    expect(
      customerRefundRequestDeniedReason({ status: "shipped" }, accessoryItems),
    ).toMatch(/customised orders only/i);
  });

  it("AC3/AC4: approve requires pending request + in-person return ack", () => {
    const shipped = {
      status: "shipped",
      shipped_at: "2026-07-01",
      refund_request_status: "requested" as const,
    };

    expect(operatorApproveDeniedReason(shipped, resultItems, false)).toMatch(
      /in-person return/i,
    );
    expect(operatorApproveDeniedReason(shipped, resultItems, true)).toBeNull();

    expect(
      operatorApproveDeniedReason(
        { ...shipped, refund_request_status: null },
        resultItems,
        true,
      ),
    ).toMatch(/no pending/i);
  });

  it("AC3: reject leaves payment intact (policy only clears request)", () => {
    expect(
      operatorRejectDeniedReason(
        { status: "shipped", refund_request_status: "requested" },
        resultItems,
      ),
    ).toBeNull();
    expect(
      operatorRejectDeniedReason(
        { status: "shipped", refund_request_status: null },
        resultItems,
      ),
    ).toMatch(/no pending/i);
  });

  it("AC5: a Staff refund for a return of a customised order needs it shipped and back in person", () => {
    const returned = { returned: true, inPersonReturnAcknowledged: true };
    expect(
      staffRefundDeniedReason({ status: "shipped", refund_request_status: null }, resultItems, returned),
    ).toBeNull();
    expect(
      staffRefundDeniedReason({ status: "shipped" }, resultItems, {
        returned: true,
        inPersonReturnAcknowledged: false,
      }),
    ).toMatch(/in person/i);
    expect(
      staffRefundDeniedReason({ status: "processing" }, resultItems, returned),
    ).toMatch(/after it has shipped/i);
  });

  it("correcting a charge on a customised order needs no return, at any stage", () => {
    expect(
      staffRefundDeniedReason({ status: "processing" }, resultItems, {
        returned: false,
        inPersonReturnAcknowledged: false,
      }),
    ).toBeNull();
    expect(
      staffRefundDeniedReason({ status: "confirmed" }, accessoryItems, {
        returned: true,
        inPersonReturnAcknowledged: false,
      }),
    ).toBeNull();
  });

  it("detects Result vs accessory snapshots", () => {
    expect(isResultCustomisedOrder(resultItems)).toBe(true);
    expect(isResultCustomisedOrder(accessoryItems)).toBe(false);
    expect(isPostDelivery({ status: "processing" })).toBe(false);
    expect(isPostDelivery({ status: "confirmed", shipped_at: "x" })).toBe(true);
  });
});
