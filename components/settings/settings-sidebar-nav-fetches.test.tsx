// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/en-US/settings";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: () => {}, replace, refresh: () => {}, prefetch: () => {} }),
}));

const { SettingsSidebarNav } = await import("./settings-sidebar-nav");

const permissions = ["results", "customers", "orders"] as const;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  pathname = "/en-US/settings";
  replace.mockClear();
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(url).includes("/api/admin/context")
        ? { signedIn: true, permissions: [...permissions] }
        : String(url).includes("queue-counts")
          ? { needsAssign: 1, stuck: 0 }
          : { counts: null },
  }));
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

const render = () =>
  root!.render(
    <SettingsSidebarNav initialAuth={{ signedIn: true, permissions: [...permissions] }}>
      <p>page</p>
    </SettingsSidebarNav>,
  );
const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};
const count = (part: string) => fetchMock.mock.calls.filter((c) => String(c[0]).includes(part)).length;

describe("badge reads per navigation", () => {
  it("reads each badge once on mount and once per navigation", async () => {
    root = createRoot(document.createElement("div"));
    await act(async () => render());
    await settle();
    expect(count("/api/admin/context")).toBe(0);
    expect(count("queue-counts")).toBe(1);
    expect(count("followup-counts")).toBe(1);

    pathname = "/en-US/settings/orders";
    await act(async () => render());
    await settle();
    expect(count("/api/admin/context")).toBe(1);
    expect(count("queue-counts")).toBe(2);
    expect(count("followup-counts")).toBe(2);
  });

  it("still reads the badges after a navigation that drops the permission, and stops", async () => {
    root = createRoot(document.createElement("div"));
    await act(async () => render());
    await settle();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/api/admin/context") ? { signedIn: true, permissions: ["orders"] } : { counts: null },
    }));
    pathname = "/en-US/settings/orders";
    await act(async () => render());
    await settle();
    expect(count("queue-counts")).toBe(2);
    pathname = "/en-US/settings/inventory";
    await act(async () => render());
    await settle();
    expect(count("queue-counts")).toBe(2);
  });
});

describe("session changes", () => {
  const host = () => document.body.lastElementChild as HTMLElement;
  const link = (href: string) => host().querySelector(`a[href="/en-US${href}"]`);
  const renderAuth = (auth: { signedIn: boolean; permissions: string[] }) =>
    root!.render(
      <SettingsSidebarNav initialAuth={auth as never}>
        <p>page</p>
      </SettingsSidebarNav>,
    );
  const mountHere = async () => {
    const el = document.createElement("div");
    document.body.append(el);
    root = createRoot(el);
    await act(async () => render());
    await settle();
  };
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("follows the server layout when it sends other permissions or a signed-out session", async () => {
    await mountHere();
    expect(link("/settings/results")).not.toBeNull();

    await act(async () => renderAuth({ signedIn: true, permissions: ["orders"] }));
    await settle();
    expect(link("/settings/results")).toBeNull();
    expect(link("/settings/orders")).not.toBeNull();

    await act(async () => renderAuth({ signedIn: false, permissions: [] }));
    await settle();
    expect(host().textContent).not.toContain("page");
    expect(replace).toHaveBeenLastCalledWith(`/en-US/account/login?next=${encodeURIComponent("/en-US/settings")}`);
  });

  it("sends Staff to the Admin Panel home when the refetch after a navigation drops that page", async () => {
    await mountHere();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/api/admin/context") ? { signedIn: true, permissions: ["results"] } : { counts: null },
    }));
    pathname = "/en-US/settings/orders";
    await act(async () => render());
    await settle();
    expect(replace.mock.calls).toEqual([["/en-US/settings?denied=orders"]]);
  });

  it("stays on the page when the refetch after a navigation still grants it", async () => {
    await mountHere();
    pathname = "/en-US/settings/orders";
    await act(async () => render());
    await settle();
    expect(count("/api/admin/context")).toBe(1);
    expect(replace).not.toHaveBeenCalled();
  });
});
