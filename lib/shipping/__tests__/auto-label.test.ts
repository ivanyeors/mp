import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The label made when an order is paid (ADR 0044): on the customer's courier
 * only, never twice, and silent for orders that ship nothing. Where Staff must
 * step in, the timeline says why. The order loaders, quote and purchase are fakes;
 * the courier choice is the real `preselectCourier`.
 */

const h = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  shipment: null as Record<string, unknown> | null,
  method: null as Record<string, unknown> | null,
  lines: [{ product_type: "pillow", quantity: 1 }] as unknown[],
  quote: null as unknown,
  buy: vi.fn(),
  timeline: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/shipping/lines", () => ({ loadOrderShippableLines: async () => h.lines }));
vi.mock("@/lib/shipping/order-shipment", async (orig) => {
  const actual = await orig<typeof import("@/lib/shipping/order-shipment")>();
  return {
    ...actual,
    loadOrderForShipping: async () => h.order,
    loadOrderShipment: async () => h.shipment,
    loadOrderShippingMethod: async () => h.method,
    quoteOrderShipment: async () => h.quote,
    buyOrderLabel: h.buy,
  };
});

const { autoCreateOrderLabel, autoCreateOrderLabelSafely } = await import("@/lib/shipping/auto-label");

const admin = {
  from: () => ({ insert: async (row: Record<string, unknown>) => (h.timeline.push(row), { error: null }) }),
} as unknown as SupabaseClient;
const config = { token: "sand_t", baseUrl: "https://es.test/2024-09", environment: "sandbox" as const };

const rate = (id: string, total: number) => ({
  courier_service_id: id,
  courier_name: id,
  umbrella_name: null,
  total_charge: total,
  currency: "SGD",
  min_days: 1,
  max_days: 3,
  cost_rank: null,
  delivery_time_rank: null,
  value_for_money_rank: null,
});
const RATES = [rate("cs_jnt", 5.2), rate("cs_ninja", 6.4)];
const pinnedJnt = {
  slug: "standard-sg",
  rate_source: "easyship",
  currency: "SGD",
  easyship_strategy: "courier",
  easyship_courier_service_id: "cs_jnt",
  content: { "en-US": { name: "Standard delivery" } },
};

beforeEach(() => {
  h.order = {
    id: "order-1",
    order_number: "MP-1001",
    email: "ada@x.test",
    phone: null,
    status: "confirmed",
    currency: "SGD",
    shipping_address: { recipient: "Ada", line1: "10 Bayfront Ave", city: "Singapore", postal_code: "018956", country: "SG" },
    shipping_courier: null,
    shipped_at: null,
  };
  h.shipment = null;
  h.method = null;
  h.lines = [{ product_type: "pillow", quantity: 1 }];
  h.quote = { ok: true, rates: { ok: true, rates: RATES } };
  h.buy.mockReset();
  h.buy.mockResolvedValue({ ok: true, shipment: { shipmentId: "ESSG1" } });
  h.timeline.length = 0;
});

