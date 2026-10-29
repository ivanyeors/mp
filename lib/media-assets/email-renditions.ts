/**
 * Email renditions of Media Assets (PRD-campaign-email-editor slice 05).
 *
 * The Media Library keeps WebP masters up to 2,400px (optimize.ts), and
 * classic Outlook for Windows shows no WebP. An image placed in an email is
 * shown from its email rendition instead: a JPEG, or a PNG when it has
 * transparency, at most 1,200px wide, stored in the media bucket under
 * `email/` and recorded in `media_asset_renditions`. One per asset, made the
 * first time it is placed and reused by every campaign and every send after:
 * a sent email points at that address for good.
 *
 * Server only. The client is passed in, so a test can hand it a fake.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeEmailRendition } from "./optimize";

const BUCKET = "media";
export const EMAIL_RENDITION_KIND = "email_1200";
/** Where renditions sit in the bucket. */
export const EMAIL_RENDITION_FOLDER = "email";
/** The largest master read to make one: masters are capped at 2,400px, so this is room to spare. */
const MASTER_MAX_BYTES = 25 * 1024 * 1024;
const MASTER_TIMEOUT_MS = 20_000;

/** A Media Asset's id as Postgres writes it, so it matches the rows read back. */
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface EmailRendition {
  assetId: string;
  /** Its public address: absolute, and the one every email that shows it uses. */
  url: string;
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
}

type RenditionRow = { asset_id: string; url: string; width: number; height: number; bytes: number; has_alpha: boolean };

const fromRow = (r: RenditionRow): EmailRendition => ({
  assetId: r.asset_id,
  url: r.url,
  width: r.width,
  height: r.height,
  bytes: r.bytes,
  hasAlpha: r.has_alpha,
});

/** Pure — a rendition's object in the bucket: one per asset, so it is made once. */
export function emailRenditionPath(assetId: string, extension: "jpg" | "png"): string {
  return `${EMAIL_RENDITION_FOLDER}/${assetId}.${extension}`;
}

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\.$/, "");

/** The master's bytes from its hosted address. */
async function fetchHosted(url: string): Promise<Buffer> {
  if (!/^https?:\/\//i.test(url)) throw new Error("its address is not a web address");
  const res = await fetch(url, { signal: AbortSignal.timeout(MASTER_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`its address answered ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MASTER_MAX_BYTES) throw new Error("it is too large");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MASTER_MAX_BYTES) throw new Error("it is too large");
  return bytes;
}

export interface EnsureEmailRenditionsOptions {
  /** The master's bytes from its hosted URL; a test passes its own. */
  fetchMaster?: (url: string) => Promise<Buffer>;
}

/**
 * Each asset's email rendition, made now for any that has none. Reads every
 * existing one in one query; makes the rest one at a time. An asset that
 * cannot have one (gone from the library, not an image, its master
 * unreadable) is in `failed` with the reason, in words for Staff. Throws only
 * when the renditions cannot be read at all.
 */
export async function ensureEmailRenditions(
  admin: SupabaseClient,
  assetIds: readonly string[],
  { fetchMaster = fetchHosted }: EnsureEmailRenditionsOptions = {},
): Promise<{ renditions: Map<string, EmailRendition>; failed: Map<string, string> }> {
  const renditions = new Map<string, EmailRendition>();
  const failed = new Map<string, string>();
  const ids = [...new Set(assetIds)];
  for (const id of ids) if (!ASSET_ID.test(id)) failed.set(id, "That is not an image from the Media Library.");
  const wanted = ids.filter((id) => !failed.has(id));
  if (!wanted.length) return { renditions, failed };

  const { data: rows, error } = await admin
    .from("media_asset_renditions")
    .select("asset_id, url, width, height, bytes, has_alpha")
    .eq("kind", EMAIL_RENDITION_KIND)
    .in("asset_id", wanted);
  if (error) throw new Error(error.message);
  for (const r of (rows ?? []) as RenditionRow[]) renditions.set(r.asset_id, fromRow(r));

  const missing = wanted.filter((id) => !renditions.has(id));
  if (!missing.length) return { renditions, failed };

  const { data: assets, error: assetsError } = await admin.from("media_assets").select("id, kind, hosted_url").in("id", missing);
  if (assetsError) throw new Error(assetsError.message);
  const byId = new Map(((assets ?? []) as { id: string; kind: string; hosted_url: string | null }[]).map((a) => [a.id, a]));

  for (const id of missing) {
    const asset = byId.get(id);
    if (!asset) {
      failed.set(id, "That image is no longer in the Media Library.");
      continue;
    }
    if (asset.kind !== "image" || !asset.hosted_url) {
      failed.set(id, "That Media Library item is not an image.");
      continue;
    }
    let master: Buffer;
    try {
      master = await fetchMaster(asset.hosted_url);
    } catch (err) {
      failed.set(id, `The Media Library's copy of it couldn't be read: ${reasonOf(err)}.`);
      continue;
    }
    try {
      const made = await makeEmailRendition(master);
      const path = emailRenditionPath(id, made.extension);
      // The same path for the same asset: a second maker at the same moment writes the same file.
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, made.buffer, { contentType: made.mimeType, cacheControl: "31536000", upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const row = {
        asset_id: id,
        kind: EMAIL_RENDITION_KIND,
        url,
        storage_path: path,
        width: made.width,
        height: made.height,
        bytes: made.byteSize,
        has_alpha: made.hasAlpha,
      };
      const { error: insertError } = await admin
        .from("media_asset_renditions")
        .upsert(row, { onConflict: "asset_id,kind", ignoreDuplicates: true });
      if (insertError) throw new Error(insertError.message);
      renditions.set(id, fromRow(row));
    } catch (err) {
      failed.set(id, `It couldn't be made into an email image: ${reasonOf(err)}.`);
    }
  }
  return { renditions, failed };
}

/** The bucket objects of an asset's renditions: removed with the asset, which the table's rows follow. */
export async function emailRenditionPathsOf(admin: SupabaseClient, assetId: string): Promise<string[]> {
  const { data, error } = await admin.from("media_asset_renditions").select("storage_path").eq("asset_id", assetId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { storage_path: string }[]).map((r) => r.storage_path);
}
