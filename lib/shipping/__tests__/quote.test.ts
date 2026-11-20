import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EasyshipAddress } from "@/lib/easyship/schema";

const h = vi.hoisted(() => ({ sender: null as EasyshipAddress | null, readTypeBoxes: vi.fn() }));
vi.mock("@/lib/easyship/store", () => ({ readSenderAddress: async () => h.sender, readTypeBoxes: h.readTypeBoxes }));

import { fetchCourierRates, priceMethod, quoteCacheKey, quoteShippingMethods } from "@/lib/shipping/quote";
import { DEFAULT_SHIPPING_SETTINGS } from "@/lib/shipping/settings";
import type { ShippingMethod } from "@/lib/types/ecommerce";
import type { RatesResult, ShippableLine, ShippingSettings, TypeBoxes } from "@/lib/shipping/types";

function fakeAdmin() {
  const rows: Array<Record<string, unknown>> = [];
  const admin = {
    rows,
    from() {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let pendingInsert: Record<string, unknown> | null = null;
      let deleting = false;
      const run = () => {
        if (pendingInsert) {
          const row = { id: `q${rows.length + 1}`, ...pendingInsert };
          rows.push(row);
          return { data: row, error: null };
        }
        if (deleting) {
          for (let i = rows.length - 1; i >= 0; i--) if (filters.every((f) => f(rows[i]))) rows.splice(i, 1);
          return { data: null, error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        return { data: hit[hit.length - 1] ?? null, error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), b),
        lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), b),
        order: () => b,
        limit: () => b,
        insert: (row: Record<string, unknown>) => ((pendingInsert = row), b),
        delete: () => ((deleting = true), b),
        single: async () => run(),
        maybeSingle: async () => run(),
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return b;
    },
  };
  return admin as unknown as SupabaseClient & { rows: typeof rows };
}

const settings: ShippingSettings = {
  ...DEFAULT_SHIPPING_SETTINGS,
  handling_days: 1,
};

