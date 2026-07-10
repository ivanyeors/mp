import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { DriveError, driveErrorStatus } from "@/lib/media-assets/drive";
import { ImportDriveError, importFromDrive } from "@/lib/media-assets/import-drive";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  let body: { url?: string; fileId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await importFromDrive({
      url: body.url,
      fileId: body.fileId,
      name: body.name,
    });
    return NextResponse.json({
      ok: true,
      asset: result.asset,
      existing: result.existing,
    });
  } catch (err) {
    if (err instanceof DriveError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: driveErrorStatus(err) },
      );
    }
    if (err instanceof ImportDriveError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
