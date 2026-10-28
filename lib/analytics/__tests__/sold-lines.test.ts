import { describe, expect, it } from "vitest";
import { allocateOrderRevenue, buildSalesReport, type SoldOrder } from "../sold-lines";

const months = ["2026-05", "2026-06"];

const pillowM = {
  group: "pillow" as const,
  key: "pillow:premium:M",
  label: "Size M",
  units: 1,
  gross: 400,
  cost: 60,
};
const neckSupport = {
  group: "part" as const,
  key: "item:61",
  label: "Cervical Neck Support (M)",
  category: "accessories",
  units: 1,
  gross: 100,
  cost: 20,
};
const uncostedPillowS = {
  group: "pillow" as const,
  key: "pillow:premium:S",
  label: "Size S",
  units: 1,
  gross: 400,
  cost: null,
  uncostedReason: "No cost price in Costings for Zip Lock Bag (S).",
  uncostedFix: "costings" as const,
};

describe("allocateOrderRevenue", () => {
  it("spreads a discounted order's revenue over its lines by list price", () => {
    const lines = allocateOrderRevenue({
      channel: "shopify",
      paidAt: "2026-05-10T04:00:00Z",
      productRevenue: 450, // 500 listed, 50 off
      lines: [pillowM, neckSupport],
    });
    expect(lines.map((l) => l.revenue)).toEqual([360, 90]);
  });

  it("splits evenly only when every line listed at nothing", () => {
    const lines = allocateOrderRevenue({
      channel: "orders",
      paidAt: "2026-05-10T04:00:00Z",
      productRevenue: 30,
      lines: [
        { ...neckSupport, gross: 0 },
        { ...neckSupport, key: "item:62", gross: 0 },
      ],
    });
    expect(lines.map((l) => l.revenue)).toEqual([15, 15]);
  });
});

describe("buildSalesReport", () => {
  const orders: SoldOrder[] = [
    { channel: "shopify", paidAt: "2026-05-10T04:00:00Z", productRevenue: 450, lines: [pillowM, neckSupport] },
    { channel: "shopify", paidAt: "2026-06-02T04:00:00Z", productRevenue: 400, lines: [uncostedPillowS] },
    {
      channel: "orders",
      paidAt: "2026-06-03T04:00:00Z",
      productRevenue: 450,
      lines: [
        { ...pillowM, gross: 400 },
        { group: "service", key: "service:measurement_premium", label: "Measurement", units: 1, gross: 50, cost: 0 },
      ],
    },
  ];
  const report = buildSalesReport({ orders, months });

  it("never counts an uncosted line as costing $0", () => {
    const s = report.summary;
    expect(s.revenue).toBe(1300);
    expect(s.uncostedRevenue).toBe(400);
    expect(s.costedRevenue).toBe(900);
    expect(s.cogs).toBe(140);
    expect(s.grossMargin).toBe(760);
    // Margin over costed sales only: 760 / 900, not 1160 / 1300.
    expect(s.marginPct).toBeCloseTo(84.44, 2);
    expect(s.coveragePct).toBeCloseTo(69.23, 2);
    expect(s.orderCount).toBe(3);
    expect(s.uncostedLineCount).toBe(1);
  });

  it("splits by channel and the channels add up to the total", () => {
    const { orders: o, shopify: sh } = report.byChannel;
    expect(o.revenue + sh.revenue).toBe(report.summary.revenue);
    expect(o.cogs + sh.cogs).toBe(report.summary.cogs);
    expect(o.orderCount).toBe(1);
    expect(sh.orderCount).toBe(2);
  });

  it("breaks products down by tier then size, reconciling with the total", () => {
    const premium = report.products.find((r) => r.key === "pillow:premium")!;
    expect(premium.parent).toBeNull();
    expect(premium.revenue).toBe(360 + 400 + 400);
    expect(premium.uncostedRevenue).toBe(400);
    const sizes = report.products.filter((r) => r.parent === "pillow:premium");
    expect(sizes.map((r) => r.label).sort()).toEqual(["Size M", "Size S"]);
    expect(sizes.reduce((sum, r) => sum + r.revenue, 0)).toBe(premium.revenue);
  });

  it("breaks parts down by category, with services on their own", () => {
    const accessories = report.parts.find((r) => r.key === "category:accessories")!;
    expect(accessories.revenue).toBe(90);
    expect(accessories.cogs).toBe(20);
    expect(report.parts.find((r) => r.key === "services")!.revenue).toBe(50);
    const everything =
      report.products.filter((r) => !r.parent).reduce((sum, r) => sum + r.revenue, 0) +
      report.parts.filter((r) => !r.parent).reduce((sum, r) => sum + r.revenue, 0);
    expect(everything).toBe(report.summary.revenue);
  });

  it("puts each sale in its Singapore month on the timeline", () => {
    const m = report.timeline.products.find((s) => s.id === "pillow:premium:M")!;
    expect(m.data.map((p) => p.units)).toEqual([1, 1]);
    expect(m.data[0].date).toBe("2026-04-30T16:00:00.000Z");
    const sales = report.timeline.parts.find((s) => s.id === "services")!;
    expect(sales.data.map((p) => p.revenue)).toEqual([0, 50]);
  });

  it("lists what has no cost, and why", () => {
    expect(report.gaps).toEqual([
      {
        channel: "shopify",
        key: "pillow:premium:S",
        label: "Size S",
        reason: "No cost price in Costings for Zip Lock Bag (S).",
        fix: "costings",
        lines: 1,
        units: 1,
        revenue: 400,
      },
    ]);
  });
});
