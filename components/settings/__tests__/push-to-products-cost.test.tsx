// @vitest-environment jsdom
import { until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InventoryFamily } from "@/lib/ecommerce/inventory-families";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/inventory",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { PushToProductsDialog } = await import("../push-to-products-dialog");

const family = (costCents: number | null): InventoryFamily => ({
  key: "cover\u0000Silk",
  category: "cover",
  name: "Silk",
  title: "Silk Cover",
  sizes: [{ itemId: 1, size: "M", costCents, msrpCents: 3900, productId: null }],
  push: "new",
  productId: null,
  productSlug: null,
  productStatus: null,
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function open(f: InventoryFamily, canSeeCost: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<PushToProductsDialog family={f} open onOpenChange={() => {}} canSeeCost={canSeeCost} />));
  return until(() => document.querySelector<HTMLElement>('[role="dialog"]'));
}

const headers = (dialog: HTMLElement) => [...dialog.querySelectorAll("th")].map((th) => th.textContent);

describe("Push to Products price check", () => {
  it("shows no cost or margin to a role without costings, and lets it check the MSRP", async () => {
    const dialog = await open(family(null), false);
    expect(headers(dialog)).toEqual(["Size", "MSRP"]);
    expect(dialog.textContent).not.toMatch(/a cost|below cost|Not set/);
    expect(dialog.textContent).toContain("I've checked these prices");
  });

  it("shows cost and margin to a role with costings, as before", async () => {
    const dialog = await open(family(1250), true);
    expect(headers(dialog)).toEqual(["Size", "Cost", "MSRP", "Margin"]);
    expect(dialog.textContent).toMatch(/12\.50/);
    expect(dialog.textContent).toContain("68%");
  });
});
