import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Buying an order's label: the chosen courier, one label per order however many
 * clicks, and a failed purchase leaves the order free to retry. Easyship is a
 * fake fetch; Supabase is a one-row-per-table fake.
 */

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown> | null>,
  timeline: [] as Array<Record<string, unknown>>,
  sendShippingEmail: vi.fn(),
  sender: null as Record<string, unknown> | null,
}));

const SENDER = {
  line_1: "1 Office Road",
  line_2: null,
  city: "Singapore",
  state: null,
  postal_code: "123456",
  country_alpha2: "SG",
  company_name: "Mpillow",
  contact_name: "Mpillow",
  contact_phone: "+6560000000",
  contact_email: "ops@mpillow.test",
  default_for: { sender: true, return: false, pickup: false, billing: false },
};

vi.mock("@/lib/email", () => ({ sendShippingEmail: h.sendShippingEmail }));
vi.mock("@/lib/shipping/settings", async (orig) => {
  const actual = await orig<typeof import("@/lib/shipping/settings")>();
  return {
    ...actual,
    readShippingSettings: async () => actual.DEFAULT_SHIPPING_SETTINGS,
  };
});
vi.mock("@/lib/easyship/store", () => ({ readSenderAddress: async () => h.sender }));
vi.mock("@/lib/shipping/lines", () => ({
  loadOrderShippableLines: async () => [
    { product_type: "pillow", quantity: 1, weight_grams: null, unit_value: 190, currency: "SGD", description: "Mpillow" },
  ],
}));

const { buyOrderLabel } = await import("@/lib/shipping/order-shipment");

function fakeAdmin() {
  return {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let write: Record<string, unknown> | null = null;
      let mode: "update" | "upsert" | "upsert-ignore" | null = null;
      const row = () => h.tables[table] ?? null;
      const matches = () =>
        row() != null &&
        filters.every(([op, col, val]) =>
          op === "is" ? row()![col] == null : String(row()![col]) === String(val),
        );
      const run = () => {
        if (table === "order_timeline") return { data: null, error: null };
        if (mode === "upsert-ignore") {
          if (!row()) h.tables[table] = { ...write };
          return { data: null, error: null };
        }
        if (mode === "upsert") {
          h.tables[table] = { ...(row() ?? {}), ...write };
          return { data: [{ ...h.tables[table] }], error: null };
        }
        if (mode === "update") {
          if (!matches()) return { data: [], error: null };
          Object.assign(row()!, write);
          return { data: [{ ...row() }], error: null };
        }
        return { data: matches() ? { ...row() } : null, error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b),
        in: () => b,
        is: (c: string, v: unknown) => (filters.push(["is", c, v]), b),
        gt: () => b,
        lt: () => b,
        order: () => b,
        limit: () => b,
        delete: () => b,
        update: (r: Record<string, unknown>) => ((write = r), (mode = "update"), b),
        upsert: (r: Record<string, unknown>, opts?: { ignoreDuplicates?: boolean }) => (
          (write = r), (mode = opts?.ignoreDuplicates ? "upsert-ignore" : "upsert"), b
        ),
        insert: (r: Record<string, unknown>) => (h.timeline.push(r), b),
        maybeSingle: async () => run(),
        single: async () => {
          const r = run();
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

const config = { token: "sand_t", baseUrl: "https://es.test/2024-09", environment: "sandbox" as const };

const order = {
  id: "order-1",
  order_number: "MP-1001",
  email: "ada@x.test",
  phone: null,
  status: "confirmed",
  currency: "SGD",
  shipping_address: { recipient: "Ada", line1: "10 Bayfront Ave", city: "Singapore", postal_code: "018956", country: "SG" },
  shipping_courier: "Ninja Van Standard",
  shipped_at: null,
};

const bought = {
  shipment: {
    easyship_shipment_id: "ESSG1",
    label_state: "generated",
    tracking_page_url: "https://track.test/ESSG1",
    trackings: [{ tracking_number: "NV123" }],
    courier_service: { id: "cs_ninja", name: "Ninja Van Standard" },
    rates: [{ total_charge: 6.42, currency: "SGD" }],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.tables = { orders: { ...order }, order_shipments: null };
  h.timeline.length = 0;
  h.sendShippingEmail.mockReset();
  h.sender = { ...SENDER };
  fetchMock = vi.fn(async () => new Response(JSON.stringify(bought), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("buyOrderLabel", () => {
  it("buys the label with the chosen courier and ships the order", async () => {
    const result = await buyOrderLabel(fakeAdmin(), order, "cs_ninja", config);
    expect(result).toMatchObject({ ok: true, shipped: true });

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.courier_settings).toEqual({ courier_service_id: "cs_ninja", allow_fallback: false });
    expect(body.order_data.platform_order_number).toBe("MP-1001");
    expect(body.origin_address).toMatchObject({ postal_code: "123456", line_1: "1 Office Road" });

    expect(h.tables.order_shipments).toMatchObject({
      easyship_shipment_id: "ESSG1",
      carrier_cost: 6.42,
      courier_service_id: "cs_ninja",
    });
    expect(h.tables.orders).toMatchObject({ status: "shipped", tracking_number: "NV123" });
    expect(h.sendShippingEmail).toHaveBeenCalledTimes(1);
    expect(h.timeline.map((t) => t.event_type)).toEqual(["shipment_created", "order_shipped"]);
  });

  it("never buys a second label for the same order", async () => {
    await buyOrderLabel(fakeAdmin(), order, "cs_ninja", config);
    const again = await buyOrderLabel(fakeAdmin(), order, "cs_ninja", config);
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when Easyship refuses, so Staff can retry", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Courier unavailable" } }), { status: 422 }),
    );
    const failed = await buyOrderLabel(fakeAdmin(), order, "cs_gone", config);
    expect(failed).toMatchObject({ ok: false, status: 400, error: "Courier unavailable" });
    expect(h.tables.order_shipments?.easyship_shipment_id).toBeNull();

    const retried = await buyOrderLabel(fakeAdmin(), order, "cs_ninja", config);
    expect(retried).toMatchObject({ ok: true });
  });

  it("refuses an order that is already delivered or not paid", async () => {
    for (const status of ["delivered", "pending", "cancelled"]) {
      const result = await buyOrderLabel(fakeAdmin(), { ...order, status }, "cs_ninja", config);
      expect(result).toMatchObject({ ok: false, status: 409 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses without a default sender address", async () => {
    h.sender = null;
    expect(await buyOrderLabel(fakeAdmin(), order, "cs_ninja", config)).toMatchObject({ ok: false, status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.tables.order_shipments).toBeNull();
  });

  it("does not try without an Easyship token", async () => {
    expect(await buyOrderLabel(fakeAdmin(), order, "cs_ninja", null)).toMatchObject({ ok: false, status: 503 });
  });
});
