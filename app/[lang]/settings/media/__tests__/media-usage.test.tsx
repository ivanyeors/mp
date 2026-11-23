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
const replaced = {
  blogFeatured: 1,
  blogInline: 0,
  landingSlots: [],
  landingSections: 0,
  slideInSections: 0,
  productImages: 0,
  productVariants: 0,
  categories: 0,
  partners: 0,
  partnersPages: 0,
};

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
    if (url === "/api/media" && init?.method === "POST") return json({ ok: true, asset: { id: "u1", name: "new.png", hosted_url: "https://cdn.test/new.webp", created_at: "2026-11-23T00:00:00Z" } });
    if (url === "/api/media/replace") return json({ ok: true, summary: replaced });
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

    act(() => card("Hero shot")!.click());
    await until(() => (badge("Hero shot") === "1 use" ? true : null));

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

  it("drops that usage once the file is replaced everywhere", async () => {
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
    act(() => card("Hero shot")!.click());
    await until(() => (badge("Hero shot") === "1 use" ? true : null));

    act(() => card("Hero shot")!.querySelector<HTMLButtonElement>('button[title="Replace everywhere"]')!.click());
    const replacement = await until(
      () =>
        document.body
          .querySelector<HTMLImageElement>('button[type="button"] > img[alt="Side shot"]')
          ?.closest<HTMLButtonElement>("button") ?? null,
    );
    act(() => replacement.click());
    await until(() => (fetchMock.mock.calls.some(([u]) => String(u) === "/api/media/replace") ? true : null));
    await settle(50);

    expect(badge("Hero shot")).toBe("Unused");
  });
});
