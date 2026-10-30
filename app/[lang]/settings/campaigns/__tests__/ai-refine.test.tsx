// @vitest-environment jsdom
import { click, press, retype, settle, typeField, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiWritingAvailability } from "@/lib/ai/availability";
import type { RefineRequest, RefineResult } from "@/lib/email-campaigns/ai-refine-shape";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * ✨ Refine in the campaign editor (PRD-campaign-email-editor slice 10,
 * decision 9): subject and preview line ideas under their fields, each a
 * button that fills the field; *✨ Rewrite* on a heading or text block, its
 * rewrite shown in the block beside the original struck through, with
 * Replace (one change, which Undo takes back), Try again and Keep mine
 * (nothing changes). Every control has a name and is a real button. Nothing
 * saves or sends.
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
vi.mock("../ai-actions", () => ({ keepAiDraft: vi.fn(async () => ({ ok: true as const })) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");

const URL_ = "https://mpillow.com/book";
const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
    {
      id: "words",
      type: "text",
      paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", warm nights are back, and so is the FibreCool cover. " }, { text: "Book a fitting", href: URL_ }] }],
    },
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

const SUBJECTS = [
  "{first_name}, sleep cooler this December",
  "The FibreCool cover is back",
  "Warm nights, cool pillow",
  "Your pillow, cooler in every size",
  "A cooler night's sleep starts with the cover your pillow has been waiting for",
];

const SHORTER: RefineResult = {
  kind: "rewrite",
  block: {
    id: "words",
    type: "text",
    paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", the FibreCool cover is back. " }, { text: "Book a fitting", href: URL_ }] }],
  },
};

/** The route's answers, in order; each request is kept. */
let answers: { status?: number; body: unknown }[] = [];
const requests: RefineRequest[] = [];
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  requests.push(JSON.parse(String(init?.body)) as RefineRequest);
  const next = answers.shift();
  if (!next) throw new Error("no answer scripted");
  return { ok: (next.status ?? 200) < 400, status: next.status ?? 200, json: async () => next.body };
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

