import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { ADMIN_ROLES } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const InviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(ADMIN_ROLES).default("staff"),
});

/** List all staff members and their roles. */
export async function GET() {
  const denied = await requireAdmin("staff");
  if (denied) return denied;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("admin_users")
    .select("id, email, role, is_active, auth_user_id, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

/**
 * Invite a staff member by email. We create the `admin_users` row up front; the
 * person gains access the next time they sign in at the staff login, when
 * `getAdminContext` links their auth id to this row by matching email.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin("staff");
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
    .insert({ email, role: parsed.data.role, is_active: true })
    .select("id, email, role, is_active, auth_user_id, created_at, updated_at")
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
