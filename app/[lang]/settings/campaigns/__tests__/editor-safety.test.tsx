// @vitest-environment jsdom
import { choose, click, press, retype, settle, typeField, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * Editing safety on the campaign editor (PRD-campaign-email-editor slice 04,
 * decision 4): one history over the whole email, so ⌘Z and ⇧⌘Z (and the
 * header's Undo and Redo) take back any change, Clear all included; ⌘S
 * saves; leaving asks first; a crashed tab's unsaved changes are offered
 * back. And the page's two tabs: Write, and Send as it was.
 */

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "", from: null })),
  saveCampaign: vi.fn<(id: string | null, input: CampaignDraftInput) => Promise<{ ok: true; id: string }>>(async (id) => ({ ok: true, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");
const { FIRST_CAMPAIGN_DRAFT, newCampaignDraft } = await import("@/lib/email-campaigns/rules");
const { keptDraftKey } = await import("../kept-draft");

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [{ id: "title", type: "heading", level: 1, text: "Sleep cooler" }],
  fallbacks: {},
};
const DRAFT: CampaignDraft = {
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: "",
  body: "",
  content: CONTENT,
  greeting: true,
  button: null,
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
};
const SAVED: Campaign = {
  ...DRAFT,
  id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
};

let root: Root | null = null;
function mount(campaign: Campaign | null, draft: CampaignDraft) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={campaign} draft={draft} stats={null} segments={[]} staffEmail="owner@mpillow.com" />
        <Toaster />
      </>,
    ),
  );
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
/** Each heading's words: one-line text inputs with Variables (slice 13). */
const headings = () => [...document.querySelectorAll<HTMLElement>("[data-block-id] [data-block-body] [role='textbox']")].map((i) => i.textContent);
const headingId = (i: number) => `block-${document.querySelectorAll<HTMLElement>("[data-block-id]")[i].dataset.blockId}-text`;
/** The subject's words as they read. */
const subject = () => wordsOf("c-subject");
const undoToast = () => document.querySelector<HTMLButtonElement>("[data-sonner-toast] [data-action]");
const undo = () => press("z", { ctrl: true }, document.body);
const redo = () => press("z", { ctrl: true, shift: true }, document.body);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

describe("one history over the whole email", () => {
  it("undoes and redoes the subject, the blocks and the greeting, in the order they changed", async () => {
    mount(SAVED, DRAFT);
    expect(button("Undo")!.disabled).toBe(true);
    await retype("c-subject", "Sleep cooler, Mei Ling");
    await choose(button("Add block")!, "Heading");
    await retype(headingId(1), "Why FibreCool");
    expect(headings()).toEqual(["Sleep cooler", "Why FibreCool"]);
    await click(document.getElementById("c-greeting")!);

    undo();
    expect(document.getElementById("c-greeting")!.getAttribute("aria-checked")).toBe("true");
    undo();
    expect(headings()).toEqual(["Sleep cooler", ""]);
    undo();
    expect(headings()).toEqual(["Sleep cooler"]);
    await click(button("Undo")!);
    expect(subject()).toBe("Sleep cooler this December");
    expect(button("Undo")!.disabled).toBe(true);
    expect(button("Save changes")!.disabled).toBe(true); // back where it was saved

    await click(button("Redo")!);
    redo();
    expect(subject()).toBe("Sleep cooler, Mei Ling");
    expect(headings()).toEqual(["Sleep cooler", ""]);
  });

  it("leaves the Send tab's own fields their own undo", async () => {
    mount(SAVED, DRAFT);
    await retype("c-subject", "Sleep cooler, Mei Ling");
    press("z", { ctrl: true }, field("c-test"));
    expect(subject()).toBe("Sleep cooler, Mei Ling");
    press("z", { ctrl: true }, field("c-name"));
    expect(subject()).toBe(DRAFT.subject);
  });

  it("makes Clear all one step: ⌘Z brings the email back and ⇧⌘Z clears it again", async () => {
    mount(SAVED, DRAFT);
    await click(button("Clear all")!);
    expect(field("c-name").value).toBe("");
    expect(headings()).toEqual([]);
    undo();
    expect(field("c-name").value).toBe(DRAFT.name);
    expect(headings()).toEqual(["Sleep cooler"]);
    redo();
    expect(field("c-name").value).toBe("");
    expect(headings()).toEqual([]);
  });

  it("makes starting from the sign-in invitation one step, who it goes to included", async () => {
    mount(null, { ...newCampaignDraft(undefined, []), audience: "subscribed" });
    const audience = () => document.getElementById("c-audience")!.textContent;
    expect(audience()).toBe("Everyone subscribed to marketing email");
    // The Start panel's Starter (slice 08).
    const choice = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("[aria-labelledby='c-start-title'] button")].find((b) => b.firstElementChild?.textContent === label);
    await click(await until(() => choice("A Starter")));
    await click(choice(FIRST_CAMPAIGN_DRAFT.name)!);
    expect(subject()).toBe(FIRST_CAMPAIGN_DRAFT.subject);
    expect(audience()).toBe("Imported from Shopify, not signed in yet");
    undo();
    expect(subject()).toBe("");
    expect(audience()).toBe("Everyone subscribed to marketing email");
    redo();
    expect(audience()).toBe("Imported from Shopify, not signed in yet");
  });

  it("puts the words back from the toast's Undo even after more typing, as a step of its own", async () => {
    mount(SAVED, DRAFT);
    await click(button("Clear all")!);
    await retype("c-subject", "Something else");
    await settle();
    await click(undoToast()!);
    expect(subject()).toBe(DRAFT.subject);
    expect(headings()).toEqual(["Sleep cooler"]);
    undo(); // the Undo itself is undone
    expect(subject()).toBe("Something else");
  });
});

