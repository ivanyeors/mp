// @vitest-environment jsdom
import { click, settle, typeField } from "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrdersInitialData } from "../orders-client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/orders",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));

const { default: SettingsOrdersPage } = await import("../orders-client");

type Row = NonNullable<OrdersInitialData["list"]>["rows"][number];
const row = (orderNumber: string): Row =>
  ({
    id: orderNumber,
    order_number: orderNumber,
    email: `${orderNumber}@example.com`,
    status: "pending",
    total: 100,
    shipping_address: null,
    partner_id: null,
    items_count: 1,
    created_at: "2026-11-01T00:00:00Z",
  }) as unknown as Row;

const initialData: OrdersInitialData = {
  dashboard: {
    ok: true,
    stats: { total_orders: 100, revenue: 0, avg_order_value: 0, total_revenue: 0, average_order_value: 0, pending_orders: 0, total_gross_margin: 0, avg_margin_pct: null },
  },
  list: { ok: true, rows: [row("P1")], total: 100, page: 1, limit: 20 },
};

let requests: { params: URLSearchParams; answer: (rows: Row[], total?: number) => Promise<void> }[];

let root: Root | null = null;
beforeEach(async () => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/shop/orders/dashboard")) {
        return Promise.resolve({ ok: true, json: async () => ({ stats: initialData.dashboard!.stats }) });
      }
      const params = new URL(url, "http://x").searchParams;
      return new Promise((resolve) => {
        requests.push({
          params,
          answer: async (rows, total = 100) => {
            await act(async () => resolve({ ok: true, json: async () => ({ ok: true, rows, total }) }));
            await settle();
          },
        });
      });
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<SettingsOrdersPage initialData={initialData} />));
  await settle(400);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function chooseStatus(value: string) {
  const el = document.querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function setDate(label: "From date" | "To date", value: string) {
  typeField(document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!, value);
  await settle();
}
async function goToPage(n: number) {
  const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === String(n));
  await click(link!);
}
const activePage = () => document.querySelector('[aria-current="page"]')?.textContent;
const tableRows = () => [...document.querySelectorAll("tbody tr")].map((tr) => tr.textContent);
const asked = (from = 0) => requests.slice(from).map((r) => `${r.params.get("page")}:${r.params.get("status") ?? "all"}`);

describe("Orders list", () => {
  it("sends one request, for page 1, when the status changes on page 3", async () => {
    await goToPage(3);
    expect(asked()).toEqual(["3:all"]);
    await requests[0].answer([row("P3")]);

    await chooseStatus("shipped");
    expect(asked(1)).toEqual(["1:shipped"]);
    await requests[1].answer([row("S1")]);
    expect(activePage()).toBe("1");
    expect(tableRows()).toEqual([expect.stringContaining("#S1")]);
  });

  it("sends one request, for page 1, when a date changes on page 3", async () => {
    await goToPage(3);
    await requests[0].answer([row("P3")]);

    await setDate("From date", "2026-11-01");
    expect(requests.slice(1).map((r) => `${r.params.get("page")}:${r.params.get("date_from")}`)).toEqual(["1:2026-11-01"]);
    await requests[1].answer([row("D1")]);
    expect(activePage()).toBe("1");
  });

  it("stays on page 3 when the status already chosen is picked again", async () => {
    await goToPage(3);
    await requests[0].answer([row("P3")]);

    await chooseStatus("all");
    expect(asked()).toEqual(["3:all"]);
    expect(activePage()).toBe("3");
    expect(tableRows()).toEqual([expect.stringContaining("#P3")]);
  });

  it("shows the newest request's rows when an older one answers last", async () => {
    await goToPage(2);
    await goToPage(3);
    expect(asked()).toEqual(["2:all", "3:all"]);
    await requests[1].answer([row("P3")]);
    await requests[0].answer([row("P2")]);
    expect(activePage()).toBe("3");
    expect(tableRows()).toEqual([expect.stringContaining("#P3")]);
  });

  it("keeps the list empty when a request answers after the dates were made invalid", async () => {
    await goToPage(2);
    await setDate("To date", "2026-11-01");
    await setDate("From date", "2026-11-10");
    expect(document.body.textContent).toContain("From date must be on or before To date.");
    for (const request of [...requests].reverse()) await request.answer([row("LATE")]);
    expect(tableRows()).toEqual([]);
    expect(document.body.textContent).toContain("No orders match your filters.");
  });
});
