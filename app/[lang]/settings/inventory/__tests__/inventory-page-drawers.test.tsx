// @vitest-environment jsdom
import { click, press, settle, typeField, until } from "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Pending = { table: string; filters: Row; answer: (rows: Row[]) => void };

const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, pending: [] as Pending[] }));
const { sellCart } = vi.hoisted(() => ({ sellCart: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/inventory",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }),
}));
vi.mock("@/components/settings/push-to-products-dialog", () => ({ PushToProductsDialog: () => null }));
vi.mock("@/components/ui/image-picker", () => ({ ImagePicker: () => null }));
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
vi.mock("../actions", () => ({
  sellPart: vi.fn(),
  receiveStock: vi.fn(),
  sellCart,
  listTemplates: vi.fn(async () => ({ templates: [] })),
  listFillingTemplates: vi.fn(async () => ({ templates: [] })),
  addInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
  renameInventoryItem: vi.fn(),
  setItemsPrimaryImage: vi.fn(),
  getItemImageUrls: vi.fn(async () => ({})),
  setComposedProductImage: vi.fn(),
  getComposedProductImageUrls: vi.fn(async () => ({})),
  getInventoryCostingState: vi.fn(async () => ({ prices: {}, families: [] })),
}));
vi.mock("@/lib/supabase/client", () => {
  const from = (table: string) => {
    const filters: Row = {};
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const keyed = Object.keys(filters).some((k) => k !== "is_active");
        const answered = keyed
          ? new Promise((done) => db.pending.push({ table, filters, answer: (rows) => done({ data: rows, error: null }) }))
          : Promise.resolve({ data: structuredClone(db.tables[table] ?? []), error: null });
        return answered.then(resolve, reject);
      },
    };
    return builder;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabaseClient: { from, channel: () => channel, removeChannel: () => undefined } };
});

const { default: InventoryPage } = await import("../page");

const item = (id: number, category: string, name: string, size: string | null, subtype: string | null = null) => ({
  id,
  category,
  name,
  size,
  subtype,
  alteration_of_item_id: null,
  alteration_name: null,
});
const SILK = item(1, "cover", "Silk", "M");
const SATIN = item(2, "cover", "Satin", "S");
const HOLLOW = item(3, "filling", "Hollow", null, "6D (L)");
const VACUUM = item(4, "packaging", "Vacuum", "S");
const VELVET = item(5, "cover", "Velvet", "M");

const BOM: Record<string, Row[]> = {
  M: [{ item_id: 1, quantity: 1 }, { item_id: 3, quantity: 2 }, { item_id: 4, quantity: 1 }],
  S: [{ item_id: 2, quantity: 1 }, { item_id: 3, quantity: 5 }],
  short: [{ item_id: 3, quantity: 3 }],
  medium: [{ item_id: 3, quantity: 4 }],
  long: [{ item_id: 3, quantity: 8 }],
};
const PRODUCT_SIZE: Record<number, string> = { 10: "M", 11: "S" };

let root: Root | null = null;
beforeEach(async () => {
  sellCart.mockReset();
  db.pending = [];
  db.tables = {
    items: [SILK, SATIN, HOLLOW, VACUUM],
    inventory_balances: [1, 2, 3, 4, 5].map((id) => ({ item_id: id, on_hand: 50 })),
    pillow_products: [
      { id: 10, size: "M", kind: "basic" },
      { id: 11, size: "S", kind: "basic" },
    ],
    bom_lines: [],
    bolster_bom_lines: [],
  };
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<InventoryPage />));
  await until(() => tile("Custom pillow"));
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
});

