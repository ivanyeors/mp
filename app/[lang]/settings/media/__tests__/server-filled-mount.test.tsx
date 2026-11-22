// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settle } from "@/components/block-editor/__tests__/dom";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/media",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: MediaPage } = await import("@/app/[lang]/settings/media/media-client");

const assets = [
  { id: "a1", name: "Hero shot", hosted_url: "https://cdn.example/a1.jpg", created_at: "2026-11-01T00:00:00Z", kind: "image", tags: [] },
];

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const body =
      url === "/api/media/usage"
        ? { ok: true, usages: {} }
        : url.startsWith("/api/site-settings")
          ? { ok: true, settings: [] }
          : url === "/api/media-folders"
            ? { ok: true, folders: [] }
            : { ok: true, assets };
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  });
}

let root: Root | null = null;
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const mount = async (node: React.ReactNode) => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await settle(20);
};

const requested = (fetchMock: ReturnType<typeof mockFetch>) =>
  [...new Set(fetchMock.mock.calls.map(([u]) => String(u).split("?")[0]))].sort();

describe("Media gallery mount", () => {
  it("reads only the usages and landing overrides in Strict Mode when the server sent the files and folders", async () => {
    const fetchMock = mockFetch();
    await mount(
      <StrictMode>
        <MediaPage initialData={{ assets: { ok: true, assets }, folders: { ok: true, folders: [] } }} />
      </StrictMode>,
    );
    expect(requested(fetchMock)).toEqual(["/api/media/usage", "/api/site-settings"]);
    expect(document.body.querySelector('img[alt="Hero shot"]')).not.toBeNull();
  });

  it("reads the files and folders too when the server could not", async () => {
    const fetchMock = mockFetch();
    await mount(<MediaPage initialData={null} />);
    expect(requested(fetchMock)).toEqual(["/api/media-assets", "/api/media-folders", "/api/media/usage", "/api/site-settings"]);
    expect(document.body.querySelector('img[alt="Hero shot"]')).not.toBeNull();
  });
});
