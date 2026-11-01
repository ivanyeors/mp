// @vitest-environment jsdom
import { click, press, retype, settle, typeField, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiWritingAvailability } from "@/lib/ai/availability";
import type { DraftEvent, DraftRequest } from "@/lib/email-campaigns/ai-draft-shape";
import type { CampaignContent, EmailBlock } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * ✨ Generate in the campaign editor (PRD-campaign-email-editor slice 09,
 * decision 9): the popover under the button, the blocks arriving one by one
 * as one change, the ideas under the subject and preview line, Keep, Try
 * again and Undo, *Drafted with AI* until a person edits or keeps a block,
 * and *Write this from the subject* in an empty text block. It never saves
 * or sends; with AI writing off there is no ✨ at all.
 */

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "", from: null })),
  saveCampaign: vi.fn(async () => ({ ok: true as const, id: "x" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
  describeCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  findCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
}));
vi.mock("../actions", () => actions);
const keepAiDraft = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("../ai-actions", () => ({ keepAiDraft }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");

const CONTENT: CampaignContent = { v: 1, blocks: [{ id: "title", type: "heading", level: 1, text: "Sleep cooler" }], fallbacks: {} };
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
const ON: AiWritingAvailability = { on: true, configured: true };

const HEADING: EmailBlock = { id: "ai1", type: "heading", level: 1, text: "Cool nights are back" };
const TEXT: EmailBlock = { id: "ai2", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "The FibreCool cover keeps your pillow cool." }] }] };

/** A draft's stream, line by line, as the test sends each event. */
function draftStream() {
  const queue: (string | null)[] = [];
  let wake: (() => void) | null = null;
  let signal: AbortSignal | undefined;
  const reader = {
    async read(): Promise<{ done: boolean; value?: Uint8Array }> {
      while (!queue.length) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        await new Promise<void>((r) => {
          wake = r;
          signal?.addEventListener("abort", () => r(), { once: true });
        });
      }
      const next = queue.shift()!;
      return next === null ? { done: true } : { done: false, value: new TextEncoder().encode(next) };
    },
  };
  const push = (line: string | null) => {
    queue.push(line);
    wake?.();
  };
  return {
    respond(init?: RequestInit) {
      signal = init?.signal ?? undefined;
      return { ok: true, status: 200, body: { getReader: () => reader }, json: async () => null };
    },
    send: async (event: DraftEvent) => {
      push(`${JSON.stringify(event)}\n`);
      await settle(10);
    },
    end: async () => {
      push(null);
      await settle(10);
    },
  };
}

let streams: ReturnType<typeof draftStream>[] = [];
const requests: DraftRequest[] = [];
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  requests.push(JSON.parse(String(init?.body)) as DraftRequest);
  const s = streams.shift();
  if (!s) throw new Error("no stream scripted");
  return s.respond(init);
});

let root: Root | null = null;
function mount(draft: CampaignDraft = DRAFT, ai: AiWritingAvailability = ON) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={SAVED} draft={draft} stats={null} segments={[]} staffEmail="owner@mpillow.com" ai={ai} />
        <Toaster />
      </>,
    ),
  );
}

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
/** The ✨ button in the header, once its popover has loaded. */
const generate = () => until(() => [...document.querySelectorAll<HTMLButtonElement>("button[aria-haspopup='dialog']")].find((b) => b.textContent?.includes("Generate")));
const headings = () => [...document.querySelectorAll<HTMLElement>("[data-block-id] [data-block-body] [role='textbox']")].map((i) => i.textContent);
const blockIds = () => [...document.querySelectorAll<HTMLElement>("li[data-block-id]")].map((b) => b.dataset.blockId);
const badges = () => [...document.querySelectorAll<HTMLElement>("li[data-block-id]")].filter((b) => b.querySelector("[data-block-badge]")).map((b) => b.dataset.blockId);
const undo = () => press("z", { ctrl: true }, document.body);
const saved = () => button("Save changes")!.disabled;

/** Opens the popover, fills the brief, and presses *Write the email*. */
async function draftIt(about = "") {
  await click(await generate());
  const box = await until(() => document.getElementById("ai-about") as HTMLTextAreaElement | null);
  if (about) act(() => typeField(box, about));
  await click(button("Write the email")!);
  await settle(20);
}

