// @vitest-environment jsdom
import { choose, click, placeholderOf, retype, richTextById, settle, typeField, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * The image + text block in the campaign editor (PRD-campaign-email-editor
 * slice 06), as the demo goes: add *Image + text*, choose its photo, write
 * its heading, flip the image to the right, and Save it. Its image always
 * has alt text, so it offers no *Decorative*; its button may be removed and
 * added back.
 */

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const RENDITION = { assetId: PHOTO, url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${PHOTO}.jpg`, width: 1200, height: 800, hasAlpha: false };

// The Media Library's picker, as if Staff chose the photo in it.
vi.mock("@/components/ui/image-picker", () => ({
  ImagePicker: ({ onSelect, children }: { onSelect: (s: { assetId: string; url: string; alt?: string | null }) => void; children: ReactNode }) => (
    <span onClickCapture={() => onSelect({ assetId: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f", url: "https://mpillow.supabase.co/storage/v1/object/public/media/photo_1.webp", alt: "A FibreCool cover on a bed" })}>
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
const save = async () => {
  await act(async () => button("Save changes")!.click());
  await settle();
};
const radio = (el: HTMLElement, group: string, label: string) =>
  [...el.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)].find((r) => r.textContent === label)!;

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

describe("an image + text block", () => {
  it("adds a photo beside its words, flips the image to the right, and saves it", async () => {
    mount(draftWith(CONTENT));
    await choose(button("Add block")!, "Image + text");
    const split = card(1);
    expect(split.textContent).toContain("Choose an image from the Media Library.");
    const heading = split.querySelector<HTMLElement>('[aria-label="Heading beside the image"]')!.id;
    expect(placeholderOf(heading)).toBe("e.g. Sleep cooler this December");
    expect(split.querySelector('[aria-label="Text beside the image"]')).not.toBeNull();
    expect(split.querySelector('input[aria-label="Button beside the image: label"]')).not.toBeNull();
    // Beside words, the image always says what it shows.
    expect(split.querySelector('button[role="checkbox"]')).toBeNull();

    await click(await until(() => (button("Choose an image")?.disabled === false ? button("Choose an image") : null)));
    await settle();
    expect(actions.placeCampaignImage).toHaveBeenCalledWith(PHOTO);
    expect((await until(() => split.querySelector<HTMLImageElement>("img"))).getAttribute("src")).toBe(RENDITION.url);
    expect(split.querySelector<HTMLInputElement>('input[id$="-alt"]')!.value).toBe("A FibreCool cover on a bed");

    // The heading takes Variables as a heading block's does (slice 13).
    await retype(heading, "Why FibreCool, {first_name}");
    expect(wordsOf(heading)).toBe("Why FibreCool, First name");
    typeField(split.querySelector<HTMLInputElement>('input[aria-label="Button beside the image: label"]')!, "Shop the covers");
    // The selected block's options: the image's side, then its button's look.
    expect(radio(split, "Image", "Left").getAttribute("aria-checked")).toBe("true");
    await click(radio(split, "Image", "Right"));
    expect(radio(split, "Image", "Right").getAttribute("aria-checked")).toBe("true");
    await click(radio(split, "Button", "Outline"));

    await save();
    expect(savedContent().blocks[1]).toEqual({
      id: expect.any(String),
      type: "split",
      image: { asset: PHOTO, alt: "A FibreCool cover on a bed" },
      side: "right",
      heading: "Why FibreCool, {first_name}",
      paragraphs: [],
      button: { label: "Shop the covers", target: "shop", style: "secondary" },
    });
  });

  it("drops its button, and adds it back on its placeholder", async () => {
    mount(draftWith(CONTENT));
    await choose(button("Add block")!, "Image + text");
    const split = card(1);
    await click(button("Remove the button")!);
    expect(split.querySelector('input[aria-label="Button beside the image: label"]')).toBeNull();
    expect(split.querySelector('[role="radiogroup"][aria-label="Button"]')).toBeNull();
    await save();
    expect(savedContent().blocks[1]).not.toHaveProperty("button");

    await click(button("Add a button")!);
    expect(split.querySelector<HTMLInputElement>('input[aria-label="Button beside the image: label"]')?.value).toBe("");
    await save();
    expect(savedContent().blocks[1]).toMatchObject({ button: { label: "", target: "shop", style: "primary" } });
  });

  it("shows Save's errors on the field they are about", async () => {
    actions.saveCampaign.mockResolvedValueOnce({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { "content.blocks.1.heading": "Write the heading.", "content.blocks.1.image.alt": "Describe the image for anyone who can't see it." },
    });
    mount(draftWith(CONTENT));
    await choose(button("Add block")!, "Image + text");
    await save();
    const split = card(1);
    expect(split.textContent).toContain("Write the heading.");
    expect(split.textContent).toContain("Describe the image for anyone who can't see it.");
    const heading = split.querySelector<HTMLElement>('[aria-label="Heading beside the image"]')!.id;
    await richTextById(heading);
    expect(document.getElementById(heading)!.getAttribute("aria-invalid")).toBe("true");
  });
});
