import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

export const runtime = "nodejs";

const InviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role_id: z.string().uuid(),
});

const MEMBER_COLUMNS = "id, email, role_id, is_active, auth_user_id, created_at, updated_at";

/** List every Member and the roles one can hold. */
export async function GET() {
  const denied = await requireAdmin("users");
  if (denied) return denied;

  const admin = supabaseAdmin();
  const [members, roles] = await Promise.all([
    admin.from("admin_users").select(MEMBER_COLUMNS).order("created_at", { ascending: true }),
    admin.from("admin_roles").select("id, key, name, is_system, grants_all").order("name"),
  ]);
  const error = members.error ?? roles.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: members.data ?? [], roles: roles.data ?? [] });
}

/**
 * Invite a staff member by email. We create the `admin_users` row up front; the
 * person gains access the next time they sign in at the staff login, when
 * `getAdminContext` links their auth id to this row by matching email.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin("users");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("admin_users")
    .insert({ email, role_id: parsed.data.role_id, is_active: true })
    .select(MEMBER_COLUMNS)
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A staff member with this email already exists" : error.message },
      { status: isDup ? 409 : 500 },
    );
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: "admin_user.invite",
    entityType: "admin_user",
    entityId: data.id,
    after: data,
  });

  return NextResponse.json({ ok: true, row: data }, { status: 201 });
}
