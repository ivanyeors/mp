// @vitest-environment jsdom
import { placeholderOf, retype, richTextIn, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * Placeholders, not prefilled words, and Clear all with Undo
 * (PRD-campaign-email-editor slice 01), in the editor as Staff use it: a new
 * campaign, a saved draft and a locked campaign. The actions are fakes; none
 * that writes is ever called by Clear all.
 *
 * A new campaign is written in blocks (slice 03), so Clear all empties its
 * blocks; the saved draft here was written before them and keeps its message
 * box. Clear all is one step of the editor's history (slice 04), so the
 * toast's Undo is the history's.
 */

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "" })),
  saveCampaign: vi.fn<(id: string | null, input: CampaignDraftInput) => Promise<{ ok: true; id: string }>>(async (id) => ({ ok: true, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");
const { CAMPAIGN_PLACEHOLDERS, FIRST_CAMPAIGN_DRAFT, newCampaignDraft } = await import("@/lib/email-campaigns/rules");

const SEGMENT = { id: "5e000000-0000-4000-8000-000000000001", name: "Premium, lapsed", needsReview: false };
const DRAFT: CampaignDraft = {
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: "Our FibreCool covers are back",
  body: "Our covers are back.\n\n- Every size",
  content: null,
  greeting: false,
  button: { target: "url", label: "Shop the covers", url: "https://mpillow.com/shop" },
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds: [],
};
const saved = (over: Partial<Campaign> = {}): Campaign => ({
  ...DRAFT,
  id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
  ...over,
});

let root: Root | null = null;

function mount(campaign: Campaign | null, draft: CampaignDraft, segments: { id: string; name: string }[] = []) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={campaign} draft={draft} stats={null} segments={segments} staffEmail="owner@mpillow.com" />
        <Toaster />
      </>,
    ),
  );
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
const text = (id: string) => document.getElementById(id)?.textContent ?? "";
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) ?? null;
const clearAll = () => button("Clear all")!;
/** A card of the Start panel (slice 08), by the name it starts with. */
const choice = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("[aria-labelledby='c-start-title'] button")].find((b) => b.firstElementChild?.textContent === label) ?? null;
const startPanel = () => document.querySelector("[aria-labelledby='c-start-title']");
const undo = () => document.querySelector<HTMLButtonElement>("[data-sonner-toast] [data-action]");
const toastText = () => document.querySelector("[data-sonner-toast]")?.textContent ?? "";

const value = (id: string) => (document.getElementById(id) ? field(id).value : null);
/** Each block's fields, as typed, joined with `|`: a text block's words as they read. */
const blocks = () =>
  [...document.querySelectorAll("[data-block-id]")].map((li) =>
    [...li.querySelectorAll<HTMLElement>("[data-block-body] input, [data-block-body] textarea, [data-block-body] [role='textbox']")]
      .map((f) => (f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement ? f.value : [...f.children].map((p) => p.textContent).filter(Boolean).join("\n\n")))
      .join("|"),
  );

/** The fields Clear all empties, as typed: the message box and button of a draft written before blocks, or the blocks. */
const words = () => ({
  name: field("c-name").value,
  // One-line text inputs with Variables (slice 13): their words as they read.
  subject: wordsOf("c-subject"),
  preheader: wordsOf("c-preheader"),
  body: value("c-body"),
  button: document.getElementById("c-button") ? text("c-button") : null,
  label: value("c-button-label"),
  url: value("c-button-url"),
  blocks: blocks(),
});
const NO_WORDS = { name: "", subject: "", preheader: "", body: null, button: null, label: null, url: null, blocks: [] };
const LEGACY_CLEARED = { name: "", subject: "", preheader: "", body: "", button: "No button", label: null, url: null, blocks: [] };