/** A button by its name: its words, or its aria-label. */
const named = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || (!b.hasAttribute("aria-label") && b.textContent?.trim() === label)) ?? null;
const ideaButtons = (field: "subject" | "preheader") => [...(document.querySelector(`[aria-labelledby='c-${field}-ideas-label']`)?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
const ideasShown = (field: "subject" | "preheader") => ideaButtons(field).filter((b) => !["More ideas", "No thanks"].includes(b.textContent?.trim() ?? ""));
const undo = () => press("z", { ctrl: true }, document.body);
const saved = () => named("Save changes")!.disabled;
const rewriteButton = (block: string) => until(() => named(`Rewrite with Claude: ${block}`));
const offer = () => document.querySelector<HTMLElement>("[aria-labelledby='block-words-offer-label']");

/** Opens ✨ Rewrite on the text block and picks `choice`. */
async function rewriteWith(choice: string) {
  await click(await rewriteButton("Text, block 2 of 2"));
  await click(await until(() => named(choice)));
  await settle(30);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  answers = [];
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

describe("subject line ideas", () => {
  it("offers five lines from the email, each with its length, the long ones marked; one fills the field, and Undo takes it back", async () => {
    mount();
    answers.push({ body: { kind: "subjects", ideas: SUBJECTS } });
    await click(await until(() => named("Suggest subject lines")));
    await until(() => ideasShown("subject").length);
    expect(requests[0]).toMatchObject({ kind: "subjects", subject: DRAFT.subject, name: DRAFT.name, exclude: [], campaignId: SAVED.id });
    expect(requests[0].kind === "subjects" && requests[0].words).toEqual(["Sleep cooler this December", "Hi {first_name}, warm nights are back, and so is the FibreCool cover. Book a fitting"]);
    const shown = ideasShown("subject");
    expect(shown).toHaveLength(5);
    // Counted as the field counts: a Variable as the sample customer's words.
    expect(shown[0].textContent).toBe(`{first_name}, sleep cooler this December${"Mei Ling, sleep cooler this December".length}`);
    expect(shown[4].textContent).toMatch(/, may be cut off on phones$/);
    expect(shown[1].textContent).not.toMatch(/cut off/);

    await click(shown[1]);
    expect(wordsOf("c-subject")).toBe("The FibreCool cover is back");
    expect(ideasShown("subject")).toEqual([]);
    expect(saved()).toBe(false);
    undo();
    await settle(20);
    expect(wordsOf("c-subject")).toBe(DRAFT.subject);
    expect(saved()).toBe(true);
    expect(actions.saveCampaign).not.toHaveBeenCalled();
  });

  it("More ideas asks again for others, keeping the last ones in view meanwhile", async () => {
    mount();
    answers.push({ body: { kind: "subjects", ideas: SUBJECTS } }, { body: { kind: "subjects", ideas: ["Cool covers, every size", "Warm nights are back", "Your coolest pillow yet"] } });
    await click(await until(() => named("Suggest subject lines")));
    await until(() => ideasShown("subject").length);
    await click(named("More ideas")!);
    await until(() => ideasShown("subject").length === 3);
    expect(requests[1]).toMatchObject({ kind: "subjects", exclude: SUBJECTS });
    expect(ideasShown("subject").map((b) => b.textContent)).toEqual([expect.stringMatching(/^Cool covers, every size/), expect.any(String), expect.any(String)]);
  });

  it("shows why when Claude can't, such as the limit, under the field", async () => {
    mount();
    answers.push({ status: 429, body: { error: "You've asked Claude for a lot today. Try again after 4:10 pm." } });
    await click(await until(() => named("Suggest subject lines")));
    expect((await until(() => document.querySelector("[role='alert']")))?.textContent).toBe("You've asked Claude for a lot today. Try again after 4:10 pm.");
    await click(named("Dismiss")!);
    expect(document.querySelector("[role='alert']")).toBeNull();
    expect(wordsOf("c-subject")).toBe(DRAFT.subject);
  });

  it("needs some of the email to be written from", async () => {
    mount({ ...DRAFT, subject: "", content: { ...CONTENT, blocks: [] } });
    const b = await until(() => named("Suggest subject lines"));
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe("Write some of the email first, then Claude can suggest subject lines from it.");
    await click(b);
    expect(requests).toEqual([]);
  });
});

describe("preview line ideas", () => {
  it("offers two lines to follow the subject; one fills the preview line", async () => {
    mount();
    answers.push({ body: { kind: "preview_lines", ideas: ["The FibreCool cover keeps your pillow cool on warm nights.", "Back in every size."] } });
    await click(await until(() => named("Suggest preview lines")));
    await until(() => ideasShown("preheader").length);
    expect(requests[0]).toMatchObject({ kind: "preview_lines", subject: DRAFT.subject });
    expect(ideasShown("preheader")).toHaveLength(2);
    await click(ideasShown("preheader")[0]);
    expect(wordsOf("c-preheader")).toBe("The FibreCool cover keeps your pillow cool on warm nights.");
    undo();
    await settle(20);
    expect(wordsOf("c-preheader")).toBe("");
  });
});

describe("✨ Rewrite a block", () => {
  it("shows the rewrite in the block beside the original struck through; Replace is one change, which Undo takes back", async () => {
    mount();
    answers.push({ body: SHORTER });
    await rewriteWith("Shorter");
    expect(requests[0]).toMatchObject({ kind: "rewrite", action: "shorter", instruction: "", block: CONTENT.blocks[1], exclude: [] });
    const shown = await until(() => offer());
    expect(shown.querySelector("del")?.textContent).toContain("warm nights are back, and so is the FibreCool cover.");
    expect(shown.querySelector("ins")?.textContent).toContain("the FibreCool cover is back.");
    // The link and the Variable are kept: the chip and the linked words read in the rewrite.
    expect(shown.querySelector("ins")?.textContent).toContain("First name");
    expect(shown.querySelector("ins")?.textContent).toContain("Book a fitting");
    expect(document.activeElement).toBe(named("Replace"));
    expect(saved()).toBe(true);

    await click(named("Replace")!);
    await settle(20);
    expect(offer()).toBeNull();
    expect(wordsOf("block-words-text")).toContain("the FibreCool cover is back.");
    expect(saved()).toBe(false);
    expect(document.activeElement).toBe(named("Rewrite with Claude: Text, block 2 of 2"));
    undo();
    await settle(20);
    expect(wordsOf("block-words-text")).toContain("warm nights are back, and so is the FibreCool cover.");
    expect(saved()).toBe(true);
    expect(actions.saveCampaign).not.toHaveBeenCalled();
  });

  it("Keep mine leaves the block untouched", async () => {
    mount();
    answers.push({ body: SHORTER });
    await rewriteWith("Warmer");
    await until(() => offer());
    await click(named("Keep mine")!);
    await settle(20);
    expect(offer()).toBeNull();
    expect(wordsOf("block-words-text")).toContain("warm nights are back, and so is the FibreCool cover.");
    expect(saved()).toBe(true);
    expect(named("Undo")!.disabled).toBe(true);
    expect(document.activeElement).toBe(named("Rewrite with Claude: Text, block 2 of 2"));
  });

  it("Try again asks for a rewrite other than the one offered", async () => {
    mount();
    const second: RefineResult = { kind: "rewrite", block: { ...SHORTER.block, paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", cool nights again. " }, { text: "Book a fitting", href: URL_ }] }] } as never };
    answers.push({ body: SHORTER }, { body: second });
    await rewriteWith("Clearer");
    await until(() => offer());
    await click(named("Try again")!);
    await until(() => offer()?.querySelector("ins")?.textContent?.includes("cool nights again"));
    expect(requests[1]).toMatchObject({ kind: "rewrite", action: "clearer", exclude: ["Hi {first_name}, the FibreCool cover is back. Book a fitting"] });
  });

  it("Something else… takes Staff's own words, one line of at most 120 characters", async () => {
    mount();
    answers.push({ body: SHORTER });
    await click(await rewriteButton("Text, block 2 of 2"));
    const box = await until(() => document.querySelector<HTMLInputElement>("input[id$='-rewrite-other']"));
    expect(box.maxLength).toBe(120);
    expect(document.querySelector(`label[for='${box.id}']`)?.textContent).toBe("Something else…");
    typeField(box, "Say the covers are washable");
    await click([...document.querySelectorAll<HTMLButtonElement>("button[type='submit']")].find((b) => b.textContent === "Rewrite")!);
    await until(() => offer());
    expect(requests[0]).toMatchObject({ kind: "rewrite", action: "other", instruction: "Say the covers are washable" });
  });

  it("rewrites a heading, and offers every choice by name", async () => {
    mount();
    answers.push({ body: { kind: "rewrite", block: { id: "title", type: "heading", level: 1, text: "A cooler December" } } });
    await click(await rewriteButton("Heading, block 1 of 2"));
    for (const choice of ["Shorter", "Warmer", "Clearer", "Fix grammar"]) expect(named(choice)?.tagName).toBe("BUTTON");
    await click(named("Fix grammar")!);
    await until(() => document.querySelector("[aria-labelledby='block-title-offer-label']"));
    await click(named("Replace")!);
    await settle(20);
    expect(wordsOf("block-title-text")).toBe("A cooler December");
  });

  it("says why when the rewrite didn't fit, with Try again and Keep mine", async () => {
    mount();
    answers.push({ status: 502, body: { error: 'Claude\'s rewrite didn\'t fit: drops the link on "Book a fitting". Try again, or keep yours.' } });
    await rewriteWith("Shorter");
    expect((await until(() => offer()?.querySelector("[role='alert']")))?.textContent).toMatch(/^Claude's rewrite didn't fit/);
    expect(named("Replace")).toBeNull();
    await click(named("Keep mine")!);
    expect(wordsOf("block-words-text")).toContain("warm nights are back");
  });

  it("drops the offer when its block changes underneath it, as an Undo does", async () => {
    mount();
    await retype("block-words-text", "Warm nights are back.");
    answers.push({ body: { kind: "rewrite", block: { id: "words", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Warm nights." }] }] } } });
    await rewriteWith("Shorter");
    await until(() => offer());
    undo();
    await settle(20);
    expect(offer()).toBeNull();
    expect(wordsOf("block-words-text")).toContain("warm nights are back, and so is the FibreCool cover.");
  });
});

describe("AI writing switched off or not set up", () => {
  it("shows no ✨ at all when AI writing is off", async () => {
    mount(DRAFT, { on: false, configured: true });
    await settle(50);
    for (const label of ["Suggest subject lines", "Suggest preview lines", "Rewrite with Claude: Text, block 2 of 2"]) expect(named(label)).toBeNull();
  });

  it("says how to set Claude up when its credentials aren't there", async () => {
    mount(DRAFT, { on: true, configured: false });
    for (const label of ["Suggest subject lines", "Rewrite with Claude: Heading, block 1 of 2"]) {
      const b = await until(() => named(label));
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(document.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe("AI writing is off: add the Claude API key on General");
    }
  });
});
