// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * The plain block editor (PRD-campaign-email-editor slice 03), as Staff use
 * it: add each block type, write in it, move it up and down, delete it, and
 * Save the blocks; a draft written before blocks converts, with Undo; a
 * campaign that has started sending shows its blocks read-only.
 */

type SaveResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "" })),
  saveCampaign: vi.fn<(id: string | null, input: CampaignDraftInput) => Promise<SaveResult>>(async (id) => ({ ok: true, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");
const { CAMPAIGN_PLACEHOLDERS, newCampaignDraft } = await import("@/lib/email-campaigns/rules");
const { CONTENT_PLACEHOLDERS } = await import("@/lib/email-campaigns/content");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// What jsdom leaves out and the page's components read: a desktop-width screen, sizes never change.
window.matchMedia ??= ((media: string) => ({
  matches: false,
  media,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/** A draft written before blocks: its message and button. */
const LEGACY: CampaignDraft = {
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: "Our FibreCool covers are back",
  body: "Our covers are back.\n\n- Every size",
  content: null,
  greeting: true,
  button: { target: "url", label: "Shop the covers", url: "https://mpillow.com/shop" },
  audience: "subscribed",
  segmentId: null,
};
const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
    { id: "cta", type: "buttons", buttons: [{ label: "Shop", target: "shop", style: "primary" }] },
  ],
  fallbacks: {},
};
const saved = (draft: CampaignDraft, over: Partial<Campaign> = {}): Campaign => ({
  ...draft,
  id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
  ...over,
});

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

const field = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
const blockItems = () => [...document.querySelectorAll<HTMLElement>("[data-block-id]")];
/** The `i`th block's fields, in order. */
const fieldsOf = (i: number) => [...blockItems()[i].querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")];
/** Each block's label and fields, as Staff read them. */
const blocks = () =>
  blockItems().map((li) => [li.querySelector(".font-medium")?.textContent, ...[...li.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].map((f) => f.value)].join("|"));

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
const settle = (ms = 600) => act(() => new Promise((r) => setTimeout(r, ms)));
const undo = () => document.querySelector<HTMLButtonElement>("[data-sonner-toast] [data-action]");

/** *Add block* → the type, as a keyboard user does it. */
async function addBlock(label: string) {
  await act(async () => {
    button("Add block")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.startsWith(label));
  await act(async () => item!.click());
}

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

describe("a new campaign's blocks", () => {
  it("are added empty, on their placeholders, written in, moved, deleted, and saved as blocks", async () => {
    mount(null, newCampaignDraft(undefined, []));
    type(field("c-name"), "December");
    type(field("c-subject"), "Sleep cooler");

    await addBlock("Heading");
    const heading = fieldsOf(0)[0];
    expect(heading.value).toBe("");
    expect(heading.placeholder).toBe(CONTENT_PLACEHOLDERS.heading);
    expect(document.activeElement).toBe(heading); // focus goes into the new block
    type(heading, "Sleep cooler this December");

    await addBlock("Text");
    expect(fieldsOf(1)[0].placeholder).toMatch(/^Write a few lines\./);
    type(fieldsOf(1)[0], "Our **FibreCool** covers. Read [the care guide](https://custom.mpillow.com/en-US/faq).");

    await addBlock("Buttons");
    expect(fieldsOf(2)[0].placeholder).toBe(CAMPAIGN_PLACEHOLDERS.buttonLabel);
    type(fieldsOf(2)[0], "Shop the covers");
    await press(button("Add a second button beside it")!);
    type(fieldsOf(2)[1], "Book a fitting");

    await addBlock("Divider");
    expect(blocks()).toEqual([
      "Heading|Sleep cooler this December",
      "Text|Our **FibreCool** covers. Read [the care guide](https://custom.mpillow.com/en-US/faq).",
      "Buttons|Shop the covers|Book a fitting",
      "Divider",
    ]);

    await press(button("Move Buttons up")!);
    expect(blocks().map((b) => b.split("|")[0])).toEqual(["Heading", "Buttons", "Text", "Divider"]);
    expect(button("Move Heading up")!.disabled).toBe(true);
    await press(button("Move Buttons down")!);
    await press(button("Delete Divider")!);
    expect(blocks().map((b) => b.split("|")[0])).toEqual(["Heading", "Text", "Buttons"]);

    await press(button("Save draft")!);
    expect(actions.saveCampaign).toHaveBeenCalledTimes(1);
    const [, input] = actions.saveCampaign.mock.calls[0];
    expect(input).toMatchObject({ name: "December", subject: "Sleep cooler", body: "", button: null });
    expect(input.content).toMatchObject({
      v: 1,
      blocks: [
        { type: "heading", level: 2, text: "Sleep cooler this December" },
        {
          type: "text",
          paragraphs: [
            {
              kind: "p",
              runs: [
                { text: "Our " },
                { text: "FibreCool", bold: true },
                { text: " covers. Read " },
                { text: "the care guide", href: "https://custom.mpillow.com/en-US/faq" },
                { text: "." },
              ],
            },
          ],
        },
        {
          type: "buttons",
          buttons: [
            { label: "Shop the covers", target: "shop", style: "primary" },
            { label: "Book a fitting", target: "shop", style: "secondary" },
          ],
        },
      ],
      fallbacks: {},
    });
    await settle();
    expect(actions.previewCampaign.mock.calls.at(-1)?.[0].content).toEqual(input.content);
  });

  it("show Save's error under the field it names", async () => {
    actions.saveCampaign.mockResolvedValueOnce({ ok: false, error: "Check the highlighted fields.", fieldErrors: { "content.blocks.0.text": "Write the heading." } });
    mount(null, newCampaignDraft(undefined, []));
    await addBlock("Heading");
    await press(button("Save draft")!);
    expect(blockItems()[0].textContent).toContain("Write the heading.");
  });

  it("ask for the first name's fallback words once the text uses it", async () => {
    mount(null, newCampaignDraft(undefined, []));
    await addBlock("Text");
    expect(document.getElementById("c-fallback-first_name")).toBeNull();
    type(fieldsOf(0)[0], "Hi {first_name}, our covers are back.");
    expect(field("c-fallback-first_name").placeholder).toBe("e.g. there");
    type(field("c-fallback-first_name"), "friend");
    await settle();
    expect(actions.previewCampaign.mock.calls.at(-1)?.[0].content).toMatchObject({
      blocks: [{ type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", our covers are back." }] }] }],
      fallbacks: { first_name: "friend" },
    });
    type(fieldsOf(0)[0], "Hi {last_name}");
    expect(blockItems()[0].textContent).toContain("{last_name} is not a Variable: only {first_name} is.");
  });
});

describe("a draft written before blocks", () => {
  it("converts to blocks that say the same, with Undo, and saves them", async () => {
    mount(saved(LEGACY), LEGACY);
    expect(field("c-body").value).toBe(LEGACY.body);
    expect(button("Add block")).toBeNull();

    await press(button("Convert to blocks")!);
    expect(document.getElementById("c-body")).toBeNull();
    expect(blocks()).toEqual(["Heading|Sleep cooler this December", "Text|Our covers are back.\n\n- Every size", "Buttons|Shop the covers|https://mpillow.com/shop"]);
    await settle();
    expect(document.querySelector("[data-sonner-toast]")?.textContent).toContain("Converted the message to blocks. Save to keep them.");
    await press(undo()!);
    expect(field("c-body").value).toBe(LEGACY.body);
    expect(blockItems()).toHaveLength(0);
    expect(actions.saveCampaign).not.toHaveBeenCalled();

    await press(button("Convert to blocks")!);
    await press(button("Save changes")!);
    const [id, input] = actions.saveCampaign.mock.calls[0];
    expect(id).toBe(saved(LEGACY).id);
    expect(input).toMatchObject({ body: "", button: null, content: { blocks: [{ type: "heading" }, { type: "text" }, { type: "buttons" }] } });
  });

  it("stays as it is once sending has started: no conversion", () => {
    mount(saved(LEGACY, { lockedAt: "2026-10-21T01:00:00Z" }), LEGACY);
    expect(field("c-body").disabled).toBe(true);
    expect(button("Convert to blocks")).toBeNull();
  });
});

describe("a block campaign that has started sending", () => {
  it("shows its blocks read-only: no adding, moving or deleting", () => {
    const draft = { ...LEGACY, body: "", button: null, content: CONTENT };
    mount(saved(draft, { lockedAt: "2026-10-21T01:00:00Z" }), draft);
    expect(blocks()).toEqual(["Heading|Sleep cooler", "Buttons|Shop"]);
    expect(button("Add block")).toBeNull();
    expect(button("Move Heading down")).toBeNull();
    expect(button("Delete Heading")).toBeNull();
    for (const f of [...fieldsOf(0), ...fieldsOf(1)]) expect(f.disabled).toBe(true);
  });
});
