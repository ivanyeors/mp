import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getWorkingAs } from "@/lib/staff/working-as";
import { grantPastPurchasePoints, readPastPurchasePreview } from "@/lib/points/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discounts → Points → Past purchases (ADR 0030, amendment of 2026-11-08):
 * each Migrated customer's points for what they spent on the old shop.
 *
 * GET is the preview: how many customers a run would grant, how many points,
 * what they spent, and what earlier runs granted. POST is the run: it sends
 * back the preview's customers and points, and the database grants only if
 * they are still what a run would grant, so what Staff confirmed is what is
 * granted. Both need `discounts`, as the rest of the Points settings do. The
 * run is audited with the Staff profile; it is not reversible (the ledger is
 * append-only), so a correction is a Staff adjustment.
 */

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
    // The numbers moved since the preview: send the new one back with the refusal.
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
