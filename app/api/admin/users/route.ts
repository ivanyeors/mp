import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { inviteMember, listMembers, listRoles } from "@/lib/auth/members";

export const runtime = "nodejs";

const InviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role_id: z.string().uuid(),
  profile_name: z.string().trim().max(120).nullish(),
});

/** Every Member and every role, for Users & permissions. */
export async function GET() {
  try {
    await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }
  try {
    const [members, roles] = await Promise.all([listMembers(), listRoles()]);
    return NextResponse.json({ ok: true, members, roles });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 500 });
  }
}

/**
 * Invite a Member by email with a role the inviter may assign, plus their
 * first Staff profile, and email them a Sign in link. The row is Invited
 * until they sign in with that address. A duplicate email is a 409 naming the
 * existing Member's state; a failed email still returns 201 with
 * `emailSent: false` so the page can offer Resend.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }

  const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const result = await inviteMember(ctx, {
      email: parsed.data.email,
      roleId: parsed.data.role_id,
      profileName: parsed.data.profile_name,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, member: result.member, emailSent: result.emailSent }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to invite" }, { status: 500 });
  }
}
