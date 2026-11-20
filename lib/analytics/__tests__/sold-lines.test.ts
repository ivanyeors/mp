import { describe, expect, it } from "vitest";
import { allocateOrderRevenue, buildSalesReport, latestChargeAt, type SoldOrder } from "../sold-lines";

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
const uncostedCase = {
  group: "unmapped" as const,
  key: "unmapped:Gift wrap",
  label: "Gift wrap",
  units: 1,
  gross: 400,
  cost: null,
  uncostedReason: "No cost was recorded on the order line when it sold.",
};

describe("latestChargeAt", () => {
  it("dates an Order by the last Stripe charge, when Stripe held the whole price", () => {
    const at = latestChargeAt([
      { orderId: "a", at: "2026-05-30T15:00:00Z" },
      { orderId: "a", at: "2026-06-02T03:00:00Z" },
      { orderId: "b", at: "2026-05-10T04:00:00Z" },
    ]);
    expect(at.get("a")).toBe("2026-06-02T03:00:00.000Z");
    expect(at.get("b")).toBe("2026-05-10T04:00:00.000Z");
  });

  it("ignores a charge with no usable time", () => {
    expect(latestChargeAt([{ orderId: "a", at: "not a date" }]).size).toBe(0);
  });
});

describe("allocateOrderRevenue", () => {
  it("spreads a discounted order's revenue over its lines by list price", () => {
    const lines = allocateOrderRevenue({
      soldAt: "2026-05-10T04:00:00Z",
      productRevenue: 450,
      lines: [pillowM, neckSupport],
    });
    expect(lines.map((l) => l.revenue)).toEqual([360, 90]);
  });

  it("splits evenly only when every line listed at nothing", () => {
    const lines = allocateOrderRevenue({
      soldAt: "2026-05-10T04:00:00Z",
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
    { soldAt: "2026-05-10T04:00:00Z", productRevenue: 450, lines: [pillowM, neckSupport] },
    { soldAt: "2026-06-02T04:00:00Z", productRevenue: 400, lines: [uncostedCase] },
    {
      soldAt: "2026-06-03T04:00:00Z",
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
    expect(s.marginPct).toBeCloseTo(84.44, 2);
    expect(s.coveragePct).toBeCloseTo(69.23, 2);
    expect(s.orderCount).toBe(3);
    expect(s.uncostedLineCount).toBe(1);
  });

  it("breaks products down by tier then size, reconciling with the total", () => {
    const premium = report.products.find((r) => r.key === "pillow:premium")!;
    expect(premium.parent).toBeNull();
    expect(premium.revenue).toBe(360 + 400);
    const sizes = report.products.filter((r) => r.parent === "pillow:premium");
    expect(sizes.map((r) => r.label)).toEqual(["Size M"]);
    expect(sizes.reduce((sum, r) => sum + r.revenue, 0)).toBe(premium.revenue);
    expect(report.products.find((r) => r.key === "unmapped")!.label).toBe("Not linked to inventory");
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

  it("files a sale by its Singapore date: 1am on 1 June SGT is June", () => {
    const r = buildSalesReport({
      orders: [{ soldAt: "2026-05-31T17:00:00Z", productRevenue: 100, lines: [neckSupport] }],
      months,
    });
    expect(r.timeline.parts[0].data.map((p) => p.revenue)).toEqual([0, 100]);
  });

  it("lists what has no cost, and why", () => {
    expect(report.gaps).toEqual([
      {
        key: "unmapped:Gift wrap",
        label: "Gift wrap",
        reason: "No cost was recorded on the order line when it sold.",
        lines: 1,
        units: 1,
        revenue: 400,
      },
    ]);
  });
});
