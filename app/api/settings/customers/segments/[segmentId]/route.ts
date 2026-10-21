import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { SEGMENT_FILTERS_VERSION, SegmentNameSchema, parseSegmentFilters } from "@/lib/crm/segment-rules";
import { SegmentNameTakenError, archiveSegment, getSegment, updateSegment } from "@/lib/crm/segments";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ segmentId: string }> };

const notFound = () => NextResponse.json({ error: "Segment not found" }, { status: 404 });

type Change = { name: string } | { filters: unknown } | { archived: true };

/** One change at a time: rename, new filters (*Update {name}*), or archive. */
function parseChange(raw: unknown): { ok: true; change: Change } | { ok: false; error: string } {
  const invalid = { ok: false as const, error: "Invalid change" };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return invalid;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return invalid;
  const body = raw as Record<string, unknown>;
  if (keys[0] === "archived") return body.archived === true ? { ok: true, change: { archived: true } } : invalid;
  if (keys[0] === "filters") return { ok: true, change: { filters: body.filters } };
  if (keys[0] === "name") {
    const name = SegmentNameSchema.safeParse(body.name);
    return name.success ? { ok: true, change: { name: name.data } } : { ok: false, error: name.error.issues[0]!.message };
  }
  return invalid;
}

/**
 * PATCH /api/settings/customers/segments/[segmentId] — on a live Segment,
 * one of:
 *
 * - `{ name }`: *Rename*. A live name in use is 409.
 * - `{ filters }`: *Update {name}* with the list's current parameters. They
 *   are checked as on saving; anything the schema would drop is refused.
 *   Saving them clears *Needs review*.
 * - `{ archived: true }`: *Archive*. The name is free again.
 *
 * Needs `customers-edit`. Each change is audited with the name and filters
 * before and after, never Customer data.
 */
export async function PATCH(req: Request, { params }: Params) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { segmentId } = await params;
  if (!UUID.test(segmentId)) return notFound();

  const parsed = parseChange(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const change = parsed.change;

  try {
    const current = await getSegment(segmentId);
    if (!current || current.archivedAt) return notFound();
    const before = { name: current.name, filters: current.filters, filters_version: current.filtersVersion };

    if ("archived" in change) {
      const archivedAt = await archiveSegment(segmentId);
      if (!archivedAt) return notFound();
      await recordAdminAction({
        actor: ctx,
        action: "customer_segment.archive",
        entityType: "customer_segment",
        entityId: segmentId,
        before: { ...before, archived_at: null },
        after: { ...before, archived_at: archivedAt },
      });
      return NextResponse.json({ ok: true, archivedAt });
    }

    if ("name" in change) {
      const row = await updateSegment(segmentId, { name: change.name });
      if (!row) return notFound();
      await recordAdminAction({
        actor: ctx,
        action: "customer_segment.rename",
        entityType: "customer_segment",
        entityId: segmentId,
        before,
        after: { ...before, name: row.name },
      });
      return NextResponse.json({ ok: true, row });
    }

    const filters = parseSegmentFilters(change.filters);
    if (!filters.ok) return NextResponse.json({ error: filters.error, refused: filters.refused }, { status: 400 });
    const row = await updateSegment(segmentId, { params: filters.params });
    if (!row) return notFound();
    await recordAdminAction({
      actor: ctx,
      action: "customer_segment.update",
      entityType: "customer_segment",
      entityId: segmentId,
      before,
      after: { name: row.name, filters: filters.params, filters_version: SEGMENT_FILTERS_VERSION },
    });
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    if (e instanceof SegmentNameTakenError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not change the Segment" }, { status: 500 });
  }
}
