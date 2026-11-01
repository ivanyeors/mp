// @vitest-environment jsdom
import { choose, click, pasteInto, pointAt, press, retype, richTextIn, settle, typeField, typeInto, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * The campaign editor's blocks (PRD-campaign-email-editor slices 03 and 04),
 * as Staff use them: drag a block in from the palette between two others,
 * write in it, drag it above the heading, undo; add each block type, write in
 * it, move, duplicate and delete it, and Save the blocks; a draft written
 * before blocks converts, with Undo; a campaign that has started sending
 * shows its blocks read-only.
 *
 * dnd-kit measures the screen, which jsdom has none of, so a drag is played
 * through the provider's own handlers with the events dnd-kit sends.
 */

type DragHandlers = Pick<ComponentProps<typeof import("@dnd-kit/react").DragDropProvider>, "onDragOver" | "onDragEnd">;
const dnd = vi.hoisted(() => ({ handlers: null as DragHandlers | null }));
vi.mock("@dnd-kit/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/react")>();
  return {
    ...actual,
    DragDropProvider: (props: ComponentProps<typeof actual.DragDropProvider>) => {
      dnd.handlers = props;
      return <actual.DragDropProvider {...props} />;
    },
  };
});

type SaveResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn<
    (input: CampaignDraftInput, opts?: { forceDark?: boolean; previewAs?: string }) => Promise<{ ok: true; subject: string; html: string; text: string; from: string }>
  >(
    async (input) => ({ ok: true, subject: input.subject, html: "<p>preview</p>", text: "", from: "Mpillow <hello@hello.mpillow.com>" }),
  ),
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
  excludeSegmentIds: [],
  includeUnengaged: false,
};
const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
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
const withBlocks = (content: CampaignContent = CONTENT): CampaignDraft => ({ ...LEGACY, body: "", button: null, content });

let root: Root | null = null;
function mount(campaign: Campaign | null, draft: CampaignDraft, { pointsLive = true }: { pointsLive?: boolean } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={campaign} draft={draft} stats={null} segments={[]} staffEmail="owner@mpillow.com" pointsLive={pointsLive} />
        <Toaster />
      </>,
    ),
  );
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-block-id]")];
/** A text input's words as they read: paragraphs a blank line apart, bullets as "- ". */
const textOf = (box: Element) =>
  [...box.children]
    .map((c) => (c.tagName === "UL" ? [...c.querySelectorAll("li")].map((li) => `- ${li.textContent}`).join("\n") : (c.textContent ?? "")))
    .filter(Boolean)
    .join("\n\n");
/** Each block's label and fields, as Staff read them. */
const blocks = () =>
  cards().map((li) =>
    [
      li.querySelector("span.text-xs.font-medium")?.textContent,
      ...[...li.querySelectorAll<HTMLElement>("[data-block-body] input, [data-block-body] textarea, [data-block-body] [role='textbox']")].map((f) =>
        f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement ? f.value : textOf(f),
      ),
    ].join("|"),
  );
const kinds = () => blocks().map((b) => b.split("|")[0]);
const undoToast = () => document.querySelector<HTMLButtonElement>("[data-sonner-toast] [data-action]");
const lastPreview = () => actions.previewCampaign.mock.calls.at(-1);
const paletteItem = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("ul[aria-label='Blocks'] button")].find((b) => b.textContent?.startsWith(label))!;

/** *Add block* → the type, as a keyboard user does it. */
const addBlock = (label: string) => choose(button("Add block")!, label);

/** The palette's Variables tab (slice 13), opened as a pointer opens it: its chips, and the fallback words under them. */
const openVariables = async () => {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === "Variables")!;
  await act(async () => void tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
};

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

