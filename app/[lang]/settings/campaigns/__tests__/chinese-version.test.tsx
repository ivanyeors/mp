// @vitest-environment jsdom
import { click, choose, pointAt, press, retype, settle, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiWritingAvailability } from "@/lib/ai/availability";
import { CHINESE_SAMPLE_CONTENT, CHINESE_SAMPLE_LINES } from "@/lib/email/__fixtures__/samples";
import { ENGLISH, TRANSLATE, translateAnswer } from "@/lib/email-campaigns/__tests__/ai-translate-fixtures";
import { translationFromAnswer, type TranslateRequest } from "@/lib/email-campaigns/ai-translate-shape";
import { chineseVersionOf } from "@/lib/email-campaigns/chinese-version";
import type { CampaignContent, EmailBlock } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * The 中文 version in the campaign editor (PRD-campaign-email-editor slice
 * 17): ✨ Translate to Chinese puts the whole 中文 version in as one change
 * and opens 中文, which Undo takes back; in 中文 the words are edited and the
 * layout is English's; a block added or changed in English says so, with ✨
 * and *Keep*; *Remove the 中文 version*; a refused translation changes
 * nothing; the preview, and a test, in the language chosen. Nothing saves or
 * sends but Save and Send.
 */

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "", from: null })),
  saveCampaign: vi.fn(async () => ({ ok: true as const, id: "x" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(async () => ({ ok: true as const, sent: 1, failed: [] })),
  describeCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  findCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  placeCampaignImage: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock("../actions", () => actions);
vi.mock("../ai-actions", () => ({ keepAiDraft: vi.fn(async () => ({ ok: true as const })) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");

const draftOf = (content: CampaignContent): CampaignDraft => ({
  name: "December cooling launch",
  subject: CHINESE_SAMPLE_LINES.subject,
  preheader: CHINESE_SAMPLE_LINES.preheader,
  body: "",
  content,
  greeting: false,
  button: null,
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds: [],
});
const saved = (content: CampaignContent): Campaign => ({
  ...draftOf(content),
  id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
});
const ON: AiWritingAvailability = { on: true, configured: true };

/** The route's answers, in order; each request is kept. */
let answers: { status?: number; body: unknown }[] = [];
const requests: TranslateRequest[] = [];
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  requests.push(JSON.parse(String(init?.body)) as TranslateRequest);
  const next = answers.shift();
  if (!next) throw new Error("no answer scripted");
  return { ok: (next.status ?? 200) < 400, status: next.status ?? 200, json: async () => next.body };
});
/** The route's answer to TRANSLATE: the sample's Chinese, as the call would put it, checked. */
const TRANSLATED = (() => {
  const made = translationFromAnswer(TRANSLATE, JSON.parse(translateAnswer()));
  if (!made.ok) throw new Error(made.problems.join("; "));
  return { translation: made.translation };
})();

let root: Root | null = null;
function mount(content: CampaignContent = ENGLISH, ai: AiWritingAvailability = ON) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={saved(content)} draft={draftOf(content)} stats={null} segments={[]} staffEmail="owner@mpillow.com" ai={ai} />
        <Toaster />
      </>,
    ),
  );
}

/** A button by its name: its words, or its aria-label. */
const named = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || (!b.hasAttribute("aria-label") && b.textContent?.trim() === label)) ?? null;
const language = () => document.querySelector<HTMLElement>("[role='radiogroup'][aria-label='Language'] [aria-checked='true']")?.textContent;
const toChinese = async () => click(await until(() => [...document.querySelectorAll<HTMLButtonElement>("[role='radiogroup'][aria-label='Language'] [role='radio']")].find((b) => b.textContent === "中文")));
const badges = () => [...document.querySelectorAll("[data-block-badge]")].map((b) => b.textContent);
const undo = () => press("z", { ctrl: true }, document.body);
const isSaved = () => named("Save changes")!.disabled;
/** What Save would write, as the editor sends it. */
async function savedInput(): Promise<CampaignDraftInput> {
  await click(named("Save changes")!);
  await settle(10);
  return (actions.saveCampaign.mock.calls.at(-1) as unknown as [string, CampaignDraftInput])[1];
}
const lastPreview = () => actions.previewCampaign.mock.calls.at(-1) as unknown as [CampaignDraftInput, { language?: string }] | undefined;

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

