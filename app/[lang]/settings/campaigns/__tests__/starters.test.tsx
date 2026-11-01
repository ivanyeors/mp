// @vitest-environment jsdom
import { byLabel, choose, click, placeholderOf, press, retype, settle, until } from "@/components/block-editor/__tests__/dom";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaletteDrag } from "@/components/block-editor/block-editor";
import type { AiWritingAvailability } from "@/lib/ai/availability";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";
import type { PastCampaign } from "@/lib/email-campaigns/store";

/**
 * Starters in the campaign editor (PRD-campaign-email-editor slice 08), as
 * the owner's demo goes: a new campaign offers four ways to start; *Product
 * launch* lands as a hero, a heading, some text, products and a button, each
 * on its placeholder; the button is dragged above the products and a block
 * deleted; *Care tips* is dragged from the palette's Starters tab to the end,
 * where its blocks land as ordinary blocks, and one Undo takes them all out.
 * Thumbnails are the real renders, asked for when the first one shows; a
 * past campaign is Duplicate.
 *
 * dnd-kit measures the screen, which jsdom has none of, so a drag is played
 * through the provider's own handlers, with each palette item's drag data as
 * its draggable registered it.
 */

type DragHandlers = Pick<ComponentProps<typeof import("@dnd-kit/react").DragDropProvider>, "onDragOver" | "onDragEnd">;
const dnd = vi.hoisted(() => ({ handlers: null as DragHandlers | null, items: new Map<string, unknown>() }));
vi.mock("@dnd-kit/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/react")>();
  return {
    ...actual,
    DragDropProvider: (props: ComponentProps<typeof actual.DragDropProvider>) => {
      dnd.handlers = props;
      return <actual.DragDropProvider {...props} />;
    },
    useDraggable: (input: Parameters<typeof actual.useDraggable>[0]) => {
      dnd.items.set(String(input.id), input.data);
      return actual.useDraggable(input);
    },
  };
});

const PAST: PastCampaign[] = [
  { id: "c2", name: "December launch", subject: "Sleep cooler", createdAt: "2026-10-28T00:00:00Z", started: false, archived: false },
  { id: "c1", name: "New website: sign in for points", subject: "Our new website is here", createdAt: "2026-10-21T00:00:00Z", started: true, archived: true },
];
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  describeCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  duplicateCampaign: vi.fn(async () => ({ ok: true as const, id: "c-new" })),
  findCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  listPastCampaignsAction: vi.fn(async () => ({ ok: true as const, campaigns: [] as PastCampaign[] })),
  planCampaignWave: vi.fn(),
  placeCampaignImage: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "", from: null })),
  // Each thumbnail's email: here, its id, so a frame says which it shows.
  previewStarters: vi.fn(async () => ({
    ok: true as const,
    previews: Object.fromEntries(["blank", "product_launch", "care_tips", "event", "short_note", "sign_in_invitation"].map((id) => [id, `<p>${id}</p>`])),
  })),
  saveCampaign: vi.fn(async (id: string | null) => ({ ok: true as const, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/new",
  useRouter: () => router,
}));

const { CampaignEditor } = await import("../campaign-editor");
const { CONTENT_PLACEHOLDERS } = await import("@/lib/email-campaigns/content");
const { CAMPAIGN_PLACEHOLDERS, newCampaignDraft } = await import("@/lib/email-campaigns/rules");

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler" },
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
  ],
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
function mount(campaign: Campaign | null, draft: CampaignDraft, ai?: AiWritingAvailability, segments: { id: string; name: string }[] = []) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={campaign} draft={draft} stats={null} segments={segments} staffEmail="owner@mpillow.com" pointsLive ai={ai} />
        <Toaster />
      </>,
    ),
  );
}

const cards = () => [...document.querySelectorAll<HTMLElement>("[data-block-id]")];
const kinds = () => cards().map((li) => li.querySelector("span.text-xs.font-medium")?.textContent);
const startPanel = () => document.querySelector("[aria-labelledby='c-start-title']");
/** A card of the Start panel, by the name it starts with. */
const choice = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("[aria-labelledby='c-start-title'] button")].find((b) => b.firstElementChild?.textContent === label) ?? null;
const audience = () => document.getElementById("c-audience")!.textContent;
const toastText = () => document.querySelector("[data-sonner-toast]")?.textContent ?? "";
const undo = () => press("z", { ctrl: true }, document.body);
const redo = () => press("z", { ctrl: true, shift: true }, document.body);

