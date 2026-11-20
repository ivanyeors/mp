import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { actingProfile } from "@/lib/staff/working-as";
import { FollowUpPatchSchema } from "@/lib/crm/followup-rules";
import {
  completeFollowUp,
  deleteFollowUp,
  getFollowUp,
  listAssignableProfiles,
  reassignFollowUp,
} from "@/lib/crm/followups";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string; followupId: string }> };

const notFound = () => NextResponse.json({ error: "Follow-up not found" }, { status: 404 });

export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, followupId } = await params;
  if (!UUID.test(id) || !UUID.test(followupId)) return notFound();

  const parsed = FollowUpPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid change" }, { status: 400 });

  try {
    const current = await getFollowUp(id, followupId);
    if (!current) return notFound();
    if (current.doneAt) return NextResponse.json({ error: "This follow-up is done already." }, { status: 409 });

    if ("done" in parsed.data) {
      const me = await actingProfile(ctx.memberId);
      const row = await completeFollowUp(followupId, me?.id ?? null);
      if (!row) return NextResponse.json({ error: "This follow-up is done already." }, { status: 409 });
      await recordAdminAction({
        actor: ctx,
        action: "customer_followup.done",
        entityType: "customer_followup",
        entityId: followupId,
        before: { customer_id: id, done_at: null },
        after: { customer_id: id, done_at: row.doneAt, done_by_profile_id: row.doneBy?.id ?? null },
      });
      return NextResponse.json({ ok: true, row });
    }

    const to = parsed.data.assignedToProfileId;
    const assignees = await listAssignableProfiles();
    if (!assignees.some((p) => p.id === to)) {
      return NextResponse.json({ error: "Pick someone whose login can make changes on Customers." }, { status: 400 });
    }
    const row = await reassignFollowUp(followupId, to);
    if (!row) return NextResponse.json({ error: "This follow-up is done already." }, { status: 409 });
    await recordAdminAction({
      actor: ctx,
      action: "customer_followup.reassign",
      entityType: "customer_followup",
      entityId: followupId,
      before: { customer_id: id, assigned_to_profile_id: current.assignee.id },
      after: { customer_id: id, assigned_to_profile_id: to },
    });
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not change the follow-up" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, followupId } = await params;
  if (!UUID.test(id) || !UUID.test(followupId)) return notFound();

  try {
    const current = await getFollowUp(id, followupId);
    if (!current || !(await deleteFollowUp(id, followupId))) return notFound();
    await recordAdminAction({
      actor: ctx,
      action: "customer_followup.delete",
      entityType: "customer_followup",
      entityId: followupId,
      before: {
        customer_id: id,
        assigned_to_profile_id: current.assignee.id,
        due_on: current.dueOn,
        done_at: current.doneAt,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete the follow-up" }, { status: 500 });
  }
}
