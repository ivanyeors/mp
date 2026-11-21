// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogEditorRow } from "../blog-editor-client";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "en-US", id: "b1" }),
  usePathname: () => "/en-US/settings/blogs/b1",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/image-picker", () => ({ ImagePicker: () => null }));

const { default: BlogEditorPage } = await import("../blog-editor-client");

const row = (title: string): BlogEditorRow => ({
  slug: "first-post",
  status: "draft",
  author: "Mpillow",
  image_url: null,
  labels: [],
  content: { "en-US": { title } },
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  toastError.mockClear();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => (init?.method === "PATCH" ? { ok: true } : { ok: true, row: row("From the server") }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async (node: ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
};
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const calls = () => fetchMock.mock.calls.map((c) => `${(c[1] as RequestInit | undefined)?.method ?? "GET"} ${c[0]}`);
const spinning = () => host.querySelector(".animate-spin") !== null;
const field = (value: string) => [...host.querySelectorAll("input")].some((i) => i.value === value);
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;

describe("Blog editor load", () => {
  it("fetches nothing on mount in Strict Mode when the server sent the post", async () => {
    await mount(
      <StrictMode>
        <BlogEditorPage initialData={{ ok: true, row: row("Sent with the page") }} />
      </StrictMode>,
    );
    expect(calls()).toEqual([]);
    expect(field("Sent with the page")).toBe(true);
  });

  it("loads the post on mount when the server read failed", async () => {
    await mount(<BlogEditorPage />);
    expect(calls()).toEqual(["GET /api/blogs/b1"]);
    expect(spinning()).toBe(false);
    expect(field("From the server")).toBe(true);
  });

  it("stops the spinner and says so when that load fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await mount(<BlogEditorPage />);
    expect(spinning()).toBe(false);
    expect(toastError).toHaveBeenCalledWith("Couldn't load this post.");
  });

  it("reloads the post after a save, and keeps the form when that reload fails", async () => {
    await mount(<BlogEditorPage initialData={{ ok: true, row: row("Sent with the page") }} />);
    await act(async () => button("Save").click());
    expect(calls()).toEqual(["PATCH /api/blogs/b1", "GET /api/blogs/b1"]);
    expect(field("From the server")).toBe(true);

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ok: true, status: 200, json: async () => ({ ok: true }) };
      throw new Error("offline");
    });
    await act(async () => button("Save").click());
    expect(spinning()).toBe(false);
    expect(field("From the server")).toBe(true);
    expect(toastError).toHaveBeenCalledWith("Couldn't load this post.");
  });
});