describe("autoCreateOrderLabel", () => {
  it("makes the label with the courier the customer paid for at checkout", async () => {
    h.shipment = { order_id: "order-1", easyship_shipment_id: null, courier_service_id: "cs_ninja" };
    expect(await autoCreateOrderLabel(admin, "order-1", config)).toEqual({ made: true, courierServiceId: "cs_ninja" });
    expect(h.buy).toHaveBeenCalledWith(admin, h.order, "cs_ninja", config, { auto: true });
    expect(h.timeline).toHaveLength(0);
  });

  it("makes a customisation order's label with the courier its method names", async () => {
    h.method = pinnedJnt;
    expect(await autoCreateOrderLabel(admin, "order-1", config)).toMatchObject({ made: true, courierServiceId: "cs_jnt" });
  });

  it("does nothing, silently, for an order with a label, nothing to ship, or no courier account", async () => {
    h.shipment = { order_id: "order-1", easyship_shipment_id: "ESSG0" };
    expect(await autoCreateOrderLabel(admin, "order-1", config)).toEqual({ made: false, skipped: "has_label" });
    h.shipment = null;
    h.lines = [];
    expect(await autoCreateOrderLabel(admin, "order-1", config)).toEqual({ made: false, skipped: "nothing_to_ship" });
    expect(await autoCreateOrderLabel(admin, "order-1", null)).toEqual({ made: false, skipped: "not_connected" });
    expect(h.buy).not.toHaveBeenCalled();
    expect(h.timeline).toHaveLength(0);
  });

  it("does nothing for an order not paid, already shipped, or collected from the studio", async () => {
    for (const over of [
      { status: "pending" },
      { status: "refunded" },
      { shipped_at: "2026-11-01T00:00:00Z" },
      { shipping_address: { recipient: "Ada", collect_location: { id: "studio" }, country: "SG", postal_code: "018956" } },
    ]) {
      h.order = { ...h.order!, ...over };
      expect(await autoCreateOrderLabel(admin, "order-1", config)).toMatchObject({ made: false });
      h.order = { ...h.order!, status: "confirmed", shipped_at: null, shipping_address: { postal_code: "018956", country: "SG" } };
    }
    expect(h.buy).not.toHaveBeenCalled();
  });

  it("makes none, and says why, when the customer's method is a flat price that names no courier", async () => {
    h.method = { ...pinnedJnt, rate_source: "flat", easyship_courier_service_id: null };
    const outcome = await autoCreateOrderLabel(admin, "order-1", config);
    expect(outcome).toMatchObject({ made: false });
    expect(h.buy).not.toHaveBeenCalled();
    expect(h.timeline[0]).toMatchObject({ event_type: "label_not_made", order_id: "order-1" });
    expect(h.timeline[0].message).toBe(
      "No label was made automatically: Standard delivery charges a flat price, so it names no courier. " +
        "To make its labels automatically, set it to a live courier rate in Settings → Shipping. " +
        "Make it with Create label on this order.",
    );
  });

  it("makes none when the courier the customer paid for is not offered today, rather than swap it", async () => {
    h.order = { ...h.order!, shipping_courier: "DHL Express" };
    h.shipment = { order_id: "order-1", easyship_shipment_id: null, courier_service_id: "cs_dhl" };
    h.method = pinnedJnt;
    expect(await autoCreateOrderLabel(admin, "order-1", config)).toMatchObject({ made: false });
    expect(h.buy).not.toHaveBeenCalled();
    expect(h.timeline[0].message).toContain("DHL Express is not offered for this parcel today");
  });

  it("says why when the quote or the purchase fails", async () => {
    h.method = pinnedJnt;
    h.quote = { ok: false, status: 400, error: "No default sender address." };
    await autoCreateOrderLabel(admin, "order-1", config);
    h.quote = { ok: true, rates: { ok: true, rates: RATES } };
    h.buy.mockResolvedValueOnce({ ok: false, status: 400, error: "Courier unavailable" });
    await autoCreateOrderLabel(admin, "order-1", config);
    expect(h.timeline.map((t) => t.message)).toEqual([
      "No label was made automatically: No default sender address. Make it with Create label on this order.",
      "No label was made automatically: Easyship refused it (Courier unavailable). Make it with Create label on this order.",
    ]);
  });

  it("stays quiet when Staff made the label while it ran", async () => {
    h.method = pinnedJnt;
    h.buy.mockResolvedValueOnce({ ok: false, status: 409, error: "This order already has an Easyship shipment" });
    expect(await autoCreateOrderLabel(admin, "order-1", config)).toEqual({ made: false, skipped: "has_label" });
    expect(h.timeline).toHaveLength(0);
  });
});

describe("autoCreateOrderLabelSafely", () => {
  it("never throws: an error is left on the timeline, without claiming no label exists", async () => {
    vi.stubEnv("EASYSHIP_API_TOKEN", "sand_t");
    h.method = pinnedJnt;
    h.buy.mockRejectedValueOnce(new Error("order_shipments upsert failed"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(autoCreateOrderLabelSafely(admin, "order-1")).resolves.toBeUndefined();
    expect(h.timeline[0].message).toBe(
      "Making the label automatically failed (order_shipments upsert failed). " +
        "Check Easyship for a shipment for this order before making one with Create label.",
    );
    quiet.mockRestore();
    vi.unstubAllEnvs();
  });
});