/** The palette's Starters tab, opened as a pointer opens it. */
const openStarters = async () => {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === "Starters")!;
  await act(async () => void tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
};
/** A Starter in the palette's Starters tab: its button. */
const paletteStarter = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("ul[aria-label='Starters'] button")].find((b) => b.textContent?.startsWith(label)) ?? null;
/** What the palette's Starter `id` carries when dragged. */
const dragged = (id: string) => {
  const found = [...dnd.items.entries()].find(([key, data]) => key.includes(":starters:") && (data as PaletteDrag).palette.id === id);
  if (!found) throw new Error(`No Starter ${id} in the palette.`);
  return { id: found[0], data: found[1] as PaletteDrag };
};
/** Drags the palette's Starter `id` in and drops it: over a card's top half (before it), or the column's end. */
function drop(id: string, over: { card: HTMLElement } | "end") {
  const source = dragged(id);
  const target = over === "end" ? { id: "block-editor:end" } : { id: over.card.dataset.blockId, element: over.card };
  const operation = { source, target, position: { current: { x: 0, y: 0 } } };
  act(() => dnd.handlers!.onDragOver!({ operation } as never, {} as never));
  act(() => dnd.handlers!.onDragEnd!({ operation, canceled: false } as never, {} as never));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  dnd.items.clear();
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

// First in the file: the thumbnails are asked for once while the page is open.
describe("thumbnails", () => {
  it("are asked for when the first one shows, not with the page, once, and are each email's real render", async () => {
    mount(SAVED, DRAFT);
    await settle(20);
    // A written email offers no Start panel, and the Starters tab is closed.
    expect(startPanel()).toBeNull();
    expect(actions.previewStarters).not.toHaveBeenCalled();

    await openStarters();
    const frame = await until(() => paletteStarter("Care tips")?.closest("li")?.querySelector("iframe"));
    expect(frame.getAttribute("srcdoc")).toBe("<p>care_tips</p>");
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.tabIndex).toBe(-1);
    expect(frame.closest("[aria-hidden]")).not.toBeNull();
    expect(actions.previewStarters).toHaveBeenCalledTimes(1);
    // Each Starter is a card with its name and what it holds.
    expect([...document.querySelectorAll("ul[aria-label='Starters'] button span.font-medium")].map((s) => s.textContent)).toEqual([
      "Product launch",
      "Care tips",
      "Event or fitting day",
      "A short note",
      "New website: sign in for points",
      // The CRM's Playbooks, approved by the owner (PRD-crm-retention-loop slice 07, 2026-11-01).
      "Second purchase",
      "Thank you",
      "We miss you",
      "Welcome back",
    ]);
  });
});

describe("a Playbook", () => {
  it("starts Welcome back with its words, its stage's Segment found by name, and the Unengaged included", async () => {
    mount(null, newCampaignDraft(undefined, []), undefined, [
      { id: "seg-loyal", name: "Loyal" },
      { id: "seg-lapsed", name: "At risk · Lapsed" },
    ]);
    await until(startPanel);
    await click(choice("A Starter")!);
    await click(choice("Welcome back")!);
    expect(startPanel()).toBeNull();
    expect(document.querySelector<HTMLInputElement>("#c-name")!.value).toBe("Welcome back");
    expect(document.getElementById("c-subject")!.textContent).toBe("Your pillow's fit can be retuned");
    expect(audience()).toBe("A saved Segment");
    expect(document.getElementById("c-segment")!.textContent).toBe("At risk · Lapsed");
    // The win-back reaches the Unengaged too (PRD-campaign-audiences slice 12).
    expect(document.querySelector("[aria-describedby='c-include-unengaged-hint']")!.getAttribute("aria-checked")).toBe("true");
  });
});