function tile(startsWith: string) {
  return [...document.querySelectorAll<HTMLElement>('[role="button"]')].find((el) => el.textContent?.startsWith(startsWith)) ?? null;
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const dialogTitled = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.querySelector("h2")?.textContent === title) ?? null;
function qtyInput(name: string) {
  const row = [...(dialog()?.querySelectorAll("tr") ?? [])].find((tr) => tr.querySelector("td")?.textContent?.includes(name));
  return row?.querySelector<HTMLInputElement>("input") ?? null;
}
const qtyOf = (name: string) => qtyInput(name)?.value ?? null;
const buttonIn = (root: ParentNode | null, text: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text) ?? null;

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function linesFor(p: Pending) {
  if (p.table === "bom_lines") return BOM[PRODUCT_SIZE[Number(p.filters.product_id)]];
  return BOM[String(p.filters.variant)];
}
const key = (p: Pending) => (p.table === "bom_lines" ? PRODUCT_SIZE[Number(p.filters.product_id)] : String(p.filters.variant));
async function answerOne(which: string) {
  const at = db.pending.findIndex((p) => key(p) === which);
  expect(at, `no pending read for ${which}`).toBeGreaterThanOrEqual(0);
  const [p] = db.pending.splice(at, 1);
  await act(async () => p.answer(linesFor(p)));
  await settle();
}
async function answerAll() {
  while (db.pending.length) await answerOne(key(db.pending[0]));
}

async function realtimeReload(nextItems?: Row[]) {
  if (nextItems) db.tables.items = nextItems;
  act(() => void window.dispatchEvent(new Event("inventory:changed")));
  await settle(450);
}

async function openCustomPillow() {
  await click(tile("Custom pillow")!);
  await answerOne("M");
  await until(() => (qtyOf("Hollow") === "2" ? true : null));
}

describe("Inventory custom pillow drawer", () => {
  it("keeps an edited part quantity when another change reloads the page in the background", async () => {
    await openCustomPillow();
    typeField(qtyInput("Hollow")!, "7");
    expect(qtyOf("Hollow")).toBe("7");

    await realtimeReload();
    await answerAll();

    expect(qtyOf("Hollow")).toBe("7");
  });

  it("shows the size picked last when an older size's parts answer after it", async () => {
    await openCustomPillow();
    const size = dialog()!.querySelector("select")!;
    await choose(size, "S");
    await choose(size, "M");
    await answerOne("M");
    await answerOne("S");

    expect(size.value).toBe("M");
    expect(qtyOf("Silk")).toBe("1");
    expect(qtyOf("Hollow")).toBe("2");
  });

  it("loads the size's parts each time it opens", async () => {
    await openCustomPillow();
    typeField(qtyInput("Hollow")!, "7");
    press("Escape");
    await settle();
    expect(dialog()).toBeNull();

    await click(tile("Custom pillow")!);
    await answerOne("M");
    expect(qtyOf("Hollow")).toBe("2");
  });
});

describe("Inventory custom bolster drawer", () => {
  it("shows the length picked last when an older length's parts answer after it", async () => {
    await click(tile("Custom bolster")!);
    await answerOne("medium");
    expect(qtyOf("Hollow")).toBe("4");
    const variant = dialog()!.querySelector("select")!;
    await choose(variant, "short");
    await choose(variant, "long");
    await answerOne("long");
    await answerOne("short");

    expect(variant.value).toBe("long");
    expect(qtyOf("Hollow")).toBe("8");
  });
});

describe("Inventory custom drawers while the next parts load", () => {
  const qtyField = () => [...dialog()!.querySelectorAll<HTMLInputElement>("input")].find((i) => i.placeholder === "Qty")!;
  const cartCount = () => /Cart \((\d+)\)/.exec(buttonIn(document.body, "Open cart")!.textContent ?? "")?.[1];

  it("does not sell the previous size's parts while the picked size's parts load", async () => {
    await openCustomPillow();
    typeField(qtyField(), "1");
    await choose(dialog()!.querySelector("select")!, "S");

    await click(buttonIn(dialog(), "Sell")!);
    expect(sellCart).not.toHaveBeenCalled();
    expect(buttonIn(dialog(), "Sell")!.disabled).toBe(true);
    expect(qtyInput("Hollow")).toBeNull();

    await answerOne("S");
    await click(buttonIn(dialog(), "Sell")!);
    expect(sellCart.mock.calls.map(([arg]) => (arg as { parts: unknown }).parts)).toEqual([
      [{ itemId: 2, quantity: 1 }, { itemId: 3, quantity: 5 }],
    ]);
  });

  it("does not add the previous length's parts to the cart while the picked length's parts load", async () => {
    await click(tile("Custom bolster")!);
    await answerOne("medium");
    typeField(qtyField(), "1");
    await choose(dialog()!.querySelector("select")!, "long");

    await click(buttonIn(dialog(), "Add to cart")!);
    expect(cartCount()).toBe("0");
    expect(buttonIn(dialog(), "Add to cart")!.disabled).toBe(true);

    await answerOne("long");
    await click(buttonIn(dialog(), "Add to cart")!);
    expect(cartCount()).toBe("8");
  });
});

