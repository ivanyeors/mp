// @vitest-environment jsdom
import { click, settle, typeField, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { ContentCheck } from "@/lib/email-campaigns/content-checks";
import type { Campaign, CampaignDraftInput } from "@/lib/email-campaigns/rules";
import type { CampaignReadiness } from "@/lib/email-campaigns/sender";

const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
    { id: "cta", type: "buttons", buttons: [{ label: "Read the care guide", target: "url", url: "https://old.example.com/care", style: "primary" }] },
  ],
  fallbacks: {},
};
const SAVED: Campaign = {
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: null,
  body: "",
  content: CONTENT,
  greeting: true,
  button: null,
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
  id: ID,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
};

const DEAD = "Block 2, Buttons: the button to old.example.com/care answered 404";
const NO_PREVIEW = "Recommended: write a preview line: without one, the inbox shows the start of the email instead";
const links: ContentCheck = {
  key: "links",
  ok: false,
  advisory: false,
  detail: DEAD,
  issues: [{ blockId: "cta", text: DEAD, what: "the button to old.example.com/care answered 404" }],
};
const previewLine: ContentCheck = { key: "preview_line", ok: false, advisory: true, detail: NO_PREVIEW, issues: [{ blockId: null, text: NO_PREVIEW, what: NO_PREVIEW }] };
const ok = (key: string) => ({ key, ok: true, detail: `${key} ok` });
const READINESS: CampaignReadiness = {
  checks: [ok("transport"), ok("from"), ok("reply_to"), ok("site"), ok("unsubscribe_route"), ok("unsubscribe_secret"), ok("pause"), links, ok("send_limit")],
  advice: [previewLine],
  ready: false,
  allowance: { remaining: 62, binding: "daily", limits: { daily: 100, monthly: 3000 }, used: { daily: 38, monthly: 140 }, roomAt: null },
  sender: { from: "Mpillow <hello@hello.mpillow.com>", replyTo: "support@mpillow.com" },
};

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "", from: null })),
  saveCampaign: vi.fn(async (id: string | null) => ({ ok: true as const, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");

let root: Root | null = null;
function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<CampaignEditor campaign={SAVED} draft={SAVED} stats={null} segments={[]} staffEmail="owner@mpillow.com" />));
}

const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) ?? null;
const tab = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)!;
const openTab = async (name: string) => {
  await act(async () => {
    tab(name).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    tab(name).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
  });
};
const card = (id: string) => document.querySelector<HTMLElement>(`li[data-block-id="${id}"]`)!;
const beside = (id: string) => card(id).querySelector("[data-block-warnings]")?.textContent ?? null;
const step = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('ol[aria-label="Before you send"] > li')].find((li) => li.querySelector("span span")?.textContent === label)!;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  actions.checkCampaignReadiness.mockResolvedValue(READINESS);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

describe("The email, in the Send card", () => {
  it("lists each failure with its block, then the advice, and a press takes Staff to the block, selected", async () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    mount();
    await openTab("Send");
    const email = await until(() => (step("The email")?.textContent?.includes(DEAD) ? step("The email") : null));
    expect(email.textContent).toContain("1 thing to fix before it can go:");
    expect(email.textContent).toContain(NO_PREVIEW);
    expect([...email.querySelectorAll("button")].map((b) => b.textContent)).toEqual([DEAD]);
    expect(step("Every check passes").textContent).toContain("are all fine");

    await click(button(DEAD)!);
    await settle(20);
    expect(tab("Write").getAttribute("aria-selected")).toBe("true");
    expect(card("cta").dataset.selected).toBe("true");
    expect(document.activeElement).toBe(card("cta"));
    expect(scrolled.mock.contexts).toContain(card("cta"));
    scrolled.mockRestore();
  });

  it("keeps Send to N people off while a check holds the wave", async () => {
    actions.planCampaignWave.mockResolvedValue({
      ok: true,
      started: false,
      batchSize: 20,
      readiness: READINESS,
      wave: "w1",
      plan: { considered: 3, eligible: 3, eligibleBuyers: 0, excluded: {}, alreadySent: 0, failed: 0 },
      customerIds: [],
      requested: 10,
      limitedBy: null,
      waiting: 0,
      leftOutBySegment: [],
      fit: [],
    });
    mount();
    await openTab("Send");
    await until(() => step("The email")?.textContent?.includes(DEAD));
    await click(button("Check who it goes to")!);
    const send = await until(() => button("Send to 3 people"));
    expect(send.disabled).toBe(true);
    expect(document.body.textContent).toContain("A step above is not done, so it can't send yet.");
  });

  it("lists the advice in Ready to send? as Recommended, never as a cross", async () => {
    mount();
    await openTab("Send");
    const row = await until(() => [...document.querySelectorAll("li")].find((li) => li.textContent?.startsWith("Preview line")));
    expect(row.textContent).toContain(NO_PREVIEW);
    expect(row.querySelector("svg")?.getAttribute("aria-label")).toBe("Recommended");
    const dead = [...document.querySelectorAll("li")].find((li) => li.textContent?.startsWith("Every link answers"))!;
    expect(dead.querySelector("svg")?.getAttribute("aria-label")).toBe("Not yet");
  });
});

describe("beside each block", () => {
  it("shows what the checks found, until the block changes", async () => {
    mount();
    expect(await until(() => beside("cta"))).toBe("the button to old.example.com/care answered 404");
    expect(beside("title")).toBeNull();
    expect(document.querySelector("[data-block-warnings]")?.textContent).not.toContain("preview line");

    typeField(document.getElementById("block-cta-button-0-label") as HTMLInputElement, "Read it now");
    expect(beside("cta")).toBeNull();
  });

  it("runs the checks again after each save, and Check again asks every link afresh", async () => {
    mount();
    await until(() => beside("cta"));
    expect(actions.checkCampaignReadiness.mock.calls).toEqual([[ID, { fresh: false }]]);

    typeField(document.getElementById("block-cta-button-0-label") as HTMLInputElement, "Read it now");
    await click(button("Save changes")!);
    await settle(20);
    expect(actions.saveCampaign).toHaveBeenCalledTimes(1);
    expect(actions.checkCampaignReadiness.mock.calls).toEqual([
      [ID, { fresh: false }],
      [ID, { fresh: false }],
    ]);

    await openTab("Send");
    await click(button("Check again")!);
    expect(actions.checkCampaignReadiness.mock.calls.at(-1)).toEqual([ID, { fresh: true }]);
  });
});