describe("the demo", () => {
  it("drags Buttons in between the heading and the text, writes in it, drags it above the heading, and ⌘Z puts it back", async () => {
    mount(saved(withBlocks()), withBlocks());
    expect(kinds()).toEqual(["Heading", "Text"]);

    const buttons = (await import("@/components/block-editor/block-palette")).blockPaletteTab((await import("../blocks/catalogue")).CAMPAIGN_BLOCKS).items.find((i) => i.id === "buttons")!;
    const drag = { source: { id: "palette:blocks:buttons", data: { palette: buttons } }, target: { id: "intro", element: cards()[1] }, position: { current: { x: 0, y: 0 } } };
    act(() => dnd.handlers!.onDragOver!({ operation: drag } as never, {} as never));
    expect(cards()[1].querySelector("[data-drop-line]")).not.toBeNull();
    act(() => dnd.handlers!.onDragEnd!({ operation: drag, canceled: false } as never, {} as never));
    expect(kinds()).toEqual(["Heading", "Buttons", "Text"]);
    await settle();
    // The new block is selected, focused on its label, and shows its options.
    expect(document.activeElement).toBe(cards()[1].querySelector("input"));
    expect(cards()[1].querySelector('[role="radiogroup"][aria-label="Style"]')).not.toBeNull();
    typeField(cards()[1].querySelector("input")!, "Shop the covers");

    const id = cards()[1].dataset.blockId!;
    act(() => dnd.handlers!.onDragEnd!({ operation: { source: { id, index: 0 }, target: { id } }, canceled: false } as never, {} as never));
    expect(blocks()).toEqual(["Buttons|Shop the covers", "Heading|Sleep cooler", "Text|Our covers are back."]);
    expect(document.body.textContent).toContain("Buttons moved to position 1 of 3.");

    press("z", { ctrl: true }, document.body);
    expect(blocks()).toEqual(["Heading|Sleep cooler", "Buttons|Shop the covers", "Text|Our covers are back."]);
    press("z", { ctrl: true, shift: true }, document.body);
    expect(kinds()).toEqual(["Buttons", "Heading", "Text"]);

    await settle(500);
    expect(lastPreview()?.[0].content?.blocks.map((b) => b.type)).toEqual(["buttons", "heading", "text"]);
  });

  it("adds a palette item after the selected block with a click", async () => {
    mount(saved(withBlocks()), withBlocks());
    await pointAt(cards()[0]);
    await click(paletteItem("Divider"));
    expect(kinds()).toEqual(["Heading", "Divider", "Text"]);
  });
});

