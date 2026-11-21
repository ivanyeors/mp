// @vitest-environment jsdom
import { click, settle } from "@/components/block-editor/__tests__/dom";
import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: number; category: string; name: string; msrp: string };
type Load = { answer: (items: Item[]) => Promise<void> };

const db = vi.hoisted(() => ({ loads: [] as Load[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/costings",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => {
  let current: { tables: Map<string, (data: unknown[]) => void> } | null = null;
  const from = (table: string) => {
    if (table === "items") {
      const tables = new Map<string, (data: unknown[]) => void>();
      current = { tables };
      const group = current;
      db.loads.push({
        answer: async (items) => {
          const rows = items.map(({ id, category, name, msrp }) => ({
            id,
            category,
            name,
            size: null,
            subtype: null,
            price_family: null,
            pricing: [{ cost_price: "5.00", msrp, compare_at_price: null }],
          }));
          const { act: reactAct } = await import("react");
          await reactAct(async () => {
            for (const [name, resolve] of group.tables) resolve(name === "items" ? rows : []);
          });
        },
      });
    }
    let resolve!: (data: unknown[]) => void;
    const promise = new Promise<{ data: unknown[]; error: null }>((r) => {
      resolve = (data) => r({ data, error: null });
    });
    current!.tables.set(table, resolve);
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) => promise.then(onFulfilled, onRejected),
    };
    return query;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabaseClient: { from, channel: () => channel, removeChannel: () => {} } };
});

const SelectContext = createContext<(value: string) => void>(() => {});
vi.mock("@/components/ui/select", () => ({
  Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: ReactNode }) => (
    <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div data-testid="filter-options">{children}</div>,
  SelectItem: function SelectItem({ value, children }: { value: string; children: ReactNode }) {
    const choose = useContext(SelectContext);
    return (
      <button type="button" data-filter-option={value} onClick={() => choose(value)}>
        {children}
      </button>
    );
  },
}));

const { default: CostingsPage } = await import("../page");

const item = (id: number, category: string, msrp = "20.00"): Item => ({ id, category, name: `Part ${id}`, msrp });
const FIVE_CATEGORIES = ["cover", "filling", "packaging", "accessories", "other"];
const TITLES: Record<string, string> = { cover: "Covers", filling: "Fillings", packaging: "Packaging", accessories: "Accessories", other: "Other" };

let frames: FrameRequestCallback[] = [];
let holdFrames = false;
const offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop")!;

let root: Root | null = null;
beforeEach(() => {
  db.loads = [];
  frames = [];
  holdFrames = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, templates: [] }) })),
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    if (holdFrames) frames.push(cb);
    else setTimeout(() => cb(0), 0);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.closest("[aria-hidden]")) return 0;
      return Array.prototype.indexOf.call(this.parentElement?.children ?? [], this) * 40;
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<CostingsPage />));
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  Object.defineProperty(HTMLElement.prototype, "offsetTop", offsetTop);
  vi.unstubAllGlobals();
});

const text = () => document.body.textContent ?? "";
async function reload() {
  await act(async () => window.dispatchEvent(new Event("inventory:changed")));
  await settle(450);
}
async function addFilter(category: string) {
  await click(document.querySelector<HTMLElement>(`[data-filter-option="${category}"]`)!);
  await settle();
}
const visibleTags = () =>
  [...document.querySelectorAll<HTMLElement>("button")]
    .filter((b) => !b.closest("[aria-hidden]") && !b.closest('[data-testid="filter-options"]'))
    .map((b) => b.textContent?.trim())
    .filter((t) => Object.values(TITLES).includes(t ?? ""));
const button = (label: RegExp) => [...document.querySelectorAll<HTMLElement>("button")].find((b) => label.test(b.textContent ?? ""));

describe("Costings load", () => {
  it("shows the newest load's prices when an older load answers last", async () => {
    await db.loads[0].answer([item(1, "cover")]);
    expect(text()).toContain("MSRP $20.00");

    await reload();
    await reload();
    expect(db.loads).toHaveLength(3);
    await db.loads[2].answer([item(1, "cover", "30.00")]);
    await db.loads[1].answer([item(1, "cover", "25.00")]);
    await settle();
    expect(text()).toContain("MSRP $30.00");
    expect(text()).not.toContain("MSRP $25.00");
  });

  it("keeps showing Loading until the newest load answers", async () => {
    await db.loads[0].answer([item(1, "cover")]);
    await reload();
    await reload();
    await db.loads[1].answer([item(1, "cover", "25.00")]);
    expect(text()).toContain("Loading costings…");
    await db.loads[2].answer([item(1, "cover", "30.00")]);
    expect(text()).toContain("MSRP $30.00");
  });
});

describe("Costings part filters", () => {
  it("drops a filter whose category disappears, and does not bring it back when the category returns", async () => {
    await db.loads[0].answer([item(1, "cover"), item(2, "filling")]);
    await addFilter("cover");
    expect(text()).toContain("Filtering 1 category");
    expect(text()).not.toContain("Part 2");

    await reload();
    await db.loads[1].answer([item(2, "filling")]);
    expect(text()).not.toContain("Filtering");
    expect(text()).toContain("Part 2");

    await reload();
    await db.loads[2].answer([item(1, "cover"), item(2, "filling")]);
    expect(text()).not.toContain("Filtering");
    expect(text()).toContain("Part 1");
    expect(text()).toContain("Part 2");
  });

  it("collapses tags past three rows behind Show more, and Show more and Show less toggle them", async () => {
    await db.loads[0].answer(FIVE_CATEGORIES.map((c, i) => item(i + 1, c)));
    for (const c of FIVE_CATEGORIES) await addFilter(c);
    await settle(10);
    expect(visibleTags()).toEqual(["Covers", "Fillings", "Packaging"]);
    await click(button(/Show 2 more/)!);
    expect(visibleTags()).toHaveLength(5);
    await click(button(/Show less/)!);
    await settle(10);
    expect(visibleTags()).toEqual(["Covers", "Fillings", "Packaging"]);
  });

  it("never renders every tag before collapsing them when a filter is added", async () => {
    await db.loads[0].answer(FIVE_CATEGORIES.map((c, i) => item(i + 1, c)));
    for (const c of FIVE_CATEGORIES.slice(0, 4)) await addFilter(c);
    await settle(10);
    expect(visibleTags()).toEqual(["Covers", "Fillings", "Packaging"]);

    holdFrames = true;
    await click(document.querySelector<HTMLElement>(`[data-filter-option="other"]`)!);
    expect(visibleTags()).toEqual(["Covers", "Fillings", "Packaging"]);
    expect(button(/Show 2 more/)).toBeTruthy();
  });
});
