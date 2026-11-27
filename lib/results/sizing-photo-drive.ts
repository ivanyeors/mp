import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { DriveError, mapDriveHttpError, parseDriveFileId } from "@/lib/media-assets/drive";
import { sendTelegram } from "@/lib/telegram/notify";

const TABLE = "mp_config_response_photos";
const TRASH_QUEUE = "sizing_photo_drive_trash";
const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_TIMEOUT_MS = 10_000;
const WAITING_TOO_LONG_MS = 60 * 60_000;
const ONE_REQUEST_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const SIZING_PHOTO_FOLDERS = ["front", "back", "side", "unchecked"] as const;
export type SizingPhotoFolder = (typeof SIZING_PHOTO_FOLDERS)[number];

export interface SizingPhotoPlace {
  view: string;
  screening_status: string | null;
  screened_view: string | null;
}

export function sizingPhotoFolder(row: SizingPhotoPlace): SizingPhotoFolder {
  if (row.screening_status !== "passed") return "unchecked";
  if (row.view === "side") return "side";
  return row.screened_view === "back" ? "back" : "front";
}

export interface SizingPhotoFile {
  bytes: Buffer;
  mimeType: string;
}

export interface SizingPhotoUpload extends SizingPhotoFile {
  name: string;
  folder: SizingPhotoFolder;
  responseId: string;
  view: string;
}

export interface PhotoDrive {
  folders(): Promise<Record<SizingPhotoFolder, string>>;
  upload(photo: SizingPhotoUpload): Promise<string>;
  moveOutOf(fileId: string, from: SizingPhotoFolder, to: SizingPhotoFolder): Promise<void>;
  trash(fileId: string): Promise<void>;
  download(fileId: string): Promise<SizingPhotoFile>;
}

const DriveId = z.string().regex(/^[A-Za-z0-9_-]+$/);
const Listed = z.object({ files: z.array(z.object({ id: DriveId })).default([]) });
const Made = z.object({ id: DriveId });
const Uploaded = z.object({ id: DriveId, md5Checksum: z.string().optional(), trashed: z.boolean().optional() });
const Parents = z.object({ parents: z.array(DriveId).default([]) });

const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest("hex");
const quoted = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const folderIdsByRoot = new Map<string, Promise<Record<SizingPhotoFolder, string>>>();

export function googlePhotoDrive(root: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch): PhotoDrive {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(DRIVE_TIMEOUT_MS),
    });
    if (!res.ok) throw mapDriveHttpError(res.status, await res.text());
    return res;
  }

  async function folderNamed(name: SizingPhotoFolder): Promise<string> {
    const params = new URLSearchParams({
      q: `'${quoted(root)}' in parents and name = '${name}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: "files(id)",
      orderBy: "createdTime",
      pageSize: "1",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const found = Listed.parse(await (await call(`${FILES}?${params}`)).json()).files[0];
    if (found) return found.id;
    const res = await call(`${FILES}?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [root] }),
    });
    return Made.parse(await res.json()).id;
  }

  async function trash(fileId: string): Promise<void> {
    try {
      await call(`${FILES}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
    } catch (e) {
      if (e instanceof DriveError && e.code === "not_found") return;
      throw e;
    }
  }

  function folders(): Promise<Record<SizingPhotoFolder, string>> {
    const cached = folderIdsByRoot.get(root);
    if (cached) return cached;
    const made = (async () => {
      const ids = {} as Record<SizingPhotoFolder, string>;
      for (const name of SIZING_PHOTO_FOLDERS) ids[name] = await folderNamed(name);
      return ids;
    })();
    folderIdsByRoot.set(root, made);
    made.catch(() => folderIdsByRoot.delete(root));
    return made;
  }

  return {
    folders,
    trash,

    async upload(photo) {
      if (photo.bytes.length > ONE_REQUEST_UPLOAD_MAX_BYTES) throw new Error(`${photo.name} is over Drive's 5 MB one-request upload`);
      const parent = (await folders())[photo.folder];
      const boundary = `mpillow-${randomUUID()}`;
      const meta = {
        name: photo.name,
        mimeType: photo.mimeType,
        parents: [parent],
        appProperties: { response_id: photo.responseId, view: photo.view },
      };
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: ${photo.mimeType}\r\n\r\n`),
        photo.bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await call(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,md5Checksum,trashed`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body),
      });
      const made = Uploaded.parse(await res.json());
      if (made.trashed) {
        folderIdsByRoot.delete(root);
        throw new Error(`the ${photo.folder} folder is in Drive's trash`);
      }
      if (made.md5Checksum !== md5(photo.bytes)) {
        await trash(made.id).catch(() => undefined);
        throw new Error(`Drive did not keep the same bytes for ${photo.name}`);
      }
      return made.id;
    },

    async moveOutOf(fileId, from, to) {
      const ids = await folders();
      const id = encodeURIComponent(fileId);
      const { parents } = Parents.parse(await (await call(`${FILES}/${id}?fields=parents&supportsAllDrives=true`)).json());
      if (!parents.includes(ids[from])) return;
      const params = new URLSearchParams({ addParents: ids[to], removeParents: ids[from], supportsAllDrives: "true" });
      await call(`${FILES}/${id}?${params}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    },

    async download(fileId) {
      const res = await call(`${FILES}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
      const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: mimeType.startsWith("image/") ? mimeType : "image/webp" };
    },
  };
}

