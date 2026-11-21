import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext, requireAdminContext, requireAnyAdmin } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { createStaffProfile, listStaffProfiles, withoutLoginEmails } from "@/lib/staff/admin";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  memberId: z.string().uuid(),
});

export async function GET(req: Request) {
  const denied = await requireAnyAdmin(["results", "users"]);
  if (denied) return denied;

  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";
  try {
    const ctx = await getAdminContext();
    const rows = await listStaffProfiles({ includeArchived });
    return NextResponse.json({
      ok: true,
      rows: ctx && hasPermission(ctx, "users") ? rows : withoutLoginEmails(rows),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
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
    const result = await createStaffProfile(ctx, parsed.data.memberId, parsed.data.name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, row: result.profile }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
