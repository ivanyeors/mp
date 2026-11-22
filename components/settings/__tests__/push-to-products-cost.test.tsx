// @vitest-environment jsdom
import { click, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FamilySize, InventoryFamily } from "@/lib/ecommerce/inventory-families";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/inventory",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { PushToProductsDialog } = await import("../push-to-products-dialog");

const family = (...sizes: Array<Partial<FamilySize>>): InventoryFamily => ({
  key: "cover\u0000Silk",
  category: "cover",
  name: "Silk",
  title: "Silk Cover",
  sizes: sizes.map((s, i) => ({ itemId: i + 1, size: ["M", "L"][i]!, costCents: null, msrpCents: 3900, productId: null, ...s })),
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
const pushButton = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Push to Products")!;
const checkbox = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('[role="checkbox"]');

describe("Push to Products price check for a role without costings", () => {
  it("shows no cost or margin, and pushes once the MSRP is checked when every size has a cost", async () => {
    const dialog = await open(family({ costHidden: true }), false);
    expect(headers(dialog)).toEqual(["Size", "MSRP"]);
    expect(dialog.textContent).not.toMatch(/a cost|below cost|Not set|Waiting on Costings/);
    expect(pushButton(dialog).disabled).toBe(true);
    await click(checkbox(dialog)!);
    expect(pushButton(dialog).disabled).toBe(false);
  });

  it("waits on Costings, with the push off, when a size has no cost yet", async () => {
    const dialog = await open(family({ costHidden: true }, {}), false);
    expect(dialog.textContent).toContain("Waiting on Costings");
    expect(dialog.textContent).toContain(
      "A size isn't priced in Costings yet. Someone with Costings access needs to add a cost.",
    );
    expect(dialog.textContent).not.toContain("Ready for Products");
    expect(checkbox(dialog)).toBeNull();
    expect(pushButton(dialog).disabled).toBe(true);
    expect(dialog.querySelector('a[href*="/settings/costings"]')).toBeNull();
  });
});

describe("Push to Products price check for a role with costings, as before", () => {
  it("shows cost and margin", async () => {
    const dialog = await open(family({ costCents: 1250 }), true);
    expect(headers(dialog)).toEqual(["Size", "Cost", "MSRP", "Margin"]);
    expect(dialog.textContent).toMatch(/12\.50/);
    expect(dialog.textContent).toContain("68%");
  });

  it("sends a size with no cost to Costings", async () => {
    const dialog = await open(family({ costCents: 1250 }, { costCents: null }), true);
    expect(dialog.textContent).toContain("1 of 2 sizes need a cost and MSRP in Costings before this goes to Products.");
    expect(dialog.querySelector('a[href*="/settings/costings"]')?.textContent).toBe("Add cost in Costings");
    expect(dialog.textContent).not.toContain("Waiting on Costings");
    expect(pushButton(dialog).disabled).toBe(true);
  });
});
