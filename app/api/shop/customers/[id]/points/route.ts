import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, requireAdminContext, type AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getWorkingAs } from "@/lib/staff/working-as";
import {
  adjustPoints,
  isPartnerCustomer,
  readPendingOrders,
  readPointsBalance,
  readMilestoneStanding,
  readPointsHistory,
  readPointsSettings,
} from "@/lib/points/server";

export const runtime = "nodejs";

/**
 * A Customer's points (PRD-loyalty-points slice 02; ADR 0030): the balance,
 * pending points by Order, the latest ledger entries, and their place on the
 * bonus milestones (slice 09). Seeing them needs `customers`.
 *
 * POST is a Staff adjustment (rule n): points up or down with a written
 * reason, refused for a partner and below zero by `adjust_points`. It needs
 * `customers-edit`, and is audited with the Staff profile.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AdjustSchema = z
  .object({
    points: z.number().int().refine((n) => n !== 0, "Enter a number of points other than 0.").refine((n) => Math.abs(n) <= 1_000_000, "At most 1,000,000 points."),
    note: z.string().trim().min(1, "Write the reason for the adjustment.").max(300, "At most 300 characters."),
  })
  .strict();

async function readView(id: string) {
  const admin = supabaseAdmin();
  const [balance, pending, history, partner, settings, standing] = await Promise.all([
    readPointsBalance(admin, id),
    readPendingOrders(admin, id),
    readPointsHistory(admin, id, 20),
    isPartnerCustomer(admin, id),
    readPointsSettings(admin),
    // A failed milestone read only hides the milestone line, never the balance.
    readMilestoneStanding(admin, id).catch(() => null),
  ]);
  const milestones = standing
    ? {
        earned: standing.earned,
        reached: settings.milestones.filter((m) => m.at <= standing.earned).length,
        total: settings.milestones.length,
      }
    : null;
  return { balance, pending, history, partner, enabled: settings.enabled, milestones };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, view: await readView(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read points" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx: AdminContext;
  try {
    ctx = await requireAdminContext("customers-edit");
  } catch (denied) {
    return denied as NextResponse;
  }

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const parsed = AdjustSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the adjustment" }, { status: 400 });
  }

  const workingAs = await getWorkingAs(ctx.memberId);
  const result = await adjustPoints(supabaseAdmin(), {
    customerId: id,
    points: parsed.data.points,
    note: parsed.data.note,
    profileId: workingAs?.id ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await recordAdminAction({
    actor: ctx,
    action: "customer.points_adjust",
    entityType: "customer",
    entityId: id,
    after: { points: parsed.data.points, note: parsed.data.note, available: result.available },
  });

  const view = await readView(id).catch(() => null);
  return NextResponse.json({ ok: true, available: result.available, view });
}
