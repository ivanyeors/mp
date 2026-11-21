// @vitest-environment jsdom
import { settle, typeField, until } from "@/components/block-editor/__tests__/dom";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Pending = { table: string; filters: Row; answer: (rows: Row[]) => Promise<void>; fail: () => Promise<void> };
type Request = { url: string; method: string; body: unknown; answered: boolean; answer: (json: unknown) => Promise<void> };

const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, pending: [] as Pending[] }));
const route = vi.hoisted(() => ({ card: "bolster-short" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ card: route.card }),
  usePathname: () => `/en-US/settings/inventory/configure/${route.card}`,
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
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
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (value ? <option value={value}>{children}</option> : null),
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
          ? new Promise((done) =>
              db.pending.push({
                table,
                filters,
                answer: async (rows) => {
                  await act(async () => done({ data: rows, error: null }));
                  await settle();
                },
                fail: async () => {
                  await act(async () => done({ data: null, error: { message: "network down" } }));
                  await settle();
                },
              }),
            )
          : Promise.resolve({ data: structuredClone(db.tables[table] ?? []), error: null });
        return answered.then(resolve, reject);
      },
    };
    return builder;
  };
  return { supabaseClient: { from } };
});

const { default: ConfigureCardPage } = await import("../[card]/page");

let requests: Request[] = [];
let auto: (url: string, method: string) => unknown = () => undefined;

const FILLING_TEMPLATES = [{ id: 42, name: "Soft mix", notes: null, is_active: true }];
const autoAnswers = (url: string, method: string) => {
  if (method !== "GET") return { ok: true };
  if (url.includes("role=filling")) return { templates: FILLING_TEMPLATES };
  if (url.includes("/unpromoted")) return { entries: [] };
  if (url.endsWith("/templates/42")) return { lines: [{ item_id: 3, quantity: 2 }], template: { name: "Soft mix" } };
  return undefined;
};

let root: Root | null = null;
async function mount(card: string, strict = false) {
  route.card = card;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(strict ? <StrictMode><ConfigureCardPage /></StrictMode> : <ConfigureCardPage />));
  await settle();
}

beforeEach(() => {
  db.pending = [];
  db.tables = {
    items: [
      { id: 1, category: "bolster_case", name: "Linen", size: "S", subtype: null, is_active: true },
      { id: 2, category: "packaging", name: "Vacuum", size: "S", subtype: null, is_active: true },
      { id: 3, category: "filling", name: "Hollow", size: null, subtype: "6D (L)", is_active: true },
    ],
    pillow_products: [
      { id: 10, size: "M", kind: "basic", default_filling_template_id: 42 },
      { id: 11, size: "M", kind: "premium", default_filling_template_id: null },
    ],
    bom_lines: [],
    bolster_length_config: [],
  };
  requests = [];
  auto = autoAnswers;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return new Promise((resolve) => {
        const reply = (json: unknown) => resolve({ ok: true, json: async () => json });
        const answer = async (json: unknown) => {
          await act(async () => reply(json));
          await settle();
        };
        const now = auto(url, method);
        requests.push({ url, method, body, answered: now !== undefined, answer });
        if (now !== undefined) reply(now);
      });
    }),
  );
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
});

const waiting = (match: (r: Request) => boolean) => requests.filter((r) => match(r));
async function answerRequest(match: (r: Request) => boolean, json: unknown) {
  const r = requests.find((req) => !req.answered && match(req));
  expect(r, "no such request").toBeDefined();
  r!.answered = true;
  await r!.answer(json);
}
const templatePicker = () =>
  [...document.querySelectorAll("select")].find((s) => s.closest("div")?.textContent?.startsWith("Template")) ?? null;
const optionNames = (s: HTMLSelectElement | null) =>
  [...(s?.querySelectorAll("option") ?? [])].filter((o) => o.value).map((o) => o.textContent);
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}
const bolsterRead = () => db.pending.find((p) => p.table === "bolster_bom_lines") ?? null;
const bolsterReads = () => db.pending.filter((p) => p.table === "bolster_bom_lines");
const STORED_BOLSTER = [{ item_id: 1, quantity: 1 }];
const bolsterSave = () =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === "Save" && !b.parentElement?.querySelector('input[placeholder="Template name"]'),
  )!;
