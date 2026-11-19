/**
 * A wanted Segment (PRD-email-funnel slices 04 and 06): a Segment a new
 * campaign is meant for, as a name and filters, found among the live
 * Segments by its filters or offered to be created through the Segments' own
 * create. One mechanism for the three that want one: a Playbook's Segment
 * (`starterWants`, ./starters), a stage's (`?stage=`) and a follow-up's
 * (`?after=`). Pure, and safe in the browser.
 *
 * The matching is the server's: a Segment's filters can name a Customer
 * (`search=…`), and Staff with `campaigns` need not hold `customers`, so the
 * browser never receives them. The server sends `FoundSegments`, each wanted
 * Segment's key mapped to the id of the live Segment that has its filters.
 */
import { filtersKey } from "@/lib/crm/filters-key";
import { customerFiltersSchema, stageFilterParam, type CampaignFilterState } from "@/lib/crm/customer-filters";
import { LIFECYCLE_STAGE_LABEL, LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { SEGMENT_NAME_MAX, type CustomerSegment } from "@/lib/crm/segment-rules";

/**
 * Where a wanted Segment comes from, as New campaign's address says it: the
 * server derives the Segment again from this, never from filters a caller
 * sends (`findWantedSegmentAction`).
 */
export type WantedAddress = { starter: string } | { stage: string } | { after: string };

export interface WantedSegment {
  /** The address it was wanted at. */
  address: WantedAddress;
  /** The name it is created with; among Segments with its filters, the one with this name is chosen. */
  name: string;
  /** Its filters, as the Customers list's query (`stage=at-risk`). */
  filters: string;
  /** Who it is for, as the notice opens: *This Playbook* sends to the Segment “…”. */
  who: string;
  /** A line after the notice. */
  note?: string;
  /** A Playbook's: it goes when the email stops being that Playbook (Clear all, another Starter). */
  playbook?: boolean;
}

/** Each wanted Segment's `wantedKey` → the id of the live Segment with its filters. Never a Segment's filters. */
export type FoundSegments = Readonly<Record<string, string>>;

/** A live Segment as the server matches it: `filtersKey` null when it needs review, so it is never chosen. */
export interface MatchableSegment {
  id: string;
  name: string;
  filtersKey: string | null;
}

/** Pure — the key `FoundSegments` holds `w` under: its filters, canonical. */
export const wantedKey = (w: Pick<WantedSegment, "filters">): string => filtersKey(w.filters) ?? w.filters;

/** Pure — the live Segments as the server matches them (lib/crm/segments.ts `listSegments`). Server only. */
export const matchable = (
  segments: readonly Pick<CustomerSegment, "id" | "name" | "params" | "needsReview">[],
): (MatchableSegment & { needsReview: boolean })[] =>
  segments.map((s) => ({ id: s.id, name: s.name, needsReview: s.needsReview, filtersKey: s.needsReview ? null : filtersKey(s.params) }));

/**
 * Pure — the Segment `w` wants, or null: one with exactly its filters (the
 * Email funnel's comparison, lib/crm/filters-key.ts), so a Segment Staff
 * renamed is still found and one with its name but other filters is not;
 * among several, the one with its name.
 */
export function findWanted<S extends MatchableSegment>(w: Pick<WantedSegment, "name" | "filters">, segments: readonly S[]): S | null {
  const key = filtersKey(w.filters);
  const same = key ? segments.filter((x) => x.filtersKey === key) : [];
  return same.find((x) => x.name === w.name) ?? same[0] ?? null;
}

/** Pure — what the server tells the editor: each of `wanted`'s found Segment, by `wantedKey`. */
export function foundSegments(wanted: readonly (WantedSegment | null)[], segments: readonly MatchableSegment[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of wanted) {
    const s = w ? findWanted(w, segments) : null;
    if (s && w) out[wantedKey(w)] ??= s.id;
  }
  return out;
}

/**
 * Pure — what *Create the Segment* sends to the Segments' own create
 * (`POST /api/settings/customers/segments`: its permission, validation,
 * unique name and audit row): the name and the filters as the Customers
 * list's parameters.
 */
export const wantedToCreate = (w: WantedSegment): { name: string; filters: Record<string, string> } => ({
  name: w.name,
  filters: Object.fromEntries(new URLSearchParams(w.filters)),
});

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** A *Lost* Customer is unsubscribed: `?stage=lost` is refused in these words. */
export const LOST_STAGE_NOTE =
  "A Lost customer has unsubscribed from marketing email, so a campaign to the Lost stage would send to nobody. Choose who to send it to.";

/**
 * Pure — `?stage=<stage>` (the Email funnel's *Add an email*): a main stage
 * as the Customers `stage` filter writes it (`lead`, `new`, `loyal`,
 * `at-risk`, `lost`). Its Segment is everyone in it, named after it. *Lost*
 * gives only the note; a sub-status or anything else, nothing.
 */
export function stageWanted(param: string | string[] | undefined): { wanted: WantedSegment } | { note: string } | null {
  const raw = first(param);
  const stage = LIFECYCLE_STAGES.find((s: LifecycleStage) => stageFilterParam(s) === raw);
  if (!stage) return null;
  if (stage === "lost") return { note: LOST_STAGE_NOTE };
  return { wanted: { address: { stage: raw! }, name: LIFECYCLE_STAGE_LABEL[stage], filters: `stage=${raw}`, who: "This campaign" } };
}

/** What a follow-up's people did with the first campaign: `not-sent` is not a follow-up. */
export type FollowUpState = Exclude<CampaignFilterState, "not-sent">;
const DID: Record<FollowUpState, string> = { sent: "got it", clicked: "clicked it", "not-clicked": "didn't click" };
const WHO_DID: Record<FollowUpState, (name: string) => string> = {
  sent: (n) => `got “${n}”`,
  clicked: (n) => `clicked “${n}”`,
  "not-clicked": (n) => `got “${n}” and didn't click`,
};

/**
 * Pure — `?after=<campaign id>:<sent|clicked|not-clicked>` (the Email
 * funnel's *Add a follow-up*), checked by the Customers `campaign` filter's
 * own schema; null for anything else, `not-sent` included.
 */
export function afterParam(param: string | string[] | undefined): { id: string; state: FollowUpState } | null {
  const parsed = customerFiltersSchema.shape.campaign.safeParse(first(param) ?? "");
  if (!parsed.success || !parsed.data || parsed.data.state === "not-sent") return null;
  return { id: parsed.data.id, state: parsed.data.state };
}

/** Pure — `head` cut so `head + tail` is a Segment name (at most `SEGMENT_NAME_MAX`). */
const fit = (head: string, tail: string) => head.slice(0, SEGMENT_NAME_MAX - tail.length).trimEnd() + tail;

/**
 * Pure — the follow-up's Segment: the people who got, clicked or got and
 * didn't click `parent` (a live campaign, started or not), named *We miss
 * you · didn't click*, cut to the name limit, and made unique (*… (2)*)
 * when a live Segment has the name: one with the same filters would have been
 * found, so it has other filters. Null when `parent` is not the `?after=`
 * campaign or is archived.
 */
export function followUpWanted(
  after: { id: string; state: FollowUpState } | null,
  parent: { id: string; name: string; archivedAt: string | null } | null,
  segments: readonly MatchableSegment[],
): WantedSegment | null {
  if (!after || !parent || parent.archivedAt || parent.id.toLowerCase() !== after.id) return null;
  const filters = `campaign=${after.id}:${after.state}`;
  const key = filtersKey(filters);
  // Names a create would be refused for: those of live Segments with other filters (one with these is found instead).
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