describe("✨ Translate to Chinese", () => {
  it("makes the whole 中文 version as one change and opens 中文; Undo takes it back, and nothing is saved", async () => {
    mount();
    expect(language()).toBe("English");
    answers.push({ body: TRANSLATED });
    await click(await until(() => named("Translate to Chinese")));
    await until(() => language() === "中文");
    expect(requests[0]).toMatchObject({ only: null, lines: true, subject: CHINESE_SAMPLE_LINES.subject, campaignId: saved(ENGLISH).id });
    expect(requests[0].content.blocks.map((b) => b.id)).toEqual(ENGLISH.blocks.map((b) => b.id));

    // Every word in Chinese, around the same blocks.
    expect(wordsOf("c-subject")).toBe("{first_name}，这个十二月睡得更清凉".replace("{first_name}", "First name"));
    expect(wordsOf("block-why-text")).toBe("为什么选择 FibreCool");
    // Claude's words, until a person reads them (PRD decision 9).
    expect(new Set(badges())).toEqual(new Set(["Drafted with AI"]));
    expect(badges()).toHaveLength(Object.keys(TRANSLATED.translation.blocks).length);
    await until(() => lastPreview()?.[1].language === "zh-CN");
    expect(isSaved()).toBe(false);
    expect(actions.saveCampaign).not.toHaveBeenCalled();

    undo();
    await settle(20);
    expect(isSaved()).toBe(true);
    // Still in 中文, now with nothing translated.
    expect(badges()).toContain("Not translated yet");
  });

  it("holds the header's ✨ Generate while it translates, as every other ✨ is held", async () => {
    mount();
    const generate = () => [...document.querySelectorAll<HTMLButtonElement>("button[aria-haspopup='dialog']")].find((b) => b.textContent?.includes("Generate"));
    expect((await until(generate)).getAttribute("aria-disabled")).toBeNull();
    // The translation is still on its way.
    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    await click(await until(() => named("Translate to Chinese")));
    const held = await until(() => (generate()?.getAttribute("aria-disabled") === "true" ? generate() : null));
    expect(document.getElementById(held!.getAttribute("aria-describedby")!)?.textContent).toBe("Claude is writing. Wait for it, or press Stop.");
  });

  it("unmarks a translated block when a person keeps or edits it in 中文", async () => {
    mount();
    answers.push({ body: TRANSLATED });
    await click(await until(() => named("Translate to Chinese")));
    await until(() => language() === "中文");
    const marked = () => [...document.querySelectorAll<HTMLElement>("li[data-block-id]")].filter((li) => li.querySelector("[data-block-badge]")).map((li) => li.dataset.blockId);
    expect(marked()).toContain("why");
    await click(document.querySelector<HTMLButtonElement>("li[data-block-id='why'] [aria-label^='Keep the Chinese as it is']")!);
    expect(marked()).not.toContain("why");
    await retype("block-hero-heading", "清凉十二月");
    expect(marked()).not.toContain("hero");
    const input = await savedInput();
    expect(chineseVersionOf(input.content)!.aiDrafted).toEqual(marked());
  });

  it("refuses a translation that drops a link, naming the block, and changes nothing", async () => {
    mount();
    answers.push({ status: 502, body: { error: "Claude's translation didn't fit, so nothing was changed: Block 2, Text drops a link: the English has 2, the Chinese 1. Try again." } });
    await click(await until(() => named("Translate to Chinese")));
    const alert = await until(() => document.querySelector("[role='alert']"));
    expect(alert.textContent).toContain("Block 2, Text drops a link");
    expect(language()).toBe("English");
    expect(isSaved()).toBe(true);
    await click(named("Dismiss")!);
    expect(document.querySelector("[role='alert']")).toBeNull();
  });

  it("offers what changed, or everything again, once there is a 中文 version: what changed sends those blocks alone", async () => {
    const changed: CampaignContent = { ...CHINESE_SAMPLE_CONTENT, blocks: CHINESE_SAMPLE_CONTENT.blocks.map((b) => (b.id === "why" ? ({ ...b, text: "Why FibreCool keeps you cool" } as EmailBlock) : b)) };
    mount(changed);
    answers.push({ body: { translation: { blocks: { why: { type: "heading", from: "x1", text: "为什么 FibreCool 让您清凉" } } } } });
    await choose(await until(() => named("Translate to Chinese")), "Translate what changed1 not translated, or changed in English since");
    await until(() => requests.length === 1);
    expect(requests[0]).toMatchObject({ only: ["why"], lines: false });
    await until(() => language() === "中文");
    expect(wordsOf("block-why-text")).toBe("为什么 FibreCool 让您清凉");
  });
});

