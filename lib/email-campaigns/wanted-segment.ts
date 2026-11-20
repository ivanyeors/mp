import { filtersKey } from "@/lib/crm/filters-key";
import { customerFiltersSchema, stageFilterParam, type CampaignFilterState } from "@/lib/crm/customer-filters";
import { LIFECYCLE_STAGE_LABEL, LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { SEGMENT_NAME_MAX, type CustomerSegment } from "@/lib/crm/segment-rules";

export type WantedAddress = { starter: string } | { stage: string } | { after: string };

export interface WantedSegment {
  address: WantedAddress;
  name: string;
  filters: string;
  who: string;
  note?: string;
  playbook?: boolean;
}

export type FoundSegments = Readonly<Record<string, string>>;

export interface MatchableSegment {
  id: string;
  name: string;
  filtersKey: string | null;
}

export const wantedKey = (w: Pick<WantedSegment, "filters">): string => filtersKey(w.filters) ?? w.filters;

export const matchable = (
  segments: readonly Pick<CustomerSegment, "id" | "name" | "params" | "needsReview">[],
): (MatchableSegment & { needsReview: boolean })[] =>
  segments.map((s) => ({ id: s.id, name: s.name, needsReview: s.needsReview, filtersKey: s.needsReview ? null : filtersKey(s.params) }));

export function findWanted<S extends MatchableSegment>(w: Pick<WantedSegment, "name" | "filters">, segments: readonly S[]): S | null {
  const key = filtersKey(w.filters);
  const same = key ? segments.filter((x) => x.filtersKey === key) : [];
  return same.find((x) => x.name === w.name) ?? same[0] ?? null;
}

export function foundSegments(wanted: readonly (WantedSegment | null)[], segments: readonly MatchableSegment[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of wanted) {
    const s = w ? findWanted(w, segments) : null;
    if (s && w) out[wantedKey(w)] ??= s.id;
  }
  return out;
}

export const wantedToCreate = (w: WantedSegment): { name: string; filters: Record<string, string> } => ({
  name: w.name,
  filters: Object.fromEntries(new URLSearchParams(w.filters)),
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const LOST_STAGE_NOTE =
  "A Lost customer has unsubscribed from marketing email, so a campaign to the Lost stage would send to nobody. Choose who to send it to.";

export function stageWanted(param: string | string[] | undefined): { wanted: WantedSegment } | { note: string } | null {
  const raw = first(param);
  const stage = LIFECYCLE_STAGES.find((s: LifecycleStage) => stageFilterParam(s) === raw);
  if (!stage) return null;
  if (stage === "lost") return { note: LOST_STAGE_NOTE };
  return { wanted: { address: { stage: raw! }, name: LIFECYCLE_STAGE_LABEL[stage], filters: `stage=${raw}`, who: "This campaign" } };
}

export type FollowUpState = Exclude<CampaignFilterState, "not-sent">;
const DID: Record<FollowUpState, string> = { sent: "got it", clicked: "clicked it", "not-clicked": "didn't click" };
const WHO_DID: Record<FollowUpState, (name: string) => string> = {
  sent: (n) => `got “${n}”`,
  clicked: (n) => `clicked “${n}”`,
  "not-clicked": (n) => `got “${n}” and didn't click`,
};

export function afterParam(param: string | string[] | undefined): { id: string; state: FollowUpState } | null {
  const parsed = customerFiltersSchema.shape.campaign.safeParse(first(param) ?? "");
  if (!parsed.success || !parsed.data || parsed.data.state === "not-sent") return null;
  return { id: parsed.data.id, state: parsed.data.state };
}

const fit = (head: string, tail: string) => head.slice(0, SEGMENT_NAME_MAX - tail.length).trimEnd() + tail;

export function followUpWanted(
  after: { id: string; state: FollowUpState } | null,
  parent: { id: string; name: string; archivedAt: string | null } | null,
  segments: readonly MatchableSegment[],
): WantedSegment | null {
  if (!after || !parent || parent.archivedAt || parent.id.toLowerCase() !== after.id) return null;
  const filters = `campaign=${after.id}:${after.state}`;
  const key = filtersKey(filters);
  const taken = new Set(segments.filter((s) => s.filtersKey !== key).map((s) => s.name.toLowerCase()));
  const tail = ` · ${DID[after.state]}`;
  let name = fit(parent.name, tail);
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = fit(parent.name, `${tail} (${n})`);
  return {
    address: { after: `${after.id}:${after.state}` },
    name,
    filters,
    who: "This follow-up campaign",
    note: `It is for the people who ${WHO_DID[after.state](parent.name)}. A follow-up reaches them after the Rest period, and each Wave goes to whoever matches then.`,
  };
}
