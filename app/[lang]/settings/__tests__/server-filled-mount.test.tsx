// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/blogs",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { default: BlogsPage } = await import("../blogs/blogs-client");
const { default: FormsPage } = await import("../forms/forms-client");

const post = { id: "b1", slug: "first", status: "published", content: { "en-US": { title: "First post" } }, image_url: null, author: "Mpillow", published_at: null, created_at: "2026-10-01T00:00:00Z" };
const catalog = { options: [{ id: "friend", labels: { "en-US": "A friend", "zh-CN": "朋友" }, active: true }] };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes("/api/blogs") ? { ok: true, rows: [post] } : { ok: true, catalog }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async (node: React.ReactNode) => {
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

const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("Blogs list", () => {
  it("fetches nothing on mount in Strict Mode when the server sent the rows", async () => {
    await mount(
      <StrictMode>
        <BlogsPage initialData={{ ok: true, rows: [post] as never }} />
      </StrictMode>,
    );
    expect(urls()).toEqual([]);
    expect(host.textContent).toContain("First post");
  });

  it("fetches on mount when the server read failed", async () => {
    await mount(<BlogsPage />);
    expect(urls()).toEqual(["/api/blogs"]);
    expect(host.textContent).toContain("First post");
  });

  it("stops the spinner when that fetch fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await mount(<BlogsPage />);
    await act(async () => {});
    expect(host.querySelector(".animate-spin")).toBeNull();
  });
});

describe("Forms discovery-source options", () => {
  it("fetches nothing on mount in Strict Mode when the server sent the catalog", async () => {
    await mount(
      <StrictMode>
        <FormsPage initialData={{ ok: true, catalog: catalog as never }} />
      </StrictMode>,
    );
    expect(urls()).toEqual([]);
    expect(host.textContent).toContain("A friend");
  });
});
