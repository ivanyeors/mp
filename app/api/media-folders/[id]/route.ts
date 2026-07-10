import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { deleteMediaFolder, updateMediaFolder } from "@/lib/media-assets";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { id } = await params;
  try {
    const body = await req.json();
    const folder = await updateMediaFolder(id, body);
    return NextResponse.json({ ok: true, folder });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = /required|empty|duplicate|unique|No fields/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { id } = await params;
  try {
    await deleteMediaFolder(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 },
    );
  }
}
