import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { DriveError, driveErrorStatus } from "@/lib/media-assets/drive";
import { ImportDriveError, reimportImageFromDrive } from "@/lib/media-assets/import-drive";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { id } = await params;
  try {
    const asset = await reimportImageFromDrive(id);
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    if (err instanceof DriveError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: driveErrorStatus(err) },
      );
    }
    if (err instanceof ImportDriveError) {
      const status = err.code === "not_found" ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Re-import failed" },
      { status: 500 },
    );
  }
}
