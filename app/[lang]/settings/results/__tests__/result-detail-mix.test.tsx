// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "r1" }),
  usePathname: () => "/en-US/settings/results/r1",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
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
vi.mock("@/components/spatial/use-pillow-fit", () => ({
  usePillowFit: () => ({}),
  useBolsterFit: () => ({}),
  useItemMaps: () => ({ itemSubtypes: new Map(), itemSizes: new Map(), itemDims: new Map() }),
  useCut: () => ({ setCut: () => {}, onDiveChange: () => {} }),
}));
vi.mock("../[id]/filling-mix-workbench", () => ({
  FillingMixWorkbench: ({ notice, picker, packList }: { notice?: ReactNode; picker?: ReactNode; packList?: ReactNode }) => (
    <div>
      {notice}
      {picker}
      {packList}
    </div>
  ),
  WorkbenchTile: ({ title, aside }: { title: string; aside?: ReactNode }) => <section aria-label={title}>{aside}</section>,
}));

const { default: ResultDetailPage } = await import("../[id]/result-detail-client");

type Held = { url: string; method: string; answer: (body: unknown) => Promise<void> };
let held: Held[] = [];
beforeEach(() => {
  held = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve) => {
          held.push({
            url: String(url),
            method: init?.method ?? "GET",
            answer: (body) =>
              act(async () => {
                resolve({ ok: true, status: 200, json: async () => body });
              }),
          });
        }),
    ),
  );
});

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const response = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  status: "held",
  product_type: "pillow",
  order_id: null,
  suggested_size: "M",
  suggested_tier: "basic",
  assigned_size: null,
  assigned_tier: null,
  suggested_length: null,
  assigned_length: null,
  filling_template_id: null,
  filling_fingerprint: null,
  recommendation_record: null,
  data: null,
  created_at: "2026-11-01T02:00:00Z",
  updated_at: "2026-11-01T02:00:00Z",
  ...over,
});

const prep = (size: string, id: number, extra: Array<{ id: number; name: string }> = []) => ({
  productLines: [],
  defaultFillingTemplate: { id, name: `${size} default`, preview: [] },
  hintSource: "default",
  fillingTemplates: [{ id, name: `${size} default` }, ...extra],
});

const pieces = (n: number) => ({
  lines: [],
  placements: Array.from({ length: n }, (_, i) => ({ section: "center", sub_section: "middle", slot: i, item_id: 1 })),
  template: { notes: "" },
  colorOverrides: [],
});

const savedMix = (n: number) => ({
  productType: "pillow",
  placements: Array.from({ length: n }, (_, i) => ({ section: "center", sub_section: "middle", slot: i, item_id: 1 })),
  items: [],
  colorOverrides: [],
});

const mount = async (fillingMix: unknown = null) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ResultDetailPage
        initialData={
          {
            detail: { response: response(), order_number: null, order: null, suggestion: null },
            assignPrep: prep("M", 10, [
              { id: 11, name: "M firm" },
              { id: 12, name: "M soft" },
            ]),
            fillingItems: [],
            fillingMix,
          } as never
        }
      />,
    ),
  );
};

const selectWith = (option: string) =>
  [...host.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === option))!;
const sizeSelect = () => selectWith("XL");
const templateSelect = () => [...host.querySelectorAll("select")].find((s) => [...s.options].some((o) => /default/.test(o.text)))!;
const choose = (el: HTMLSelectElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const preview = (id: number) => held.find((h) => h.url === `/en-US/settings/inventory/configure/templates/${id}`)!;
const prepFor = (size: string) => [...held].reverse().find((h) => h.url.startsWith("/api/results/assign/prep?") && h.url.includes(`size=${size}&`))!;
const packList = () => host.querySelector('[aria-label="Derived pack list"]')?.textContent;
const hint = () => [...host.querySelectorAll("p")].find((p) => /Size default|No default template|Loading the recommendation/.test(p.textContent ?? ""))?.textContent;

describe("Result detail: the assignment's size and filling template", () => {
  it("drops the old pick when the size changes, then seeds the new size's default", async () => {
    await mount();
    await preview(10).answer(pieces(1));
    expect(templateSelect().value).toBe("10");

    await choose(sizeSelect(), "L");
    expect(hint()).toBe("Loading the recommendation…");
    await prepFor("L").answer(prep("L", 20));

    expect(templateSelect().value).toBe("20");
    expect(hint()).toBe("Size default: L default");
  });

  it("shows S's templates when L's slower prep answers after S's", async () => {
    await mount();
    await preview(10).answer(pieces(1));
    await choose(sizeSelect(), "L");
    await choose(sizeSelect(), "S");
    const forL = prepFor("L");
    const forS = prepFor("S");

    await forS.answer(prep("S", 30));
    await forL.answer(prep("L", 20));

    expect(hint()).toBe("Size default: S default");
    expect(templateSelect().value).toBe("30");
  });

  it("keeps the new size's mix when the old size's template answers last", async () => {
    await mount();
    await choose(sizeSelect(), "L");
    await prepFor("L").answer(prep("L", 20));

    await preview(20).answer(pieces(3));
    await preview(10).answer(pieces(1));

    expect(packList()).toBe("3 pieces");
  });

  it("keeps the template picked last when an earlier pick answers last", async () => {
    await mount();
    await preview(10).answer(pieces(1));
    await choose(templateSelect(), "11");
    await choose(templateSelect(), "12");

    await preview(12).answer(pieces(3));
    await preview(11).answer(pieces(2));

    expect(templateSelect().value).toBe("12");
    expect(packList()).toBe("3 pieces");
  });

  it("keeps a saved mix when the size changes", async () => {
    await mount(savedMix(2));
    await preview(10).answer(pieces(1));
    expect(packList()).toBe("2 pieces");

    await choose(sizeSelect(), "L");
    await prepFor("L").answer(prep("L", 20));
    await preview(20).answer(pieces(4));

    expect(packList()).toBe("2 pieces");
  });

  it("drops the old pick when a re-read after Save brings a new size", async () => {
    await mount();
    await preview(10).answer(pieces(1));

    const save = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Save")!;
    await act(async () => save.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await held.find((h) => h.method === "POST" && h.url === "/api/mp-config/responses")!.answer({ ok: true });
    await held
      .find((h) => h.url === "/api/mp-config/responses/r1")!
      .answer({ ok: true, response: response({ suggested_size: "L", filling_template_id: 10 }), suggestion: null });
    await prepFor("L").answer(prep("L", 20));

    expect(sizeSelect().value).toBe("L");
    expect(templateSelect().value).toBe("20");
  });
});
