// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/settings/orders" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const { TopLoadingBar } = await import("@/components/ui/top-loading-bar");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The bar measures where the sidebar header sits on mount and again on every
 * route change, coalesced onto one animation frame per burst.
 */
describe("TopLoadingBar offsets", () => {
  afterEach(() => vi.restoreAllMocks());

  it("schedules one measurement on mount and one per route change", () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const flush = () => act(() => frames.splice(0).forEach((cb) => cb(0)));

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<TopLoadingBar />));
    expect(raf).toHaveBeenCalledTimes(1);
    flush();

    nav.pathname = "/settings/inventory";
    act(() => root.render(<TopLoadingBar />));
    expect(raf).toHaveBeenCalledTimes(2);
    flush();

    // A re-render on the same route measures nothing.
    act(() => root.render(<TopLoadingBar />));
    expect(raf).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
  });
});
