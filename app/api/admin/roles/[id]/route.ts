import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { deleteRole, updateRole } from "@/lib/auth/roles";

export const runtime = "nodejs";

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(60, "Name is too long").optional(),
    description: z.string().trim().max(280, "Description is too long").nullish(),
    permissions: z.array(z.string()).max(200).optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.permissions !== undefined, {
    message: "Nothing to update",
  });

/**
 * Rename, re-describe or change a custom role's pages. Built-in roles are
 * refused; `requires` is applied; a non-Owner/Admin may only edit within
 * their own pages.
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
    const { description, ...rest } = parsed.data;
    const result = await updateRole(ctx, id, {
      ...rest,
      ...(description !== undefined ? { description: description || null } : {}),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, role: result.role });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update role" }, { status: 500 });
  }
}

/** Delete a custom role nobody holds. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }
  const { id } = await params;
  try {
    const result = await deleteRole(ctx, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete role" }, { status: 500 });
  }
}
