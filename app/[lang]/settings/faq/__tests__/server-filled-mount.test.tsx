// @vitest-environment jsdom
import { settle } from "@/components/block-editor/__tests__/dom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FaqInitialData } from "../faq-client";

vi.mock("next/navigation", () => ({ usePathname: () => "/en-US/settings/faq" }));
vi.mock("@/components/settings/page-faqs-panel", () => ({ PageFaqsPanel: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: SettingsFaqPage } = await import("../faq-client");

const initialData: FaqInitialData = {
  categories: {
    ok: true,
    rows: [{ id: "c1", key: "shipping", labels: { "en-US": "Shipping", "zh-CN": "运送" }, position: 0, visible: true }],
  },
  items: { ok: true, rows: [] },
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ rows: [] }) }));
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("FAQ settings mount", () => {
  it("fetches nothing on mount in Strict Mode when the server sent the categories and questions", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <StrictMode>
          <SettingsFaqPage initialData={initialData} />
        </StrictMode>,
      ),
    );
    await settle();
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([]);
    expect(host.textContent).toContain("Shipping");
  });
});