const posted = (path: string) => waiting((r) => r.url.endsWith(path) && r.method !== "GET").map((r) => `${r.method} ${JSON.stringify(r.body)}`);
async function answerWarehouse(kind: "pillow" | "bolster", ids: number[]) {
  await answerRequest((r) => r.url.includes(`kind=${kind}`) && r.url.includes("role=warehouse"), {
    templates: ids.map((id) => ({ id, name: `Template ${id}`, notes: null })),
  });
}
async function pickAndSave(card: "bolster" | "pillow") {
  await choose(templatePicker()!, "7");
  await choose(templatePicker()!, "8");
  await answerRequest((r) => r.url.endsWith("/templates/8"), { lines: [{ item_id: 2, quantity: 2 }] });
  await answerRequest((r) => r.url.endsWith("/templates/7"), { lines: [{ item_id: 1, quantity: 5 }] });
  const save = card === "bolster" ? bolsterSave() : [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Save changes")!;
  await act(async () => save.click());
  await settle();
}

describe("Configure card: bolster lines", () => {
  it("saves the template picked as soon as the editor shows, not the BOM read that answers later", async () => {
    await mount("bolster-short");
    await settle(50);
    if (!templatePicker()) {
      expect(bolsterRead()?.filters).toEqual({ variant: "short" });
      await bolsterRead()!.answer([{ item_id: 1, quantity: 1 }]);
    }
    await until(() => templatePicker());
    await answerRequest((r) => r.url.includes("kind=bolster") && r.url.includes("role=warehouse"), {
      templates: [{ id: 7, name: "Short classic", notes: null }],
    });
    await choose(templatePicker()!, "7");
    await answerRequest((r) => r.url.endsWith("/templates/7"), { lines: [{ item_id: 2, quantity: 2 }] });
    if (bolsterRead()) await bolsterRead()!.answer([{ item_id: 1, quantity: 1 }]);

    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Save" && !b.parentElement?.querySelector('input[placeholder="Template name"]'),
    )!;
    await act(async () => save.click());
    await settle();

    const saved = waiting((r) => r.url.endsWith("/configure/save") && r.method === "POST");
    expect(saved.map((r) => r.body)).toEqual([
      expect.objectContaining({ kind: "bolster", variant: "short", lines: [{ item_id: 2, quantity: 2 }] }),
    ]);
  });
});

describe("Configure card: overlapping first loads", () => {
  it("keeps the bolster editor hidden when a reload lands before the load that reads its lines", async () => {
    await mount("bolster-short");
    await settle(50);
    expect(bolsterReads()).toHaveLength(1);
    act(() => void window.dispatchEvent(new Event("inventory:changed")));
    await settle(50);
    expect(templatePicker()).toBeNull();

    const [first, latest] = bolsterReads();
    await latest.answer(STORED_BOLSTER);
    await until(() => templatePicker());
    await answerWarehouse("bolster", [7]);
    await choose(templatePicker()!, "7");
    await answerRequest((r) => r.url.endsWith("/templates/7"), { lines: [{ item_id: 2, quantity: 2 }] });
    await first.answer(STORED_BOLSTER);
    await act(async () => bolsterSave().click());
    await settle();

    expect(posted("/configure/save")).toEqual([
      `POST ${JSON.stringify({ kind: "bolster", variant: "short", lines: [{ item_id: 2, quantity: 2 }], defaultFillingTemplateId: null })}`,
    ]);
  });

  it("applies only the newest first load under Strict Mode's double mount", async () => {
    await mount("bolster-short", true);
    await settle(50);
    const [first, latest] = bolsterReads();
    expect(latest).toBeDefined();
    await latest.answer(STORED_BOLSTER);
    await until(() => templatePicker());
    await answerWarehouse("bolster", [7]);
    await choose(templatePicker()!, "7");
    await answerRequest((r) => r.url.endsWith("/templates/7"), { lines: [{ item_id: 2, quantity: 2 }] });
    await first.answer(STORED_BOLSTER);
    await act(async () => bolsterSave().click());
    await settle();

    expect(posted("/configure/save")).toEqual([
      `POST ${JSON.stringify({ kind: "bolster", variant: "short", lines: [{ item_id: 2, quantity: 2 }], defaultFillingTemplateId: null })}`,
    ]);
  });
});

