import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createMediaFolder, listMediaFolders } from "@/lib/media-assets";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  try {
    const folders = await listMediaFolders();
    return NextResponse.json({ ok: true, folders });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list folders" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  try {
    const body = await req.json();
    const folder = await createMediaFolder(body);
    return NextResponse.json({ ok: true, folder }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    const status = /required|empty|duplicate|unique/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
