// @vitest-environment jsdom
import { settle } from "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Pending = { key: string; answer: (names: string[]) => Promise<void> };
const { pending, listTemplates } = vi.hoisted(() => {
  const pending: Pending[] = [];
  let nextId = 1;
  const listTemplates = vi.fn(
    (kind: string, key: string, pillowKind?: string) =>
      new Promise((resolve) => {
        pending.push({
          key: [kind, key, pillowKind].filter(Boolean).join(":"),
          answer: async (names) => {
            await act(async () => resolve({ templates: names.map((name) => ({ id: nextId++, name })) }));
          },
        });
      }),
  );
  return { pending, listTemplates };
});

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock("../actions", () => ({
  listShopifyRemoteProducts: vi.fn(async () => ({ ok: true, rows: [], variants: [] })),
  listTemplates,
  upsertShopifyVariantOverride: vi.fn(),
  deleteShopifyVariantOverride: vi.fn(),
  linkPartToShopifyVariant: vi.fn(),
  linkPillowToShopifyVariant: vi.fn(),
  linkBolsterToShopifyVariant: vi.fn(),
  deleteShopifyMapping: vi.fn(),
}));

const { default: ShopifyAdminPanel } = await import("../ShopifyAdminPanel");

let root: Root | null = null;
beforeEach(async () => {
  pending.length = 0;
  listTemplates.mockClear();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<ShopifyAdminPanel items={[]} />));
  await settle();
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
});

const [KIND, SUB, SIZE, TEMPLATE] = [0, 1, 2, 3];
const select = (which: number) => document.querySelectorAll("select")[which];
const options = (which: number) => [...select(which).querySelectorAll("option")].filter((o) => o.value).map((o) => o.textContent);
async function choose(which: number, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(which), value);
    select(which).dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function answer(key: string, names: string[]) {
  const at = pending.findIndex((p) => p.key === key);
  expect(at, `no pending listTemplates for ${key}`).toBeGreaterThanOrEqual(0);
  const [p] = pending.splice(at, 1);
  await p.answer(names);
  await settle();
}

describe("ShopifyAdminPanel link templates", () => {
  it("lists the size picked last when an older size's templates answer after it", async () => {
    await choose(KIND, "pillow");
    await choose(SIZE, "L");
    await answer("pillow:L:basic", ["Large standard"]);
    await answer("pillow:M:basic", ["Medium standard"]);

    expect(select(SIZE).value).toBe("L");
    expect(options(TEMPLATE)).toEqual(["Large standard"]);
  });

  it("starts each mapping type on a default size or length and clears the chosen template when the selection changes", async () => {
    await choose(KIND, "bolster");
    expect(select(SUB).value).toBe("medium");
    await answer("bolster:medium", ["Medium bolster"]);
    await choose(TEMPLATE, select(TEMPLATE).querySelector<HTMLOptionElement>("option[value]:not([value=''])")!.value);
    expect(select(TEMPLATE).value).not.toBe("");

    await choose(SUB, "long");
    expect(select(TEMPLATE).value).toBe("");
    await answer("bolster:long", ["Long bolster"]);

    await choose(KIND, "pillow");
    expect(select(SIZE).value).toBe("M");
    await answer("pillow:M:basic", ["Medium standard"]);
    await choose(TEMPLATE, select(TEMPLATE).querySelector<HTMLOptionElement>("option[value]:not([value=''])")!.value);
    await choose(SUB, "premium");
    expect(select(TEMPLATE).value).toBe("");
    await answer("pillow:M:premium", ["Medium premium"]);
    expect(options(TEMPLATE)).toEqual(["Medium premium"]);

    await choose(KIND, "part");
    expect(select(TEMPLATE).value).toBe("");
    expect(listTemplates).toHaveBeenCalledTimes(4);
  });
});