describe("Inventory part drawer", () => {
  it("follows a reload of its group and closes when the group empties, without reopening when it returns", async () => {
    await click(tile("Covers")!);
    expect(dialogTitled("Covers")?.textContent).toContain("Silk");
    expect(dialogTitled("Covers")?.textContent).not.toContain("Velvet");

    await realtimeReload([SILK, SATIN, HOLLOW, VACUUM, VELVET]);
    expect(dialogTitled("Covers")?.textContent).toContain("Velvet");

    await realtimeReload([HOLLOW, VACUUM]);
    expect(dialogTitled("Covers")).toBeNull();

    await realtimeReload([SILK, SATIN, HOLLOW, VACUUM]);
    expect(dialogTitled("Covers")).toBeNull();
  });

  it("follows a reload in the All Parts drawer", async () => {
    await click(tile("All Parts")!);
    expect(dialogTitled("Custom parts")?.textContent).not.toContain("Velvet");
    await realtimeReload([SILK, SATIN, HOLLOW, VACUUM, VELVET]);
    expect(dialogTitled("Custom parts")?.textContent).toContain("Velvet");
  });
});

describe("Inventory cart sale id", () => {
  async function addCustomPillowToCart() {
    await openCustomPillow();
    const qty = [...dialog()!.querySelectorAll<HTMLInputElement>("input")].find((i) => i.placeholder === "Qty")!;
    typeField(qty, "1");
    await click(buttonIn(dialog(), "Add to cart")!);
    press("Escape");
    await settle();
  }
  async function sell() {
    await click(buttonIn(dialogTitled("Selected items"), "Sell")!);
    await settle();
  }
  const saleIds = () => sellCart.mock.calls.map(([arg]) => (arg as { saleId: string }).saleId);

  it("retries a failed sale of the same cart with the same id and gives a changed cart a new one", async () => {
    sellCart.mockRejectedValueOnce(new Error("Network")).mockRejectedValueOnce(new Error("Network"));
    sellCart.mockResolvedValue({ alreadySold: false });
    await addCustomPillowToCart();
    await click(buttonIn(document.body, "Open cart")!);

    await sell();
    await sell();
    expect(saleIds()).toHaveLength(2);
    expect(saleIds()[1]).toBe(saleIds()[0]);

    await click(buttonIn(dialogTitled("Selected items"), "Undo")!);
    await sell();
    expect(saleIds()).toHaveLength(3);
    expect(saleIds()[2]).not.toBe(saleIds()[0]);
    await until(() => (dialogTitled("Selected items") ? null : true));

    await addCustomPillowToCart();
    await click(buttonIn(document.body, "Open cart")!);
    await sell();
    expect(saleIds()).toHaveLength(4);
    expect(new Set(saleIds()).size).toBe(3);
  });
});

describe("Inventory add drawer", () => {
  it("starts each opening with one blank entry and no error", async () => {
    await click(buttonIn(document.body, "Add inventory item")!);
    await click(buttonIn(dialog(), "Add more")!);
    typeField(document.querySelector<HTMLInputElement>("#add-item-name-0")!, "");
    await act(async () => void dialog()!.querySelector("form")!.requestSubmit());
    expect(dialog()!.textContent).toContain("Item 1: Name is required");
    expect(document.querySelector("#add-item-name-1")).not.toBeNull();

    press("Escape");
    await settle();
    expect(dialog()).toBeNull();

    await click(buttonIn(document.body, "Add inventory item")!);
    expect(document.querySelector<HTMLInputElement>("#add-item-name-0")!.value).toBe("cover");
    expect(document.querySelector("#add-item-name-1")).toBeNull();
    expect(dialog()!.textContent).not.toContain("Name is required");
  });
});
