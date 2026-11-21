// @vitest-environment jsdom
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => {
  let entries = ["/en-US/blog"];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    get entries() {
      return entries;
    },
    current: () => entries[entries.length - 1],
    reset(url: string) {
      entries = [url];
    },
    push: vi.fn((url: string) => {
      entries = [...entries, url];
      notify();
    }),
    back() {
      entries = entries.slice(0, -1);
      notify();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
});

vi.mock("next/navigation", () => {
  const router = { push: nav.push, replace: nav.push };
  return {
    useRouter: () => router,
    usePathname: () => useSyncExternalStore(nav.subscribe, () => nav.current().split("?")[0]),
    useSearchParams: () => {
      const search = useSyncExternalStore(nav.subscribe, () => nav.current().split("?")[1] ?? "");
      return new URLSearchParams(search);
    },
  };
});

import { BlogFilters } from "../blog-filters";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
function mount(url = "/en-US/blog") {
  nav.reset(url);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<BlogFilters availableLabels={["Sleep", "Neck"]} />));
}
const input = () => document.querySelector<HTMLInputElement>("input")!;
function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const label = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === name)!;

beforeEach(() => {
  vi.useFakeTimers();
  nav.push.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("BlogFilters", () => {
  it("writes the search to ?q= once typing stops for 300 ms, as one history entry", () => {
    mount();
    type("n");
    type("ne");
    type("neck");
    wait(299);
    expect(nav.push).not.toHaveBeenCalled();
    wait(1);
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.current()).toBe("/en-US/blog?q=neck");
  });

  it("does not push on load when the URL already holds the search", () => {
    mount("/en-US/blog?q=neck");
    expect(input().value).toBe("neck");
    wait(1000);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("drops ?q= when the box is cleared", () => {
    mount("/en-US/blog?label=Sleep&q=neck");
    type("");
    wait(300);
    expect(nav.current()).toBe("/en-US/blog?label=Sleep");
  });

  it("lets browser Back leave a search, and the box follows the URL", () => {
    mount();
    type("neck");
    wait(300);
    expect(nav.current()).toBe("/en-US/blog?q=neck");

    act(() => nav.back());
    wait(1000);
    expect(nav.current()).toBe("/en-US/blog");
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(input().value).toBe("");

    act(() => nav.push("/en-US/blog?q=neck"));
    expect(input().value).toBe("neck");
  });

  it("keeps what is typed while the URL is still catching up with the last search", () => {
    mount();
    const held: string[] = [];
    nav.push.mockImplementationOnce((url: string) => void held.push(url));
    type("neck");
    wait(300);
    type("necks");
    act(() => nav.push(held[0]));
    expect(input().value).toBe("necks");
    wait(300);
    expect(nav.current()).toBe("/en-US/blog?q=necks");
  });

  function holdPushes() {
    const held: string[] = [];
    nav.push.mockImplementation((url: string) => void held.push(url));
    const land = () => {
      nav.push.mockRestore();
      const url = held.shift()!;
      act(() => nav.push(url));
    };
    return { held, land };
  }
  const urlQ = () => new URLSearchParams(nav.current().split("?")[1]).get("q");

  it("keeps a cleared box cleared when the search it pushed earlier lands late", () => {
    mount();
    const slow = holdPushes();
    type("neck");
    wait(300);
    type("");
    wait(300);
    while (slow.held.length) {
      slow.land();
      expect(input().value).toBe("");
    }
    expect(urlQ()).toBeNull();
  });

  it("keeps an edit back to the URL's own search when the longer search it pushed earlier lands late", () => {
    mount("/en-US/blog?q=sleep");
    const slow = holdPushes();
    type("sleepy");
    wait(300);
    type("sleep");
    wait(300);
    while (slow.held.length) {
      slow.land();
      expect(input().value).toBe("sleep");
    }
    expect(urlQ()).toBe("sleep");
  });

  it("still follows a link to another search while its own push is in flight", () => {
    mount();
    holdPushes();
    type("neck");
    wait(300);
    nav.push.mockRestore();
    act(() => nav.push("/en-US/blog?q=pillow"));
    expect(input().value).toBe("pillow");
  });

  it("drops a search still waiting to be written when Back moves the URL under it", () => {
    mount();
    type("neck");
    wait(300);
    type("necks");
    act(() => nav.back());
    expect(input().value).toBe("");
    wait(1000);
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.current()).toBe("/en-US/blog");
    expect(input().value).toBe("");
  });

  it("keeps the search when a label is picked, also while the search is still waiting to be written", () => {
    mount();
    type("neck");
    act(() => label("Sleep").click());
    wait(1000);
    expect(new URLSearchParams(nav.current().split("?")[1]).get("q")).toBe("neck");
    expect(new URLSearchParams(nav.current().split("?")[1]).get("label")).toBe("Sleep");

    act(() => label("Sleep").click());
    wait(1000);
    expect(nav.current()).toBe("/en-US/blog?q=neck");
  });
});
