// @vitest-environment jsdom
import { byLabel, click, settle } from "@/components/block-editor/__tests__/dom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ReviewSlaSection } = await import("../review-sla-section");

const saved = {
  settings: {
    workingDays: 7,
    reminderIntervalDays: 2,
    remindTelegram: false,
    remindEmail: true,
    opsEmail: "ops@mpillow.test",
    authExpiryBufferHours: 60,
    authHoldEnabled: false,
  },
  paymentReminders: { enabled: false, firstDelayDays: 5, intervalDays: 4, maxReminders: 2 },
  draftReminders: { enabled: false },
};

const server = { up: false };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  server.up = false;
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => ({ ok: true, ...body }) };
    }
    return server.up
      ? { ok: true, status: 200, json: async () => ({ ok: true, ...saved }) }
      : { ok: false, status: 500, json: async () => ({ error: "connection reset" }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<StrictMode><ReviewSlaSection /></StrictMode>));
  await settle();
  await click(byLabel("Toggle Review SLA")!);
};
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const puts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
const saveButton = () => byLabel("Save settings") as HTMLButtonElement | null;
const alertText = () => host.querySelector('[role="alert"]')?.textContent ?? "";

describe("Review SLA section after a failed load", () => {
  it("says the settings could not be read, offers Retry, and leaves nothing to save over them", async () => {
    await mount();
    const save = saveButton();
    if (save) await click(save);
    await settle();
    expect(puts()).toEqual([]);
    expect(save === null || save.disabled).toBe(true);
    expect(alertText()).toContain("Couldn't read the Review SLA settings");
    expect(byLabel("Retry")).not.toBeNull();
    expect(host.querySelector("#sla-auth-hold")).toBeNull();
  });

  it("shows the saved values once Retry reaches the server, and saves those", async () => {
    await mount();
    server.up = true;
    await click(byLabel("Retry")!);
    await settle();

    expect(alertText()).toBe("");
    expect(host.querySelector<HTMLInputElement>("#sla-ops-email")?.value).toBe("ops@mpillow.test");
    expect(host.querySelector("#sla-auth-hold")?.getAttribute("aria-checked")).toBe("false");
    expect(host.querySelector("#pay-remind")?.getAttribute("aria-checked")).toBe("false");
    expect(host.querySelector("#draft-remind")?.getAttribute("aria-checked")).toBe("false");

    await click(saveButton()!);
    await settle();
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(String(puts()[0]![1].body))).toEqual({
      ...saved.settings,
      paymentReminders: saved.paymentReminders,
      draftReminders: saved.draftReminders,
    });
  });

  it("keeps the alert, not the defaults, when Retry fails again", async () => {
    await mount();
    await click(byLabel("Retry")!);
    await settle();
    expect(alertText()).toContain("Couldn't read the Review SLA settings");
    expect(saveButton()).toBeNull();
    expect(puts()).toEqual([]);
  });
});
