// @vitest-environment jsdom
import { click, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedProduct } from "../product-editor-client";

vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "en-US", id: "p1" }),
  usePathname: () => "/en-US/settings/products/p1",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: () => {} }),
}));
vi.mock("sonner", () => ({ toast: { message: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/image-picker", () => ({ ImagePicker: () => null }));
vi.mock("@/components/markdown-editor/markdown-editor", () => ({ MarkdownEditor: () => null }));
vi.mock("../seo-card", () => ({ SeoCard: () => null }));

const { ProductEditorClient } = await import("../product-editor-client");

const product = {
  id: "p1",
  slug: "travel-pouch",
  status: "draft",
  product_type: "accessory",
  category_id: null,
  tags: [],
  featured: false,
  is_auto_generated: false,
  content: { "en-US": { title: "Travel Pouch", description: "", body: "", seo_title: "", seo_description: "" } },
  product_variants: [],
  product_images: [],
} as unknown as LoadedProduct;

const fetchMock = vi.fn(async (url: string) => ({
  ok: true,
  json: async () => (url.includes("/variants") ? { ok: true, row: { id: "v9", title: null, price: 0 } } : { ok: true, row: product }),
}));

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const buttons = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent?.trim() === text);
const variantDialog = () =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.querySelector("h2")?.textContent === "Add variant") ?? null;

async function addVariant(canSeeCost: boolean) {
  await act(async () =>
    root!.render(
      <ProductEditorClient
        initialData={{ product: { ok: true, row: product } }}
        categories={[]}
        stripeMode="test"
        canSeeCost={canSeeCost}
      />,
    ),
  );
  await click(buttons("Add variant")[0]!);
  const dialog = await until(variantDialog);
  const hasCostInput = dialog.querySelector("#vf-cost") !== null;
  await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add variant")!);
  await until(() => fetchMock.mock.calls.find(([url]) => String(url).endsWith("/variants")));
  const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/variants"))! as unknown as [string, RequestInit];
  return { hasCostInput, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

describe("Product editor variant cost", () => {
  it("has no cost input and sends no cost_price for a role without costings", async () => {
    const { hasCostInput, body } = await addVariant(false);
    expect(hasCostInput).toBe(false);
    expect(body).not.toHaveProperty("cost_price");
  });

  it("has the cost input and sends cost_price for a role with costings, as before", async () => {
    const { hasCostInput, body } = await addVariant(true);
    expect(hasCostInput).toBe(true);
    expect(body).toHaveProperty("cost_price", null);
  });
});