export function photoDriveFromEnv(env: Record<string, string | undefined> = process.env): PhotoDrive | null {
  const root = parseDriveFileId(env.PHOTO_EVAL_DRIVE_FOLDER ?? "");
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN?.trim();
  if (!root || !clientId || !clientSecret || !refreshToken) return null;
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return googlePhotoDrive(root, async () => {
    const { token } = await client.getAccessToken();
    if (!token) throw new DriveError("upstream", "Google did not refresh the Sizing photos Drive token");
    return token;
  });
}

export function photoFromDataUrl(dataUrl: string): SizingPhotoFile | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  return bytes.length ? { bytes, mimeType: m[1].toLowerCase() } : null;
}

const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" };

export async function sizingPhotoDataUrl(
  row: { data_url: string | null; drive_file_id: string | null },
  drive: PhotoDrive | null,
): Promise<string | null> {
  if (row.data_url) return row.data_url;
  if (!row.drive_file_id || !drive) return null;
  const { bytes, mimeType } = await drive.download(row.drive_file_id);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

interface WaitingPhoto extends SizingPhotoPlace {
  id: string;
  response_id: string;
  data_url: string;
  updated_at: string;
}

const WAITING_COLUMNS = "id,response_id,view,data_url,screening_status,screened_view,updated_at";

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function moveOne(admin: SupabaseClient, drive: PhotoDrive, row: WaitingPhoto): Promise<boolean> {
  const photo = photoFromDataUrl(row.data_url);
  if (!photo) throw new Error("the stored photo is not an image data URL");
  const fileId = await drive.upload({
    ...photo,
    name: `${row.response_id}-${row.view}.${EXTENSION[photo.mimeType] ?? "img"}`,
    folder: sizingPhotoFolder(row),
    responseId: row.response_id,
    view: row.view,
  });

  const { data, error } = await admin
    .from(TABLE)
    .update({ drive_file_id: fileId, data_url: null })
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (!error && data?.length) return true;

  const { data: now, error: readError } = await admin.from(TABLE).select("drive_file_id").eq("id", row.id).maybeSingle();
  if (readError) throw new Error(`could not tell whether ${fileId} was saved, so it stays on Drive: ${readError.message}`);
  if (now?.drive_file_id === fileId) return true;
  await drive.trash(fileId);
  if (error) throw new Error(error.message);
  return false;
}

export interface MoveReport {
  configured: boolean;
  moved: number;
  failed: number;
  lastSeen?: string | null;
  error?: string;
}

export async function moveSizingPhotosToDrive(
  admin: SupabaseClient,
  {
    responseId,
    limit = 20,
    olderThan,
    drive = photoDriveFromEnv(),
  }: { responseId?: string; limit?: number; olderThan?: string; drive?: PhotoDrive | null } = {},
): Promise<MoveReport> {
  if (!drive) return { configured: false, moved: 0, failed: 0 };

  let query = admin.from(TABLE).select(WAITING_COLUMNS).not("data_url", "is", null);
  if (responseId) query = query.eq("response_id", responseId);
  if (olderThan) query = query.lt("updated_at", olderThan);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit);
  if (error) return { configured: true, moved: 0, failed: 0, error: error.message };

  const rows = (data ?? []) as WaitingPhoto[];
  let moved = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (await moveOne(admin, drive, row)) moved++;
    } catch (e) {
      failed++;
      console.error(`[sizing-photo] ${row.response_id} ${row.view} not moved to Drive, kept in the database:`, reason(e));
    }
  }
  return { configured: true, moved, failed, lastSeen: rows.at(-1)?.updated_at ?? null };
}

