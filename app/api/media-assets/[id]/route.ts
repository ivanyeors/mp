import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import {
  deleteMediaAssetGuarded,
  getMediaAsset,
  MediaAssetInUseError,
  updateMediaAsset,
} from "@/lib/media-assets";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { id } = await params;
  try {
    const asset = await getMediaAsset(id);
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get asset" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { id } = await params;
  try {
    const body = await req.json();
    const asset = await updateMediaAsset(id, body);
    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = /required|empty|No fields|Invalid/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "true";

  try {
    await deleteMediaAssetGuarded(id, { force });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MediaAssetInUseError) {
      return NextResponse.json(
        { error: "Asset is in use", usages: err.usages, deletable: err.deletable },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "Delete failed";
    const status = message === "Not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
