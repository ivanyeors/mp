import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

export const runtime = "nodejs";

const UpdateSchema = z
  .object({
    role_id: z.string().uuid().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => v.role_id !== undefined || v.is_active !== undefined, {
    message: "Nothing to update",
  });

/** Change a staff member's role or active status. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("users");
  if (denied) return denied;
  const ctx = await getAdminContext();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const { data: target, error: findError } = await admin
    .from("admin_users")
    .select("id, email, role_id, is_active, role:admin_roles(key)")
    .eq("id", id)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  // Prevent locking yourself out: you can't change your own role or deactivate
  // your own account.
  if (ctx && target.email.toLowerCase() === ctx.email.toLowerCase()) {
    return NextResponse.json(
      { error: "You cannot change your own role or active status." },
      { status: 400 },
    );
  }

  // Never leave the back office without an active owner.
  const { data: ownerRole } = await admin.from("admin_roles").select("id").eq("key", "owner").maybeSingle();
  const losingOwner =
    target.role_id === ownerRole?.id &&
    ((parsed.data.role_id !== undefined && parsed.data.role_id !== ownerRole?.id) ||
      parsed.data.is_active === false);
  if (losingOwner) {
    const { count } = await admin
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .eq("role_id", ownerRole!.id)
      .eq("is_active", true)
      .neq("id", id);
    if (!count) {
      return NextResponse.json(
        { error: "There must be at least one active owner." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin
    .from("admin_users")
    .update(parsed.data)
    .eq("id", id)
    .select("id, email, role_id, is_active, auth_user_id, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAdminAction({
    actor: ctx,
    action: "admin_user.update",
    entityType: "admin_user",
    entityId: id,
    before: target,
    after: data,
  });

  return NextResponse.json({ ok: true, row: data });
}
