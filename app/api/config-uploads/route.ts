import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/auth/admin";
import {
  assertUploadAllowed,
  deleteConfigUpload,
  listConfigUploads,
  saveConfigUpload,
  UploadRefusedError,
} from "@/lib/config-upload";

export const runtime = "nodejs";

const uuid = z.string().uuid();

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Reference photos for a session. Admin-only (the gate behind `staffAssist`). */
export async function GET(req: Request) {
  if (!(await getAdminContext())) return unauthorized();
  const parsed = uuid.safeParse(new URL(req.url).searchParams.get("sessionId") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  const images = await listConfigUploads(parsed.data);
  return NextResponse.json({ ok: true, images });
}

/** Upload one image (multipart: `sessionId` + `file`). */
export async function POST(req: Request) {
  if (!(await getAdminContext())) return unauthorized();

  const form = await req.formData().catch(() => null);
  const parsed = uuid.safeParse(typeof form?.get("sessionId") === "string" ? form!.get("sessionId") : "");
  if (!parsed.success) return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  try {
    const existing = await listConfigUploads(parsed.data);
    assertUploadAllowed(existing.length, file.size, file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = await saveConfigUpload({ sessionId: parsed.data, bytes, originalName: file.name });
    return NextResponse.json({ ok: true, image });
  } catch (e) {
    if (e instanceof UploadRefusedError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Delete one image by id (removes storage object + row). */
export async function DELETE(req: Request) {
  if (!(await getAdminContext())) return unauthorized();
  const parsed = uuid.safeParse(new URL(req.url).searchParams.get("id") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await deleteConfigUpload(parsed.data);
  return NextResponse.json({ ok: true });
}
