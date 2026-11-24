import { DriveError, downloadFile, listFolder, parseDriveFileId } from "@/lib/media-assets/drive";

/**
 * The Sizing photo eval's photos, read from a Google Drive folder
 * (`scripts/eval-photo-screening.ts --drive`). The Drive folder holds the same
 * folders a local one does (`front/`, `back/`, `side/` …, and any subfolders
 * for tags). It is read through the Media library's Drive sign-in, which is
 * read-only, so the folder must be one that account can open: its own, shared
 * with it, or in a Shared Drive it belongs to. Each photo is downloaded into
 * memory when the eval runs; no copy is written to disk.
 */

/** A test photo wherever it lives: its path under the photos folder, and how to read it. */
export interface EvalPhotoFile {
  path: string;
  read: () => Promise<Buffer>;
  /** Where a person can open it: Drive's link, or null for a file on this computer. */
  link: string | null;
}

const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
/** Folders, then tag subfolders, then a little room; anything deeper is a mistake. */
const MAX_DEPTH = 6;

export interface DriveReader {
  listFolder: typeof listFolder;
  downloadFile: typeof downloadFile;
}

/**
 * Every file under the Drive folder `folder` (its link or id), with its path
 * from there. Shortcuts aren't followed: they're listed in `skipped`, with why.
 */
export async function drivePhotoFiles(
  folder: string,
  drive: DriveReader = { listFolder, downloadFile },
): Promise<{ files: EvalPhotoFile[]; skipped: string[] }> {
  const rootId = parseDriveFileId(folder);
  if (!rootId) throw new DriveError("invalid_url", `"${folder}" isn't a Google Drive folder link or id`);
  const files: EvalPhotoFile[] = [];
  const skipped: string[] = [];

  const walk = async (folderId: string, prefix: string, depth: number): Promise<void> => {
    let pageToken: string | undefined;
    do {
      const page = await drive.listFolder({ folderId, pageToken, pageSize: 200 });
      for (const item of page.items) {
        // A Drive name can hold a "/", which would read as a folder.
        const path = `${prefix}${item.name.replace(/\//g, "-")}`;
        if (item.isFolder) {
          if (depth < MAX_DEPTH) await walk(item.id, `${path}/`, depth + 1);
          else skipped.push(`${path}/: too many folders deep to read`);
        } else if (item.mimeType === SHORTCUT_MIME) {
          skipped.push(`${path}: a shortcut; put the photo itself in the folder`);
        } else {
          files.push({ path, read: () => drive.downloadFile(item.id), link: item.webViewLink });
        }
      }
      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken);
  };

  await walk(rootId, "", 0);
  return { files, skipped };
}

/** Pure — why Drive couldn't be read, in words that say what to do. */
export function driveProblem(e: unknown): string {
  if (!(e instanceof DriveError)) return e instanceof Error ? e.message : String(e);
  if (/^Missing GOOGLE_/.test(e.message)) {
    return "Reading Drive uses the Media library's Drive sign-in: set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN in .env.local (see .env.example).";
  }
  if (e.code === "not_found" || e.code === "forbidden") {
    return `The Media library's Drive account can't open that folder (${e.message}). Share the folder with it, or put the folder in a Shared Drive it belongs to.`;
  }
  return e.message;
}
