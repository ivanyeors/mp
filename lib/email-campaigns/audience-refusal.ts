import { getSegment } from "@/lib/crm/segments";
import { readSegmentFilters } from "@/lib/crm/segment-rules";
import { selfDefeatingAudience } from "./rules";

/**
 * PRD-campaign-audiences slice 05: the words refusing a Segment chosen by this
 * campaign's own history (*got it*, *clicked it*), which would never send; null
 * when the Audience can send. A Segment that is gone or needs review is left
 * to the wave's own refusal. Shared by Save and the Email funnel's arranging
 * (PRD-email-funnel slice 07). Server only.
 */
export async function audienceRefusal(campaignId: string, segmentId: string | null): Promise<string | null> {
  if (!segmentId) return null;
  const segment = await getSegment(segmentId);
  if (!segment) return null;
  const { filters } = readSegmentFilters(segment.filters, segment.filtersVersion);
  return selfDefeatingAudience(campaignId, { name: segment.name, filters });
}
