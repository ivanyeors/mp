import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { listRoles } from "@/lib/auth/members";
import { createRole } from "@/lib/auth/roles";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name is too long"),
  description: z.string().trim().max(280, "Description is too long").nullish(),
  permissions: z.array(z.string()).max(200).default([]),
});

export async function GET() {
  try {
    await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }
  try {
    return NextResponse.json({ ok: true, roles: await listRoles() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load roles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const result = await createRole(ctx, {
      name: parsed.data.name,
      description: parsed.data.description || null,
      permissions: parsed.data.permissions,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, role: result.role }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create role" }, { status: 500 });
  }
}
