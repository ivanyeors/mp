// @vitest-environment jsdom
import { act, Suspense } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "../use-media-query";
import { useIsMobile } from "../use-mobile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PHONE = "(max-width: 767px)";

/**
 * A screen whose media queries the test sets. `useIsMobile` has read
 * `window.innerWidth` as well as the query, so a phone sets both.
 */
const screen = {
  matches: new Map<string, boolean>(),
  listeners: new Map<string, Set<() => void>>(),
  added: 0,
  removed: 0,
  set(query: string, value: boolean) {
    this.matches.set(query, value);
    if (query === PHONE) Object.defineProperty(window, "innerWidth", { configurable: true, value: value ? 375 : 1024 });
  },
  change(query: string, value: boolean) {
    this.set(query, value);
    for (const fn of this.listeners.get(query) ?? []) fn();
  },
};

beforeEach(() => {
  screen.matches.clear();
  screen.listeners.clear();
  screen.added = 0;
  screen.removed = 0;
  screen.set(PHONE, false);
  window.matchMedia = ((media: string) => ({
    get matches() {
      return screen.matches.get(media) ?? false;
    },
    media,
    onchange: null,
    addEventListener: (_: string, fn: () => void) => {
      screen.added++;
      if (!screen.listeners.has(media)) screen.listeners.set(media, new Set());
      screen.listeners.get(media)!.add(fn);
    },
    removeEventListener: (_: string, fn: () => void) => {
      screen.removed++;
      screen.listeners.get(media)?.delete(fn);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

/** Every value each render saw, first render first. */
function probe(read: () => boolean) {
  const seen: boolean[] = [];
  function Probe() {
    const value = read();
    seen.push(value);
    return <span>{String(value)}</span>;
  }
  return { seen, Probe };
}

const hooks = [
  { name: "useMediaQuery", query: "(min-width: 1024px)", read: () => useMediaQuery("(min-width: 1024px)") },
  { name: "useIsMobile", query: PHONE, read: () => useIsMobile() },
];

describe.each(hooks)("$name", ({ query, read }) => {
  it("is false on the server, whatever the screen", () => {
    screen.set(query, true);
    const { Probe } = probe(read);
    expect(renderToString(<Probe />)).toBe("<span>false</span>");
  });

  it("hydrates as false, with no mismatch, then takes the screen's value", () => {
    screen.set(query, true);
    const { Probe, seen } = probe(read);
    host = document.createElement("div");
    host.innerHTML = renderToString(<Probe />);
    document.body.append(host);
    seen.length = 0;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recoverable: unknown[] = [];
    act(() => {
      root = hydrateRoot(host!, <Probe />, { onRecoverableError: (e) => recoverable.push(e) });
    });
    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);
    expect(host.textContent).toBe("true");
    expect(recoverable).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("is the screen's value on the first render of a client navigation", () => {
    screen.set(query, true);
    const { Probe, seen } = probe(read);
    host = document.createElement("div");
    document.body.append(host);
    act(() => {
      root = createRoot(host!);
      root.render(<Probe />);
    });
    expect(seen[0]).toBe(true);
    expect(seen.every(Boolean)).toBe(true);
  });

  it("is the screen's value on the first render inside a server-skipped (`ssr: false`) boundary", async () => {
    // next/dynamic's `ssr: false` throws on the server inside a Suspense
    // boundary, so the browser renders that boundary fresh instead of
    // hydrating it (the appointments calendar relies on this).
    screen.set(query, true);
    const { Probe, seen } = probe(read);
    function ServerOnlyBailout(): never {
      throw new Error("bail out to client rendering");
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    host = document.createElement("div");
    host.innerHTML = renderToString(
      <Suspense fallback={<i>loading</i>}>
        <ServerOnlyBailout />
      </Suspense>,
    );
    document.body.append(host);
    await act(async () => {
      root = hydrateRoot(
        host!,
        <Suspense fallback={<i>loading</i>}>
          <Probe />
        </Suspense>,
        { onRecoverableError: () => undefined },
      );
    });
    errors.mockRestore();
    expect(host.textContent).toBe("true");
    expect(seen[0]).toBe(true);
  });

  it("follows a change event", () => {
    const { Probe } = probe(read);
    host = document.createElement("div");
    document.body.append(host);
    act(() => {
      root = createRoot(host!);
      root.render(<Probe />);
    });
    expect(host.textContent).toBe("false");
    act(() => screen.change(query, true));
    expect(host.textContent).toBe("true");
    act(() => screen.change(query, false));
    expect(host.textContent).toBe("false");
  });

  it("stops listening on unmount", () => {
    const { Probe } = probe(read);
    host = document.createElement("div");
    document.body.append(host);
    act(() => {
      root = createRoot(host!);
      root.render(<Probe />);
    });
    expect(screen.listeners.get(query)?.size).toBe(1);
    act(() => root!.unmount());
    root = null;
    expect(screen.listeners.get(query)?.size ?? 0).toBe(0);
    expect(screen.removed).toBe(screen.added);
  });
});
