import { describe, expect, it } from "vitest";

import {
  CreateStaffOrderSchema,
  StaffOrderDraftSchema,
  isPayLinkToken,
  mergeQuantities,
  payLinkExpiry,
  payLinkState,
  subtotals,
  type StaffOrderLine,
} from "@/lib/staff-orders/shared";

/** The rules of a Staff order that need no database (ADR 0048). */

const CUSTOMER = "0b0b0b0b-0000-4000-8000-000000000001";
const VARIANT = "0c0c0c0c-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-07T04:00:00Z");

describe("the draft Staff send", () => {
  it("carries no price: a total or unit price in the body is dropped", () => {
    const parsed = StaffOrderDraftSchema.parse({
      customer_id: CUSTOMER,
      goods: [{ variant_id: VARIANT, quantity: 1, unit_price: 0.01 }],
      delivery: { kind: "studio", location_id: "studio-1" },
      total: 0.5,
    });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed.goods[0]).toEqual({ variant_id: VARIANT, quantity: 1 });
  });

  it("needs at least one product or service", () => {
    const res = StaffOrderDraftSchema.safeParse({
      customer_id: CUSTOMER,
      delivery: { kind: "studio", location_id: "studio-1" },
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("Add at least one product or service");
  });

  it("takes only the three Services", () => {
    const base = { customer_id: CUSTOMER, delivery: { kind: "studio", location_id: "s" } };
    expect(StaffOrderDraftSchema.safeParse({ ...base, services: [{ key: "readjustment", quantity: 1 }] }).success).toBe(true);
    expect(StaffOrderDraftSchema.safeParse({ ...base, services: [{ key: "gift_wrap", quantity: 1 }] }).success).toBe(false);
  });

  it("needs a postal code for a Singapore delivery, and upper-cases the country", () => {
    const ship = (address: Record<string, unknown>) =>
      StaffOrderDraftSchema.safeParse({
        customer_id: CUSTOMER,
        goods: [{ variant_id: VARIANT, quantity: 1 }],
        delivery: { kind: "ship", shipping_method_id: VARIANT, address },
      });
    expect(ship({ recipient: "Ada", line1: "1 Road", city: "Singapore", country: "sg" }).success).toBe(false);
    const ok = ship({ recipient: "Ada", line1: "1 Road", city: "Singapore", postal_code: "238824", country: "sg" });
    expect(ok.success && ok.data.delivery.kind === "ship" && ok.data.delivery.address.country).toBe("SG");
  });

  it("emails the link unless Staff untick it", () => {
    const base = { customer_id: CUSTOMER, goods: [{ variant_id: VARIANT, quantity: 1 }], delivery: { kind: "studio", location_id: "s" } };
    expect(CreateStaffOrderSchema.parse(base).send_email).toBe(true);
    expect(CreateStaffOrderSchema.parse({ ...base, send_email: false }).send_email).toBe(false);
  });
});

describe("lines and subtotals", () => {
  it("merges the same Variant added twice", () => {
    expect(
      mergeQuantities(
        [
          { variant_id: "a", quantity: 1 },
          { variant_id: "b", quantity: 2 },
          { variant_id: "a", quantity: 3 },
        ],
        "variant_id",
      ),
    ).toEqual([
      { variant_id: "a", quantity: 4 },
      { variant_id: "b", quantity: 2 },
    ]);
  });

  it("keeps goods and services apart, to the cent", () => {
    const lines: StaffOrderLine[] = [
      { kind: "goods", variantId: "a", productId: "p", categoryId: null, sku: "", title: "Pad", variantTitle: null, imageUrl: null, unitPrice: 25.5, quantity: 3, stockAvailable: 5 },
      { kind: "service", serviceKey: "readjustment", sku: "", title: "Re-adjustment", unitPrice: 30, quantity: 1 },
    ];
    expect(subtotals(lines)).toEqual({ goods: 76.5, services: 30, all: 106.5 });
  });
});

describe("Payment link state", () => {
  const link = { expires_at: payLinkExpiry(NOW).toISOString() };

  it("is payable for 7 days, then expired", () => {
    expect(payLinkState({ status: "pending", paid_at: null }, link, NOW)).toBe("payable");
    expect(payLinkState({ status: "payment_failed", paid_at: null }, link, NOW)).toBe("payable");
    const later = new Date(NOW.getTime() + 7 * 24 * 3600_000 + 1);
    expect(payLinkState({ status: "pending", paid_at: null }, link, later)).toBe("expired");
  });

  it("is paid once Stripe charged it, whatever its status since", () => {
    expect(payLinkState({ status: "confirmed", paid_at: NOW.toISOString() }, link, NOW)).toBe("paid");
    expect(payLinkState({ status: "refunded", paid_at: NOW.toISOString() }, link, NOW)).toBe("paid");
  });

  it("is closed when Staff cancelled it or moved it on by hand", () => {
    expect(payLinkState({ status: "cancelled", paid_at: null }, link, NOW)).toBe("closed");
    expect(payLinkState({ status: "confirmed", paid_at: null }, link, NOW)).toBe("closed");
  });

  it("looks up only uuid tokens", () => {
    expect(isPayLinkToken("5a1e5a1e-0000-4000-8000-0000000f0009")).toBe(true);
    expect(isPayLinkToken("../../etc")).toBe(false);
    expect(isPayLinkToken(42)).toBe(false);
  });
});
