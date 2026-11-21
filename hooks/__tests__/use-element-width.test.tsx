// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useElementWidth } from "../use-element-width";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Watch = { el: Element | null; report: (width: number) => void; live: boolean };
let watches: Watch[] = [];
class FakeResizeObserver {
  private watch: Watch;
  constructor(callback: ResizeObserverCallback) {
    this.watch = {
      el: null,
      live: true,
      report: (width) => callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver),
    };
    watches.push(this.watch);
  }
  observe(el: Element) {
    this.watch.el = el;
  }
  unobserve() {}
  disconnect() {
    this.watch.live = false;
  }
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  watches = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function Probe({ show = true }: { show?: boolean }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <>
      <output>{width}</output>
      {show && <div ref={ref} />}
    </>
  );
}
const shown = () => host.querySelector("output")!.textContent;
const live = () => watches.filter((w) => w.live);

describe("useElementWidth", () => {
  it("reports the element's width as it resizes", () => {
    act(() => root.render(<Probe />));
    act(() => live()[0]!.report(320));
    expect(shown()).toBe("320");
    act(() => live()[0]!.report(512));
    expect(shown()).toBe("512");
  });

  it("stops watching when the element goes, while the component stays", () => {
    act(() => root.render(<Probe />));
    act(() => root.render(<Probe show={false} />));
    expect(live()).toEqual([]);
  });

  it("stops watching when the component unmounts, in Strict Mode too", () => {
    act(() =>
      root.render(
        <StrictMode>
          <Probe />
        </StrictMode>,
      ),
    );
    expect(live()).toHaveLength(1);
    act(() => root.render(null));
    expect(live()).toEqual([]);
  });
});