describe("a new campaign's blocks", () => {
  it("are added empty, on their placeholders, written in, moved, deleted, and saved as blocks", async () => {
    mount(null, newCampaignDraft(undefined, []));
    typeField(field("c-name"), "December");
    await retype("c-subject", "Sleep cooler");

    await addBlock("Heading");
    const heading = await richTextIn(cards()[0]);
    await settle();
    expect(heading.getText()).toBe("");
    expect(heading.view.dom.getAttribute("aria-placeholder")).toBe(CONTENT_PLACEHOLDERS.heading);
    expect(heading.view.dom.getAttribute("aria-multiline")).toBe("false"); // one line, with Variables (slice 13)
    expect(document.activeElement).toBe(heading.view.dom); // focus goes into the new block
    typeInto(heading, "Sleep cooler this December");

    await addBlock("Text");
    const text = await richTextIn(cards()[1]);
    await settle();
    expect(text.view.dom.getAttribute("aria-placeholder")).toBe(CONTENT_PLACEHOLDERS.text);
    expect(document.activeElement).toBe(text.view.dom);
    pasteInto(text, 'Our <b>FibreCool</b> covers. Read <a href="https://custom.mpillow.com/en-US/faq">the care guide</a>.');

    await addBlock("Buttons");
    const label = () => cards()[2].querySelectorAll("input")[0];
    expect(label().placeholder).toBe(CAMPAIGN_PLACEHOLDERS.buttonLabel);
    typeField(label(), "Shop the covers");
    await click(button("Add a second button beside it")!);
    typeField(cards()[2].querySelectorAll("input")[1], "Book a fitting");

    await addBlock("Divider");
    await addBlock("Spacer");
    expect(blocks()).toEqual([
      "Heading|Sleep cooler this December",
      "Text|Our FibreCool covers. Read the care guide.",
      "Buttons|Shop the covers|Book a fitting",
      "Divider",
      "Spacer",
    ]);

    await choose(button("Actions for Buttons, block 3")!, "Move up");
    expect(kinds()).toEqual(["Heading", "Buttons", "Text", "Divider", "Spacer"]);
    expect(document.body.textContent).toContain("Buttons moved to position 2 of 5.");
    await choose(button("Actions for Buttons, block 2")!, "Move down");
    await choose(button("Actions for Divider, block 4")!, "Delete");
    await choose(button("Actions for Spacer, block 4")!, "Duplicate");
    await choose(button("Actions for Spacer, block 5")!, "Delete");
    await choose(button("Actions for Spacer, block 4")!, "Delete");
    expect(kinds()).toEqual(["Heading", "Text", "Buttons"]);

    await click(button("Save draft")!);
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
    await settle(500);
    expect(lastPreview()?.[0].content).toEqual(input.content);
  });

  it("set presets under the selected block: a heading's size, a button's style, a spacer's size", async () => {
    mount(null, newCampaignDraft(undefined, []));
    await addBlock("Heading");
    await click([...cards()[0].querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === "Title")!);
    await addBlock("Buttons");
    await click([...cards()[1].querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === "Outline")!);
    await addBlock("Spacer");
    await click([...cards()[2].querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === "Large")!);
    await settle(500);
    expect(lastPreview()?.[0].content?.blocks).toMatchObject([
      { type: "heading", level: 1 },
      { type: "buttons", buttons: [{ style: "secondary" }] },
      { type: "spacer", size: "l" },
    ]);
  });

  it("show Save's error under the field it names", async () => {
    actions.saveCampaign.mockResolvedValueOnce({ ok: false, error: "Check the highlighted fields.", fieldErrors: { "content.blocks.0.text": "Write the heading." } });
    mount(null, newCampaignDraft(undefined, []));
    await addBlock("Heading");
    await click(button("Save draft")!);
    expect(cards()[0].textContent).toContain("Write the heading.");
  });

  it("turn {first_name} typed in a text block into the Variable, and ask for its fallback words", async () => {
    mount(null, newCampaignDraft(undefined, []));
    await openVariables();
    // The greeting is the First name Variable (slice 13): off, and nothing else uses it, there is nothing to ask.
    expect(field("c-fallback-first_name").value).toBe("there");
    await click(document.getElementById("c-greeting")!);
    await addBlock("Text");
    expect(document.getElementById("c-fallback-first_name")).toBeNull();
    const text = await richTextIn(cards()[0]);
    typeInto(text, "Hi {first_name}, our covers are back.");
    expect(cards()[0].querySelector('[data-variable="first_name"]')?.textContent).toBe("First name");
    // Prefilled with the catalogue's default, which Staff may change.
    expect(field("c-fallback-first_name").value).toBe("there");
    typeField(field("c-fallback-first_name"), "friend");
    await settle(500);
    expect(lastPreview()?.[0].content).toMatchObject({
      blocks: [{ type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", our covers are back." }] }] }],
      fallbacks: { first_name: "friend" },
    });
    typeInto(text, " {nickname}");
    expect(cards()[0].textContent).toContain("{nickname} is not a Variable: the Variables are {first_name}, {last_name}, {points_balance} and {your_pillow}.");
  });

  it("ask for a Variable's fallback words when only the subject or the preview line uses it", async () => {
    mount(null, newCampaignDraft(undefined, []));
    await openVariables();
    await addBlock("Heading");
    await retype("c-subject", "{last_name}, sleep cooler this December");
    expect(wordsOf("c-subject")).toBe("Last name, sleep cooler this December");
    expect(field("c-fallback-last_name").value).toBe(""); // no default: Staff write one
    await retype("c-subject", "Sleep cooler this December");
    expect(document.getElementById("c-fallback-last_name")).toBeNull();
    await retype("c-preheader", "For you, {last_name}");
    expect(document.getElementById("c-fallback-last_name")).not.toBeNull();
    await settle(500);
    expect(lastPreview()?.[0]).toMatchObject({ subject: "Sleep cooler this December", preheader: "For you, {last_name}" });
  });
});

