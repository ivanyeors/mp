// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { typeField } from "@/components/block-editor/__tests__/dom";
import type { LoadedProduct } from "../product-editor-client";

const nav = vi.hoisted(() => ({ id: "p1", replace: vi.fn(), push: vi.fn() }));
const toast = vi.hoisted(() => ({ message: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "en-US", id: nav.id }),
  usePathname: () => `/en-US/settings/products/${nav.id}`,
  useRouter: () => ({ replace: nav.replace, push: nav.push, refresh: () => {} }),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/image-picker", () => ({ ImagePicker: () => null }));
vi.mock("@/components/markdown-editor/markdown-editor", () => ({ MarkdownEditor: () => null }));
vi.mock("../seo-card", () => ({ SeoCard: ({ slug }: { slug: string }) => <output data-slug={slug} /> }));

const { ProductEditorClient } = await import("../product-editor-client");

const product = {
  id: "p1",
  slug: "cloud-pillow",
  status: "draft",
  product_type: "pillow",
  category_id: null,
  tags: [],
  featured: false,
  is_auto_generated: false,
  stripe_payment_link: null,
  content: { "en-US": { title: "Cloud Pillow", description: "", body: "", seo_title: "", seo_description: "" } },
  product_variants: [],
  product_images: [],
} as unknown as LoadedProduct;

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  nav.replace.mockClear();
  toast.message.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, row: product }) })));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

const slug = () => host.querySelector("[data-slug]")?.getAttribute("data-slug");

describe("Product editor slug", () => {
  it("keeps an existing product's slug when its title changes", async () => {
    nav.id = "p1";
    await act(async () =>
      root!.render(<ProductEditorClient initialData={{ product: { ok: true, row: product } }} categories={[]} stripeMode="test" />),
    );
    expect(slug()).toBe("cloud-pillow");
    typeField(host.querySelector<HTMLInputElement>("#title-en-US")!, "Cloud Pillow Two");
    expect(host.querySelector<HTMLInputElement>("#title-en-US")!.value).toBe("Cloud Pillow Two");
    expect(slug()).toBe("cloud-pillow");
  });

  it("keeps the slug the server read when the page had no product", async () => {
    nav.id = "p1";
    await act(async () => root!.render(<ProductEditorClient categories={[]} stripeMode="test" />));
    expect(slug()).toBe("cloud-pillow");
    typeField(host.querySelector<HTMLInputElement>("#title-en-US")!, "Cloud Pillow Two");
    expect(slug()).toBe("cloud-pillow");
  });

  it("sends the retired new-product address back to the list with a note", async () => {
    nav.id = "new";
    await act(async () => root!.render(<ProductEditorClient categories={[]} stripeMode="test" />));
    expect(toast.message).toHaveBeenCalledWith("Products come from inventory. Use Sync from Inventory on the Products page.");
    expect(nav.replace).toHaveBeenCalledWith("../products");
  });
});
