import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { revokeInvite, updateMember } from "@/lib/auth/members";

export const runtime = "nodejs";

const UpdateSchema = z
  .object({
    role_id: z.string().uuid().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => v.role_id !== undefined || v.is_active !== undefined, {
    message: "Nothing to update",
  });

/**
 * Change a Member's role or active state. The role policy decides
 * (`lib/auth/role-policy.ts`): not yourself, Owner only by an Owner, at least
 * one active Owner, and never a role with pages the actor lacks.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }

  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const result = await updateMember(ctx, id, { roleId: parsed.data.role_id, isActive: parsed.data.is_active });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, member: result.member });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 500 });
  }
}

/** Revoke an invite. Only while the Member is still Invited; an Active Member is deactivated instead. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }
  const { id } = await params;
  try {
    const result = await revokeInvite(ctx, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Revoke failed" }, { status: 500 });
  }
}
