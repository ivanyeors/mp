// @vitest-environment jsdom
import { click, settle } from "@/components/block-editor/__tests__/dom";
import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: number; category: string; name: string; msrp: string };
type Load = { answer: (items: Item[]) => Promise<void>; fail: (message: string) => Promise<void> };

const db = vi.hoisted(() => ({ loads: [] as Load[] }));
const dock = vi.hoisted(() => ({ actions: [] as Array<{ id: string; disabled?: boolean; onClick: () => void }> }));

vi.mock("@/components/ui/page-dock-actions", () => ({
  useMobileDockActions: (actions: typeof dock.actions) => {
    dock.actions = actions;
    return false;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/costings",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => {
  type Result = { data: unknown[] | null; error: { message: string } | null };
  let current: { tables: Map<string, (result: Result) => void> } | null = null;
  const from = (table: string) => {
    if (table === "items") {
      const tables = new Map<string, (result: Result) => void>();
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
            for (const [name, resolve] of group.tables) resolve({ data: name === "items" ? rows : [], error: null });
          });
        },
        fail: async (message) => {
          const { act: reactAct } = await import("react");
          await reactAct(async () => {
            for (const [name, resolve] of group.tables) resolve(name === "items" ? { data: null, error: { message } } : { data: [], error: null });
          });
        },
      });
    }
    let resolve!: (result: Result) => void;
    const promise = new Promise<Result>((r) => {
      resolve = r;
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
const { toast } = await import("sonner");

const item = (id: number, category: string, msrp = "20.00"): Item => ({ id, category, name: `Part ${id}`, msrp });
const FIVE_CATEGORIES = ["cover", "filling", "packaging", "accessories", "other"];
const TITLES: Record<string, string> = { cover: "Covers", filling: "Fillings", packaging: "Packaging", accessories: "Accessories", other: "Other" };

let frames: FrameRequestCallback[] = [];
let holdFrames = false;
let holdSave = false;
let releaseSave: (() => void) | null = null;
let saveAnswer: { ok: boolean; status: number; body: unknown } | null = null;
const offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop")!;

let root: Root | null = null;
beforeEach(() => {
  db.loads = [];
  dock.actions = [];
  holdSave = false;
  releaseSave = null;
  saveAnswer = null;
  vi.mocked(toast.error).mockClear();
  frames = [];
  holdFrames = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const answer =
        saveAnswer && url.includes("/costings/save")
          ? { ok: saveAnswer.ok, status: saveAnswer.status, json: async () => saveAnswer!.body }
          : { ok: true, status: 200, json: async () => ({ ok: true, templates: [] }) };
      if (holdSave && url.includes("/costings/save")) return new Promise((resolve) => (releaseSave = () => resolve(answer)));
      return Promise.resolve(answer);
    }),
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
const saveButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Save")!;
async function editPartMsrp(value: string) {
  const cell = document.querySelector<HTMLElement>('#costings-parts td[aria-label$=" MSRP"]')!;
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  const input = document.querySelector<HTMLInputElement>('#costings-parts td[aria-label$=" MSRP"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await settle(300);
}
const button = (label: RegExp) => [...document.querySelectorAll<HTMLElement>("button")].find((b) => label.test(b.textContent ?? ""));
const refreshButton = () => button(/^Refresh$/) as HTMLButtonElement;
const dockRefresh = () => dock.actions.find((action) => action.id === "refresh")!;
const cell = (label: string) => document.querySelector(`td[aria-label="${label}"]`)?.textContent;
const notice = () => [...document.querySelectorAll('[role="status"]')].map((el) => el.textContent).join(" ");
const saveBodies = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes("/costings/save"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

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

  it("shows saved prices as saved when the reload after Save answers and a later reload fails", async () => {
    await db.loads[0].answer([item(1, "cover")]);
    await editPartMsrp("30.00");
    expect(saveButton().disabled).toBe(false);

    await click(saveButton());
    await settle();
    expect(db.loads).toHaveLength(2);
    await reload();
    expect(db.loads).toHaveLength(3);

    await db.loads[1].answer([item(1, "cover", "30.00")]);
    await db.loads[2].fail("network down");
    await settle();
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(text()).toContain("MSRP $30.00");
    expect(text()).not.toContain("Unsaved changes");
    expect(saveButton().disabled).toBe(true);
  });

  it("ignores a reload that started during Save and answers before Save's own reload fails", async () => {
    await db.loads[0].answer([item(1, "cover")]);
    await editPartMsrp("30.00");

    holdSave = true;
    await click(saveButton());
    await reload();
    expect(db.loads).toHaveLength(2);
    await act(async () => releaseSave!());
    await settle();
    expect(db.loads).toHaveLength(3);

    await db.loads[1].answer([item(1, "cover", "20.00")]);
    await db.loads[2].fail("network down");
    await settle();
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(text()).toContain("MSRP $30.00");
    expect(text()).toContain("Unsaved changes");
    expect(saveButton().disabled).toBe(false);
  });

  it("ignores a reload that started during Save and answers after Save's own reload failed", async () => {
    await db.loads[0].answer([item(1, "cover")]);
    await editPartMsrp("30.00");

    holdSave = true;
    await click(saveButton());
    await reload();
    expect(db.loads).toHaveLength(2);
    await act(async () => releaseSave!());
    await settle();
    expect(db.loads).toHaveLength(3);

    await db.loads[2].fail("network down");
    await settle();
    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(text()).toContain("Unsaved changes");

    await db.loads[1].answer([item(1, "cover", "20.00")]);
    await settle();
    expect(text()).toContain("MSRP $30.00");
    expect(text()).toContain("Unsaved changes");
    expect(saveButton().disabled).toBe(false);
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

describe("Costings drafts", () => {
  const twoParts = (part1: string, part2: string) => [item(1, "cover", part1), item(2, "cover", part2)];

  it("does not apply a load that answers while Save is in flight, and Refresh is disabled until Save answers", async () => {
    await db.loads[0].answer(twoParts("20.00", "20.00"));
    await editPartMsrp("30.00");

    holdSave = true;
    await click(saveButton());
    expect(refreshButton().disabled).toBe(true);
    expect(dockRefresh().disabled).toBe(true);
    await act(async () => dockRefresh().onClick());
    expect(db.loads).toHaveLength(1);

    await reload();
    expect(db.loads).toHaveLength(2);
    await db.loads[1].answer(twoParts("20.00", "25.00"));
    await settle();
    expect(cell("Part 1 Covers MSRP")).toBe("$30.00");
    expect(cell("Part 2 Covers MSRP")).toBe("$20.00");
    expect(notice()).toContain("You have unsaved changes.");

    await act(async () => releaseSave!());
    await settle();
    expect(db.loads).toHaveLength(3);
    await db.loads[2].answer(twoParts("30.00", "25.00"));
    await settle();
    expect(refreshButton().disabled).toBe(false);
    expect(dockRefresh().disabled).toBe(false);
    expect(cell("Part 1 Covers MSRP")).toBe("$30.00");
    expect(cell("Part 2 Covers MSRP")).toBe("$25.00");
    expect(notice()).not.toContain("unsaved");
  });

  it.each(["Refresh", "inventory:changed"])(
    "keeps a typed MSRP through %s, refreshes the rows nobody typed in, and says there are unsaved changes",
    async (how) => {
      await db.loads[0].answer(twoParts("20.00", "20.00"));
      expect(notice()).not.toContain("unsaved");
      await editPartMsrp("30.00");
      expect(notice()).toContain("You have unsaved changes.");

      if (how === "Refresh") await click(refreshButton());
      else await reload();
      expect(db.loads).toHaveLength(2);
      await db.loads[1].answer(twoParts("20.00", "25.00"));
      await settle();

      expect(cell("Part 1 Covers MSRP")).toBe("$30.00");
      expect(cell("Part 2 Covers MSRP")).toBe("$25.00");
      expect(notice()).toContain("You have unsaved changes.");
      expect(notice()).not.toContain("Saved since you started editing");
      expect(saveButton().disabled).toBe(false);
    },
  );

  it("shows the saved price that changed under a typed one when a reload brings it in", async () => {
    await db.loads[0].answer(twoParts("20.00", "20.00"));
    await editPartMsrp("30.00");
    await reload();
    await db.loads[1].answer(twoParts("25.00", "20.00"));
    await settle();

    expect(cell("Part 1 Covers MSRP")).toBe("$30.00");
    expect(notice()).toContain("Saved since you started editing: Part 1 Covers MSRP $25.00. Save to replace it with yours.");
  });

  it("on a conflict, names the row, keeps the draft, and saves against the reloaded price after a reload", async () => {
    await db.loads[0].answer(twoParts("20.00", "20.00"));
    await editPartMsrp("30.00");

    const conflict = "Someone changed this price since you opened it — reload to see it: Part 1 Covers.";
    saveAnswer = { ok: false, status: 409, body: { error: conflict, conflicts: [{ key: "item:1", name: "Part 1 Covers" }] } };
    await click(saveButton());
    await settle();

    expect(saveBodies()[0].rows).toEqual([
      {
        itemId: 1,
        costPriceCents: 500,
        msrpCents: 3000,
        compareAtCents: null,
        base: { costPriceCents: 500, msrpCents: 2000, compareAtCents: null },
      },
    ]);
    expect(notice()).toContain(conflict);
    expect(toast.error).toHaveBeenCalledWith(conflict);
    expect(db.loads).toHaveLength(1);
    expect(cell("Part 1 Covers MSRP")).toBe("$30.00");
    expect(saveButton().disabled).toBe(false);

    saveAnswer = null;
    await click(refreshButton());
    await db.loads[1].answer(twoParts("25.00", "20.00"));
    await settle();
    expect(cell("Part 1 Covers MSRP")).toBe("$30.00");
    expect(notice()).not.toContain("Someone changed");
    expect(notice()).toContain("Part 1 Covers MSRP $25.00");

    await click(saveButton());
    await settle();
    expect(saveBodies()[1].rows).toEqual([
      {
        itemId: 1,
        costPriceCents: 500,
        msrpCents: 3000,
        compareAtCents: null,
        base: { costPriceCents: 500, msrpCents: 2500, compareAtCents: null },
      },
    ]);
  });
});
