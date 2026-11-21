import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { loadPartnerRow } from "@/lib/auth/partner";
import { tooManyRequests } from "@/lib/rate-limit";
import { assertLogoAllowed, saveApplicantLogo, LogoRefusedError } from "@/lib/partner-upload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in to apply." }, { status: 401 });

  if (await loadPartnerRow(user)) {
    return NextResponse.json({ error: "You have already applied." }, { status: 409 });
  }

  const limited = await tooManyRequests(
    [{ bucket: "partner-apply-logo", key: user.id, windowMs: 60 * 60 * 1000, max: 20 }],
    "Too many uploads. Please wait a while and try again.",
  );
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  try {
    assertLogoAllowed(file.size, file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await saveApplicantLogo({ authUserId: user.id, bytes, originalName: file.name });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof LogoRefusedError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