/** Streams a whole draft: the stage, the ideas, two blocks, done. */
async function writeAll(s: ReturnType<typeof draftStream>) {
  await s.send({ type: "stage", stage: "writing" });
  await s.send({ type: "subjects", subjects: ["Cool nights are back", "FibreCool covers are back", "Sleep cooler this December"] });
  await s.send({ type: "preheaders", preheaders: ["The FibreCool cover keeps your pillow cool on warm nights.", "Back in all sizes."] });
  await s.send({ type: "block", block: HEADING });
  await s.send({ type: "block", block: TEXT });
  await s.send({ type: "done", draftId: "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f", notes: ["Add a photo of the cover."] });
  await s.end();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  streams = [];
  requests.length = 0;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("✨ Generate", () => {
  it("writes the email into the editor block by block, as one change that one Undo takes back exactly", async () => {
    mount();
    const s = draftStream();
    streams.push(s);
    await draftIt("The FibreCool cover is back in all sizes");
    expect(requests[0]).toMatchObject({ scope: "email", subject: DRAFT.subject, name: DRAFT.name, about: "The FibreCool cover is back in all sizes", existing: [] });
    expect(await until(() => document.body.textContent?.includes("Reading your brief…"))).toBe(true);

    await s.send({ type: "stage", stage: "writing" });
    expect(document.body.textContent).toContain("Writing the email…");
    await s.send({ type: "block", block: HEADING });
    // The first block is in the email while the rest is still being written, in place of the old one.
    expect(blockIds()).toEqual(["ai1"]);
    expect(button("Keep")).toBeNull();
    // However long Claude takes between blocks, the draft stays one change.
    const later = Date.now() + 30_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(later);
    await s.send({ type: "block", block: TEXT });
    await s.send({ type: "done", draftId: "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f", notes: ["Add a photo of the cover."] });
    await s.end();

    clock.mockRestore();
    expect(blockIds()).toEqual(["ai1", "ai2"]);
    expect(badges()).toEqual(["ai1", "ai2"]);
    expect(document.querySelector("li[data-block-id='ai1']")!.getAttribute("aria-label")).toBe("Heading, block 1 of 2, Drafted with AI");
    expect(await until(() => button("Keep"))).toBeTruthy();
    expect(document.body.textContent).toContain("Add a photo of the cover.");
    expect(saved()).toBe(false);

    undo();
    await settle(20);
    expect(blockIds()).toEqual(["title"]);
    expect(headings()).toEqual(["Sleep cooler"]);
    expect(badges()).toEqual([]);
    expect(saved()).toBe(true); // exactly as it was saved
    expect(button("Keep")).toBeNull();
    expect(actions.saveCampaign).not.toHaveBeenCalled();
  });

  it("Keep reads the draft as a person's; one Undo still takes the whole draft back", async () => {
    mount();
    const s = draftStream();
    streams.push(s);
    await draftIt();
    await writeAll(s);
    await click(await until(() => button("Keep")));
    expect(badges()).toEqual([]);
    expect(keepAiDraft).toHaveBeenCalledWith("9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f", SAVED.id);
    expect(button("Keep")).toBeNull();
    undo();
    await settle(20);
    expect(blockIds()).toEqual(["title"]);
    expect(saved()).toBe(true);
  });

  it("offers subject and preview line ideas under their fields; picking one fills it, in the same change", async () => {
    mount();
    const s = draftStream();
    streams.push(s);
    await draftIt();
    await writeAll(s);
    const ideas = await until(() => document.querySelector<HTMLElement>("[aria-labelledby='c-subject-ideas-label']"));
    const idea = [...ideas.querySelectorAll("button")].find((b) => b.textContent?.startsWith("FibreCool covers are back"))!;
    await click(idea);
    expect(wordsOf("c-subject")).toBe("FibreCool covers are back");
    expect(document.querySelector("[aria-labelledby='c-subject-ideas-label']")).toBeNull();
    expect(document.querySelector("[aria-labelledby='c-preheader-ideas-label']")).not.toBeNull();
    undo();
    await settle(20);
    expect(wordsOf("c-subject")).toBe(DRAFT.subject);
    expect(blockIds()).toEqual(["title"]);
  });

  it("unmarks a drafted block a person edits", async () => {
    mount();
    const s = draftStream();
    streams.push(s);
    await draftIt();
    await writeAll(s);
    await retype("block-ai1-text", "Cool nights, again");
    expect(badges()).toEqual(["ai2"]);
  });

  it("Try again takes the draft back and writes it again from the same brief", async () => {
    mount();
    const first = draftStream();
    const second = draftStream();
    streams.push(first, second);
    await draftIt("Back in all sizes");
    await writeAll(first);
    await click(await until(() => button("Try again")));
    expect(blockIds()).toEqual(["title"]);
    expect(requests[1]).toMatchObject({ about: "Back in all sizes" });
    await second.send({ type: "block", block: { ...HEADING, id: "ai3", text: "A cooler December" } });
    await second.send({ type: "done", draftId: "1c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f", notes: [] });
    await second.end();
    expect(blockIds()).toEqual(["ai3"]);
    undo();
    await settle(20);
    expect(blockIds()).toEqual(["title"]);
  });

  it("adds below the email's blocks when asked, sending its words along for context", async () => {
    mount();
    const s = draftStream();
    streams.push(s);
    await click(await generate());
    const add = await until(() => [...document.querySelectorAll<HTMLButtonElement>("[role='radio']")].find((b) => b.textContent === "Add below"));
    await click(add);
    await click(button("Write the email")!);
    await writeAll(s);
    expect(requests[0].existing).toEqual(["Sleep cooler"]);
    expect(blockIds()).toEqual(["title", "ai1", "ai2"]);
    expect(badges()).toEqual(["ai1", "ai2"]);
  });

  it("Stop keeps what came before it, to keep or undo", async () => {
    mount();
    const s = draftStream();
    streams.push(s);
    await draftIt();
    await s.send({ type: "block", block: HEADING });
    await click(await until(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Stop")));
    await settle(20);
    expect(blockIds()).toEqual(["ai1"]);
    expect(document.body.textContent).toContain("Stopped. What Claude wrote so far is in the email");
    await click(button("Undo")!);
    expect(blockIds()).toEqual(["title"]);
  });

  it("puts the email back and says why when a draft fails", async () => {
    mount();
    const s = draftStream();
    streams.push(s);
    await draftIt();
    await s.send({ type: "block", block: HEADING });
    await s.send({ type: "error", error: "Claude couldn't write this one. Try different words." });
    await s.end();
    expect(blockIds()).toEqual(["title"]);
    expect(document.querySelector("[role='alert']")?.textContent).toBe("Claude couldn't write this one. Try different words.");
    expect(saved()).toBe(true);
  });

  it("shows a refusal before the stream, such as the limit, in the bar", async () => {
    mount();
    streams.push({
      respond: () => ({ ok: false, status: 429, body: null, json: async () => ({ error: "You've drafted a lot today. Try again after 4:10 pm." }) }),
    } as unknown as ReturnType<typeof draftStream>);
    await draftIt();
    expect((await until(() => document.querySelector("[role='alert']")))?.textContent).toBe("You've drafted a lot today. Try again after 4:10 pm.");
    expect(blockIds()).toEqual(["title"]);
  });

  it("needs a subject of at least 3 words", async () => {
    mount({ ...DRAFT, subject: "Sleep cooler", name: "" });
    const b = await generate();
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Write a subject of at least 3 words, then Claude can draft the email from it.",
    );
    await click(b);
    expect(document.getElementById("ai-about")).toBeNull();
  });
});

describe("✨ Write this from the subject", () => {
  it("fills one empty text block, marked, sending the email's other words along", async () => {
    mount({ ...DRAFT, content: { ...CONTENT, blocks: [...CONTENT.blocks, { id: "empty", type: "text", paragraphs: [] }] } });
    const s = draftStream();
    streams.push(s);
    await click(await until(() => button("Write this from the subject")));
    expect(requests[0]).toMatchObject({ scope: "text", existing: ["Sleep cooler"], about: "" });
    await s.send({ type: "block", block: { ...TEXT, id: "ignored" } });
    await s.send({ type: "done", draftId: "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f", notes: [] });
    await s.end();
    expect(blockIds()).toEqual(["title", "empty"]);
    expect(wordsOf("block-empty-text")).toBe("The FibreCool cover keeps your pillow cool.");
    expect(badges()).toEqual(["empty"]);
    undo();
    await settle(20);
    expect(wordsOf("block-empty-text")).toBe("");
    expect(badges()).toEqual([]);
  });
});

describe("AI writing switched off or not set up", () => {
  const withEmptyText = { ...DRAFT, content: { ...CONTENT, blocks: [...CONTENT.blocks, { id: "empty", type: "text" as const, paragraphs: [] }] } };

  it("shows no ✨ button anywhere when AI writing is off", async () => {
    mount(withEmptyText, { on: false, configured: true });
    await settle(50);
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Generate"))).toBe(false);
    expect(button("Write this from the subject")).toBeNull();
  });

  it("says how to set Claude up when its credentials aren't there", async () => {
    mount(withEmptyText, { on: true, configured: false });
    await settle(50);
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("Generate"))!;
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe("AI writing is off: add the Claude API key on General");
    expect(button("Write this from the subject")!.getAttribute("aria-disabled")).toBe("true");
  });
});
