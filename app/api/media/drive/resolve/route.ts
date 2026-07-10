import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { DriveError, driveErrorStatus, resolveUrl } from "@/lib/media-assets/drive";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const url = new URL(req.url).searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const file = await resolveUrl(url);
    return NextResponse.json({ ok: true, file });
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
