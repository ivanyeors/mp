// @vitest-environment jsdom
import { choose, click, retype, settle, typeField, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const RENDITION = { assetId: PHOTO, url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${PHOTO}.jpg`, width: 1200, height: 800, hasAlpha: false };

const picker = vi.hoisted(() => ({ assetId: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f" }));
vi.mock("@/components/ui/image-picker", () => ({
  ImagePicker: ({ onSelect, children }: { onSelect: (s: { assetId: string; url: string; alt?: string | null }) => void; children: ReactNode }) => (
    <span onClickCapture={() => onSelect({ assetId: picker.assetId, url: "https://mpillow.supabase.co/storage/v1/object/public/media/photo_1.webp", alt: "A FibreCool cover on a bed" })}>
      {children}
    </span>
  ),
}));

type SaveResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  placeCampaignImage: vi.fn(async (assetId: string) => ({ ok: true as const, image: { ...RENDITION, assetId } })),
  previewCampaign: vi.fn<(input: CampaignDraftInput, opts?: { forceDark?: boolean }) => Promise<{ ok: true; subject: string; html: string; text: string; from: string }>>(
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

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";
const { CampaignEditor } = await import("../campaign-editor");
const { renderCampaignPreview } = await import("@/lib/email-campaigns/sender");

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [{ id: "title", type: "heading", level: 1, text: "Sleep cooler" }],
  fallbacks: {},
};
const draftWith = (content: CampaignContent): CampaignDraft => ({
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: "",
  body: "",
  content,
  greeting: false,
  button: null,
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
});
const saved = (draft: CampaignDraft): Campaign => ({
  ...draft,
  id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
});

let root: Root | null = null;
function mount(draft: CampaignDraft) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={saved(draft)} draft={draft} stats={null} segments={[]} staffEmail="owner@mpillow.com" />
        <Toaster />
      </>,
    ),
  );
}

const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
const card = (n: number) => document.querySelectorAll<HTMLElement>("li[data-block-id]")[n];
const savedContent = () => actions.saveCampaign.mock.calls.at(-1)![1].content!;
const addBlock = (label: string) => choose(button("Add block")!, label);
const chooseImage = async () => {
  const b = await until(() => (button("Choose an image")?.disabled === false ? button("Choose an image") : null));
  await click(b);
  await settle();
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  picker.assetId = PHOTO;
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

describe("an image block", () => {
  it("chooses a photo from the Media Library: its email copy on the card, its alt text prefilled, saved by asset id", async () => {
    mount(draftWith(CONTENT));
    await addBlock("Image");
    const image = card(1);
    expect(image.textContent).toContain("Choose an image from the Media Library.");

    await chooseImage();
    expect(actions.placeCampaignImage).toHaveBeenCalledWith(PHOTO);
    const shown = await until(() => image.querySelector<HTMLImageElement>("img"));
    expect(shown.getAttribute("src")).toBe(RENDITION.url);
    const alt = image.querySelector<HTMLInputElement>('input[id$="-alt"]')!;
    expect(alt.value).toBe("A FibreCool cover on a bed");
    typeField(alt, "A FibreCool cover on a made bed, in white");
    await settle();

    await act(async () => button("Save changes")!.click());
    await settle();
    expect(savedContent().blocks[1]).toEqual({
      id: expect.any(String),
      type: "image",
      image: { asset: PHOTO, alt: "A FibreCool cover on a made bed, in white" },
      width: "full",
    });
  });

  it("marks it decorative, and takes no alt text then", async () => {
    mount(draftWith(CONTENT));
    await addBlock("Image");
    await chooseImage();
    const image = card(1);
    await click(image.querySelector<HTMLButtonElement>('button[role="checkbox"]')!);
    const alt = image.querySelector<HTMLInputElement>('input[id$="-alt"]')!;
    expect(alt.disabled).toBe(true);
    expect(alt.value).toBe("");
    await act(async () => button("Save changes")!.click());
    await settle();
    expect(savedContent().blocks[1]).toMatchObject({ image: { asset: PHOTO, decorative: true } });
  });

  it("keeps what Staff change while the image's email copy is being made", async () => {
    const LATE = "7a2d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
    picker.assetId = LATE;
    let ready!: (r: { ok: true; image: typeof RENDITION }) => void;
    actions.placeCampaignImage.mockImplementationOnce(() => new Promise((r) => (ready = r)));
    mount(draftWith({ ...CONTENT, blocks: [...CONTENT.blocks, { id: "note", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Back soon." }] }] }] }));
    await addBlock("Image");
    await chooseImage();
    expect(button("Getting it ready for email…")).not.toBeNull();

    const image = card(2);
    const alt = image.querySelector<HTMLInputElement>('input[id$="-alt"]')!;
    typeField(alt, "A cover on a made bed");
    await settle();
    await retype(card(0).querySelector<HTMLElement>('[aria-label="Title"]')!.id, "Sleep cooler all December");
    await choose(button("Actions for Text, block 2")!, "Delete");
    await act(async () => ready({ ok: true, image: { ...RENDITION, assetId: LATE } }));
    await settle();

    await act(async () => button("Save changes")!.click());
    await settle();
    expect(savedContent().blocks).toEqual([
      { id: "title", type: "heading", level: 1, text: "Sleep cooler all December" },
      { id: expect.any(String), type: "image", image: { asset: LATE, alt: "A cover on a made bed" }, width: "full" },
    ]);
  });

  it("places nothing when its block is deleted while the email copy is made", async () => {
    const LATE = "8b3e4d5f-6a71-4b8c-9d0e-1f2a3b4c5d6e";
    picker.assetId = LATE;
    let ready!: (r: { ok: true; image: typeof RENDITION }) => void;
    actions.placeCampaignImage.mockImplementationOnce(() => new Promise((r) => (ready = r)));
    mount(draftWith(CONTENT));
    await addBlock("Image");
    await chooseImage();
    await choose(button("Actions for Image, block 2")!, "Delete");
    await act(async () => ready({ ok: true, image: { ...RENDITION, assetId: LATE } }));
    await settle();
    expect([...document.querySelectorAll<HTMLElement>("li[data-block-id]")].map((li) => li.dataset.blockId)).toEqual(["title"]);
  });

  it("says why an image can't be used, and places nothing", async () => {
    picker.assetId = "99999999-8888-4777-8666-555555555555";
    actions.placeCampaignImage.mockResolvedValueOnce({ ok: false, error: "That image is no longer in the Media Library." } as never);
    mount(draftWith(CONTENT));
    await addBlock("Image");
    await chooseImage();
    expect(card(1).textContent).toContain("That image is no longer in the Media Library.");
    expect(card(1).querySelector("img")).toBeNull();
  });
});

describe("a hero", () => {
  it("starts with every part, and drops and adds them back", async () => {
    mount(draftWith(CONTENT));
    await addBlock("Hero");
    const hero = card(1);
    expect(hero.querySelector('[aria-label="Hero heading"]')).not.toBeNull();
    expect(hero.querySelector('[aria-label="Hero line"]')).not.toBeNull();
    expect(hero.querySelector('input[aria-label="Hero button: label"]')).not.toBeNull();

    await click(button("Remove the line")!);
    expect(hero.querySelector('[aria-label="Hero line"]')).toBeNull();
    await click(button("Add a line")!);
    expect(hero.querySelector('[aria-label="Hero line"]')?.textContent).toBe("");

    await click(button("Remove the button")!);
    await act(async () => button("Save changes")!.click());
    await settle();
    expect(savedContent().blocks[1]).toEqual({ id: expect.any(String), type: "hero", image: { asset: "", alt: "" }, heading: "", line: "" });
  });

  it("takes Variables in its heading and line, as chips, saved as the subject writes them", async () => {
    mount(draftWith(CONTENT));
    await addBlock("Hero");
    const hero = card(1);
    const heading = hero.querySelector<HTMLElement>('[aria-label="Hero heading"]')!.id;
    const line = hero.querySelector<HTMLElement>('[aria-label="Hero line"]')!.id;
    await retype(heading, "{first_name}, sleep cooler");
    await retype(line, "Our covers, {last_name} family");
    expect(wordsOf(heading)).toBe("First name, sleep cooler");
    expect(wordsOf(line)).toBe("Our covers, Last name family");
    await act(async () => button("Save changes")!.click());
    await settle();
    expect(savedContent().blocks[1]).toMatchObject({ type: "hero", heading: "{first_name}, sleep cooler", line: "Our covers, {last_name} family" });
  });
});

describe("the preview", () => {
  it("selects a block's card when the block is clicked in the email", async () => {
    const content: CampaignContent = {
      v: 1,
      blocks: [
        { id: "hero", type: "hero", image: { asset: PHOTO, alt: "A bed" }, heading: "Sleep cooler" },
        { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
      ],
      fallbacks: {},
    };
    const html = renderCampaignPreview(draftWith(content), { origin: "https://custom.mpillow.com", firstName: "Ivan", images: { [PHOTO]: RENDITION } }).html;
    actions.previewCampaign.mockImplementation(async (input) => ({ ok: true, subject: input.subject, html, text: "", from: "Mpillow <hello@hello.mpillow.com>" }));
    mount(draftWith(content));
    const frame = await until(() => document.querySelector<HTMLIFrameElement>('iframe[title="Email preview"]'));
    await settle(100);
    const doc = frame.contentDocument!;
    doc.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;

    expect(card(1).dataset.selected).toBeUndefined();
    await act(async () => doc.querySelector<HTMLElement>('[data-block-id="intro"] p')!.click());
    expect(card(1).dataset.selected).toBe("true");
    await act(async () => doc.querySelector<HTMLElement>('[data-block-id="hero"] h1')!.click());
    expect(card(0).dataset.selected).toBe("true");
    expect(card(1).dataset.selected).toBeUndefined();
    expect(doc.querySelector('[data-block-id="hero"]')!.classList.contains("mp-editor-selected")).toBe(true);
  });
});