describe("the demo", () => {
  it("starts from Product launch, moves and deletes its blocks, drags Care tips to the end, and one Undo takes Care tips out", async () => {
    mount(null, newCampaignDraft(undefined, []));
    // Loaded with the first empty email, not with the page.
    expect((await until(startPanel)).textContent).toContain("Start the email");
    // AI writing is off here, so there is no ✨ Write with AI (slice 09).
    expect([...startPanel()!.querySelectorAll("ul[aria-label='Ways to start'] > li button > span:first-child")].map((s) => s.textContent)).toEqual([
      "Blank",
      "A Starter",
      "A past campaign",
    ]);
    // The Blank and A Starter cards show real renders.
    await until(() => startPanel()!.querySelector("iframe[srcdoc='<p>blank</p>']"));

    await click(choice("A Starter")!);
    expect(choice("A Starter")!.getAttribute("aria-expanded")).toBe("true");
    await click(choice("Product launch")!);
    expect(kinds()).toEqual(["Hero", "Heading", "Text", "Products", "Buttons"]);
    expect(startPanel()).toBeNull();
    // Every field on its placeholder, never sample words.
    const heading = cards()[1].querySelector<HTMLElement>("[data-block-body] [id$='-text']")!;
    expect(placeholderOf(heading.id)).toBe(CONTENT_PLACEHOLDERS.heading);
    expect(placeholderOf(`block-${cards()[0].dataset.blockId}-line`)).toBe(CONTENT_PLACEHOLDERS.line);
    expect(cards()[4].querySelector("input")!.value).toBe("");
    expect(cards()[4].querySelector("input")!.placeholder).toBe(CAMPAIGN_PLACEHOLDERS.buttonLabel);
    // Ordinary blocks: nothing marks where they came from.
    expect(document.querySelector("[data-starter]")).toBeNull();

    // The button above the products.
    const button = cards()[4].dataset.blockId!;
    act(() => dnd.handlers!.onDragEnd!({ operation: { source: { id: button, index: 3 }, target: { id: button } }, canceled: false } as never, {} as never));
    expect(kinds()).toEqual(["Hero", "Heading", "Text", "Buttons", "Products"]);
    // A paragraph deleted.
    await choose(byLabel("Actions for Text, block 3")!, "Delete");
    expect(kinds()).toEqual(["Hero", "Heading", "Buttons", "Products"]);

    // Care tips, dragged from the palette's Starters tab to the end.
    await openStarters();
    drop("care_tips", "end");
    expect(kinds()).toEqual(["Hero", "Heading", "Buttons", "Products", "Heading", "Text", "Image + text", "Text", "Buttons"]);
    expect(document.body.textContent).toContain("5 blocks added at position 5 of 9.");
    // They move and delete like any others.
    await choose(byLabel("Actions for Image + text, block 7")!, "Move up");
    expect(kinds()).toEqual(["Hero", "Heading", "Buttons", "Products", "Heading", "Image + text", "Text", "Text", "Buttons"]);
    undo();
    expect(kinds()).toEqual(["Hero", "Heading", "Buttons", "Products", "Heading", "Text", "Image + text", "Text", "Buttons"]);
    // One Undo takes the whole insert out, and Redo puts it back.
    undo();
    expect(kinds()).toEqual(["Hero", "Heading", "Buttons", "Products"]);
    redo();
    expect(kinds()).toHaveLength(9);

    await settle(500);
    const sent = actions.previewCampaign.mock.calls.at(-1)![0];
    expect(sent.content?.blocks.map((b) => b.type)).toEqual(["hero", "heading", "buttons", "products", "heading", "text", "split", "text", "buttons"]);
  });
});

