import { describe, expect, it } from "vitest";
import { deliveryWindow, normalizeEasyshipRates, pickRate, priceLiveRate } from "@/lib/shipping/rates";
import type { CourierRate } from "@/lib/shipping/types";

const rate = (over: Partial<CourierRate>): CourierRate => ({
  courier_service_id: "svc",
  courier_name: "Courier",
  umbrella_name: null,
  total_charge: 10,
  currency: "SGD",
  min_days: 1,
  max_days: 3,
  cost_rank: null,
  delivery_time_rank: null,
  value_for_money_rank: null,
  ...over,
});

describe("normalizeEasyshipRates", () => {
  it("reads the 2024-09 courier_service shape", () => {
    const rates = normalizeEasyshipRates({
      rates: [
        {
          courier_service: { id: "cs_ninja", name: "Ninja Van Standard", umbrella_name: "Ninja Van" },
          total_charge: 6.42,
          currency: "sgd",
          min_delivery_time: 1,
          max_delivery_time: 2,
          cost_rank: 1,
          delivery_time_rank: 2,
          value_for_money_rank: 1,
        },
      ],
    });
    expect(rates).toEqual([
      {
        courier_service_id: "cs_ninja",
        courier_name: "Ninja Van Standard",
        umbrella_name: "Ninja Van",
        total_charge: 6.42,
        currency: "SGD",
        min_days: 1,
        max_days: 2,
        cost_rank: 1,
        delivery_time_rank: 2,
        value_for_money_rank: 1,
      },
    ]);
  });

  it("reads the 2023-01 courier_id shape", () => {
    const [r] = normalizeEasyshipRates({
      rates: [{ courier_id: "abc", courier_name: "SingPost", shipment_charge_total: "8.1", currency: "SGD" }],
    });
    expect(r).toMatchObject({ courier_service_id: "abc", courier_name: "SingPost", total_charge: 8.1 });
  });

  it("drops rates it cannot price instead of guessing", () => {
    expect(
      normalizeEasyshipRates({
        rates: [
          { courier_service: { name: "No id" }, total_charge: 5, currency: "SGD" },
          { courier_service: { id: "x" }, currency: "SGD" },
          { courier_service: { id: "y" }, total_charge: -1, currency: "SGD" },
          { courier_service: { id: "z" }, total_charge: 4 },
          null,
        ],
      }),
    ).toEqual([]);
    expect(normalizeEasyshipRates(null)).toEqual([]);
    expect(normalizeEasyshipRates({ rates: "nope" })).toEqual([]);
  });
});

describe("pickRate", () => {
  const rates = [
    rate({ courier_service_id: "slow-cheap", total_charge: 5, min_days: 3, max_days: 6, value_for_money_rank: 2 }),
    rate({ courier_service_id: "fast-dear", total_charge: 15, min_days: 1, max_days: 1, value_for_money_rank: 3 }),
    rate({ courier_service_id: "middle", total_charge: 8, min_days: 2, max_days: 3, value_for_money_rank: 1 }),
  ];

  it("cheapest, fastest and best value each pick their courier", () => {
    expect(pickRate(rates, "cheapest")?.courier_service_id).toBe("slow-cheap");
    expect(pickRate(rates, "fastest")?.courier_service_id).toBe("fast-dear");
    expect(pickRate(rates, "best_value")?.courier_service_id).toBe("middle");
  });

  it("a pinned courier is that courier or nothing", () => {
    expect(pickRate(rates, "courier", "middle")?.courier_service_id).toBe("middle");
    expect(pickRate(rates, "courier", "gone")).toBeNull();
  });

  it("breaks ties the same way whatever order Easyship lists them in", () => {
    const a = rate({ courier_service_id: "a", total_charge: 5, max_days: 2 });
    const b = rate({ courier_service_id: "b", total_charge: 5, max_days: 2 });
    expect(pickRate([a, b], "cheapest")?.courier_service_id).toBe("a");
    expect(pickRate([b, a], "cheapest")?.courier_service_id).toBe("a");
  });

  it("has nothing to pick from no rates", () => {
    expect(pickRate([], "cheapest")).toBeNull();
  });
});

describe("priceLiveRate", () => {
  it("applies percent, then fixed markup", () => {
    expect(priceLiveRate(10, { markup_percent: 10, markup_fixed: 2, rate_rounding: 0 })).toBe(13);
  });

  it("rounds up to the increment, never down", () => {
    expect(priceLiveRate(7.13, { markup_percent: 0, markup_fixed: 0, rate_rounding: 0.5 })).toBe(7.5);
    expect(priceLiveRate(7.5, { markup_percent: 0, markup_fixed: 0, rate_rounding: 0.5 })).toBe(7.5);
    expect(priceLiveRate(7.01, { markup_percent: 0, markup_fixed: 0, rate_rounding: 1 })).toBe(8);
    expect(priceLiveRate(7.13, { markup_percent: 0, markup_fixed: 0, rate_rounding: 0.1 })).toBe(7.2);
  });

  it("does not round float noise up a whole step", () => {
    // 6.818181… × 1.1 = 7.4999999…; that is 7.50, not 8.00.
    expect(priceLiveRate(75 / 11, { markup_percent: 10, markup_fixed: 0, rate_rounding: 0.5 })).toBe(7.5);
  });

  it("lets a subsidy reach zero but not go below it", () => {
    expect(priceLiveRate(6, { markup_percent: 0, markup_fixed: -10, rate_rounding: 0 })).toBe(0);
  });

  it("treats missing markup columns as no markup", () => {
    expect(priceLiveRate(9.99, {})).toBe(9.99);
  });
});

describe("deliveryWindow", () => {
  it("adds handling days to the courier's transit time", () => {
    expect(deliveryWindow({ min_days: 1, max_days: 3 }, 2)).toEqual({ min_days: 3, max_days: 5 });
    expect(deliveryWindow({ min_days: null, max_days: null }, 2)).toEqual({ min_days: null, max_days: null });
  });
});
