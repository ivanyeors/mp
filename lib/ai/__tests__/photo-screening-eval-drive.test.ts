import { describe, expect, it } from "vitest";
import { DriveError, type DriveFileMeta, type DriveFolderListing } from "@/lib/media-assets/drive";
import { drivePhotoFiles, driveProblem, type DriveReader } from "@/lib/ai/photo-screening-eval-drive";

/** The Sizing photo eval reading its photos from a Google Drive folder. */

const folder = (id: string, name: string): DriveFileMeta => ({
  id,
  name,
  mimeType: "application/vnd.google-apps.folder",
  thumbnailLink: null,
  size: null,
  webViewLink: null,
  isFolder: true,
});
const photo = (id: string, name: string, mimeType = "image/jpeg"): DriveFileMeta => ({
  id,
  name,
  mimeType,
  thumbnailLink: null,
  size: 1000,
  webViewLink: `https://drive.google.com/file/d/${id}/view`,
  isFolder: false,
});

/** A Drive whose folders are `tree`, each listed in pages of `perPage`. */
function fakeDrive(tree: Record<string, DriveFileMeta[]>, perPage = 100): DriveReader & { listed: string[]; downloaded: string[] } {
  const listed: string[] = [];
  const downloaded: string[] = [];
  return {
    listed,
    downloaded,
    listFolder: async (opts) => {
      const id = opts?.folderId ?? "";
      if (!(id in tree)) throw new DriveError("not_found", "File not found: " + id);
      listed.push(id);
      const start = Number(opts?.pageToken ?? 0);
      const items = tree[id].slice(start, start + perPage);
      const next = start + perPage < tree[id].length ? String(start + perPage) : null;
      return { items, nextPageToken: next } satisfies DriveFolderListing;
    },
    downloadFile: async (id) => {
      downloaded.push(id);
      return Buffer.from(id);
    },
  };
}

const ROOT = "1AbCdEfGhIjKlMnOp";

describe("drivePhotoFiles", () => {
  it("reads every photo under the folder with its path, through every page and subfolder", async () => {
    const drive = fakeDrive(
      {
        [ROOT]: [folder("F1", "front"), folder("S1", "side"), photo("R1", "loose.jpg")],
        F1: [photo("p1", "IMG_1.jpg"), photo("p2", "IMG_2.HEIC", "image/heic"), folder("M1", "mirror-selfie")],
        M1: [photo("p3", "m.jpg")],
        S1: [photo("p4", "a.png", "image/png"), photo("p5", "b/c.jpg")],
      },
      2,
    );
    const { files, skipped } = await drivePhotoFiles(`https://drive.google.com/drive/folders/${ROOT}?usp=sharing`, drive);
    expect(files.map((f) => f.path).sort()).toEqual(
      ["front/IMG_1.jpg", "front/IMG_2.HEIC", "front/mirror-selfie/m.jpg", "loose.jpg", "side/a.png", "side/b-c.jpg"].sort(),
    );
    expect(skipped).toEqual([]);
    expect(files.find((f) => f.path === "side/a.png")?.link).toBe("https://drive.google.com/file/d/p4/view");
    expect(drive.downloaded).toEqual([]);
  });

  it("downloads a photo only when it's read", async () => {
    const drive = fakeDrive({ [ROOT]: [folder("F1", "front")], F1: [photo("p1", "a.jpg")] });
    const { files } = await drivePhotoFiles(ROOT, drive);
    expect((await files[0].read()).toString()).toBe("p1");
    expect(drive.downloaded).toEqual(["p1"]);
  });

  it("doesn't follow a shortcut, and says to put the photo itself in the folder", async () => {
    const drive = fakeDrive({ [ROOT]: [folder("F1", "front")], F1: [photo("x", "a.jpg", "application/vnd.google-apps.shortcut")] });
    expect(await drivePhotoFiles(ROOT, drive)).toEqual({ files: [], skipped: ["front/a.jpg: a shortcut; put the photo itself in the folder"] });
  });

  it("stops at folders nested too deep", async () => {
    const tree: Record<string, DriveFileMeta[]> = { [ROOT]: [folder("d1", "a")] };
    for (let i = 1; i <= 7; i++) tree[`d${i}`] = [folder(`d${i + 1}`, "a")];
    tree.d8 = [];
    const { skipped } = await drivePhotoFiles(ROOT, fakeDrive(tree));
    expect(skipped).toEqual([expect.stringContaining("too many folders deep")]);
  });

  it("refuses what isn't a Drive link", async () => {
    await expect(drivePhotoFiles("my photos", fakeDrive({}))).rejects.toThrow("isn't a Google Drive folder link or id");
  });
});

describe("driveProblem", () => {
  it("says what to do about a folder the Drive account can't open, or a missing sign-in", () => {
    expect(driveProblem(new DriveError("not_found", "File not found: x"))).toContain("Share the folder with it");
    expect(driveProblem(new DriveError("forbidden", "Insufficient permissions"))).toContain("Share the folder with it");
    expect(driveProblem(new DriveError("upstream", "Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN"))).toContain(
      "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN in .env.local",
    );
    expect(driveProblem(new Error("boom"))).toBe("boom");
  });
});
