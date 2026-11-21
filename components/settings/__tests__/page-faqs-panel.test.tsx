// @vitest-environment jsdom
import { byLabel, click, settle, typeField } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/page-faq", async () => ({
  ...(await import("@/lib/page-faq/preview-path")),
  ...(await import("@/lib/page-faq/surface-key")),
}));

const { PageFaqsPanel } = await import("../page-faqs-panel");

const question = {
  id: "q1",
  set_id: "set-home",
  slug: "wash",
  content: {
    "en-US": { question: "Can I wash it?", answer: "By hand." },
    "zh-CN": { question: "可以洗吗?", answer: "手洗。" },
  },
  position: 0,
  visible: true,
};
const sizeQuestion = {
  ...question,
  id: "q2",
  slug: "size",
  content: {
    "en-US": { question: "Which size?", answer: "Measure first." },
    "zh-CN": { question: "哪个尺寸?", answer: "先量。" },
  },
  position: 1,
};
let homeItems: (typeof question)[];
const setFor = (key: string) => ({
  id: `set-${key}`,
  surface_key: key,
  titles: { "en-US": `Questions for ${key}` },
  visible: true,
  items: key === "home" ? homeItems : [],
});

type Held = { key: string; release: () => void };
let held: Held[];
let holdWhen: (url: string, method: string) => string | null;
let failWhen: (url: string, method: string) => boolean;
let savedRow: (body: Record<string, unknown>) => unknown;

const respond = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  held = [];
  holdWhen = () => null;
  failWhen = () => false;
  homeItems = [question];
  savedRow = (body) => ({ ...question, ...body });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const hold = holdWhen(url, method);
      if (hold) await new Promise<void>((release) => held.push({ key: hold, release }));
      if (failWhen(url, method)) return { ok: false, json: async () => ({}) };
      if (url.startsWith("/api/shop/products")) return respond({ rows: [] });
      if (url === "/api/page-faq/sets") return respond({ ok: true });
      if (url.startsWith("/api/page-faq/sets?surface_key=")) {
        const key = decodeURIComponent(url.split("=")[1]);
        return respond({ set: setFor(key) });
      }
      if (url.startsWith("/api/page-faq/items/")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return respond({ row: savedRow(body) });
      }
      return respond({});
    }),
  );
});

let root: Root | null = null;
const mount = async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<PageFaqsPanel locale="en-US" />));
  await settle();
};
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const heading = () => document.querySelector("h2")?.textContent;
const release = async (key: string) => {
  await act(async () => held.find((h) => h.key === key)!.release());
  await settle();
};
const setReads = (key: string) =>
  vi.mocked(fetch).mock.calls.filter(([u]) => String(u) === `/api/page-faq/sets?surface_key=${key}`).length;
const loadOf = (key: string) => (url: string) => (url === `/api/page-faq/sets?surface_key=${key}` ? key : null);
const surfaceKey = () => document.querySelector("code")?.textContent;

function fieldAfter(text: string) {
  const label = [...document.querySelectorAll("label")].find((l) => l.textContent === text);
  const field = label?.nextElementSibling;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) throw new Error(`No field after ${text}`);
  return field;
}

async function openQuestion() {
  const trigger = [...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((b) =>
    b.textContent?.includes("Can I wash it?"),
  );
  await click(trigger!);
}

describe("Page FAQs surface switch", () => {
  it("shows the newest surface's questions when an older surface's load lands last", async () => {
    await mount();
    expect(heading()).toBe("Questions for home");

    holdWhen = loadOf("mp-config");
    await click(byLabel("mp-config")!);
    await click(byLabel("mbolster-config")!);
    await settle();
    expect(heading()).toBe("Questions for mbolster-config");

    await release("mp-config");

    expect(surfaceKey()).toBe("mbolster-config");
    expect(heading()).toBe("Questions for mbolster-config");
  });

  it("keeps the new surface when an Add question on the old one finishes after the switch", async () => {
    await mount();
    holdWhen = (url, method) =>
      url === "/api/page-faq/items" && method === "POST" ? "add" : loadOf("mp-config")(url);
    await click(byLabel("Add question")!);
    await click(byLabel("mp-config")!);

    await release("add");
    await release("mp-config");

    expect(surfaceKey()).toBe("mp-config");
    expect(heading()).toBe("Questions for mp-config");
  });

  it("keeps the new surface when a failed reorder on the old one answers after the switch", async () => {
    homeItems = [question, sizeQuestion];
    await mount();
    holdWhen = (url) => (url.endsWith("/reorder") ? "reorder" : loadOf("mp-config")(url));
    failWhen = (url) => url.endsWith("/reorder");
    await click(byLabel("Move down")!);
    await click(byLabel("mp-config")!);

    await release("reorder");
    await release("mp-config");

    expect(surfaceKey()).toBe("mp-config");
    expect(heading()).toBe("Questions for mp-config");
  });

  it("reloads the surface after Add question when it is still the one selected", async () => {
    await mount();
    expect(setReads("home")).toBe(1);
    await click(byLabel("Add question")!);
    await settle();
    expect(setReads("home")).toBe(2);
    expect(heading()).toBe("Questions for home");
  });
});

describe("Page FAQ question draft", () => {
  it("keeps an unsaved answer when the question is hidden", async () => {
    await mount();
    await openQuestion();
    typeField(fieldAfter("Answer (Markdown)"), "In the machine, cold.");
    await click(byLabel("Hide question")!);
    await settle();
    expect(byLabel("Show question")).not.toBeNull();
    expect(fieldAfter("Answer (Markdown)").value).toBe("In the machine, cold.");
  });

  it("re-seeds the answer from the saved row the server sends back", async () => {
    savedRow = (body) => ({
      ...question,
      ...body,
      content: { ...question.content, "en-US": { question: "Can I wash it?", answer: "In the machine, 30°C." } },
    });
    await mount();
    await openQuestion();
    typeField(fieldAfter("Answer (Markdown)"), "In the machine, cold.");
    await click(byLabel("Save question")!);
    await settle();
    expect(fieldAfter("Answer (Markdown)").value).toBe("In the machine, 30°C.");
  });
});