describe("Configure card: warehouse template picks", () => {
  it("applies only the bolster template picked last when an earlier pick answers after it", async () => {
    await mount("bolster-short");
    await settle(50);
    await bolsterReads()[0].answer(STORED_BOLSTER);
    await until(() => templatePicker());
    await answerWarehouse("bolster", [7, 8]);
    await pickAndSave("bolster");

    expect(posted("/configure/save")).toEqual([
      `POST ${JSON.stringify({ kind: "bolster", variant: "short", lines: [{ item_id: 2, quantity: 2 }], defaultFillingTemplateId: null })}`,
    ]);
    expect(posted("/templates/8")).toEqual([`PUT ${JSON.stringify({ lines: [{ item_id: 2, quantity: 2 }] })}`]);
  });

  it("applies only the pillow template picked last when an earlier pick answers after it", async () => {
    await mount("basic-M");
    await until(() => templatePicker());
    await answerWarehouse("pillow", [7, 8]);
    await pickAndSave("pillow");

    expect(posted("/templates/8")).toEqual([`PUT ${JSON.stringify({ lines: [{ item_id: 2, quantity: 2 }] })}`]);
    expect(posted("/configure/save")).toEqual([
      `POST ${JSON.stringify({ productId: 10, lines: [{ item_id: 2, quantity: 2 }], defaultFillingTemplateId: 42 })}`,
    ]);
  });
});

describe("Configure card: bolster lines that fail to load", () => {
  it("shows an error and writes nothing when the bolster parts cannot be read", async () => {
    await mount("bolster-short");
    await settle(50);
    await bolsterReads()[0].fail();
    await until(() => document.querySelector("h1"));
    typeField(document.querySelector<HTMLInputElement>('input[placeholder="Template name"]')!, "Backup");
    for (const b of document.querySelectorAll<HTMLButtonElement>("button")) {
      if (b.textContent?.trim() === "Save") await act(async () => b.click());
    }
    await settle();

    expect([...posted("/configure/save"), ...posted("/configure/templates")]).toEqual([]);
    expect(document.body.textContent).toContain("Couldn't load this bolster's parts.");
  });
});

describe("Configure card: premium warehouse templates", () => {
  it("lists the variant picked last when an older variant's templates answer after it", async () => {
    auto = (url, method) => (url.includes("role=warehouse") ? undefined : autoAnswers(url, method));
    await mount("premium-M");
    await until(() => templatePicker());
    await answerRequest((r) => r.url.includes("pillowVariant=linen"), { templates: [{ id: 1, name: "Linen first", notes: null }] });

    const variant = [...document.querySelectorAll("select")].find((s) => s.querySelector('option[value="fibrecool"]'))!;
    await choose(variant, "fibrecool");
    await choose(variant, "linen");
    await answerRequest((r) => r.url.includes("pillowVariant=linen"), { templates: [{ id: 2, name: "Linen second", notes: null }] });
    await answerRequest((r) => r.url.includes("pillowVariant=fibrecool"), { templates: [{ id: 3, name: "FibreCool", notes: null }] });

    expect(variant.value).toBe("linen");
    expect(optionNames(templatePicker())).toEqual(["Linen second"]);
  });
});

describe("Configure card: default filling preview", () => {
  it("reads the default filling's lines once, not again on every keystroke elsewhere on the page", async () => {
    await mount("basic-M");
    await until(() => (document.body.textContent?.includes("×2") ? true : null));
    const previewReads = () => requests.filter((r) => r.url.endsWith("/templates/42")).length;
    expect(previewReads()).toBe(1);

    const name = document.querySelector<HTMLInputElement>('input[placeholder="Template name"]')!;
    typeField(name, "N");
    typeField(name, "Ne");
    typeField(name, "New");
    await settle();

    expect(previewReads()).toBe(1);
    expect(document.body.textContent).not.toContain("Loading preview…");
  });
});

describe("Configure card: last filling draft", () => {
  it("opens the template whose draft was saved last when the filling tab loads", async () => {
    localStorage.setItem(
      "mp:editor-draft:v1:template:pillow:M:42",
      JSON.stringify({ savedAt: Date.now(), data: { name: "Soft mix (edited)", notes: "", active: true, keys: ["M"], rows: [] } }),
    );
    await mount("basic-M");
    await until(() => (requests.some((r) => r.url.endsWith("/templates/42")) ? true : null));
    await settle(50);

    expect(requests.filter((r) => r.url.endsWith("/templates/42") && r.method === "GET")).toHaveLength(1);
    expect([...document.querySelectorAll("input")].map((i) => i.value)).toContain("Soft mix (edited)");
  });
});
