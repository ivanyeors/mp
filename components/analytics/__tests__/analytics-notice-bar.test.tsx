// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/en-US";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { AnalyticsNoticeBar } = await import("../analytics-notice-bar");

let root: Root | null = null;
let host: HTMLDivElement;
beforeEach(() => {
  pathname = "/en-US";
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
});

const bar = () => host.querySelector('[role="status"]');
const render = () => act(() => (root ??= createRoot(host)).render(<AnalyticsNoticeBar />));
const gotIt = () =>
  act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "Got it")!.click());

/** localStorage that throws, as in some private modes. */
function blockStorage() {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
}

describe("AnalyticsNoticeBar", () => {
  it("renders nothing on the server, so the first paint has no bar", () => {
    expect(renderToString(<AnalyticsNoticeBar />)).toBe("");
  });

  it("shows after hydration for a first-time visitor, with no mismatch", () => {
    host.innerHTML = renderToString(<AnalyticsNoticeBar />);
    const recoverable: unknown[] = [];
    act(() => {
      root = hydrateRoot(host, <AnalyticsNoticeBar />, { onRecoverableError: (e) => recoverable.push(e) });
    });
    expect(bar()).not.toBeNull();
    expect(recoverable).toEqual([]);
  });

  it("stays hidden once Got it is stored, on this page and the next", () => {
    render();
    expect(bar()).not.toBeNull();
    gotIt();
    expect(bar()).toBeNull();
    expect(localStorage.getItem("mp_analytics_notice_ok")).toBe("1");
    pathname = "/en-US/shop";
    render();
    expect(bar()).toBeNull();
  });

  it("stays hidden for a visitor who dismissed it on an earlier visit", () => {
    localStorage.setItem("mp_analytics_notice_ok", "1");
    render();
    expect(bar()).toBeNull();
  });

  it("is never shown on admin pages", () => {
    pathname = "/en-US/settings/orders";
    render();
    expect(bar()).toBeNull();
    pathname = "/en-US";
    render();
    expect(bar()).not.toBeNull();
  });

  it("with storage blocked, shows, and Got it hides it for the rest of the visit", () => {
    blockStorage();
    render();
    expect(bar()).not.toBeNull();
    gotIt();
    expect(bar()).toBeNull();
    pathname = "/en-US/shop";
    render();
    expect(bar()).toBeNull();
  });
});
