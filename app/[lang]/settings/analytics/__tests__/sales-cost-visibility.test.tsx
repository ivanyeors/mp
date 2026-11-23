// @vitest-environment jsdom
import { settle } from "@/components/block-editor/__tests__/dom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { permissionsForRole, type Permission } from "@/lib/auth/permissions";
import { buildSalesReport, type SoldOrder } from "@/lib/analytics/sold-lines";

const h = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("@/lib/auth/admin", () => {
  const ctx = () => ({ userId: "u1", email: "ops@example.com", permissions: h.permissions });
  return {
    assertAdmin: vi.fn(async (permission: string) => {
      if (!h.permissions.has(permission)) throw new Error("Forbidden");
      return ctx();
    }),
    requireAdminPage: vi.fn(async () => ctx()),
  };
});

const SOLD: SoldOrder[] = [
  {
    soldAt: "2026-10-10T04:00:00.000Z",
    productRevenue: 300,
    lines: [
      { group: "pillow", key: "pillow:premium:M", label: "Size M", units: 1, gross: 200, cost: 80 },
      {
        group: "part",
        key: "item:7",
        label: "Silk cover",
        category: "cover",
        units: 2,
        gross: 100,
        cost: null,
        uncostedReason: "No cost was recorded on the order line when it sold.",
      },
    ],
  },
];

vi.mock("@/lib/analytics/sales-report", () => ({
  loadSalesReport: vi.fn(async () => ({
    ...buildSalesReport({ orders: SOLD, months: ["2026-10"] }),
    fromMonth: "2026-10",
    toMonth: "2026-10",
  })),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("../AnalyticsClient", () => ({ default: () => null }));

const { getSalesReport } = await import("../actions");
const { SalesTab } = await import("../SalesTab");
const { default: AnalyticsPage } = await import("../page");
const { analyticsTabText } = await import("../tabs");

const COST_KEYS = /"(cogs|grossMargin|marginPct|costedRevenue|uncostedRevenue|coveragePct|uncostedLineCount|cost)"/;
const PERIOD = { from: "2026-09-30T16:00:00.000Z", to: "2026-10-31T15:59:59.999Z" };

const signInWith = (permissions: Iterable<Permission>) => {
  h.permissions = new Set(permissions);
};

let root: Root | null = null;
async function renderSalesTab(canSeeCost: boolean): Promise<string> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <SalesTab
        {...PERIOD}
        dateRange={{ from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) }}
        canSeeCost={canSeeCost}
      />,
    ),
  );
  await settle(10);
  return host.textContent ?? "";
}

async function pageCanSeeCost(): Promise<unknown> {
  const page = (await AnalyticsPage({
    params: Promise.resolve({ lang: "en-US" }),
    searchParams: Promise.resolve({}),
  })) as ReactElement<{ canSeeCost: boolean }>;
  return page.props.canSeeCost;
}

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
});

describe("a role with analytics but not costings (Viewer)", () => {
  beforeEach(() => signInWith(permissionsForRole("viewer")));

  it("gets no margin, COGS, cost coverage or margin breakdown from the Sales report", async () => {
    const report = await getSalesReport(PERIOD);
    expect(JSON.stringify(report)).not.toMatch(COST_KEYS);
    expect(report).not.toHaveProperty("products");
    expect(report).not.toHaveProperty("parts");
    expect(report).not.toHaveProperty("gaps");
    expect(report.canSeeCost).toBe(false);
  });

  it("still gets revenue, units, orders and sales over time", async () => {
    const report = await getSalesReport(PERIOD);
    expect(report.summary).toEqual({ revenue: 300, units: 3, orderCount: 1, lineCount: 2, currency: "SGD" });
    expect(report.timeline.products.map((s) => s.name)).toEqual(["Premium Mpillow · Size M"]);
    expect(report.timeline.parts[0]!.data[0]).toMatchObject({ units: 2, revenue: 100 });
    expect(report).toMatchObject({ fromMonth: "2026-10", toMonth: "2026-10" });
  });

  it("the page tells the Sales tab to hide cost, and the tab is named for sales only", async () => {
    expect(await pageCanSeeCost()).toBe(false);
    expect(analyticsTabText("sales", false)).toEqual({
      label: "Sales",
      question: "What did we sell, and what did it bring in?",
    });
  });

  it("the Sales tab shows revenue and sales over time, with no margin card, chart or column", async () => {
    const text = await renderSalesTab(false);
    expect(text).toContain("Revenue");
    expect(text).toContain("$300");
    expect(text).toContain("Sales over time");
    for (const gone of ["Gross margin", "Margin %", "Cost coverage", "COGS", "Sales with no cost", "Margin by"]) {
      expect(text).not.toContain(gone);
    }
  });
});

describe("a role with analytics and costings (Manager) keeps today's behaviour", () => {
  beforeEach(() => signInWith(permissionsForRole("manager")));

  it("gets margin, COGS, cost coverage and the margin breakdown", async () => {
    const report = await getSalesReport(PERIOD);
    if (!report.canSeeCost) throw new Error("expected the costed report");
    expect(report.summary).toMatchObject({ revenue: 300, cogs: 80, grossMargin: 120, costedRevenue: 200 });
    expect(report.products.map((r) => r.label)).toEqual(["Premium Mpillow", "Size M"]);
    expect(report.gaps.map((g) => g.label)).toEqual(["Silk cover"]);
  });

  it("the page shows cost, and the Sales tab shows the margin cards and breakdown", async () => {
    expect(await pageCanSeeCost()).toBe(true);
    expect(analyticsTabText("sales", true).label).toBe("Sales & margin");
    const text = await renderSalesTab(true);
    for (const shown of ["Gross margin", "$120", "Margin %", "Cost coverage", "COGS", "Sales with no cost", "Margin by product"]) {
      expect(text).toContain(shown);
    }
  });
});