/** *Add block* → the type, as a keyboard user does it. */
async function addBlock(label: string) {
  await act(async () => {
    button("Add block")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.startsWith(label));
  await act(async () => item!.click());
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const press = async (el: HTMLElement) => {
  await act(async () => el.click());
};
/** Past the preview's debounce, and the toast's own rendering. */
const settle = (ms = 600) => act(() => new Promise((r) => setTimeout(r, ms)));
const lastPreview = () => actions.previewCampaign.mock.calls.at(-1)?.[0];

/** None of these writes was called: Clear all saves nothing and audits nothing. */
const expectNothingWritten = () => {
  for (const write of ["saveCampaign", "archiveCampaignAction", "duplicateCampaign", "planCampaignWave", "sendCampaignBatchAction", "sendCampaignTestAction"] as const) {
    expect(actions[write], write).not.toHaveBeenCalled();
  }
};

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  // The unmount dismisses the toast a frame later: let it, before the next test makes one.
  await settle(50);
  document.body.innerHTML = "";
});

describe("a new campaign", () => {
  it("opens with every field empty, on its placeholder, no blocks yet, and nothing of the invitation", async () => {
    mount(null, newCampaignDraft(undefined, []));
    expect(words()).toEqual(NO_WORDS);
    expect(field("c-name").placeholder).toBe("e.g. December cooling launch");
    expect(placeholderOf("c-subject")).toBe("e.g. Sleep cooler this December");
    expect(placeholderOf("c-preheader")).toBe("e.g. Our FibreCool covers are back, in every size");
    // No blocks yet: the Start panel offers where to start (slice 08), once it has loaded.
    expect((await until(startPanel)).textContent).toContain("Start the email");
    expect(button("Add block")).not.toBeNull();
    expect(document.body.textContent).not.toContain(FIRST_CAMPAIGN_DRAFT.subject);
    expect(document.getElementById("c-greeting")?.getAttribute("aria-checked")).toBe("true");
  });

  it("has Clear all off, saying why, until there is something to clear", async () => {
    mount(null, newCampaignDraft(undefined, []));
    expect(clearAll().getAttribute("aria-disabled")).toBe("true");
    expect(clearAll().disabled).toBe(false); // still in the tab order, so the reason is reachable
    expect(text(clearAll().getAttribute("aria-describedby")!)).toBe("Nothing to clear: every field is on its placeholder.");
    await retype("c-subject", "Hello");
    expect(clearAll().getAttribute("aria-disabled")).toBeNull();
    expect(clearAll().getAttribute("aria-describedby")).toBeNull();
  });

  it("fills in the invitation, as real words in blocks and its audience, only when asked", async () => {
    mount(null, newCampaignDraft(SEGMENT.id, [SEGMENT]), [SEGMENT]);
    // Named after the Segment, and still empty: the Start panel offers the invitation, a Starter (slice 08).
    expect(field("c-name").value).toBe(SEGMENT.name);
    await press(await until(() => choice("A Starter")));
    await press(choice(FIRST_CAMPAIGN_DRAFT.name)!);
    const filled = words();
    expect(filled).toMatchObject({
      name: FIRST_CAMPAIGN_DRAFT.name,
      subject: FIRST_CAMPAIGN_DRAFT.subject,
      preheader: FIRST_CAMPAIGN_DRAFT.preheader,
      body: null,
    });
    expect(filled.blocks[0]).toBe(FIRST_CAMPAIGN_DRAFT.subject);
    expect(filled.blocks[1]).toContain("There's nothing to fill in and no password to set");
    expect(filled.blocks.at(-1)).toBe(FIRST_CAMPAIGN_DRAFT.button!.label);
    expect(text("c-audience")).toBe("Imported from Shopify, not signed in yet");
    expect(startPanel()).toBeNull();
  });

  it("clears the words and blocks back to their placeholders, keeps the audience and greeting, and Undo puts every word back", async () => {
    mount(null, newCampaignDraft(SEGMENT.id, [SEGMENT]), [SEGMENT]);
    await retype("c-subject", "Sleep cooler this December");
    await addBlock("Text");
    const input = await richTextIn(document.querySelector("[data-block-id]")!);
    act(() => void input.commands.insertContent("Our covers are back."));
    await press(document.getElementById("c-greeting")!);
    const typed = words();
    expect(typed.name).toBe(SEGMENT.name);
    expect(typed.blocks).toEqual(["Our covers are back."]);

    await press(clearAll());
    expect(words()).toEqual(NO_WORDS);
    expect(text("c-audience")).toBe("A saved Segment");
    expect(text("c-segment")).toBe(SEGMENT.name);
    expect(document.getElementById("c-greeting")?.getAttribute("aria-checked")).toBe("false");
    await settle();
    expect(toastText()).toContain("Cleared the email.");
    expect(undo()?.textContent).toBe("Undo");
    expect(lastPreview()).toMatchObject({ name: "", subject: "", body: "", button: null, content: { blocks: [] }, audience: "segment", segmentId: SEGMENT.id });

    await press(undo()!);
    expect(words()).toEqual(typed);
    await settle();
    expect(lastPreview()).toMatchObject({
      name: SEGMENT.name,
      subject: "Sleep cooler this December",
      body: "",
      content: { blocks: [{ type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] }] },
      greeting: false,
    });
    expectNothingWritten();
  });
});

