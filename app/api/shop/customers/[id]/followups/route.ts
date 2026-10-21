import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { recordAdminAction } from "@/lib/auth/audit";
import { actingProfile } from "@/lib/staff/working-as";
import { FollowUpInputSchema, sgtToday } from "@/lib/crm/followup-rules";
import { createFollowUp, listAssignableProfiles, listCustomerFollowUps } from "@/lib/crm/followups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/shop/customers/[id]/followups — the Customer's Follow-ups (CRM 06),
 * open first. Seeing them needs `customers`. Answers `{ ok, rows, today, me,
 * assignees }`: `today` is the Singapore day the states were read against,
 * `me` the profile the viewer works as (the form's default assignee), and
 * `assignees` the profiles whose Member may close one, only for a viewer who
 * may add one (`customers-edit`), else an empty list.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  try {
    const canEdit = hasPermission(ctx, "customers-edit");
    const [rows, me, assignees] = await Promise.all([
      listCustomerFollowUps(id),
      actingProfile(ctx.memberId),
      canEdit ? listAssignableProfiles() : Promise.resolve([]),
    ]);
    return NextResponse.json({ ok: true, rows, today: sgtToday(), me, assignees });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load follow-ups" }, { status: 500 });
  }
}

/**
 * POST /api/shop/customers/[id]/followups — adds a follow-up `{ title, dueOn,
 * assignedToProfileId }`, created by the profile the signed-in Member works
 * as. The assignee must be a live profile whose Member holds `customers-edit`.
 * The audit entry names ids and the due date, never the title.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const parsed = FollowUpInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid follow-up" }, { status: 400 });
  }

  const { data: customer } = await supabaseAdmin().from("customers").select("id").eq("id", id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  let row;
  try {
    const assignees = await listAssignableProfiles();
    if (!assignees.some((p) => p.id === parsed.data.assignedToProfileId)) {
      return NextResponse.json(
        { error: "Pick someone whose login can make changes on Customers." },
        { status: 400 },
      );
    }
    const me = await actingProfile(ctx.memberId);
    row = await createFollowUp(id, parsed.data, me?.id ?? null);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save the follow-up" }, { status: 500 });
  }

  await recordAdminAction({
    actor: ctx,
    action: "customer_followup.create",
    entityType: "customer_followup",
    entityId: row.id,
    after: { customer_id: id, assigned_to_profile_id: row.assignee.id, due_on: row.dueOn },
  });

  return NextResponse.json({ ok: true, row }, { status: 201 });
}
