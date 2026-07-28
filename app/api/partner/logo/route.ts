import { NextResponse } from "next/server";
import { getPartnerContext } from "@/lib/auth/partner";
import { assertLogoAllowed, savePartnerLogo, LogoRefusedError } from "@/lib/partner-upload";

export const runtime = "nodejs";

/**
 * Upload a partner logo (multipart: `file`). Optimizes + stores in the public
 * media bucket and returns the public url; the client then saves it via the
 * profile PATCH. Partner-guarded — writes under the caller's own partnerId.
 */
export async function POST(req: Request) {
  const ctx = await getPartnerContext();
  if (!ctx || ctx.status !== "approved" || !ctx.partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  try {
    assertLogoAllowed(file.size, file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await savePartnerLogo({ partnerId: ctx.partnerId, bytes, originalName: file.name });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof LogoRefusedError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
