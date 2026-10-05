import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { updateStaffProfile } from "@/lib/staff/admin";

export const runtime = "nodejs";

// One change per request, so each lands in the Audit Log as its own action.
const ChangeSchema = z.union([
  z.object({ name: z.string().trim().min(1, "Name is required").max(120, "Name is too long") }).strict(),
  z.object({ memberId: z.string().uuid() }).strict(),
  z.object({ archived: z.boolean() }).strict(),
]);

/** Rename, move to another login, archive or restore a Staff profile. There is no delete. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAdminContext("users");
  } catch (denied) {
    return denied as NextResponse;
  }
  const { id } = await params;
  const parsed = ChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send exactly one of: name, memberId, archived." },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const change =
    "name" in body
      ? ({ kind: "rename", name: body.name } as const)
      : "memberId" in body
        ? ({ kind: "move", memberId: body.memberId } as const)
        : ({ kind: body.archived ? "archive" : "restore" } as const);
  try {
    const result = await updateStaffProfile(ctx, id, change);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, row: result.profile });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
