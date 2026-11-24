// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { settle } from "@/components/block-editor/__tests__/dom";

const sectionRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/components/slide-in-pages/slide-in-content", () => ({
  useSlideInHeader: () => ({ title: "Sheet title", description: "Sheet description" }),
  SlideInPageSections: () => {
    sectionRenders.count += 1;
    return <p>Sections</p>;
  },
}));

const { AmbassadorsSlideIn } = await import("../ambassadors-slide-in");
const { BasicMpillowLearnMoreSheet } = await import("../basic-mpillow-learn-more-slide-in");
const { CervicalNeckSupportSheet, openCervicalNeckSupportSheet } = await import("../cervical-neck-support");

let root: Root | null = null;
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
});

async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
}

const sheets: [string, () => Promise<void>][] = [
  [
    "Ambassadors",
    async () => {
      await mount(<AmbassadorsSlideIn />);
      await act(async () => document.querySelector<HTMLButtonElement>("button")!.click());
    },
  ],
  ["Basic Mpillow", () => mount(<BasicMpillowLearnMoreSheet open onOpenChange={() => {}} />)],
  [
    "Cervical neck support",
    async () => {
      await mount(<CervicalNeckSupportSheet />);
      await act(async () => openCervicalNeckSupportSheet());
    },
  ],
];

function viewport() {
  const el = document.querySelector<HTMLElement>(".overflow-y-auto.overscroll-contain");
  if (!el) throw new Error("The sheet has no scrolling viewport.");
  return el;
}

function setGeometry(el: HTMLElement, scrollHeight: number, clientHeight: number, scrollTop: number) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: scrollTop });
}

const barTransform = () =>
  document.querySelector<HTMLElement>('[data-slot="progress-indicator"]')?.style.transform;

async function scrollTo(el: HTMLElement, scrollTop: number) {
  el.scrollTop = scrollTop;
  await act(async () => el.dispatchEvent(new Event("scroll")));
  await settle(50);
}

describe.each(sheets)("%s sheet's reading progress", (_name, open) => {
  it("follows the viewport's scroll and a window resize", async () => {
    await open();
    const el = viewport();
    expect(barTransform()).toBe("translateX(-100%)");

    setGeometry(el, 1500, 500, 0);
    await scrollTo(el, 250);
    expect(barTransform()).toBe("translateX(-75%)");

    await scrollTo(el, 1000);
    expect(barTransform()).toBe("translateX(0%)");

    setGeometry(el, 2500, 500, 1000);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(barTransform()).toBe("translateX(-50%)");
  });

  it("does not render the page's sections again while the visitor scrolls", async () => {
    await open();
    const el = viewport();
    setGeometry(el, 1500, 500, 0);
    const before = sectionRenders.count;

    await scrollTo(el, 250);
    await scrollTo(el, 600);

    expect(barTransform()).toBe("translateX(-40%)");
    expect(sectionRenders.count).toBe(before);
  });
});
