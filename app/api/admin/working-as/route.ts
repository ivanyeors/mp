import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/auth/admin";
import {
  WORKING_AS_COOKIE,
  WORKING_AS_MAX_AGE,
  getWorkingAs,
  memberProfiles,
  validWorkingAs,
} from "@/lib/staff/working-as";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [profiles, current] = await Promise.all([memberProfiles(ctx.memberId), getWorkingAs(ctx.memberId)]);
  return NextResponse.json({ ok: true, profiles, current: current?.id ?? null });
}

const BodySchema = z.object({ profileId: z.string().uuid().nullable() });

export async function POST(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const res = NextResponse.json({ ok: true, current: parsed.data.profileId });
  if (parsed.data.profileId === null) {
    res.cookies.delete(WORKING_AS_COOKIE);
    return res;
  }
  const profile = await validWorkingAs(ctx.memberId, parsed.data.profileId);
  if (!profile) {
    return NextResponse.json({ error: "That profile isn't one of this login's." }, { status: 400 });
  }
  res.cookies.set(WORKING_AS_COOKIE, profile.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WORKING_AS_MAX_AGE,
  });
  return res;
}
