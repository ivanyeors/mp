// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";
import type { EmailRendition } from "@/lib/media-assets/email-renditions";
import { emptyWorld, fakeCampaignsClient } from "@/lib/email-campaigns/__tests__/fake-db";

/**
 * Images through the page's actions (PRD-campaign-email-editor slice 05):
 * choosing one makes its email rendition; Save asks for alt text by field and
 * refuses an image with no email copy; the preview shows the rendition the
 * test send delivers, byte for byte, `data-block-id` and all.
 */

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const GONE = "99999999-8888-4777-8666-555555555555";
const RENDITION: EmailRendition = {
  assetId: PHOTO,
  url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${PHOTO}.jpg`,
  width: 1200,
  height: 800,
  bytes: 90_000,
  hasAlpha: false,
};

const h = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[], placed: [] as string[][], touched: [] as unknown[] }));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "s1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com" }) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        h.inserts.push({ table, ...row });
        return { select: () => ({ single: async () => ({ data: { id: "c-new" }, error: null }) }) };
      },
    }),
  }),
}));
vi.mock("@/lib/media-assets/email-renditions", () => ({
  ensureEmailRenditions: vi.fn(async (_admin: unknown, ids: string[]) => {
    h.placed.push(ids);
    return {
      renditions: new Map(ids.filter((id) => id === PHOTO).map((id) => [id, RENDITION])),
      failed: new Map(ids.filter((id) => id !== PHOTO).map((id) => [id, "That image is no longer in the Media Library."])),
    };
  }),
}));
vi.mock("@/lib/media-assets", () => ({ touchLastUsed: vi.fn(async (refs: unknown) => void h.touched.push(refs)) }));

const { placeCampaignImage, previewCampaign, saveCampaign } = await import("../actions");
const { CampaignPreviewSchema } = await import("@/lib/email-campaigns/rules");
const { renderCampaignPreview, sendCampaignTest } = await import("@/lib/email-campaigns/sender");

const content = (alt: string, asset = PHOTO): CampaignContent => ({
  v: 1,
  blocks: [
    { id: "hero", type: "hero", image: { asset, alt }, heading: "Sleep cooler", button: { label: "Shop the covers", target: "shop", style: "primary" } },
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
    { id: "photo", type: "image", image: { asset, alt: "A cover, close up" }, link: { target: "shop" }, width: "inset" },
  ],
  fallbacks: {},
});
const input = (c: CampaignContent): CampaignDraftInput => ({
  name: "December",
  subject: "Sleep cooler",
  preheader: "",
  body: "",
  content: c,
  greeting: true,
  audience: "subscribed",
  segmentId: null,
  button: null,
});

beforeEach(() => {
  h.inserts = [];
  h.placed = [];
  h.touched = [];
});

describe("choosing an image", () => {
  it("makes its email rendition, for the card to show", async () => {
    expect(await placeCampaignImage(PHOTO)).toEqual({
      ok: true,
      image: { assetId: PHOTO, url: RENDITION.url, width: 1200, height: 800, hasAlpha: false },
    });
    expect(h.placed).toEqual([[PHOTO]]);
  });

  it("says why an image can't be placed, and refuses what is not an asset id", async () => {
    expect(await placeCampaignImage(GONE)).toEqual({ ok: false, error: "That image is no longer in the Media Library." });
    expect(await placeCampaignImage("https://evil.example/pixel.gif")).toEqual({ ok: false, error: "That is not an image from the Media Library." });
    expect(h.placed).toEqual([[GONE]]);
  });
});

describe("Save", () => {
  it("asks for missing alt text as a field error, and saves nothing", async () => {
    const r = await saveCampaign(null, input(content("")));
    expect(r).toMatchObject({ ok: false, fieldErrors: { "content.blocks.0.image.alt": "Describe the image for anyone who can't see it, or mark it decorative." } });
    expect(h.inserts).toEqual([]);
  });

  it("refuses an image with no email copy, on the blocks that place it", async () => {
    const r = await saveCampaign(null, input(content("A bed", GONE)));
    expect(r).toEqual({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: {
        "content.blocks.0.image.asset": "That image is no longer in the Media Library.",
        "content.blocks.2.image.asset": "That image is no longer in the Media Library.",
      },
    });
    expect(h.inserts).toEqual([]);
  });

  it("saves the image by asset id only, and marks it used in the Media Library", async () => {
    expect(await saveCampaign(null, input(content("A bed")))).toEqual({ ok: true, id: "c-new" });
    expect(h.inserts[0].content).toEqual(content("A bed"));
    expect(JSON.stringify(h.inserts[0].content)).not.toContain(RENDITION.url);
    expect(h.touched).toEqual([{ assetIds: [PHOTO] }]);
  });
});

describe("the preview", () => {
  it("shows the rendition the test send delivers, byte for byte", async () => {
    const preview = await previewCampaign(input(content("A bed")));
    expect(preview.ok && preview.html).toContain(`src="${RENDITION.url}"`);

    const draft = CampaignPreviewSchema.parse(input(content("A bed")));
    const sent: OutgoingEmail[] = [];
    const transport: EmailTransport = {
      name: "resend",
      async send(email) {
        sent.push(email);
        return { id: "re_1" };
      },
    };
    await sendCampaignTest(draft, { to: ["me@mpillow.com"], firstName: "Ivan" }, {
      admin: fakeCampaignsClient(emptyWorld()) as unknown as SupabaseClient,
      transport,
      campaignFrom: "Mpillow <hello@hello.mpillow.com>",
      campaignDomain: "hello.mpillow.com",
      orderFrom: "orders@mpillow.com",
      replyTo: "Mpillow Support <support@mpillow.com>",
      origin: "https://custom.mpillow.com",
      unsubscribeSecret: "campaign-test-secret",
      sleep: async () => undefined,
    });
    const unsigned = (s: string) => s.replace(/\/en-US\/unsubscribe\?[^"\s]*/g, "/en-US/unsubscribe");
    const local = renderCampaignPreview(draft, { origin: "https://custom.mpillow.com", firstName: "Ivan", images: { [PHOTO]: { ...RENDITION } } });
    expect(unsigned(sent[0].html)).toBe(local.html);
    expect(preview.ok && preview.html).toBe(local.html);
    for (const id of ["hero", "intro", "photo"]) expect(sent[0].html).toContain(`<div data-block-id="${id}">`);
  });
});