describe("a saved draft", () => {
  it("shows its words, and Clear all empties every one, the button back to No button, without saving", async () => {
    mount(saved(), DRAFT);
    const before = words();
    expect(before).toEqual({
      name: DRAFT.name,
      subject: DRAFT.subject,
      preheader: DRAFT.preheader,
      body: DRAFT.body,
      button: "A link",
      label: "Shop the covers",
      url: "https://mpillow.com/shop",
      blocks: [],
    });
    expect(field("c-button-label").placeholder).toBe(CAMPAIGN_PLACEHOLDERS.buttonLabel);
    expect(button("Save changes")!.disabled).toBe(true); // saved

    await press(clearAll());
    expect(words()).toEqual(LEGACY_CLEARED);
    expect(text("c-audience")).toBe("Everyone subscribed to marketing email");
    // Cleared but not saved: the draft is unsaved, and Save validates as today.
    expect(button("Save changes")!.disabled).toBe(false);
    expectNothingWritten();

    await settle();
    await press(undo()!);
    expect(words()).toEqual(before);
    expect(button("Save changes")!.disabled).toBe(true);
    expectNothingWritten();
  });

  it("has no Undo after a Save", async () => {
    mount(saved(), DRAFT);
    await press(clearAll());
    type(field("c-name"), "A new one");
    await retype("c-subject", "Hello");
    type(field("c-body"), "Hi");
    await settle();
    const late = undo()!;
    expect(late).not.toBeNull();
    await press(button("Save changes")!);
    expect(actions.saveCampaign).toHaveBeenCalledTimes(1);
    // What Save sends is what was typed: an empty preview line is empty, not its placeholder.
    expect(actions.saveCampaign.mock.calls[0][1]).toMatchObject({ name: "A new one", subject: "Hello", preheader: "", body: "Hi", button: null });
    await settle(100);
    // The toast is on its way out, and its Undo, pressed late, puts nothing back.
    expect(document.querySelector("[data-sonner-toast]:not([data-removed='true'])")).toBeNull();
    await press(late);
    expect(words()).toMatchObject({ name: "A new one", subject: "Hello", preheader: "", body: "Hi" });
  });
});

describe("a campaign that has started sending", () => {
  it("has Clear all off, saying why, and pressing it changes nothing", async () => {
    mount(saved({ lockedAt: "2026-10-21T01:00:00Z" }), DRAFT);
    const before = words();
    expect(clearAll().getAttribute("aria-disabled")).toBe("true");
    expect(text(clearAll().getAttribute("aria-describedby")!)).toBe(
      "Sending has started, so the email is fixed. Duplicate it to write a new one.",
    );
    await press(clearAll());
    await settle(50);
    expect(words()).toEqual(before);
    expect(undo()).toBeNull();
    expect(startPanel()).toBeNull();
    expectNothingWritten();
  });
});
