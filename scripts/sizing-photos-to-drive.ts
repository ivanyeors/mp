/**
 * Moves the Sizing photos still kept in the database to Google Drive (ADR 0059).
 * New photos move by themselves right after upload, and the daily results-sla
 * cron catches up on any it missed; this does the photos from before, in one
 * sitting, through the same moveSizingPhotosToDrive the app uses: each photo is
 * copied, Drive's checksum compared, and only then cleared from the database.
 * Newest first, and past any photo that fails, so one bad row can't stop the
 * rest. Safe to stop and run again.
 *
 *   npx tsx --env-file=.env.local scripts/sizing-photos-to-drive.ts --new-root  # make the app its own folder (drive.file token)
 *   npx tsx --env-file=.env.local scripts/sizing-photos-to-drive.ts --check     # reach the folder, make front/back/side/unchecked
 *   npx tsx --env-file=.env.local scripts/sizing-photos-to-drive.ts --dry-run   # count and size what would move, change nothing
 *   npx tsx --env-file=.env.local scripts/sizing-photos-to-drive.ts             # move them
 *
 * Needs GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
 * GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN (sg@mpillow.com) and, except for
 * --new-root, PHOTO_EVAL_DRIVE_FOLDER; --dry-run and the move also need
 * Supabase (the service role).
 */
import { OAuth2Client } from "google-auth-library";
import { DriveError } from "../lib/media-assets/drive";
import { moveSizingPhotosToDrive, photoDriveFromEnv } from "../lib/results/sizing-photo-drive";
import { supabaseAdmin } from "../lib/supabase/server";

const PAGE = 10;
const BATCH = 20;
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;

const NEEDS = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN"];

function missing(names: string[]): string[] {
  return names.filter((n) => !process.env[n]?.trim());
}

async function newRoot() {
  const gaps = missing(NEEDS);
  if (gaps.length) throw new Error(`Set ${gaps.join(", ")} first.`);
  const client = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_PHOTOS_OAUTH_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sizing photos", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) throw new Error(`Drive refused (${res.status}): ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  console.log(`Made "Sizing photos" in sg@mpillow.com's My Drive.\nSet PHOTO_EVAL_DRIVE_FOLDER=${folderLink(id)}`);
  console.log("Move it where you like; the app keeps access. Keep it out of folders the whole company can read.");
}

async function check() {
  const drive = photoDriveFromEnv();
  if (!drive) throw new Error(`Set ${missing([...NEEDS, "PHOTO_EVAL_DRIVE_FOLDER"]).join(", ")} first.`);
  try {
    const ids = await drive.folders();
    for (const [name, id] of Object.entries(ids)) console.log(`${name.padEnd(10)} ${folderLink(id)}`);
    console.log("The app can reach the folder and its four subfolders.");
  } catch (e) {
    if (e instanceof DriveError && (e.code === "not_found" || e.code === "forbidden")) {
      throw new Error(
        `The app can't open PHOTO_EVAL_DRIVE_FOLDER (${e.message}). A drive.file token only sees folders the app made: ` +
          "run --new-root and use the folder it prints, or mint the token with the drive scope to use a folder made by hand.",
      );
    }
    throw e;
  }
}

async function dryRun() {
  const admin = supabaseAdmin();
  let lastId = "00000000-0000-0000-0000-000000000000";
  let count = 0;
  let bytes = 0;
  let tooBig = 0;
  for (;;) {
    const { data, error } = await admin
      .from("mp_config_response_photos")
      .select("id,data_url")
      .not("data_url", "is", null)
      .gt("id", lastId)
      .order("id")
      .limit(PAGE);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data as { id: string; data_url: string }[]) {
      lastId = row.id;
      count++;
      bytes += row.data_url.length;
      if ((row.data_url.length * 3) / 4 > 5 * 1024 * 1024) tooBig++;
    }
  }
  console.log(`${count} photo(s) waiting in the database, ${mb(bytes)} of data URLs. Nothing changed.`);
  if (tooBig) console.log(`${tooBig} of them are over Drive's 5 MB one-request upload and will stay in the database.`);
}

async function move() {
  const drive = photoDriveFromEnv();
  if (!drive) throw new Error(`Set ${missing([...NEEDS, "PHOTO_EVAL_DRIVE_FOLDER"]).join(", ")} first.`);
  const admin = supabaseAdmin();
  let moved = 0;
  let failed = 0;
  let olderThan: string | undefined;
  for (;;) {
    const report = await moveSizingPhotosToDrive(admin, { drive, limit: BATCH, olderThan });
    if (report.error) throw new Error(report.error);
    moved += report.moved;
    failed += report.failed;
    console.log(`moved ${moved} so far${failed ? `, ${failed} failed` : ""}`);
    if (!report.lastSeen) break;
    olderThan = report.lastSeen;
  }
  const { count } = await admin.from("mp_config_response_photos").select("id", { count: "exact", head: true }).not("data_url", "is", null);
  console.log(`Moved ${moved} photo(s) to Drive. ${count ?? "?"} still in the database${count ? " (see the errors above; run again once fixed)" : ""}.`);
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if (flags.has("--new-root")) return newRoot();
  if (flags.has("--check")) return check();
  if (flags.has("--dry-run")) return dryRun();
  return move();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
