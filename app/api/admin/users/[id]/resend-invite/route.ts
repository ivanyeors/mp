import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { resendInvite } from "@/lib/auth/members";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }
  const { id } = await params;
  try {
    const result = await resendInvite(ctx, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, member: result.member, emailSent: result.emailSent });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Resend failed" }, { status: 500 });
  }
}
