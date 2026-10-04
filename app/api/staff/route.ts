import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext, requireAnyAdmin } from "@/lib/auth/admin";
import { createStaffProfile, listStaffProfiles } from "@/lib/staff/admin";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  memberId: z.string().uuid(),
});

/**
 * Staff profiles with the login each works under. Results reads this for its
 * "measured by" picker (`results`); Users & permissions manages them
 * (`users`). `?includeArchived=1` adds archived profiles, so old Results can
 * still be labelled.
 */
export async function GET(req: Request) {
  const denied = await requireAnyAdmin(["results", "users"]);
  if (denied) return denied;

  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "1";
  try {
    return NextResponse.json({ ok: true, rows: await listStaffProfiles({ includeArchived }) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** Add a Staff profile under a login. */
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
