// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SunburstMenu } from "../sunburst-menu";

let containerWidth = 0;
let resized: (() => void)[] = [];
class FakeResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(el: Element) {
    resized.push(() => this.callback([{ target: el, contentRect: { width: containerWidth } } as ResizeObserverEntry], this as unknown as ResizeObserver));
  }
  unobserve() {}
  disconnect() {}
}

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  resized = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => containerWidth);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: containerWidth }) as DOMRect);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const menu = () => host.querySelector<HTMLElement>('[role="menu"]')!;
const mount = () =>
  act(() => root!.render(<SunburstMenu root={[{ id: "a", label: "A" }]} onSelect={() => {}} size={320} />));

describe("SunburstMenu sizes itself to its container", () => {
  it("keeps the size it was given in a wide container", () => {
    containerWidth = 600;
    mount();
    expect(menu().style.width).toBe("80px");
  });

  it("shrinks to a narrow container", () => {
    containerWidth = 160;
    mount();
    expect(menu().style.width).toBe("36px");
  });

  it("follows the container as it resizes", () => {
    containerWidth = 600;
    mount();
    containerWidth = 160;
    act(() => resized.forEach((r) => r()));
    expect(menu().style.width).toBe("36px");
  });
});
