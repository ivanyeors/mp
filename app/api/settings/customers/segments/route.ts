import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { actingProfile } from "@/lib/staff/working-as";
import { SEGMENT_FILTERS_VERSION, SegmentNameSchema, parseSegmentFilters } from "@/lib/crm/segment-rules";
import { SegmentNameTakenError, createSegment, listSegments } from "@/lib/crm/segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin("customers");
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, rows: await listSegments() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load Segments" }, { status: 500 });
  }
}

const CreateSegmentSchema = z.object({ name: SegmentNameSchema, filters: z.unknown() });

export async function POST(req: Request) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = CreateSegmentSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid Segment" }, { status: 400 });
  }
  const filters = parseSegmentFilters(body.data.filters);
  if (!filters.ok) return NextResponse.json({ error: filters.error, refused: filters.refused }, { status: 400 });

  let row;
  try {
    const me = await actingProfile(ctx.memberId);
    row = await createSegment(body.data.name, filters.params, me?.id ?? null);
  } catch (e) {
    if (e instanceof SegmentNameTakenError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save the Segment" }, { status: 500 });
  }

  await recordAdminAction({
    actor: ctx,
    action: "customer_segment.create",
    entityType: "customer_segment",
    entityId: row.id,
    after: { name: row.name, filters: filters.params, filters_version: SEGMENT_FILTERS_VERSION },
  });

  return NextResponse.json({ ok: true, row }, { status: 201 });
}
