import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ensureEmailRenditions, emailRenditionPath, EMAIL_RENDITION_KIND } from "@/lib/media-assets/email-renditions";
import {
  EMAIL_RENDITION_TARGET_BYTES,
  EMAIL_RENDITION_WIDTH,
  makeEmailRendition,
  optimizeImageForWeb,
} from "@/lib/media-assets/optimize";

/**
 * Email renditions (PRD-campaign-email-editor slice 05): a WebP master from
 * the Media Library becomes a JPEG, or a PNG when it has transparency, at
 * most 1,200px wide, made once per asset and reused by every campaign and
 * every send.
 */

/** A photo-like master, as the library stores it: a 2,400px WebP. */
async function photoMaster(): Promise<Buffer> {
  const photo = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } })
    .blur(2)
    .jpeg({ quality: 95 })
    .toBuffer();
  return (await optimizeImageForWeb(photo)).buffer;
}

/** A cut-out: dark ink on transparency, as a logo or a product shot is. */
async function cutoutMaster(): Promise<Buffer> {
  const ink = await sharp({ create: { width: 800, height: 400, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } } }).png().toBuffer();
  const png = await sharp({ create: { width: 1600, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: ink, left: 400, top: 200 }])
    .png()
    .toBuffer();
  return (await optimizeImageForWeb(png)).buffer;
}

describe("makeEmailRendition", () => {
  it("makes a photo a JPEG at most 1,200px wide and under 300 KB", async () => {
    const out = await makeEmailRendition(await photoMaster());
    expect(out).toMatchObject({ mimeType: "image/jpeg", extension: "jpg", width: EMAIL_RENDITION_WIDTH, height: 800, hasAlpha: false });
    expect(out.byteSize).toBeLessThan(EMAIL_RENDITION_TARGET_BYTES);
    expect((await sharp(out.buffer).metadata()).format).toBe("jpeg");
  });

  it("keeps transparency as a PNG, and says so for the light plate", async () => {
    const out = await makeEmailRendition(await cutoutMaster());
    expect(out).toMatchObject({ mimeType: "image/png", extension: "png", width: 1200, height: 600, hasAlpha: true });
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
  });

  it("makes an alpha channel that is opaque everywhere a JPEG: it is a photo", async () => {
    const opaque = await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } } }).png().toBuffer();
    expect((await sharp(opaque).metadata()).hasAlpha).toBe(true);
    expect(await makeEmailRendition(opaque)).toMatchObject({ mimeType: "image/jpeg", hasAlpha: false, width: 800, height: 600 });
  });

  it("never enlarges a small image", async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#808080" } }).webp().toBuffer();
    expect(await makeEmailRendition(small)).toMatchObject({ width: 300, height: 200 });
  });
});

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const CUTOUT = "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const VIDEO = "11111111-2222-4333-8444-555555555555";
const GONE = "99999999-8888-4777-8666-555555555555";
const BUCKET_URL = "https://mpillow.supabase.co/storage/v1/object/public/media";

type Row = Record<string, unknown>;

/** The service client as ensureEmailRenditions uses it: two tables and the media bucket, in memory. */
function fakeAdmin(assets: Row[]) {
  const renditions: Row[] = [];
  const uploads: string[] = [];
  const query = (rows: () => Row[]) => {
    const filters: ((r: Row) => boolean)[] = [];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), q),
      then: (ok: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }).then(ok),
    };
    return q;
  };
  const admin = {
    from: (table: string) => ({
      ...query(() => (table === "media_assets" ? assets : renditions)),
      upsert: async (row: Row) => {
        if (!renditions.some((r) => r.asset_id === row.asset_id && r.kind === row.kind)) renditions.push(row);
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${BUCKET_URL}/${path}` } }),
      }),
    },
  };
  return { admin: admin as unknown as SupabaseClient, renditions, uploads };
}

describe("ensureEmailRenditions", () => {
  const assets: Row[] = [
    { id: PHOTO, kind: "image", hosted_url: `${BUCKET_URL}/photo_1.webp` },
    { id: CUTOUT, kind: "image", hosted_url: `${BUCKET_URL}/cutout_1.webp` },
    { id: VIDEO, kind: "video", hosted_url: null },
  ];

  it("makes one per asset the first time, stores it under email/, and reuses it for every campaign and send after", async () => {
    const db = fakeAdmin(assets);
    const masters: Record<string, Buffer> = { [`${BUCKET_URL}/photo_1.webp`]: await photoMaster(), [`${BUCKET_URL}/cutout_1.webp`]: await cutoutMaster() };
    const fetched: string[] = [];
    const fetchMaster = async (url: string) => {
      fetched.push(url);
      return masters[url];
    };

    // Two campaigns place the photo; one also places the cut-out.
    const first = await ensureEmailRenditions(db.admin, [PHOTO, PHOTO], { fetchMaster });
    const second = await ensureEmailRenditions(db.admin, [CUTOUT, PHOTO], { fetchMaster });
    // A wave's batches, and a test send, read them again.
    for (let i = 0; i < 3; i++) await ensureEmailRenditions(db.admin, [PHOTO, CUTOUT], { fetchMaster });

    expect(fetched).toEqual([`${BUCKET_URL}/photo_1.webp`, `${BUCKET_URL}/cutout_1.webp`]);
    expect(db.uploads).toEqual([emailRenditionPath(PHOTO, "jpg"), emailRenditionPath(CUTOUT, "png")]);
    expect(db.renditions).toHaveLength(2);
    expect(db.renditions[0]).toMatchObject({
      asset_id: PHOTO,
      kind: EMAIL_RENDITION_KIND,
      url: `${BUCKET_URL}/email/${PHOTO}.jpg`,
      storage_path: `email/${PHOTO}.jpg`,
      width: 1200,
      height: 800,
      has_alpha: false,
    });
    expect(first.renditions.get(PHOTO)).toMatchObject({ url: `${BUCKET_URL}/email/${PHOTO}.jpg`, width: 1200, height: 800, hasAlpha: false });
    expect(second.renditions.get(CUTOUT)).toMatchObject({ url: `${BUCKET_URL}/email/${CUTOUT}.png`, hasAlpha: true });
    expect(second.renditions.get(PHOTO)).toEqual(first.renditions.get(PHOTO));
  });

  it("says why an asset can have none: gone, not an image, unreadable, or not an id", async () => {
    const db = fakeAdmin([...assets]);
    const { renditions, failed } = await ensureEmailRenditions(db.admin, [GONE, VIDEO, PHOTO, "not-an-id"], {
      fetchMaster: async () => {
        throw new Error("its address answered 404");
      },
    });
    expect(renditions.size).toBe(0);
    expect(Object.fromEntries(failed)).toEqual({
      "not-an-id": "That is not an image from the Media Library.",
      [GONE]: "That image is no longer in the Media Library.",
      [VIDEO]: "That Media Library item is not an image.",
      [PHOTO]: "The Media Library's copy of it couldn't be read: its address answered 404.",
    });
    expect(db.uploads).toEqual([]);
  });

  it("asks the database nothing for no images", async () => {
    const db = fakeAdmin(assets);
    const from = db.admin.from;
    let asked = 0;
    (db.admin as unknown as { from: unknown }).from = (t: string) => (asked++, from(t));
    expect(await ensureEmailRenditions(db.admin, [])).toEqual({ renditions: new Map(), failed: new Map() });
    expect(asked).toBe(0);
  });
});
