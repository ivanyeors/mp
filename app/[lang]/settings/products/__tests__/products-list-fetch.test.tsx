// @vitest-environment jsdom
import { click, settle } from "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductRow, ProductsInitialData } from "../products-client";

/**
 * The Products list's filters and pager: one request per change, page 1 after a
 * filter changes, the newest answer wins, and the selection clears whenever the
 * rows are replaced or the type changes.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/products",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/settings/shop-listing-toggles", () => ({ ShopListingToggles: () => null }));
vi.mock("@/components/settings/inventory-push-sheet", () => ({ InventoryPushSheet: () => null }));
vi.mock("../categories-manager", () => ({ CategoriesManager: () => null }));
// Radix Select needs pointer capture jsdom lacks; a native select calls the same onValueChange.
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

const { ProductsClient } = await import("../products-client");

const row = (id: string, product_type = "pillow"): ProductRow => ({
  id,
  slug: id,
  status: "active",
  product_type,
  is_auto_generated: true,
  content: { "en-US": { title: `Product ${id}` } },
  category_id: null,
  product_variants: [],
  product_images: [],
  created_at: "2026-11-01T00:00:00Z",
});

const initialData: ProductsInitialData = {
  products: { ok: true, rows: [row("p1-a")], total: 100, page: 1, limit: 20 },
  categories: { ok: true, rows: [{ id: "cat1", slug: "pillows", content: { "en-US": { name: "Pillows" } } }] },
};

/** Each products request, in order, answered when the test says. */
let requests: { params: URLSearchParams; answer: (rows: ProductRow[], total?: number) => Promise<void> }[];

let root: Root | null = null;
beforeEach(async () => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
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
  act(() => root!.render(<ProductsClient initialData={initialData} stripeMode="test" />));
  // The search box's debounce also runs once on mount and sets page 1 after 350ms.
  await settle(400);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const selects = () => [...document.querySelectorAll("select")];
const [TYPE, STATUS] = [0, 1];
async function choose(which: number, value: string) {
  const el = selects()[which];
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function goToPage(n: number) {
  const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.textContent === String(n));
  await click(link!);
}
const activePage = () => document.querySelector('[aria-current="page"]')?.textContent;
const titles = () => [...document.querySelectorAll("tbody tr")].map((tr) => tr.textContent);
const selectedCount = () => /(\d+) selected/.exec(document.body.textContent ?? "")?.[1] ?? null;

describe("ProductsClient list", () => {
  it("sends one request, for page 1, when a filter changes on page 3", async () => {
    await goToPage(3);
    expect(requests.map((r) => r.params.get("page"))).toEqual(["3"]);
    await requests[0].answer([row("p3-a")]);

    await choose(STATUS, "draft");
    expect(requests.slice(1).map((r) => `${r.params.get("page")}:${r.params.get("status")}`)).toEqual(["1:draft"]);
    await requests[1].answer([row("p1-draft")]);
    expect(activePage()).toBe("1");
    expect(titles()).toEqual([expect.stringContaining("Product p1-draft")]);
  });

  it("shows the newest request's rows when an older one answers last", async () => {
    await goToPage(2);
    await goToPage(3);
    expect(requests.map((r) => r.params.get("page"))).toEqual(["2", "3"]);
    await requests[1].answer([row("p3-a")]);
    await requests[0].answer([row("p2-a")]);
    expect(activePage()).toBe("3");
    expect(titles()).toEqual([expect.stringContaining("Product p3-a")]);
  });

  it("clears the selection when new rows arrive and when the type changes", async () => {
    await choose(TYPE, "accessory");
    expect(requests.map((r) => `${r.params.get("page")}:${r.params.get("product_type")}`)).toEqual(["1:accessory"]);
    await requests[0].answer([row("a1", "accessory"), row("a2", "accessory")]);

    await click(document.querySelector<HTMLElement>('[aria-label="Select Product a1"]')!);
    expect(selectedCount()).toBe("1");
    await goToPage(2);
    await requests[1].answer([row("a3", "accessory")]);    expect(selectedCount()).toBeNull();

    await click(document.querySelector<HTMLElement>('[aria-label="Select Product a3"]')!);
    expect(selectedCount()).toBe("1");
    await choose(TYPE, "all");
    expect(selectedCount()).toBeNull();
    expect(requests.at(-1)!.params.get("page")).toBe("1");
  });

  it("sends one request, for page 1, when the type changes on page 3", async () => {
    await goToPage(3);
    await requests[0].answer([row("p3-a")]);
    await choose(TYPE, "bolster");
    expect(requests.slice(1).map((r) => `${r.params.get("page")}:${r.params.get("product_type")}`)).toEqual(["1:bolster"]);
  });
});
