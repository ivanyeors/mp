import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "../content";
import type { EmailRendition } from "@/lib/media-assets/email-renditions";

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const GONE = "99999999-8888-4777-8666-555555555555";

const h = vi.hoisted(() => ({
  calls: [] as string[][],
  renditions: new Map<string, EmailRendition>(),
  failed: new Map<string, string>(),
  throws: null as Error | null,
}));
vi.mock("@/lib/media-assets/email-renditions", () => ({
  ensureEmailRenditions: vi.fn(async (_admin: unknown, ids: string[]) => {
    h.calls.push(ids);
    if (h.throws) throw h.throws;
    return { renditions: h.renditions, failed: h.failed };
  }),
}));

const { campaignImageFieldErrors, campaignImagesProblem, readCampaignImages } = await import("../images");

const admin = {} as SupabaseClient;
const content: CampaignContent = {
  v: 1,
  blocks: [
    { id: "t", type: "heading", level: 1, text: "Sleep cooler" },
    { id: "h", type: "hero", image: { asset: PHOTO, alt: "A bed" } },
    { id: "i", type: "image", image: { asset: GONE, alt: "Gone" }, width: "full" },
    { id: "j", type: "image", image: { asset: PHOTO, alt: "Again" }, width: "inset" },
  ],
  fallbacks: {},
};

beforeEach(() => {
  h.calls = [];
  h.renditions = new Map([[PHOTO, { assetId: PHOTO, url: `https://x.supabase.co/media/email/${PHOTO}.jpg`, width: 1200, height: 800, bytes: 90_000, hasAlpha: false }]]);
  h.failed = new Map([[GONE, "That image is no longer in the Media Library."]]);
  h.throws = null;
});

describe("readCampaignImages", () => {
  it("reads every placed image once, as the renderer takes it, with each one that has no email copy", async () => {
    const got = await readCampaignImages(admin, content);
    expect(h.calls).toEqual([[PHOTO, GONE]]);
    expect(got.images).toEqual({ [PHOTO]: { url: `https://x.supabase.co/media/email/${PHOTO}.jpg`, width: 1200, height: 800, hasAlpha: false } });
    expect(got.failed).toEqual([{ assetId: GONE, reason: "That image is no longer in the Media Library." }]);
  });

  it("reads nothing for an email with no image, or a legacy one", async () => {
    expect(await readCampaignImages(admin, { ...content, blocks: content.blocks.slice(0, 1) })).toEqual({ images: {}, failed: [] });
    expect(await readCampaignImages(admin, null)).toEqual({ images: {}, failed: [] });
    expect(h.calls).toEqual([]);
  });

  it("never throws: an unreadable table fails every image, with the reason", async () => {
    h.throws = new Error("relation media_asset_renditions does not exist");
    const got = await readCampaignImages(admin, content);
    expect(got.images).toEqual({});
    expect(got.failed.map((f) => f.assetId)).toEqual([PHOTO, GONE]);
    expect(got.failed[0].reason).toContain("relation media_asset_renditions does not exist");
  });
});

describe("what a failed image stops", () => {
  it("stops a send, naming the first reason", async () => {
    const got = await readCampaignImages(admin, content);
    expect(campaignImagesProblem(got)).toBe("an image in the email has no copy an inbox can show: That image is no longer in the Media Library.");
    expect(campaignImagesProblem({ images: {}, failed: [] })).toBeNull();
  });

  it("is a field error on the block that places it", async () => {
    expect(campaignImageFieldErrors(content, await readCampaignImages(admin, content))).toEqual({
      "content.blocks.2.image.asset": "That image is no longer in the Media Library.",
    });
  });
});
