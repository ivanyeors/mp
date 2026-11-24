import { OAuth2Client } from "google-auth-library";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS =
  "id,name,mimeType,thumbnailLink,size,webViewLink,shortcutDetails";

export type DriveErrorCode = "invalid_url" | "not_found" | "forbidden" | "upstream";

export class DriveError extends Error {
  constructor(
    public readonly code: DriveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink: string | null;
  size: number | null;
  webViewLink: string | null;
  isFolder: boolean;
};

export type DriveSharedDrive = { id: string; name: string };

export type DriveFolderListing = {
  items: DriveFileMeta[];
  nextPageToken: string | null;
};

export function parseDriveFileId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }

  const path = url.pathname;
  const fileMatch = path.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) return decodeURIComponent(fileMatch[1]);
  const folderMatch = path.match(/\/folders\/([^/]+)/);
  if (folderMatch) return decodeURIComponent(folderMatch[1]);
  const docMatch = path.match(/\/(?:document|spreadsheets|presentation|forms)\/d\/([^/]+)/);
  if (docMatch) return decodeURIComponent(docMatch[1]);
  const openId = url.searchParams.get("id");
  if (openId?.trim()) return openId.trim();
  return null;
}

function getDriveOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new DriveError(
      "upstream",
      "Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN",
    );
  }
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function getDriveAccessToken(): Promise<string> {
  const client = getDriveOAuthClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new DriveError("upstream", "Failed to refresh Drive access token");
  return token.token;
}

export function mapDriveHttpError(status: number, body: string): DriveError {
  let message = body.slice(0, 400);
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    if (json.error?.message) message = json.error.message;
  } catch {}
  if (status === 404) return new DriveError("not_found", message || "Drive file not found");
  if (status === 403 || status === 401) {
    return new DriveError("forbidden", message || "Insufficient Drive access");
  }
  return new DriveError("upstream", `Drive API failed (${status}): ${message}`);
}

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getDriveAccessToken();
  return fetch(`${DRIVE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function toMeta(f: {
  id?: string;
  name?: string;
  mimeType?: string;
  thumbnailLink?: string;
  size?: string;
  webViewLink?: string;
}): DriveFileMeta {
  const mimeType = f.mimeType ?? "application/octet-stream";
  return {
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType,
    thumbnailLink: f.thumbnailLink ?? null,
    size: f.size != null ? Number(f.size) : null,
    webViewLink: f.webViewLink ?? null,
    isFolder: mimeType === FOLDER_MIME,
  };
}

export async function resolveUrl(pasteUrl: string): Promise<DriveFileMeta> {
  const fileId = parseDriveFileId(pasteUrl);
  if (!fileId) throw new DriveError("invalid_url", "Invalid Google Drive URL");

  const res = await driveFetch(
    `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`,
  );
  if (!res.ok) throw mapDriveHttpError(res.status, await res.text());
  const json = (await res.json()) as Parameters<typeof toMeta>[0];
  return toMeta(json);
}

export async function listSharedDrives(): Promise<DriveSharedDrive[]> {
  const drives: DriveSharedDrive[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ pageSize: "100", fields: "nextPageToken,drives(id,name)" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await driveFetch(`/drives?${qs}`);
    if (!res.ok) throw mapDriveHttpError(res.status, await res.text());
    const json = (await res.json()) as {
      drives?: Array<{ id?: string; name?: string }>;
      nextPageToken?: string;
    };
    for (const d of json.drives ?? []) {
      if (d.id) drives.push({ id: d.id, name: d.name ?? d.id });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return drives;
}

export async function listFolder(opts?: {
  driveId?: string;
  folderId?: string;
  pageToken?: string;
  pageSize?: number;
}): Promise<DriveFolderListing> {
  const driveId = opts?.driveId?.trim() || undefined;
  const folderId = opts?.folderId?.trim() || driveId;
  if (!folderId) {
    throw new DriveError("invalid_url", "driveId or folderId is required to list a folder");
  }

  const parent = folderId;
  const q = `'${parent.replace(/'/g, "\\'")}' in parents and trashed=false`;
  const qs = new URLSearchParams({
    q,
    pageSize: String(opts?.pageSize ?? 50),
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    orderBy: "folder,name",
  });
  // ponytail: corpora=allDrives avoids Shared Drive 400s with parent q; tighten to corpora=drive if listing gets noisy
  qs.set("corpora", "allDrives");
  if (opts?.pageToken) qs.set("pageToken", opts.pageToken);

  const res = await driveFetch(`/files?${qs}`);
  if (!res.ok) throw mapDriveHttpError(res.status, await res.text());
  const json = (await res.json()) as {
    files?: Array<Parameters<typeof toMeta>[0]>;
    nextPageToken?: string;
  };
  return {
    items: (json.files ?? []).filter((f) => f.id).map(toMeta),
    nextPageToken: json.nextPageToken ?? null,
  };
}

export type DriveImportKind = "image" | "video" | "pdf";

const KIND_MIME_CLAUSE: Record<DriveImportKind, string> = {
  image: "mimeType contains 'image/'",
  video: "mimeType contains 'video/'",
  pdf: "mimeType = 'application/pdf'",
};

export function buildSearchQuery(text: string, kind?: DriveImportKind): string {
  const escaped = text.trim().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const mime = kind
    ? KIND_MIME_CLAUSE[kind]
    : `(${Object.values(KIND_MIME_CLAUSE).join(" or ")})`;
  return `name contains '${escaped}' and trashed=false and ${mime}`;
}

export async function searchFiles(opts: {
  text: string;
  kind?: DriveImportKind;
  driveId?: string;
  pageToken?: string;
}): Promise<DriveFolderListing> {
  const qs = new URLSearchParams({
    q: buildSearchQuery(opts.text, opts.kind),
    pageSize: "50",
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (opts.driveId) {
    qs.set("corpora", "drive");
    qs.set("driveId", opts.driveId);
  } else {
    qs.set("corpora", "allDrives");
  }
  if (opts.pageToken) qs.set("pageToken", opts.pageToken);

  const res = await driveFetch(`/files?${qs}`);
  if (!res.ok) throw mapDriveHttpError(res.status, await res.text());
  const json = (await res.json()) as {
    files?: Array<Parameters<typeof toMeta>[0]>;
    nextPageToken?: string;
  };
  return {
    items: (json.files ?? []).filter((f) => f.id).map(toMeta),
    nextPageToken: json.nextPageToken ?? null,
  };
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const id = fileId.trim();
  if (!id) throw new DriveError("invalid_url", "fileId is required");

  const res = await driveFetch(
    `/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
  );
  if (!res.ok) throw mapDriveHttpError(res.status, await res.text());
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadThumbnail(thumbnailLink: string | null | undefined): Promise<Buffer | null> {
  const url = thumbnailLink?.trim();
  if (!url) return null;
  try {
    const token = await getDriveAccessToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

export function driveErrorStatus(err: DriveError): number {
  switch (err.code) {
    case "invalid_url":
      return 400;
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    default:
      return 502;
  }
}
