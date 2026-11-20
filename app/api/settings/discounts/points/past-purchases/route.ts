import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWorkingAs } from "@/lib/staff/working-as";
import { grantPastPurchasePoints, readPastPurchasePreview } from "@/lib/points/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RunSchema = z
  .object({
    customers: z.number().int().min(1, "There is nobody to grant."),
    points: z.number().int().min(1, "There are no points to grant."),
  })
  .strict();

export async function GET() {
  try {
    await requireAdminContext("discounts");
  } catch (res) {
    return res as NextResponse;
  }
  try {
    return NextResponse.json({ ok: true, preview: await readPastPurchasePreview(supabaseAdmin()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireAdminContext("discounts");
  } catch (res) {
    return res as NextResponse;
  }

  const parsed = RunSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the numbers" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const workingAs = await getWorkingAs(ctx.memberId);
  const result = await grantPastPurchasePoints(admin, {
    profileId: workingAs?.id ?? null,
    customers: parsed.data.customers,
    points: parsed.data.points,
  });
  if (!result.ok) {
    const preview = await readPastPurchasePreview(admin).catch(() => null);
    return NextResponse.json({ error: result.error, preview }, { status: 409 });
  }

  await recordAdminAction({
    actor: ctx,
    action: "points.past_purchases_grant",
    entityType: "site_setting",
    entityId: "points",
    after: { customers: result.customers, points: result.points },
  });

  const preview = await readPastPurchasePreview(admin).catch(() => null);
  return NextResponse.json({ ok: true, granted: { customers: result.customers, points: result.points }, preview });
}