describe("a draft written before blocks", () => {
  it("converts to blocks that say the same, with Undo, and saves them", async () => {
    mount(saved(LEGACY), LEGACY);
    expect(field("c-body").value).toBe(LEGACY.body);
    expect(button("Add block")).toBeNull();

    await click(button("Convert to blocks")!);
    expect(document.getElementById("c-body")).toBeNull();
    expect(blocks()).toEqual(["Heading|Sleep cooler this December", "Text|Our covers are back.\n\n- Every size", "Buttons|Shop the covers|https://mpillow.com/shop"]);
    await settle();
    expect(document.querySelector("[data-sonner-toast]")?.textContent).toContain("Converted the message to blocks. Save to keep them.");
    await click(undoToast()!);
    expect(field("c-body").value).toBe(LEGACY.body);
    expect(cards()).toHaveLength(0);
    expect(actions.saveCampaign).not.toHaveBeenCalled();

    await click(button("Convert to blocks")!);
    await click(button("Save changes")!);
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
  it("shows its blocks read-only: no palette, no drag, no menus, Duplicate to change it", () => {
    const draft = withBlocks({ ...CONTENT, blocks: [CONTENT.blocks[0], { id: "cta", type: "buttons", buttons: [{ label: "Shop", target: "shop", style: "primary" }] }] });
    mount(saved(draft, { lockedAt: "2026-10-21T01:00:00Z" }), draft);
    expect(blocks()).toEqual(["Heading|Sleep cooler", "Buttons|Shop"]);
    expect(document.querySelector("ul[aria-label='Blocks']")).toBeNull();
    expect(button("Add block")).toBeNull();
    expect(document.querySelector('[aria-label^="Drag "]')).toBeNull();
    expect(button("Actions for Heading, block 1")).toBeNull();
    expect(button("Undo")).toBeNull();
    for (const f of cards().flatMap((c) => [...c.querySelectorAll<HTMLInputElement>("input")])) expect(f.disabled).toBe(true);
    expect(button("Duplicate to change it")).not.toBeNull();
  });
});

describe("the preview", () => {
  it("renders on the server for Light and Dark, shows the inbox row, and switches to Mobile", async () => {
    mount(saved(withBlocks()), withBlocks());
    await settle(500);
    expect(lastPreview()?.[1]).toEqual({ forceDark: false, previewAs: "customer" });
    expect(document.body.textContent).toContain("Mpillow <hello@hello.mpillow.com>"); // From, read-only
    const radio = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === label)!;
    await click(radio("Dark"));
    await settle(500);
    expect(lastPreview()?.[1]).toEqual({ forceDark: true, previewAs: "customer" });
    // Preview as (slice 13): the sample customer, or a customer with no details, whose Variables are their fallbacks.
    await click(radio("No details"));
    await settle(500);
    expect(lastPreview()?.[1]).toEqual({ forceDark: true, previewAs: "no_details" });
    const frame = await until(() => document.querySelector<HTMLIFrameElement>('iframe[title="Email preview"]'));
    expect(frame.style.colorScheme).toBe("dark");
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin"); // no script runs in it
    await click(radio("Mobile"));
    expect(frame.style.width).toBe("375px");
    const inbox = document.querySelector('[aria-label="How the inbox lists it"]')!;
    expect(inbox.textContent).toContain("Mpillow");
    expect(inbox.textContent).toContain("Sleep cooler this December");
  });
});
