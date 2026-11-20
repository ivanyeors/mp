import { getSegment } from "@/lib/crm/segments";
import { readSegmentFilters } from "@/lib/crm/segment-rules";
import { selfDefeatingAudience } from "./rules";

export async function audienceRefusal(campaignId: string, segmentId: string | null): Promise<string | null> {
  if (!segmentId) return null;
  const segment = await getSegment(segmentId);
  if (!segment) return null;
  const { filters } = readSegmentFilters(segment.filters, segment.filtersVersion);
  return selfDefeatingAudience(campaignId, { name: segment.name, filters });
}
