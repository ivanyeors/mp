// @vitest-environment jsdom
import { settle } from "@/components/block-editor/__tests__/dom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../shopify-client";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  supabaseClient: { from: (table: string) => (read(table), { select: () => ({ eq: async () => ({ data: [] }) }) }) },
}));
vi.mock("../../../inventory/actions", () => ({ fullShopifySync: vi.fn() }));
vi.mock("../../../inventory/ShopifyAdminPanel", () => ({
  default: ({ items }: { items: Item[] }) => <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: ShopifyAdminPage } = await import("../shopify-client");

const items: Item[] = [
  { id: 1, category: "pillow", subtype: null, name: "Mpillow Basic", size: "M", alteration_of_item_id: null },
];

let root: Root | null = null;
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  read.mockClear();
});

describe("Shopify link page mount", () => {
  it("reads nothing in the browser on mount in Strict Mode and lists the server's items", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <StrictMode>
          <ShopifyAdminPage initialData={items} />
        </StrictMode>,
      ),
    );
    await settle();
    expect(read).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Mpillow Basic");
  });
});
