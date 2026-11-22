// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Coupon as ListCoupon } from "../discounts-client";
import type { Coupon, DiscountEditorInitialData } from "../[id]/discount-editor-client";

const route = vi.hoisted(() => ({ id: "c1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => `/en-US/settings/discounts/${route.id}`,
  useParams: () => ({ lang: "en-US", id: route.id }),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("../points-settings-card", () => ({ PointsSettingsCard: () => null }));

const { DiscountsClient } = await import("../discounts-client");
const { DiscountEditorClient } = await import("../[id]/discount-editor-client");

const listCoupon: ListCoupon = {
  id: "c1",
  code: "SAVE20",
  discount_type: "percentage",
  discount_value: 20,
  currency: "SGD",
  usage_count: 3,
  usage_limit: null,
  is_active: true,
  starts_at: null,
  expires_at: null,
  created_at: "2026-11-01T00:00:00Z",
};
const coupon: Coupon = {
  id: "c1",
  code: "SAVE20",
  discount_type: "percentage",
  discount_value: 20,
  currency: "SGD",
  min_order_amount: null,
  max_discount: null,
  usage_limit: null,
  usage_count: 3,
  per_customer_limit: null,
  starts_at: null,
  expires_at: null,
  applies_to: null,
  is_active: true,
};
const editorData = (row: Coupon | null): DiscountEditorInitialData => ({
  coupon: row ? { ok: true, row } : null,
  products: { ok: true, rows: [], total: 0, page: 1, limit: 100 },
  categories: { ok: true, rows: [] },
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  route.id = "c1";
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.startsWith("/api/shop/coupons/")
        ? { ok: true, row: { ...coupon, code: "FROMAPI" } }
        : url.startsWith("/api/shop/coupons")
          ? { ok: true, rows: [{ ...listCoupon, code: "FROMAPI" }], total: 1 }
          : { ok: true, rows: [] },
  }));
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async (node: ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
};
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const codeField = () => host.querySelector<HTMLInputElement>("input#code")!;

describe("Discounts list", () => {
  it("fetches nothing on mount in Strict Mode when the server sent the coupons", async () => {
    await mount(
      <StrictMode>
        <DiscountsClient initialData={{ coupons: { ok: true, rows: [listCoupon], total: 1, page: 1, limit: 100 } }} />
      </StrictMode>,
    );
    expect(urls()).toEqual([]);
    expect(host.textContent).toContain("SAVE20");
  });

  it("fetches the coupons on mount when the server read failed", async () => {
    await mount(<DiscountsClient />);
    expect(urls()).toEqual(["/api/shop/coupons?limit=100"]);
    expect(host.textContent).toContain("FROMAPI");
    expect(host.querySelector(".animate-spin")).toBeNull();
  });

  it("shows an empty list, not a spinner, when that fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await mount(<DiscountsClient />);
    expect(host.querySelector(".animate-spin")).toBeNull();
    expect(host.textContent).toContain("No discount codes yet.");
  });
});

describe("Discount editor", () => {
  it("fetches nothing on mount in Strict Mode when the server sent the coupon", async () => {
    await mount(
      <StrictMode>
        <DiscountEditorClient initialData={editorData(coupon)} />
      </StrictMode>,
    );
    expect(urls()).toEqual([]);
    expect(codeField().value).toBe("SAVE20");
  });

  it("fetches nothing on mount for a new discount", async () => {
    route.id = "new";
    await mount(
      <StrictMode>
        <DiscountEditorClient initialData={editorData(null)} />
      </StrictMode>,
    );
    expect(urls()).toEqual([]);
    expect(codeField().value).toBe("");
  });

  it("fetches only the catalog for a new discount when the server read failed", async () => {
    route.id = "new";
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/shop/coupons/") ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, json: async () => ({ ok: true, rows: [] }) },
    );
    await mount(<DiscountEditorClient />);
    expect(urls().sort()).toEqual(["/api/shop/categories", "/api/shop/products?limit=100"]);
    expect(host.textContent).not.toContain("Couldn't load the discount.");
    expect(codeField().value).toBe("");
  });

  it("fetches the coupon and the catalog on mount when the server read failed", async () => {
    await mount(<DiscountEditorClient />);
    expect(urls().sort()).toEqual(["/api/shop/categories", "/api/shop/coupons/c1", "/api/shop/products?limit=100"]);
    expect(codeField().value).toBe("FROMAPI");
  });

  it("says so, and stops the spinner, when that fetch fails", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/shop/coupons/") ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, json: async () => ({ ok: true, rows: [] }) },
    );
    await mount(<DiscountEditorClient />);
    expect(host.querySelector(".animate-spin")).toBeNull();
    expect(host.textContent).toContain("Couldn't load the discount.");
  });
});