describe("saving and leaving", () => {
  it("saves on Ctrl+S (⌘S on a Mac), only when something changed", async () => {
    mount(SAVED, DRAFT);
    press("s", { ctrl: true }, document.body);
    await settle();
    expect(actions.saveCampaign).not.toHaveBeenCalled();
    await retype("c-subject", "Sleep cooler, today");
    press("s", { ctrl: true }, field("c-subject"));
    await settle();
    expect(actions.saveCampaign).toHaveBeenCalledTimes(1);
    expect(actions.saveCampaign.mock.calls[0][1]).toMatchObject({ subject: "Sleep cooler, today" });
  });

  it("makes one campaign from New campaign however often Save is pressed before its page opens", async () => {
    mount(null, newCampaignDraft(undefined, []));
    typeField(field("c-name"), "December cooling launch");
    press("s", { ctrl: true }, document.body);
    await settle();
    // The page for it has not opened yet (the router's replace is still on its way).
    press("s", { ctrl: true }, document.body);
    await settle();
    expect(actions.saveCampaign.mock.calls.map(([id]) => id)).toEqual([null, "new"]);
  });

  it("asks before the browser leaves with unsaved changes", async () => {
    mount(SAVED, DRAFT);
    const leave = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    await retype("c-subject", "Changed");
    expect(leave()).toBe(true);
  });

  it("keeps unsaved changes in the browser and offers them back, as one change Undo takes back", async () => {
    mount(SAVED, DRAFT);
    await retype("c-subject", "Half written, then the tab crashed");
    await settle(600);
    expect(window.localStorage.getItem(keptDraftKey(SAVED.id))).toContain("Half written");
    act(() => root!.unmount());
    document.body.innerHTML = "";

    mount(SAVED, DRAFT);
    await settle();
    expect(document.body.textContent).toMatch(/Restore your unsaved changes from \w{3}, \d+ \w{3}, \d+:\d{2} [ap]m\?/);
    await click(button("Restore")!);
    expect(subject()).toBe("Half written, then the tab crashed");
    expect(document.body.textContent).not.toContain("Restore your unsaved changes");
    undo();
    expect(subject()).toBe(DRAFT.subject);
  });

  it("restores who it goes to with the words, and one Undo takes both back", async () => {
    const email = { ...DRAFT, subject: "Kept before the crash", preheader: "", body: "", button: { choice: "none", label: "", url: "" } };
    window.localStorage.setItem(
      keptDraftKey(SAVED.id),
      JSON.stringify({ v: 1, at: "2026-10-29T08:12:00.000Z", base: SAVED.updatedAt, value: { email, audience: "imported_not_signed_in", segmentId: "" } }),
    );
    mount(SAVED, DRAFT);
    await settle();
    const audience = () => document.getElementById("c-audience")!.textContent;
    await click(button("Restore")!);
    expect(subject()).toBe("Kept before the crash");
    expect(audience()).toBe("Imported from Shopify, not signed in yet");
    undo();
    expect(subject()).toBe(DRAFT.subject);
    expect(audience()).toBe("Everyone subscribed to marketing email");
  });

  it("offers nothing for a campaign that has started sending", async () => {
    window.localStorage.setItem(
      keptDraftKey(SAVED.id),
      JSON.stringify({ v: 1, at: "2026-10-29T08:12:00.000Z", base: SAVED.updatedAt, value: { email: { ...DRAFT, preheader: "", body: "", button: { choice: "none", label: "", url: "" } }, audience: "subscribed", segmentId: "" } }),
    );
    mount({ ...SAVED, lockedAt: "2026-10-21T01:00:00Z" }, DRAFT);
    await settle();
    expect(document.body.textContent).not.toContain("Restore your unsaved changes");
  });
});

describe("the tabs", () => {
  it("writes on Write and sends on Send, with nothing to send until the draft is saved", async () => {
    mount(null, newCampaignDraft(undefined, []));
    const tab = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)!;
    expect(tab("Write").getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      tab("Send").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      tab("Send").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
    });
    expect(tab("Send").getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).toContain("Save the draft first. Then you can test it, check what sending needs, and send it.");
  });
});
