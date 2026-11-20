// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settle, until } from "@/components/block-editor/__tests__/dom";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/media",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: MediaPage } = await import("@/app/[lang]/settings/media/media-client");

/**
 * The grid's usage badge reads the URL usage map first and falls back to what
 * the per-asset endpoint found when the file was opened. A later refresh of
 * the file list (upload, Drive import, move) must not drop that fallback.
 */
const asset = (id: string, name: string) => ({
  id,
  name,
  hosted_url: `https://cdn.example/${id}.jpg`,
  created_at: "2026-11-01T00:00:00Z",
  kind: "image",
  tags: [],
});
const assets = [asset("a1", "Hero shot"), asset("a2", "Side shot")];
const usage = { type: "blog_featured", label: "Sleep guide", ref_id: "post-1" };

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }));
}

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url === "/api/media/usage") return json({ ok: true, usages: {} });
    if (url.startsWith("/api/site-settings")) return json({ ok: true, settings: [] });
    if (url === "/api/media-assets/a1/usage") return json({ ok: true, usages: [usage] });
    if (url.match(/^\/api\/media-assets\/[^/]+\/usage$/)) return json({ ok: true, usages: [] });
    if (url === "/api/media-assets") return json({ ok: true, assets });
    if (url === "/api/media" && init?.method === "POST") return json({ ok: true });
    return json({ ok: true });
  });
}

let root: Root | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const card = (name: string) =>
  document.body.querySelector<HTMLImageElement>(`img[alt="${name}"]`)?.closest<HTMLElement>(".cursor-pointer") ?? null;
const badge = (name: string) => card(name)?.querySelector(".absolute.top-2.left-2")?.textContent ?? null;

describe("Media gallery usage badge", () => {
  it("keeps a usage found by opening a file after the file list reloads", async () => {
    const fetchMock = mockFetch();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <MediaPage initialData={{ assets: { ok: true, assets }, folders: { ok: true, folders: [] } }} />,
      ),
    );
    await until(() => (badge("Hero shot") === "Unused" ? true : null));

    // Opening the file finds a usage the URL map missed; the grid marks it used.
    act(() => card("Hero shot")!.click());
    await until(() => (badge("Hero shot") === "1 use" ? true : null));

    // An upload reloads the file list.
    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["x"], "new.jpg", { type: "image/jpeg" })] });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await until(() =>
      fetchMock.mock.calls.filter(([u, i]) => String(u) === "/api/media-assets" && !i).length > 0 ? true : null,
    );
    await settle(50);

    expect(badge("Hero shot")).toBe("1 use");
    expect(badge("Side shot")).toBe("Unused");
  });
});
