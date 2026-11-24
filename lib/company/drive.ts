import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import { getDriveAccessToken, mapDriveHttpError } from "@/lib/media-assets/drive";
import { fromDocsMarkdown } from "./report";

export const AGENTS_FOLDER_ID = "1Zxnuc9ko1AhWLIiKAnKDgLKWb7Mxxd4P";
export const AGENTS_FOLDER_URL = `https://drive.google.com/drive/folders/${AGENTS_FOLDER_ID}`;

const FILES_API = "https://www.googleapis.com/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
export const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const MAX_TEXT = 1_000_000;

export type OutputFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string | null;
  md5: string | null;
  folder: string;
};

export type OutputSource = {
  kind: "drive" | "local";
  list(): Promise<OutputFile[]>;
  read(file: Pick<OutputFile, "id" | "mimeType">): Promise<string>;
};

export function childFolder(parent: string, name: string): string | null {
  if (parent === "") {
    if (/^\d{4}$/.test(name) || name === "_trackers" || name === "_company") return name;
    return null;
  }
  if (/^\d{4}$/.test(parent) && name.startsWith(`${parent}-`) && /^\d{4}-\d{2}$/.test(name)) return `${parent}/${name}`;
  if (parent === "_company" && name === "agents") return "_company/agents";
  return null;
}

const RawFile = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  name: z.string(),
  mimeType: z.string(),
  modifiedTime: z.string(),
  webViewLink: z.string().url().optional(),
  md5Checksum: z.string().optional(),
});
const RawPage = z.object({ files: z.array(RawFile).default([]), nextPageToken: z.string().optional() });
type Raw = z.infer<typeof RawFile>;

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n\n_(cut off at ${MAX_TEXT.toLocaleString("en-SG")} characters)_\n` : text;
}

export function driveConfigured(): boolean {
  return ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN"].every((n) => Boolean(process.env[n]?.trim()));
}

export function driveSource(token: () => Promise<string> = getDriveAccessToken, fetchImpl: typeof fetch = fetch): OutputSource {
  async function get(url: string): Promise<Response> {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
    if (!res.ok) throw mapDriveHttpError(res.status, await res.text());
    return res;
  }

  async function children(folderId: string): Promise<Raw[]> {
    const out: Raw[] = [];
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, md5Checksum)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) qs.set("pageToken", pageToken);
      const page = RawPage.parse(await (await get(`${FILES_API}?${qs}`)).json());
      out.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async function walk(folderId: string, path: string): Promise<OutputFile[]> {
    const items = await children(folderId);
    const nested = await Promise.all(
      items
        .filter((f) => f.mimeType === FOLDER)
        .flatMap((f) => {
          const sub = childFolder(path, f.name);
          return sub === null ? [] : [walk(f.id, sub)];
        }),
    );
    const files = items
      .filter((f) => f.mimeType !== FOLDER && path !== "")
      .map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink ?? null,
        md5: f.md5Checksum ?? null,
        folder: path,
      }));
    return [...files, ...nested.flat()];
  }

  return {
    kind: "drive",
    list: () => walk(AGENTS_FOLDER_ID, ""),
    async read(file) {
      if (!/^[A-Za-z0-9_-]+$/.test(file.id)) throw new Error("Not a Drive file id");
      const id = encodeURIComponent(file.id);
      if (file.mimeType === GOOGLE_DOC) return clip(fromDocsMarkdown(await (await get(`${FILES_API}/${id}/export?mimeType=text%2Fmarkdown`)).text()));
      if (file.mimeType === GOOGLE_SHEET) return clip(await (await get(`${FILES_API}/${id}/export?mimeType=text%2Fcsv`)).text());
      return clip(await (await get(`${FILES_API}/${id}?alt=media&supportsAllDrives=true`)).text());
    },
  };
}

const MIME_BY_EXT: Record<string, string> = { md: "text/markdown", csv: "text/csv", gdoc: GOOGLE_DOC };

export function localSource(dir: string): OutputSource {
  const root = resolve(dir);
  const md5 = (text: string) => createHash("md5").update(text).digest("hex");

  function walk(abs: string, path: string): OutputFile[] {
    return readdirSync(abs).flatMap((name) => {
      const full = join(abs, name);
      if (statSync(full).isDirectory()) {
        const sub = childFolder(path, name);
        return sub === null ? [] : walk(full, sub);
      }
      const ext = /\.([a-z]+)$/.exec(name)?.[1] ?? "";
      if (path === "" || !MIME_BY_EXT[ext]) return [];
      const mimeType = MIME_BY_EXT[ext];
      return [{
        id: relative(root, full),
        name: ext === "gdoc" ? name.slice(0, -".gdoc".length) : name,
        mimeType,
        modifiedTime: statSync(full).mtime.toISOString(),
        webViewLink: null,
        md5: mimeType === GOOGLE_DOC ? null : md5(readFileSync(full, "utf8")),
        folder: path,
      }];
    });
  }

  return {
    kind: "local",
    list: async () => walk(root, ""),
    async read(file) {
      const full = resolve(root, file.id);
      if (relative(root, full).startsWith("..")) throw new Error("Outside the outputs folder");
      const text = readFileSync(full, "utf8");
      return clip(file.mimeType === GOOGLE_DOC ? fromDocsMarkdown(text) : text);
    },
  };
}

export function outputSource(): OutputSource | null {
  const local = process.env.COMPANY_OUTPUTS_DIR?.trim();
  if (local) return localSource(local);
  return driveConfigured() ? driveSource() : null;
}