describe("in 中文", () => {
  it("edits the words and not the layout: no palette, no drag, no menus, options read-only with why", async () => {
    mount(CHINESE_SAMPLE_CONTENT);
    expect(document.querySelector("aside[aria-label='Palette']")).not.toBeNull();
    await toChinese();
    expect(document.querySelector("aside[aria-label='Palette']")).toBeNull();
    expect(document.querySelectorAll("[aria-label^='Drag ']")).toHaveLength(0);
    expect(document.querySelectorAll("[aria-label^='Actions for ']")).toHaveLength(0);
    expect(named("Generate")).toBeNull();
    expect(named("Suggest subject lines")).toBeNull();
    // A button's words change; where it goes doesn't.
    const target = document.getElementById("block-pair-button-0-target") as HTMLButtonElement;
    expect(target.disabled).toBe(true);
    expect((document.getElementById("block-pair-button-0-label") as HTMLInputElement).value).toBe("定制您的 Mpillow");
    await pointAt(document.querySelector<HTMLElement>("li[data-block-id='why']")!);
    const options = await until(() => document.querySelector<HTMLElement>("[aria-label='Heading options']"));
    expect(options.textContent).toContain("The layout is shared with English. Change it there.");
    expect([...options.querySelectorAll<HTMLButtonElement>("[role='radio']")].every((b) => b.disabled)).toBe(true);

    await retype("block-why-text", "为什么选 FibreCool？");
    const input = await savedInput();
    const words = chineseVersionOf(input.content as CampaignContent)!.blocks;
    expect(words.why).toMatchObject({ type: "heading", text: "为什么选 FibreCool？" });
    // The English is as it was.
    expect((input.content as CampaignContent).blocks).toEqual(CHINESE_SAMPLE_CONTENT.blocks);
  });

  it("says a block added in English is not translated yet, and one changed since is out of date, with Keep", async () => {
    const content: CampaignContent = {
      ...CHINESE_SAMPLE_CONTENT,
      blocks: [
        ...CHINESE_SAMPLE_CONTENT.blocks.map((b) => (b.id === "why" ? ({ ...b, text: "Why FibreCool keeps you cool" } as EmailBlock) : b)),
        { id: "more", type: "heading", level: 2, text: "Care" },
      ],
    };
    mount(content);
    await toChinese();
    expect(badges()).toEqual(["English changed since this was translated", "Not translated yet"]);
    expect(named("Translate into Chinese: Heading, block 9 of 9")).not.toBeNull();
    expect(named("Translate again into Chinese: Heading, block 3 of 9")).not.toBeNull();
    await click(named("Keep the Chinese as it is: Heading, block 3 of 9")!);
    expect(badges()).toEqual(["Not translated yet"]);
    undo();
    await settle(20);
    expect(badges()).toEqual(["English changed since this was translated", "Not translated yet"]);
  });

  it("puts each Variable's 中文 fallback beside its English one", async () => {
    mount(CHINESE_SAMPLE_CONTENT);
    await toChinese();
    const zh = await until(() => document.querySelector<HTMLInputElement>("input[aria-label='First name: if a customer has none, say in Chinese']"));
    expect(zh.value).toBe("您");
  });
});

describe("Remove the 中文 version", () => {
  it("sends English to everyone again, as one change", async () => {
    mount(CHINESE_SAMPLE_CONTENT);
    await toChinese();
    await choose(await until(() => named("Language: more")), "Remove the 中文 version");
    expect(language()).toBe("English");
    expect(chineseVersionOf((await savedInput()).content as CampaignContent)).toBeNull();
  });
});

describe("a test, in either language", () => {
  it("asks which language once there is a 中文 version", async () => {
    mount(CHINESE_SAMPLE_CONTENT);
    await click(await until(() => [...document.querySelectorAll<HTMLButtonElement>("[role='tab']")].find((t) => t.textContent === "Send")));
    const radios = await until(() => document.querySelectorAll<HTMLButtonElement>("[role='radiogroup'][aria-label='Language'] [role='radio']"));
    await click([...radios].at(-1)!);
    await click(named("Send test")!);
    await until(() => actions.sendCampaignTestAction.mock.calls.length);
    expect(actions.sendCampaignTestAction.mock.calls[0]).toEqual([saved(CHINESE_SAMPLE_CONTENT).id, ["owner@mpillow.com"], { language: "zh-CN" }]);
  });
});