describe("the palette's Starters tab", () => {
  it("drops a Starter between two blocks, and one Undo removes the whole insert", async () => {
    mount(SAVED, DRAFT);
    await openStarters();
    drop("short_note", { card: cards()[1] });
    expect(kinds()).toEqual(["Heading", "Heading", "Text", "Buttons", "Text"]);
    await settle();
    // The first of them selected, and its words ready to type.
    expect(cards()[1].dataset.selected).toBe("true");
    undo();
    expect(kinds()).toEqual(["Heading", "Text"]);
    expect(button("Save changes")!.disabled).toBe(true); // back to what is saved
  });

  it("adds a Starter after the selected block with a click, as Enter does", async () => {
    mount(SAVED, DRAFT);
    await act(async () => void cards()[0].dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    await openStarters();
    await click(paletteStarter("Event or fitting day")!);
    expect(kinds()).toEqual(["Heading", "Hero", "Text", "Buttons", "Text"]);
  });

  it("sends the email to the invitation's audience in the same step as its blocks, and says so", async () => {
    mount(SAVED, DRAFT);
    expect(audience()).toBe("Everyone subscribed to marketing email");
    await openStarters();
    drop("sign_in_invitation", "end");
    expect(kinds()[2]).toBe("Heading");
    expect(audience()).toBe("Imported from Shopify, not signed in yet");
    await settle();
    expect(toastText()).toContain("Send to is now “Imported from Shopify, not signed in yet”: New website: sign in for points is written for them.");
    // A dragged-in Starter brings its blocks, never its subject.
    expect(document.getElementById("c-subject")!.textContent).toBe(DRAFT.subject);
    undo();
    expect(kinds()).toEqual(["Heading", "Text"]);
    expect(audience()).toBe("Everyone subscribed to marketing email");
  });
});

describe("the Start panel", () => {
  it("is put away by Blank, ended by typing, and offered again after Clear all", async () => {
    mount(null, newCampaignDraft(undefined, []));
    await click(await until(() => choice("Blank")));
    expect(startPanel()).toBeNull();
    expect(document.body.textContent).toContain("No blocks yet.");

    await retype("c-subject", "Sleep cooler");
    await click(button("Clear all")!);
    expect(startPanel()).not.toBeNull();
    // Typing in the email ends it; emptying it again offers it again.
    await retype("c-subject", "Hi");
    expect(startPanel()).toBeNull();
    await retype("c-subject", "");
    expect(startPanel()).not.toBeNull();
  });

  it("makes a copy of a past campaign, archived ones listed too, as Duplicate does", async () => {
    actions.listPastCampaignsAction.mockResolvedValueOnce({ ok: true, campaigns: PAST });
    mount(null, newCampaignDraft(undefined, []));
    expect(actions.listPastCampaignsAction).not.toHaveBeenCalled();
    await click(await until(() => choice("A past campaign")));
    const list = await until(() => document.querySelector("ul[aria-label='Past campaigns']"));
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^December launchSleep coolerDraft/),
      expect.stringMatching(/^New website: sign in for pointsOur new website is hereArchived/),
    ]);
    await click(list.querySelectorAll("button")[1]);
    expect(actions.duplicateCampaign).toHaveBeenCalledWith("c1");
    expect(router.push).toHaveBeenCalledWith("/en-US/settings/campaigns/c-new");
    expect(actions.saveCampaign).not.toHaveBeenCalled();
  });

  it("opens Generate's brief from ✨ Write with AI while AI writing is on, or says why it can't yet", async () => {
    // A name of three words is what Claude drafts from until there is a subject (slice 09).
    mount(null, { ...newCampaignDraft(undefined, []), name: "December cooling launch" }, { on: true, configured: true });
    // Generate's popover loads with the page's AI parts: the card opens it under the header's Generate.
    await until(() => [...document.querySelectorAll("button[aria-haspopup='dialog']")].find((b) => b.textContent?.includes("Generate")));
    const card = await until(() => choice("Write with AI"));
    expect(card.getAttribute("aria-disabled")).toBeNull();
    await click(card);
    const brief = await until(() => document.querySelector("[aria-label='Write the email with Claude']"));
    expect(brief.textContent).toContain("December cooling launch");
    act(() => root?.unmount());

    // No subject and no name of three words: the card says what Claude needs.
    mount(null, newCampaignDraft(undefined, []), { on: true, configured: false });
    expect((await until(() => choice("Write with AI"))).getAttribute("aria-disabled")).toBe("true");
    expect(choice("Write with AI")!.textContent).toContain("add the Claude API key");
    act(() => root?.unmount());
    mount(null, newCampaignDraft(undefined, []), { on: true, configured: true });
    expect((await until(() => choice("Write with AI"))).textContent).toContain("Write a subject of at least 3 words");
  });

  it("is not offered for a campaign that has started sending", () => {
    mount({ ...SAVED, lockedAt: "2026-10-21T01:00:00Z" }, { ...DRAFT, subject: "", content: { ...CONTENT, blocks: [] } });
    expect(startPanel()).toBeNull();
  });
});

function button(label: string) {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
}
