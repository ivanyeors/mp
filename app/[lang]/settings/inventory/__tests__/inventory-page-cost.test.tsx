// @vitest-environment jsdom
import { click, settle, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CostingPrices, FamilySize, InventoryFamily } from "@/lib/ecommerce/inventory-families";

type Row = Record<string, unknown>;
type CostingState = { canSeeCost: boolean; prices: Record<number, CostingPrices>; families: InventoryFamily[] };

const coverFamily = (name: string, size: FamilySize): InventoryFamily => ({
  key: `cover\u0000${name}`,
  category: "cover",
  name,
  title: `${name} Cover`,
  sizes: [size],
  push: "new",
  productId: null,
  productSlug: null,
  productStatus: null,
});

const h = vi.hoisted(() => ({ costing: null as CostingState | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/inventory",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }),
}));
vi.mock("@/components/settings/push-to-products-dialog", () => ({ PushToProductsDialog: () => null }));
vi.mock("@/components/ui/image-picker", () => ({ ImagePicker: () => null }));
vi.mock("../actions", () => ({
  sellPart: vi.fn(),
  receiveStock: vi.fn(),
  sellCart: vi.fn(),
  listTemplates: vi.fn(async () => ({ templates: [] })),
  listFillingTemplates: vi.fn(async () => ({ templates: [] })),
  addInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
  renameInventoryItem: vi.fn(),
  setItemsPrimaryImage: vi.fn(),
  getItemImageUrls: vi.fn(async () => ({})),
  setComposedProductImage: vi.fn(),
  getComposedProductImageUrls: vi.fn(async () => ({})),
  getInventoryCostingState: vi.fn(async () => h.costing),
}));
vi.mock("@/lib/supabase/client", () => {
  const item = (id: number, name: string, size: string) => ({
    id,
    category: "cover",
    name,
    size,
    subtype: null,
    alteration_of_item_id: null,
    alteration_name: null,
  });
  const tables: Record<string, Row[]> = {
    items: [item(1, "Silk", "M"), item(2, "Satin", "S")],
    inventory_balances: [
      { item_id: 1, on_hand: 50 },
      { item_id: 2, on_hand: 50 },
    ],
    pillow_products: [],
    bom_lines: [],
    bolster_bom_lines: [],
  };
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: structuredClone(tables[table] ?? []), error: null }).then(resolve, reject),
    };
    return builder;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabaseClient: { from, channel: () => channel, removeChannel: () => undefined } };
});

const { default: InventoryPage } = await import("../page");

let root: Root | null = null;
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
});

async function mountWith(costing: CostingState) {
  h.costing = costing;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<InventoryPage />));
  await until(() => coversTile()?.textContent?.includes("need") ? true : null);
}

const coversTile = () =>
  [...document.querySelectorAll<HTMLElement>('[role="button"]')].find((el) => el.textContent?.startsWith("Covers")) ?? null;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label) ?? null;
const sheetTitled = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.querySelector("h2")?.textContent === title) ?? null;

async function openAddItem() {
  await click(button("Add inventory item")!);
  return until(() => sheetTitled("Add inventory item"));
}
async function openCovers() {
  await click(coversTile()!);
  return until(() => sheetTitled("Covers"));
}

const buttonIn = (root: ParentNode, label: string) =>
  root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe("Inventory for a role with inventory but not costings", () => {
  const hidden: CostingState = {
    canSeeCost: false,
    prices: { 1: { costCents: null, msrpCents: 3900, costHidden: true }, 2: { costCents: null, msrpCents: 4200 } },
    families: [
      coverFamily("Silk", { itemId: 1, size: "M", costCents: null, msrpCents: 3900, costHidden: true, productId: null }),
      coverFamily("Satin", { itemId: 2, size: "S", costCents: null, msrpCents: 4200, productId: null }),
    ],
  };

  it("has no cost price input when adding an item, only the MSRP", async () => {
    await mountWith(hidden);
    const sheet = await openAddItem();
    expect(sheet.querySelector("#add-item-cost-0")).toBeNull();
    expect(sheet.textContent).not.toContain("Cost price");
    expect(sheet.querySelector("#add-item-msrp-0")).not.toBeNull();
  });

  it("shows no cost figure, only which item still needs one, and no Costings link", async () => {
    await mountWith(hidden);
    expect(coversTile()!.textContent).toContain("1 needs a cost");
    const drawer = await openCovers();
    expect(drawer.textContent).toMatch(/MSRP \S*39\.00/);
    expect(drawer.textContent).toContain("Needs a cost in Costings");
    expect(drawer.textContent).not.toMatch(/Cost \S*\d/);
    expect(drawer.querySelector('[aria-label^="Add cost for"]')).toBeNull();
  });

  it("can push a family whose sizes all have a cost, and sees one with no cost waiting on Costings", async () => {
    await mountWith(hidden);
    const drawer = await openCovers();
    expect(buttonIn(drawer, "Push Silk to Products")?.disabled).toBe(false);
    const satinPush = buttonIn(drawer, "Push Satin to Products")!;
    expect(satinPush.disabled).toBe(true);
    const satinBar = satinPush.parentElement!;
    expect(satinBar.textContent).toContain("Waiting on Costings");
    expect(satinBar.textContent).toContain(
      "A size isn't priced in Costings yet. Someone with Costings access needs to add a cost.",
    );
    expect(satinBar.textContent).not.toContain("Ready for Products");
  });
});

describe("Inventory for a role with costings keeps today's view", () => {
  const visible: CostingState = {
    canSeeCost: true,
    prices: { 1: { costCents: 1250, msrpCents: 3900 }, 2: { costCents: null, msrpCents: null } },
    families: [
      coverFamily("Silk", { itemId: 1, size: "M", costCents: 1250, msrpCents: 3900, productId: null }),
      coverFamily("Satin", { itemId: 2, size: "S", costCents: null, msrpCents: null, productId: null }),
    ],
  };

  it("has the cost price input when adding an item", async () => {
    await mountWith(visible);
    const sheet = await openAddItem();
    expect(sheet.querySelector("#add-item-cost-0")).not.toBeNull();
  });

  it("shows each item's cost and what is missing", async () => {
    await mountWith(visible);
    expect(coversTile()!.textContent).toContain("1 needs a cost");
    const drawer = await openCovers();
    expect(drawer.textContent).toMatch(/Cost \S*12\.50/);
    expect(drawer.textContent).toContain("Needs a cost and an MSRP in Costings");
    expect(drawer.querySelector('[aria-label^="Add cost for"]')).not.toBeNull();
    expect(buttonIn(drawer, "Push Silk to Products")?.disabled).toBe(false);
    expect(buttonIn(drawer, "Push Satin to Products")).toBeNull();
    expect(drawer.textContent).not.toContain("Waiting on Costings");
  });
});
