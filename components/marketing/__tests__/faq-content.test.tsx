// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FaqCategoryWithItems, FaqItem } from "@/lib/faq/types";

import { FaqContent } from "../faq-content";

const stamp = { created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", visible: true };
const item = (slug: string, position: number): FaqItem => ({
  ...stamp,
  id: `i-${slug}`,
  category_id: "c1",
  slug,
  position,
  question: `Question ${slug}?`,
  answer: `Answer ${slug}.`,
  content: { "en-US": { question: `Question ${slug}?`, answer: `Answer ${slug}.` }, "zh-CN": { question: "", answer: "" } },
});
const categories: FaqCategoryWithItems[] = [
  {
    ...stamp,
    id: "c1",
    key: "care",
    label: "Care",
    labels: { "en-US": "Care", "zh-CN": "护理" },
    position: 0,
    items: [item("washing", 0), item("drying", 1), item("storing", 2)],
  },
];

let root: Root | null = null;
let host: HTMLElement;
let scrolled: { id: string; open: string | null }[] = [];
beforeEach(() => {
  scrolled = [];
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
    scrolled.push({ id: this.id, open: this.getAttribute("data-state") });
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
});

const render = (initialSlug?: string) =>
  act(() => root!.render(<FaqContent categories={categories} locale="en-US" initialSlug={initialSlug} />));
const openItems = () => [...host.querySelectorAll('[data-slot="accordion-item"][data-state="open"]')].map((el) => el.id);
const trigger = (slug: string) => host.querySelector<HTMLButtonElement>(`#${slug} button`)!;

describe("FaqContent opens the question in the link", () => {
  it("opens and scrolls to it on arrival", () => {
    render("drying");
    expect(openItems()).toEqual(["drying"]);
    expect(scrolled.map((s) => s.id)).toEqual(["drying"]);
  });

  it("opens the new question before scrolling to it when a link on the page changes it", () => {
    render("drying");
    render("storing");
    expect(openItems()).toEqual(["storing"]);
    expect(scrolled.at(-1)).toEqual({ id: "storing", open: "open" });
  });

  it("keeps the question the visitor opened when the page re-renders with the same link", () => {
    render("drying");
    act(() => trigger("washing").click());
    expect(openItems()).toEqual(["washing"]);

    render("drying");
    expect(openItems()).toEqual(["washing"]);
    expect(scrolled.map((s) => s.id)).toEqual(["drying"]);
  });

  it("keeps the open question when the link loses its question", () => {
    render("drying");
    render(undefined);
    expect(openItems()).toEqual(["drying"]);
  });
});
