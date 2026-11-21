// @vitest-environment jsdom
import { byLabel, click, settle } from "@/components/block-editor/__tests__/dom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_WRITING_READ_FAILED } from "@/lib/ai/settings";
import type { AiUsageLine, AiUsageThisMonth } from "@/lib/ai/usage";
import { AI_WRITING_DEFAULTS, type AiWritingSettings } from "@/lib/ai/writing-settings";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { AiWritingSection } = await import("../ai-writing-section");

const line = (calls: number, costUsd: number): AiUsageLine => ({ calls, inputTokens: calls * 1000, outputTokens: calls * 500, costUsd });
const none = line(0, 0);
const usage: AiUsageThisMonth = {
  since: "2026-10-31T16:00:00.000Z",
  byKind: {
    draft: line(4, 0.4),
    translate: none,
    subjects: none,
    preview_lines: none,
    rewrite: none,
    product_description: none,
    product_seo: none,
  },
  total: line(4, 0.4),
  unlistedModelCalls: 0,
};
const settings: AiWritingSettings = { ...AI_WRITING_DEFAULTS, limitDay: 42 };

let fetchMock: ReturnType<typeof vi.fn>;
const answer = (status: number, body: unknown) => fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async (node: React.ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<StrictMode>{node}</StrictMode>));
  await settle();
  await click(byLabel("Toggle AI writing")!);
};
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const getRequests = () => fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === "GET");

describe("AI writing section", () => {
  it("shows the saved settings and this month's use", async () => {
    answer(200, { ok: true, settings, configured: true, usage });
    await mount(<AiWritingSection configured initial={{ settings, usage }} />);
    expect(host.querySelector<HTMLInputElement>("#ai-writing-limit-day")?.value).toBe("42");
    expect(host.textContent).toContain("Claude is configured");
    expect(host.textContent).toContain("4 drafts");
  });

  it("asks the browser for nothing on mount: the page hands the settings in", async () => {
    answer(200, { ok: true, settings, configured: true, usage });
    await mount(<AiWritingSection configured initial={{ settings, usage }} />);
    expect(getRequests()).toEqual([]);
  });

  it("says the settings could not be read, and shows no form to save over them", async () => {
    answer(500, { error: AI_WRITING_READ_FAILED });
    await mount(<AiWritingSection configured initial={{ error: AI_WRITING_READ_FAILED }} />);
    expect(host.textContent).toContain(AI_WRITING_READ_FAILED);
    expect(host.querySelector("#ai-writing-enabled")).toBeNull();
  });
});
