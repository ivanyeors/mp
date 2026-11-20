import type { SupabaseClient } from "@supabase/supabase-js";
import { makeEmailRendition } from "./optimize";

const BUCKET = "media";
export const EMAIL_RENDITION_KIND = "email_1200";
export const EMAIL_RENDITION_FOLDER = "email";
const MASTER_MAX_BYTES = 25 * 1024 * 1024;
const MASTER_TIMEOUT_MS = 20_000;

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface EmailRendition {
  assetId: string;
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

export function emailRenditionPath(assetId: string, extension: "jpg" | "png"): string {
  return `${EMAIL_RENDITION_FOLDER}/${assetId}.${extension}`;
}

const reasonOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\.$/, "");

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
  fetchMaster?: (url: string) => Promise<Buffer>;
}

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
