import { SegmentUnavailableError, getSegment, resolveSegment } from "@/lib/crm/segments";
import { campaignSegmentIds, type ApprovedSegment, type LiveSegment } from "./keep-sending";
import type { Campaign } from "./rules";
import type { CampaignExclusionSource } from "./sender";

export const segmentAudience = (c: Pick<Campaign, "segmentId">): (() => AsyncIterable<string[]>) | undefined =>
  c.segmentId ? () => resolveSegment(c.segmentId!) : undefined;

export async function leftOutSegments(ids: readonly string[]): Promise<CampaignExclusionSource[]> {
  return Promise.all(
    ids.map(async (segmentId) => {
      const name = (await getSegment(segmentId))?.name ?? "a Segment that no longer exists";
      async function* customerIds() {
        try {
          yield* resolveSegment(segmentId);
        } catch (err) {
          if (!(err instanceof SegmentUnavailableError)) throw err;
          throw new Error(`It leaves out “${name}”, which cannot be used: ${err.message} Take it out of Leave out, or fix the Segment.`);
        }
      }
      return { segmentId, name, ids: customerIds };
    }),
  );
}

export async function readLiveSegments(c: Pick<Campaign, "segmentId" | "excludeSegmentIds">): Promise<Map<string, LiveSegment | null>> {
  const ids = campaignSegmentIds(c);
  const rows = await Promise.all(ids.map((id) => getSegment(id)));
  return new Map(
    ids.map((id, i) => {
      const s = rows[i];
      return [id, s ? { name: s.name, filters: s.filters, filtersVersion: s.filtersVersion, archivedAt: s.archivedAt } : null] as const;
    }),
  );
}

export async function approveSegments(c: Pick<Campaign, "segmentId" | "excludeSegmentIds">): Promise<Record<string, ApprovedSegment>> {
  const live = await readLiveSegments(c);
  const approved: Record<string, ApprovedSegment> = {};
  for (const [id, s] of live) {
    if (!s) throw new Error("A Segment this campaign reads no longer exists, so it cannot keep sending.");
    if (s.archivedAt) throw new Error(`Its Segment “${s.name}” is archived, so it cannot keep sending.`);
    approved[id] = { filters: s.filters, filtersVersion: s.filtersVersion };
  }
  return approved;
}
