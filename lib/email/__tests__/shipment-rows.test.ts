import { describe, expect, it } from "vitest";
import { renderOrderEmail } from "@/lib/email/templates";
import type { OrderEmailData } from "@/lib/email/types";

const data: OrderEmailData = {
  orderNumber: "MP-1",
  customerName: "Ada",
  currency: "SGD",
  items: [],
  subtotal: 0,
  shippingAmount: 0,
  taxAmount: 0,
  discountAmount: 0,
  total: 0,
  trackingNumber: "NV123",
  trackingUrl: "https://track.test/1",
  courierName: "Ninja Van",
  minDays: 2,
  maxDays: 4,
  trackingCheckpoint: "Held at customs — SG",
};

describe("shipment rows in shipping emails", () => {
  it("shows courier and delivery estimate when shipped, not the checkpoint", () => {
    const { text, html } = renderOrderEmail("shipping", data);
    expect(text).toContain("Courier: Ninja Van");
    expect(text).toContain("Estimated delivery: 2–4 days");
    expect(text).not.toContain("Held at customs");
    expect(html).toContain("Ninja Van");
  });

  it("shows the checkpoint only in problem emails", () => {
    expect(renderOrderEmail("tracking_exception", data).text).toContain("Latest update: Held at customs — SG");
    expect(renderOrderEmail("tracking_delivery_attempt", data).text).toContain("Latest update:");
    expect(renderOrderEmail("tracking_delivered", data).text).not.toContain("Latest update:");
    expect(renderOrderEmail("tracking_delivered", data).text).not.toContain("Estimated delivery");
  });

  it("leaves out what isn't known", () => {
    const { text } = renderOrderEmail("shipping", { ...data, courierName: null, minDays: null, trackingNumber: null });
    expect(text).not.toMatch(/Courier|Estimated|Tracking number/);
    expect(renderOrderEmail("shipping", { ...data, maxDays: 2 }).text).toContain("Estimated delivery: 2 days");
  });
});
