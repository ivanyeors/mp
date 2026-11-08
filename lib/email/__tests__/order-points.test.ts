process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { buildOrderEmailData, planOrderConfirmedEmails, renderOrderEmail } from "@/lib/email";
import { defaultEmailCopy } from "@/lib/email/copy";
import { ORDER_EMAIL_COPY } from "@/lib/email/templates";
import { sampleOrder, sampleOrderWithPoints } from "@/lib/email/__fixtures__/samples";

/** Amounts are formatted with no-break spaces; compare them as plain ones. */
const plain = (s: string) => s.replace(/\u00a0|\u202f/g, " ");

/**
 * The order emails with points (PRD-loyalty-points slices 03 and 04): points
 * used are their own line, apart from the coupon, and the confirmation says
 * what the order will earn, with a sign-in line for a guest. An order with
 * no points reads exactly as before.
 */

describe("points used", () => {
  it("splits the discount: the coupon, then the points, each its own line", () => {
    for (const template of ["order_confirmation", "payment_receipt"] as const) {
      const text = plain(renderOrderEmail(template, sampleOrderWithPoints()).text);
      expect(text).toContain("Discount: − SGD 20.00\nPoints used (200): − SGD 20.00");
      expect(text).toContain("Total: SGD 451.13");
    }
  });

  it("points alone, with no coupon: no Discount line", () => {
    const text = plain(renderOrderEmail("payment_receipt", { ...sampleOrderWithPoints(), discountAmount: 20 }).text);
    expect(text).not.toContain("Discount:");
    expect(text).toContain("Points used (200): − SGD 20.00");
  });

  it("an order with no points is unchanged", () => {
    const text = plain(renderOrderEmail("order_confirmation", sampleOrder()).text);
    expect(text).toContain("Discount: − SGD 40.00");
    expect(text).not.toMatch(/points?\b/i);
  });

  it("reads points_spent off the Order row", () => {
    const data = buildOrderEmailData({
      order_number: "MP-1",
      email: "a@x.test",
      currency: "SGD",
      subtotal: 100,
      shipping_amount: 0,
      tax_amount: 0,
      discount_amount: 10,
      total: 90,
      points_spent: 1000,
    });
    expect(data.pointsSpent).toBe(1000);
    expect(data.pointsEarn).toBeNull();
  });
});

describe("points the order will earn", () => {
  it("says what it earns, in points and dollars, with a sign-in line for a guest", () => {
    const { text, html } = renderOrderEmail("order_confirmation", sampleOrderWithPoints());
    expect(text).toContain(
      "This order will earn 451 points (S$45.10) once it has been delivered and kept for 30 days. Sign in with this email to see and use them.",
    );
    expect(html).toContain("This order will earn 451 points (S$45.10)");
  });

  it("leaves the sign-in line out for a customer who has signed in", () => {
    const { text } = renderOrderEmail("order_confirmation", { ...sampleOrderWithPoints(), pointsEarn: { points: 30, guest: false } });
    expect(text).toContain("This order will earn 30 points (S$3.00) once it has been delivered and kept for 30 days.\n");
    expect(text).not.toContain("Sign in with this email");
  });

  it("says nothing when the order earns nothing, or Staff blanked the line", () => {
    expect(renderOrderEmail("order_confirmation", { ...sampleOrderWithPoints(), pointsEarn: null }).text).not.toContain("will earn");
    const blank = { ...defaultEmailCopy(ORDER_EMAIL_COPY.order_confirmation), points_earn: "" };
    expect(renderOrderEmail("order_confirmation", sampleOrderWithPoints(), blank).text).not.toMatch(/will earn|Sign in with this email/);
  });

  it("is in the confirmation only, never the receipt", () => {
    expect(renderOrderEmail("payment_receipt", sampleOrderWithPoints()).text).not.toContain("will earn");
    const row = { order_number: "MP-1", email: "a@x.test", currency: "SGD", subtotal: 100, shipping_amount: 0, tax_amount: 0, discount_amount: 0, total: 100 };
    const plans = planOrderConfirmedEmails(row, { points: 300, guest: true });
    expect(plans.map((p) => [p.template, p.data.pointsEarn])).toEqual([
      ["order_confirmation", { points: 300, guest: true }],
      ["payment_receipt", { points: 300, guest: true }],
    ]);
  });
});
