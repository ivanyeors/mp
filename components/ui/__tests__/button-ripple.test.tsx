// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

/**
 * A click starts a ripple that clears itself 600ms later. A Button unmounted
 * before then must cancel that timer: otherwise it sets state once the test
 * file's jsdom is gone, React's update reaches for `window`, and vitest fails
 * the whole run on an unhandled `ReferenceError` (it did on #411, from
 * split-block.test.tsx, with every test passing).
 */
describe("Button ripple", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets no state after it unmounts, even once window is gone", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<Button>Save changes</Button>));
    act(() => host.querySelector("button")!.click());
    act(() => root.unmount());

    const win = globalThis.window;
    // As after jsdom's teardown.
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    } finally {
      globalThis.window = win;
    }
  });
});
