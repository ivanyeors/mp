import { hasPermission, permissionForHref, type Permission } from "@/lib/auth/permissions";
import { mergeTimeline } from "@/lib/crm/timeline/merge";
import { TIMELINE_ADAPTERS } from "@/lib/crm/timeline/registry";
import type {
  ShownTimelineEntry,
  TimelineAdapter,
  TimelineCursor,
  TimelineCustomer,
  TimelineGroup,
  TimelineRef,
} from "@/lib/crm/timeline/types";

export const TIMELINE_PAGE_SIZE = 50;

export type TimelinePageResult = {
  entries: ShownTimelineEntry[];
  next: TimelineCursor | null;
  groups: TimelineGroup[];
  unavailable: string[];
};

function linkFor(ref: TimelineRef, viewer: { permissions: ReadonlySet<Permission> }): TimelineRef {
  if (!ref.href) return ref;
  const needs = permissionForHref(ref.href);
  if (!needs || hasPermission(viewer, needs)) return ref;
  return { type: ref.type, id: ref.id };
}

export async function loadTimeline(input: {
  customer: TimelineCustomer;
  viewer: { permissions: ReadonlySet<Permission> };
  groups: ReadonlySet<string> | null;
  after: TimelineCursor | null;
  limit?: number;
  adapters?: readonly TimelineAdapter[];
}): Promise<TimelinePageResult> {
  const limit = input.limit ?? TIMELINE_PAGE_SIZE;
  const visible = (input.adapters ?? TIMELINE_ADAPTERS).filter((a) => hasPermission(input.viewer, a.permission));

  const groups: TimelineGroup[] = [];
  for (const a of visible) if (!groups.some((g) => g.key === a.group.key)) groups.push(a.group);

  const chosen = visible.filter((a) => !input.groups || input.groups.has(a.group.key));
  const settled = await Promise.allSettled(
    chosen.map((a) => a.load(input.customer, input.after?.at ?? null, limit)),
  );

  const unavailable: string[] = [];
  const batches: { entries: ShownTimelineEntry[]; floor: string | null }[] = [];
  settled.forEach((result, i) => {
    const adapter = chosen[i]!;
    if (result.status === "rejected") {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`[timeline] ${adapter.key} failed: ${reason}`);
      if (!unavailable.includes(adapter.group.label)) unavailable.push(adapter.group.label);
      return;
    }
    batches.push({
      floor: result.value.floor,
      entries: result.value.entries.map((e) => ({ ...e, group: adapter.group.key, ref: linkFor(e.ref, input.viewer) })),
    });
  });

  return { ...mergeTimeline(batches, limit, input.after), groups, unavailable };
}
