import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import {
  DriveError,
  driveErrorStatus,
  listFolder,
  listSharedDrives,
} from "@/lib/media-assets/drive";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  const driveId = sp.get("driveId")?.trim() || undefined;
  const folderId = sp.get("folderId")?.trim() || undefined;
  const pageToken = sp.get("pageToken")?.trim() || undefined;

  try {
    if (!driveId && !folderId) {
      const drives = await listSharedDrives();
      return NextResponse.json({ ok: true, mode: "drives", drives });
    }

    const listing = await listFolder({ driveId, folderId, pageToken });
    return NextResponse.json({
      ok: true,
      mode: "folder",
      driveId: driveId ?? null,
      folderId: folderId ?? driveId ?? null,
      items: listing.items,
      nextPageToken: listing.nextPageToken,
    });
  } catch (err) {
    if (err instanceof DriveError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: driveErrorStatus(err) },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
