import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageUsageEntry } from "@/lib/media/image-usages";

const ASSET = {
  id: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f",
  kind: "image",
  hosted_url: "https://cdn.example/storage/v1/object/public/media/hero_1.webp",
};

const h = vi.hoisted(() => ({
  usages: [] as ImageUsageEntry[],
  calls: [] as string[],
}));

vi.mock("@/lib/media/image-usages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/image-usages")>()),
  listAssetUsages: vi.fn(async () => h.usages),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          if (table === "media_asset_renditions") return Promise.resolve({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.media_asset_renditions'" } });
          return { maybeSingle: async () => ({ data: ASSET, error: null }) };
        },
      }),
      delete: () => ({
        eq: async () => {
          h.calls.push(`delete ${table}`);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          h.calls.push(`remove ${paths.join(", ")}`);
          return { error: null };
        },
      }),
    },
  }),
}));

const { deleteMediaAssetGuarded, MediaAssetInUseError } = await import("@/lib/media-assets");

const CAMPAIGN: ImageUsageEntry = { type: "email_campaign", label: "December launch", ref_id: "c1" };
const BLOG: ImageUsageEntry = { type: "blog_featured", label: "Sleep tips", ref_id: "b1" };

beforeEach(() => {
  h.usages = [];
  h.calls = [];
});

describe("deleteMediaAssetGuarded", () => {
  it("refuses an image a campaign uses, even with Delete anyway, and touches nothing", async () => {
    h.usages = [BLOG, CAMPAIGN];
    for (const force of [false, true]) {
      const err = await deleteMediaAssetGuarded(ASSET.id, { force }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(MediaAssetInUseError);
      expect(err).toMatchObject({ usages: [BLOG, CAMPAIGN], deletable: false });
    }
    expect(h.calls).toEqual([]);
  });

  it("asks first about any other use, and Delete anyway deletes past it", async () => {
    h.usages = [BLOG];
    await expect(deleteMediaAssetGuarded(ASSET.id)).rejects.toMatchObject({ usages: [BLOG], deletable: true });
    expect(h.calls).toEqual([]);
    await deleteMediaAssetGuarded(ASSET.id, { force: true });
    expect(h.calls).toEqual(["delete media_assets", "remove hero_1.webp"]);
  });

  it("removes the master after the row, and keeps its email rendition for the emails already sent", async () => {
    await deleteMediaAssetGuarded(ASSET.id);
    expect(h.calls).toEqual(["delete media_assets", "remove hero_1.webp"]);
  });
});
