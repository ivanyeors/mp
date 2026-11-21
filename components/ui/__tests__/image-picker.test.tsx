// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The media picker loads the library each time it opens, starts each open
 * with no search or filters, and keeps a file dropped in before that load
 * lands.
 */

vi.mock("@/components/settings/select-from-drive-dialog", () => ({ SelectFromDriveDialog: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ImagePicker } from "../image-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const asset = (id: string) => ({ id, name: `${id}.png`, hosted_url: `https://cdn.test/${id}.png`, created_at: "2026-11-01T00:00:00Z" });
const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

// Each library load waits until the test lets it land.
let loads: Array<(ids: string[]) => Promise<void>> = [];
let uploads: Array<(id: string) => Promise<void>> = [];
const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (url === "/api/media" && init?.method === "POST") {
    return new Promise<Response>((resolve) => uploads.push(async (id) => void resolve(json({ ok: true, asset: asset(id) }))));
  }
  if (url.startsWith("/api/media-assets")) {
    return new Promise<Response>((resolve) => loads.push(async (ids) => void resolve(json({ ok: true, assets: ids.map(asset) }))));
  }
  if (url === "/api/media/usage") return Promise.resolve(json({ ok: true, usages: {} }));
  return Promise.resolve(json({ ok: true, folders: [] }));
});

let root: Root | null = null;
function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<ImagePicker onSelect={() => undefined} />));
}
const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
const open = async () => {
  await act(async () => button("Browse Media").click());
  await flush();
};
const close = async () => {
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await flush();
};
const land = async (ids: string[]) => {
  await act(() => loads.shift()!(ids));
  await flush();
};
const names = () => [...document.querySelectorAll("[role=dialog] span[title]")].map((s) => s.textContent);
const search = () => document.querySelector<HTMLInputElement>("[role=dialog] input[type=text], [role=dialog] input[placeholder*='earch']")!;

beforeEach(() => {
  loads = [];
  uploads = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("ImagePicker", () => {
  it("loads the library each time it opens, and not while closed", async () => {
    mount();
    expect(loads).toHaveLength(0);
    await open();
    expect(loads).toHaveLength(1);
    await land(["a", "b"]);
    expect(names()).toEqual(["a.png", "b.png"]);
    await close();
    await open();
    expect(loads).toHaveLength(1);
  });

  it("starts each open with the search cleared", async () => {
    mount();
    await open();
    await land(["neck", "sleep"]);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search(), "neck");
      search().dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    expect(names()).toEqual(["neck.png"]);
    await close();
    await open();
    expect(search().value).toBe("");
    await land(["neck", "sleep"]);
    expect(names()).toEqual(["neck.png", "sleep.png"]);
  });

  it("keeps a file dropped in before the library load lands", async () => {
    mount();
    await open();
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    const file = new File(["x"], "fresh.png", { type: "image/png" });
    Object.assign(drop, { dataTransfer: { files: [file], types: ["Files"] } });
    await act(async () => void document.querySelector("[role=dialog]")!.dispatchEvent(drop));
    await act(() => uploads.shift()!("fresh"));
    await flush();

    // The grid shows once the load lands. The load was asked for before the upload existed, so it lacks it.
    await land(["a"]);
    expect(names()).toEqual(["fresh.png", "a.png"]);
  });

  it("shows the latest load when an older one lands after it", async () => {
    mount();
    await open();
    await close();
    await open();
    expect(loads).toHaveLength(2);
    const [older, newer] = loads;
    loads = [];
    await act(() => newer(["new"]));
    await flush();
    await act(() => older(["old"]));
    await flush();
    expect(names()).toEqual(["new.png"]);
  });
});
