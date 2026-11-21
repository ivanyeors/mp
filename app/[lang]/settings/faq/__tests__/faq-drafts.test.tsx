// @vitest-environment jsdom
import { byLabel, click, settle, typeField } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryRow, FaqInitialData, ItemRow } from "../faq-client";

vi.mock("next/navigation", () => ({ usePathname: () => "/en-US/settings/faq" }));
vi.mock("@/components/settings/page-faqs-panel", () => ({ PageFaqsPanel: () => null }));

const { default: SettingsFaqPage } = await import("../faq-client");

const category: CategoryRow = {
  id: "c1",
  key: "shipping",
  labels: { "en-US": "Shipping", "zh-CN": "运送" },
  position: 0,
  visible: true,
};
const item: ItemRow = {
  id: "i1",
  category_id: "c1",
  slug: "how-long",
  content: {
    "en-US": { question: "How long?", answer: "Three days." },
    "zh-CN": { question: "多久?", answer: "三天。" },
  },
  position: 0,
  visible: true,
};
const initialData: FaqInitialData = {
  categories: { ok: true, rows: [category] },
  items: { ok: true, rows: [item] },
};

let serverRow: (url: string, body: Record<string, unknown>) => unknown;

let root: Root | null = null;
beforeEach(() => {
  serverRow = (url, body) => (url.includes("/categories/") ? { ...category, ...body } : { ...item, ...body });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return { ok: true, json: async () => ({ row: serverRow(url, body) }) };
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<SettingsFaqPage initialData={initialData} />));
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function fieldAfter(text: string, within: ParentNode = document) {
  const label = [...within.querySelectorAll("label")].find((l) => l.textContent === text);
  const field = label?.nextElementSibling;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) throw new Error(`No field after ${text}`);
  return field;
}

async function openCategory() {
  const trigger = [...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((b) =>
    b.textContent?.includes("Shipping"),
  );
  await click(trigger!);
}

async function openQuestion() {
  const trigger = [...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((b) =>
    b.textContent?.includes("How long?"),
  );
  await click(trigger!);
}

describe("FAQ category draft", () => {
  it("keeps an unsaved label when the category is hidden", async () => {
    await openCategory();
    typeField(fieldAfter("Label") as HTMLInputElement, "Delivery");
    await click(byLabel("Hide category")!);
    await settle();
    expect(byLabel("Show category")).not.toBeNull();
    expect(fieldAfter("Label").value).toBe("Delivery");
  });

  it("re-seeds the label from the saved row the server sends back", async () => {
    serverRow = (_url, body) => ({ ...category, ...body, labels: { "en-US": "Delivery (saved)", "zh-CN": "运送" } });
    await openCategory();
    typeField(fieldAfter("Label") as HTMLInputElement, "Delivery");
    await click(byLabel("Save category")!);
    await settle();
    expect(fieldAfter("Label").value).toBe("Delivery (saved)");
  });
});

describe("FAQ question draft", () => {
  it("keeps an unsaved answer when the question is hidden", async () => {
    await openQuestion();
    typeField(fieldAfter("Answer (markdown)"), "Five days.");
    await click(byLabel("Hide question")!);
    await settle();
    expect(byLabel("Show question")).not.toBeNull();
    expect(fieldAfter("Answer (markdown)").value).toBe("Five days.");
  });

  it("re-seeds the answer from the saved row the server sends back", async () => {
    serverRow = (_url, body) => ({
      ...item,
      ...body,
      content: { ...item.content, "en-US": { question: "How long?", answer: "Five working days." } },
    });
    await openQuestion();
    typeField(fieldAfter("Answer (markdown)"), "Five days.");
    await click(byLabel("Save question")!);
    await settle();
    expect(fieldAfter("Answer (markdown)").value).toBe("Five working days.");
  });
});