export interface TrashReport {
  trashed: number;
  failed: number;
  error?: string;
}

export async function trashReleasedSizingPhotos(admin: SupabaseClient, drive: PhotoDrive, limit = 50): Promise<TrashReport> {
  const { data, error } = await admin.from(TRASH_QUEUE).select("drive_file_id").order("released_at").limit(limit);
  if (error) return { trashed: 0, failed: 0, error: error.message };

  let trashed = 0;
  let failed = 0;
  for (const { drive_file_id: fileId } of (data ?? []) as { drive_file_id: string }[]) {
    try {
      const { data: still, error: stillError } = await admin.from(TABLE).select("id").eq("drive_file_id", fileId).limit(1);
      if (stillError) throw new Error(stillError.message);
      if (!still?.length) {
        await drive.trash(fileId);
        trashed++;
      }
      const { error: doneError } = await admin.from(TRASH_QUEUE).delete().eq("drive_file_id", fileId);
      if (doneError) throw new Error(doneError.message);
    } catch (e) {
      failed++;
      console.error(`[sizing-photo] released photo ${fileId} not trashed yet:`, reason(e));
    }
  }
  return { trashed, failed };
}

export interface DailyMoveReport extends MoveReport {
  released?: TrashReport;
  onDrive?: number;
  waiting?: number;
  oldestWaiting?: string | null;
  alerted?: boolean;
}

export async function runSizingPhotoMoves(
  admin: SupabaseClient,
  now: Date,
  {
    drive = photoDriveFromEnv(),
    notify = sendTelegram,
    limit = 50,
  }: { drive?: PhotoDrive | null; notify?: (text: string) => Promise<unknown>; limit?: number } = {},
): Promise<DailyMoveReport> {
  if (!drive) {
    const { count, error } = await admin.from(TABLE).select("id", { count: "exact", head: true }).not("drive_file_id", "is", null);
    if (error) return { configured: false, moved: 0, failed: 0, error: error.message };
    const alerted = (count ?? 0) > 0;
    if (alerted) {
      await notify(
        `📷 The Google Drive connection for Sizing photos is missing, and ${count} photo(s) live on Drive: they can't be attached to Telegram, ` +
          "and new photos stay in the database. Set GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN and PHOTO_EVAL_DRIVE_FOLDER on Vercel.",
      );
    }
    return { configured: false, moved: 0, failed: 0, onDrive: count ?? 0, alerted };
  }

  const report = await moveSizingPhotosToDrive(admin, { limit, drive });
  const released = await trashReleasedSizingPhotos(admin, drive);

  const { data, count, error } = await admin
    .from(TABLE)
    .select("updated_at", { count: "exact" })
    .not("data_url", "is", null)
    .order("updated_at")
    .limit(1);
  if (error) return { ...report, released, error: error.message };

  const oldest = (data?.[0]?.updated_at as string | undefined) ?? null;
  const alerted = oldest !== null && now.getTime() - Date.parse(oldest) > WAITING_TOO_LONG_MS;
  if (alerted) {
    await notify(
      `📷 ${count ?? 1} Sizing photo(s) are still waiting to move to Google Drive, the oldest since ${oldest.slice(0, 10)}. ` +
        "They are safe in the database meanwhile. Check the Drive connection (GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN, PHOTO_EVAL_DRIVE_FOLDER); " +
        "if these are photos from before the move, run scripts/sizing-photos-to-drive.ts.",
    );
  }
  return { ...report, released, waiting: count ?? 0, oldestWaiting: oldest, alerted };
}
