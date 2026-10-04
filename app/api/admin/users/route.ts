import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { listMembers, listRoles } from "@/lib/auth/members";
import { canAssignRole } from "@/lib/auth/role-policy";

export const runtime = "nodejs";

const InviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role_id: z.string().uuid(),
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
 * Invite a Member by email with a role the inviter may assign. The row is
 * created Invited; `getAdminContext` binds it to the invitee's auth user the
 * first time they sign in with that email.
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

  const roles = await listRoles().catch(() => null);
  if (!roles) return NextResponse.json({ error: "Failed to load roles" }, { status: 500 });
  const role = roles.find((r) => r.id === parsed.data.role_id);
  if (!role) return NextResponse.json({ error: "That role no longer exists." }, { status: 400 });
  const decision = canAssignRole(ctx, role);
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });

  const email = parsed.data.email.toLowerCase();
  const { data, error } = await supabaseAdmin()
    .from("admin_users")
    .insert({ email, role_id: role.id, is_active: true })
    .select("id, email, role_id, is_active, auth_user_id, created_at")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A Member with this email already exists." : error.message },
      { status: isDup ? 409 : 500 },
    );
  }

  await recordAdminAction({
    actor: ctx,
    action: "member.invite",
    entityType: "member",
    entityId: data.id,
    after: { email, role: role.name, status: "invited" },
  });

  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