const sender: EasyshipAddress = {
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

beforeEach(() => {
  h.sender = sender;
  h.readTypeBoxes.mockReset().mockResolvedValue({});
});

const config = { token: "sand_t", baseUrl: "https://es.test/2024-09", environment: "sandbox" as const };

const easyshipRates = {
  rates: [
    {
      courier_service: { id: "cs_cheap", name: "Ninja Van Standard", umbrella_name: "Ninja Van" },
      total_charge: 6.42,
      currency: "SGD",
      min_delivery_time: 1,
      max_delivery_time: 3,
    },
    {
      courier_service: { id: "cs_fast", name: "Lalamove Same Day", umbrella_name: "Lalamove" },
      total_charge: 18,
      currency: "SGD",
      min_delivery_time: 0,
      max_delivery_time: 0,
    },
  ],
};

const okFetch = () => vi.fn(async () => new Response(JSON.stringify(easyshipRates), { status: 200 }));

const lines: ShippableLine[] = [
  { product_type: "pillow", quantity: 1, weight_grams: null, unit_value: 190, currency: "SGD", description: "Mpillow" },
];

const method = (over: Partial<ShippingMethod>): ShippingMethod => ({
  id: "m1",
  slug: "standard",
  content: {},
  base_rate: 8,
  free_above: 150,
  currency: "SGD",
  countries: ["SG"],
  is_active: true,
  position: 0,
  created_at: "",
  updated_at: "",
  ...over,
});

const destination = { country: "SG", postal_code: "018 989" };
const boxes: TypeBoxes = { pillow: { length_cm: 70, width_cm: 45, height_cm: 20, tare_grams: 0, weight_grams: 1500 } };

describe("fetchCourierRates", () => {
  it("calls Easyship once, then serves the same cart and postal code from the cache", async () => {
    const admin = fakeAdmin();
    const fetchImpl = okFetch();
    const parcels = [{ length_cm: 70, width_cm: 45, height_cm: 20, weight_kg: 1.5, items: [] }];
    const input = { settings, destination, parcels, currency: "SGD", config, fetchImpl };

    const first = await fetchCourierRates(admin, input);
    const second = await fetchCourierRates(admin, { ...input, destination: { ...destination, postal_code: "018989" } });

    expect(first).toMatchObject({ ok: true, cached: false });
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.ok && second.rates).toEqual(first.ok && first.rates);
  });

  it("refetches once the quote has expired", async () => {
    const admin = fakeAdmin();
    const fetchImpl = okFetch();
    const parcels = [{ length_cm: 70, width_cm: 45, height_cm: 20, weight_kg: 1.5, items: [] }];
    const t0 = new Date("2026-10-02T00:00:00Z");
    const later = new Date(t0.getTime() + (settings.quote_ttl_minutes + 1) * 60_000);
    await fetchCourierRates(admin, { settings, destination, parcels, currency: "SGD", config, fetchImpl, now: t0 });
    await fetchCourierRates(admin, { settings, destination, parcels, currency: "SGD", config, fetchImpl, now: later });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("says why it cannot quote instead of throwing", async () => {
    const admin = fakeAdmin();
    const parcels = [{ length_cm: 1, width_cm: 1, height_cm: 1, weight_kg: 1, items: [] }];
    const base = { settings, destination, parcels, currency: "SGD" };
    expect(await fetchCourierRates(admin, { ...base, config: null })).toMatchObject({ reason: "not_configured" });
    expect(
      await fetchCourierRates(admin, { ...base, config, origin: { ...sender, postal_code: null } }),
    ).toMatchObject({ reason: "invalid_origin" });
    h.sender = null;
    expect(await fetchCourierRates(admin, { ...base, config })).toMatchObject({ reason: "invalid_origin" });
    h.sender = sender;
    expect(await fetchCourierRates(admin, { ...base, config, parcels: null })).toMatchObject({
      reason: "too_many_parcels",
    });
    const failing = vi.fn(async () => new Response("{}", { status: 500 }));
    const errored = await fetchCourierRates(admin, { ...base, config, fetchImpl: failing });
    expect(errored).toMatchObject({ ok: false, reason: "error" });
  });

  it("keys the cache on what a courier prices, not on descriptions", () => {
    const parcel = (description: string) => [
      {
        length_cm: 70,
        width_cm: 45,
        height_cm: 20,
        weight_kg: 1.5,
        items: [{ description, quantity: 1, weight_kg: 1.5, declared_value: 190, currency: "SGD" }],
      },
    ];
    const key = (d: string, postal = "018989") =>
      quoteCacheKey({
        settings,
        origin: sender,
        destination: { country: "SG", postal_code: postal },
        parcels: parcel(d),
        currency: "SGD",
      });
    expect(key("Mpillow")).toBe(key("Mpillow — renamed"));
    expect(key("Mpillow")).not.toBe(key("Mpillow", "018990"));
  });

  it("quotes from the current default sender address", async () => {
    const admin = fakeAdmin();
    const fetchImpl = okFetch();
    const parcels = [{ length_cm: 70, width_cm: 45, height_cm: 20, weight_kg: 1.5, items: [] }];
    const input = { settings, destination, parcels, currency: "SGD", config, fetchImpl };
    await fetchCourierRates(admin, input);
    h.sender = { ...sender, postal_code: "654321" };
    expect(await fetchCourierRates(admin, input)).toMatchObject({ ok: true, cached: false });
    const body = (n: number) => JSON.parse((fetchImpl.mock.calls[n] as unknown as [string, RequestInit])[1].body as string);
    expect(body(0).origin_address.postal_code).toBe("123456");
    expect(body(1).origin_address.postal_code).toBe("654321");
  });
});

describe("priceMethod", () => {
  const live: RatesResult = {
    ok: true,
    cached: false,
    quoteId: "q1",
    rates: [
      {
        courier_service_id: "cs_cheap",
        courier_name: "Ninja Van Standard",
        umbrella_name: "Ninja Van",
        total_charge: 6.42,
        currency: "SGD",
        min_days: 1,
        max_days: 3,
        cost_rank: 1,
        delivery_time_rank: 2,
        value_for_money_rank: 1,
      },
    ],
  };

  it("prices a flat method from base_rate, as before", () => {
    expect(priceMethod(method({}), live, 40, 0)).toMatchObject({ amount: 8, source: "flat", courier: null });
    expect(priceMethod(method({}), live, 200, 0)).toMatchObject({ amount: 0, is_free: true });
  });

  it("prices a live method from the courier, marked up, with handling days", () => {
    const option = priceMethod(
      method({ rate_source: "easyship", markup_percent: 10, rate_rounding: 0.5 }),
      live,
      40,
      2,
    );
    expect(option).toMatchObject({
      amount: 7.5,
      source: "easyship",
      carrier_cost: 6.42,
      courier: { service_id: "cs_cheap", name: "Ninja Van Standard" },
      min_days: 3,
      max_days: 5,
    });
  });

  it("still honours free_above on a live method", () => {
    expect(priceMethod(method({ rate_source: "easyship" }), live, 150, 0)).toMatchObject({
      amount: 0,
      is_free: true,
      carrier_cost: 6.42,
    });
  });

  it("hides a live method on an outage, never charging base_rate", () => {
    const failed: RatesResult = { ok: false, reason: "error", message: "timeout" };
    expect(priceMethod(method({ rate_source: "easyship" }), failed, 40, 0)).toBeNull();
    expect(priceMethod(method({ rate_source: "easyship" }), null, 40, 0)).toBeNull();
  });

  it("hides a live method when there are no rates", () => {
    expect(priceMethod(method({ rate_source: "easyship" }), { ...live, rates: [] }, 40, 0)).toBeNull();
    expect(
      priceMethod(method({ rate_source: "easyship", easyship_strategy: "courier", easyship_courier_service_id: "gone" }), live, 40, 0),
    ).toBeNull();
  });

  it("hides a live method rather than charge in the wrong currency", () => {
    const usd: RatesResult = { ...live, rates: live.ok ? live.rates.map((r) => ({ ...r, currency: "USD" })) : [] };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(priceMethod(method({ rate_source: "easyship" }), usd, 40, 0)).toBeNull();
    spy.mockRestore();
  });

  it("leaves flat methods unaffected when live rates fail", () => {
    const failed: RatesResult = { ok: false, reason: "error", message: "timeout" };
    expect(priceMethod(method({}), failed, 40, 0)).toMatchObject({ amount: 8, source: "flat" });
    expect(priceMethod(method({}), null, 40, 0)).toMatchObject({ amount: 8, source: "flat" });
  });
});

describe("quoteShippingMethods", () => {
  it("never reads settings or calls Easyship when every method is flat", async () => {
    const loadSettings = vi.fn();
    const fetchImpl = okFetch();
    const { options } = await quoteShippingMethods(fakeAdmin(), {
      methods: [method({})],
      lines,
      destination,
      subtotal: 40,
      loadSettings,
      config,
      fetchImpl,
    });
    expect(options).toHaveLength(1);
    expect(loadSettings).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("serves every live method from one Easyship call", async () => {
    const fetchImpl = okFetch();
    const { options } = await quoteShippingMethods(fakeAdmin(), {
      methods: [
        method({ id: "std", rate_source: "easyship", easyship_strategy: "cheapest" }),
        method({ id: "exp", rate_source: "easyship", easyship_strategy: "fastest", free_above: null }),
        method({ id: "flat", base_rate: 5 }),
      ],
      lines,
      destination,
      subtotal: 40,
      loadSettings: async () => settings,
      loadBoxes: async () => boxes,
      config,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(options.map((o) => [o.method.id, o.amount, o.courier?.service_id ?? null])).toEqual([
      ["std", 6.42, "cs_cheap"],
      ["exp", 18, "cs_fast"],
      ["flat", 5, null],
    ]);
  });

  it("quotes only flat methods when the courier token is unset", async () => {
    const { options } = await quoteShippingMethods(fakeAdmin(), {
      methods: [method({ id: "live", rate_source: "easyship" }), method({ id: "flat", base_rate: 5 })],
      lines,
      destination,
      subtotal: 40,
      loadSettings: async () => settings,
      config: null,
    });
    expect(options.map((o) => [o.method.id, o.source])).toEqual([["flat", "flat"]]);
  });

  it("reads boxes from the courier account by default, and a type with no box gets no live call", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.readTypeBoxes.mockResolvedValue({});
    const fetchImpl = okFetch();
    const { rates, options } = await quoteShippingMethods(fakeAdmin(), {
      methods: [method({ rate_source: "easyship" })],
      lines,
      destination,
      subtotal: 40,
      loadSettings: async () => settings,
      config,
      fetchImpl,
    });
    expect(h.readTypeBoxes).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rates).toMatchObject({ ok: false, reason: "too_many_parcels" });
    expect(options).toEqual([]);
    spy.mockRestore();
  });

  it("hides live methods when settings cannot be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { options } = await quoteShippingMethods(fakeAdmin(), {
      methods: [method({ rate_source: "easyship" })],
      lines,
      destination,
      subtotal: 40,
      loadSettings: async () => {
        throw new Error("db down");
      },
      config,
    });
    expect(options).toEqual([]);
    spy.mockRestore();
  });
});
