/**
 * The **Email funnel** as one view (PRD-email-funnel; ADR 0054), pure: for
 * each **Lifecycle stage**, its header, the **Segments** that cut it, its
 * **Email flow** and its results, from plain facts a loader reads. No
 * database, no React; the view is plain JSON, so a server page hands it to a
 * client component as it is.
 *
 * Everything is derived, never stored (ADR 0054 (4)): a campaign belongs to
 * the stages its Segment's `stage` filter names, and a Playbook's step is set
 * up when a live campaign's Segment has the Playbook's filters, compared after
 * the Customers list's one schema (`customerFiltersSchema` →
 * `customerFilterParams`), so key order and defaults do not matter.
 *
 * Results follow the campaign Results tab (lib/email-campaigns/results.ts):
 * the `sent` cohort only, by the stage each person had when sent
 * (`stage_at_send`), rates over people sent and a dash when nobody was. The
 * view holds counts, never rates: the page calls `rate`, which is null for
 * nobody, never `NaN`.
 *
 * ponytail: numbers are since each email started (PRD decision 6):
 * `email_campaign_stage_results` has no dates, so there is no period picker.
 * The upgrade is a dated results view and a `since` on `FunnelFacts`.
 */

import {
  customerFiltersSchema,
  stageFilterParam,
  type CampaignFilterState,
  type StageFilter,
} from "@/lib/crm/customer-filters";
import { filtersKey, parseFilters } from "@/lib/crm/filters-key";
import { LIFECYCLE_DETAIL_STAGE, LIFECYCLE_STAGE_LABEL, LIFECYCLE_STAGE_RULE, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { LifecyclePartKey, LifecycleSummary } from "@/lib/crm/lifecycle-summary";
import type { CustomerSegment } from "@/lib/crm/segment-rules";
import type { KeepSending } from "@/lib/email-campaigns/keep-sending";
import { NO_RESULTS, rate, RESULT_WINDOW_DAYS, resultsFromRows, type ResultNumbers } from "@/lib/email-campaigns/results";
import { REST_DAYS, REST_MAX_PER_30_DAYS, REST_PERIOD_TEXT, type Campaign, type CampaignAudience } from "@/lib/email-campaigns/rules";
import { APPROVED_PLAYBOOKS } from "@/lib/email-campaigns/starters";
import type { CampaignStats } from "@/lib/email-campaigns/store";
import {
  campaignPath,
  FUNNEL_PATHS,
  FUNNEL_STAGES,
  funnelProgramme,
  newFromStarterPath,
  STAGE_ENTRIES,
  stepsOfStage,
  type FunnelSwitch,
  type PlaybookStep,
  type ProgrammeStep,
  type StageEntry,
} from "./programme";

/** `rate(part, whole)`: null when `whole` is 0. With the Results tab's `formatRate` and `formatSgd`. */
export { formatRate, formatSgd, rate } from "@/lib/email-campaigns/results";
/** *Same filters as the Playbook* (`customerFiltersSchema` → `customerFilterParams`), shared with New campaign. */
export { filtersKey } from "@/lib/crm/filters-key";

// ─── Facts: what the loader reads ────────────────────────────────────────────

/** A live Segment: `CustomerSegment` as `listSegments` returns it fits. */
export type FunnelSegmentFact = Pick<CustomerSegment, "id" | "name" | "count" | "needsReview"> & {
  /** Its stored filters, as the Customers list's URL parameters (strings). */
  params: Readonly<Record<string, string | undefined>>;
};

/** A live campaign: `CampaignListItem` as `listCampaigns` returns it fits. */
export interface FunnelCampaignFact {
  campaign: Pick<Campaign, "id" | "name" | "audience" | "segmentId" | "excludeSegmentIds" | "lockedAt" | "createdAt"> & {
    keepSending?: Pick<KeepSending, "on" | "dailyCap" | "pausedAt" | "pausedReason" | "holdoutAt">;
  };
  stats: Pick<CampaignStats, "handed" | "firstSentAt" | "lastSentAt">;
}

/** What an Automatic email already records: how many were sent, and its one outcome. */
export interface AutomaticCount {
  sent: number;
  outcome: number;
  /** Other counts it records, shown beside the outcome (*Reviews linked*, each reminder's sends). */
  also?: readonly AutomaticAlso[];
}

/** One more count an Automatic email records, in words. */
export interface AutomaticAlso {
  label: string;
  count: number;
}

/** A part of the page whose read failed: the page says so instead of showing it empty. */
export type FunnelPart = "summary" | "segments" | "campaigns" | "results" | "switches";

export interface FunnelFacts {
  /** Every Customer by stage now (`lifecycleSummary`); null when not read. */
  summary: LifecycleSummary | null;
  /** Per stage, how many of its Customers are subscribed to marketing email; missing or null when not read. */
  subscribed: Readonly<Partial<Record<LifecycleStage, number | null>>>;
  /** Live Segments (not archived). */
  segments: readonly FunnelSegmentFact[];
  /** Live campaigns (not archived). */
  campaigns: readonly FunnelCampaignFact[];
  /** `email_campaign_stage_results` rows for those campaigns, as the view returns them (`resultsFromRows` reads them). */
  stageResults: readonly Record<string, unknown>[];
  /** Automatic emails' counts by programme step id; missing or null for one not read (a failed read): *not counted*. */
  automatic: Readonly<Partial<Record<string, AutomaticCount | null>>>;
  /**
   * The switches, true when the step can send: draft reminders
   * (`draft_reminders_enabled`), review requests and check-ups
   * (`reviewRequestBlock` / `checkupBlock` is null), and their timings.
   */
  switches: Readonly<Record<FunnelSwitch, boolean>> & { checkupMonths: number; reviewRequestDays?: number };
  /** Parts whose read failed (their facts are then empty); missing for none. */
  notRead?: readonly FunnelPart[];
}

// ─── The view ────────────────────────────────────────────────────────────────

/** A campaign named on the page. */
export interface CampaignRef {
  id: string;
  name: string;
}

/** A step's state, with the words the page shows. */
export type StepState =
  /** An Automatic email that sends; a Service email without a switch always is. */
  | { state: "on"; label: string }
  | { state: "off_in_settings"; label: string }
  /** A Playbook not in `APPROVED_PLAYBOOKS`: it cannot be started. */
  | { state: "words_waiting"; label: string }
  /** An approved Playbook with no live campaign to its Segment. */
  | { state: "not_set_up"; label: string }
  /** A campaign whose first Wave has not been planned. */
  | { state: "draft"; label: string }
  /** Its first Wave was planned; it does not keep sending. */
  | { state: "started"; label: string }
  | { state: "keeps_sending"; label: string; dailyCap: number }
  /** Kept sending, paused: `reason` is the daily job's, or null when a person paused it. */
  | { state: "paused"; label: string; reason: string | null };

/** A campaign in a stage's flow. */
export interface FlowCampaign {
  id: string;
  name: string;
  /** Its own page. */
  href: string;
  state: StepState;
  /** When its first Wave was planned; null for a draft. */
  startedAt: string | null;
}

/** A follow-up: the campaign of this stage its Segment reads, and what that campaign did with them. */
export interface FollowUp {
  campaignId: string;
  did: CampaignFilterState;
}

/** One **Funnel step** of a stage's Email flow. */
export interface FlowStep {
  /** The programme step's id (`lead.draft_reminders`), or `campaign:<id>` for a campaign Staff wrote. */
  key: string;
  kind: "automatic" | "playbook" | "campaign";
  name: string;
  purpose: "service" | "marketing";
  /** Which consent it reads, in words. */
  consent: string;
  who: string;
  when: string;
  /** What ends it; empty when nothing but leaving the stage does. */
  stops: string;
  state: StepState;
  /** Where it is changed: settings, Email templates, or the campaign. */
  href: string;
  /** A Playbook *Not set up*: New campaign started from it. Null otherwise. */
  setUpHref: string | null;
  /** An Automatic step's registry ids; empty otherwise. */
  templates: string[];
  /** A Playbook step's Starter id; null otherwise. */
  starterId: string | null;
  /** A Playbook: every live campaign to its Segment, oldest started first. A campaign: itself. Automatic: none. */
  campaigns: FlowCampaign[];
  /** A campaign Staff wrote whose Segment reads another campaign of this stage; null otherwise. */
  after: FollowUp | null;
}

/** A Segment of a stage. */
export interface FunnelSegmentView {
  /** Null for a Playbook's Segment that is *Not created*. */
  id: string | null;
  name: string;
  /** Its stored filters (a Not created one: the Playbook's), as URL parameters, without `search` (see `searchHidden`). */
  params: Record<string, string>;
  /** Its filters include a search, left out of `params` so no Customer's name or email reaches the page: show a chip without its words. */
  searchHidden: boolean;
  /** Customers it chooses now; null when not counted. */
  count: number | null;
  needsReview: boolean;
  /** A stored filter does not parse. Flagged, like needs review: never matched to a Playbook. */
  unreadable: boolean;
  notCreated: boolean;
  /** For a Not created one, the Playbook that names it; null otherwise. */
  starterId: string | null;
  /** Live campaigns sent to it. */
  sendsTo: CampaignRef[];
  /** Live campaigns that leave it out. */
  leftOutBy: CampaignRef[];
}

/** One row of a stage's results. */
export type FunnelResultRow =
  | {
      kind: "campaign";
      campaignId: string;
      name: string;
      href: string;
      /** *Keeps sending*, or else *one-off*. */
      keepsSending: boolean;
      audience: CampaignAudience;
      /** The `sent` cohort's numbers for people at this stage when sent. */
      numbers: ResultNumbers;
    }
  | {
      kind: "automatic";
      stepId: string;
      name: string;
      href: string;
      /** What `outcome` counts (*Opened the review link*). */
      outcomeLabel: string;
      /** False when its count could not be read: *not counted*, never 0. */
      counted: boolean;
      sent: number | null;
      outcome: number | null;
      /** Its other counts; empty when not counted. */
      also: AutomaticAlso[];
      /** Listed under more than one stage (the Check-up reminder): its numbers are not split by stage. */
      acrossStages: boolean;
    };

export interface FunnelStageTotals {
  /** Every campaign row's numbers added up. */
  campaigns: ResultNumbers;
  /** Every counted Automatic row's `sent` added up, except rows listed under several stages (`acrossStages`). */
  automaticSent: number;
  /** The `sent` of counted `acrossStages` rows (the Check-up reminder): not split by stage, so shown beside the total and never added to it. */
  automaticAcrossStages: number;
  /** Automatic rows not counted, so not in `automaticSent`. */
  automaticNotCounted: number;
}

export interface FunnelStageView {
  stage: LifecycleStage;
  /** As the URL writes it: `?stage=at-risk`. */
  param: string;
  header: {
    label: string;
    rule: string;
    /** Null when the counts were not read. */
    customers: number | null;
    /** Of them, subscribed to marketing email; null when not read. */
    subscribed: number | null;
    /** Its sub-statuses, in bar order (`LIFECYCLE_PARTS`). */
    parts: { key: LifecyclePartKey; label: string; customers: number }[];
  };
  /** Who enters, whether the sunset rule shows, and *Lost*'s nothing-sent words. */
  entry: StageEntry;
  segments: FunnelSegmentView[];
  /** Programme steps, then the stage's other campaigns oldest started first. Empty for *Lost*. */
  flow: FlowStep[];
  results: {
    /** One row per email with anyone sent at this stage (an uncounted Automatic one included). */
    rows: FunnelResultRow[];
    totals: FunnelStageTotals;
    /** *Lost* only: campaigns by how many people unsubscribed from them (every stage), most first. Null elsewhere. */
    unsubscribedFrom: (CampaignRef & { unsubscribed: number })[] | null;
  };
}

export interface FunnelView {
  /** The five stages, in funnel order. */
  stages: FunnelStageView[];
  /** The **Rest period**, drawn between two marketing emails. */
  restPeriod: { days: number; maxPer30Days: number; text: string };
  /** *Bought within 30 days*. */
  resultWindowDays: number;
  /** Parts whose read failed: the page says each could not be read. */
  notRead: FunnelPart[];
}

// ─── Filters ─────────────────────────────────────────────────────────────────

/** Whether a Stage filter's values name `stage` or one of its sub-statuses. */
const namesStage = (values: readonly StageFilter[], stage: LifecycleStage) =>
  values.some((v) => v === stage || (v in LIFECYCLE_DETAIL_STAGE && LIFECYCLE_DETAIL_STAGE[v as keyof typeof LIFECYCLE_DETAIL_STAGE] === stage));

/** A Segment, read once. */
interface ReadSegment {
  fact: FunnelSegmentFact;
  /** The stages its `stage` filter names. */
  stages: Set<LifecycleStage>;
  /** Canonical filters; null when flagged (needs review or unreadable), so never matched. */
  key: string | null;
  unreadable: boolean;
  /** Its *Campaign* filter, read. */
  campaign: { id: string; state: CampaignFilterState } | null;
}

function readSegment(fact: FunnelSegmentFact): ReadSegment {
  const unreadable = parseFilters(fact.params) === null;
  const stage = fact.params.stage === undefined ? null : customerFiltersSchema.shape.stage.safeParse(fact.params.stage);
  const values = stage?.success && stage.data ? stage.data : [];
  const campaign = fact.params.campaign === undefined ? null : customerFiltersSchema.shape.campaign.safeParse(fact.params.campaign);
  return {
    fact,
    stages: new Set(FUNNEL_STAGES.filter((s) => namesStage(values, s))),
    key: unreadable || fact.needsReview ? null : filtersKey(fact.params),
    unreadable,
    campaign: campaign?.success && campaign.data ? campaign.data : null,
  };
}

/** The *Campaign* filter states that make a follow-up: got it, clicked it, got it and didn't click. */
const FOLLOW_UP_STATES: ReadonlySet<CampaignFilterState> = new Set(["sent", "clicked", "not-clicked"]);

/**
 * Stored filters for the page, without a search's words: a search may be a
 * Customer's name or email, and this page never names a Customer (PRD
 * hazard). Matching still reads the whole stored filters.
 */
const shownParams = (params: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "search"));

// ─── States ──────────────────────────────────────────────────────────────────

/** Pure — a campaign's state: Draft → Started → Keeps sending, n a day → Paused with the reason. */
export function campaignState(c: FunnelCampaignFact["campaign"]): StepState {
  if (!c.lockedAt) return { state: "draft", label: "Draft" };
  const k = c.keepSending;
  if (k?.on && k.pausedAt) {
    return { state: "paused", label: k.pausedReason ? `Paused: ${k.pausedReason}` : "Paused by a person", reason: k.pausedReason };
  }
  if (k?.on) return { state: "keeps_sending", label: `Keeps sending, ${k.dailyCap} a day`, dailyCap: k.dailyCap };
  return { state: "started", label: "Started" };
}

/** How far along a campaign is, for a Playbook with several: the step reads its furthest. */
const PROGRESS: Record<StepState["state"], number> = {
  on: 0,
  off_in_settings: 0,
  words_waiting: 0,
  not_set_up: 0,
  draft: 1,
  started: 2,
  paused: 3,
  keeps_sending: 4,
};

/** Oldest started first; drafts after, oldest made first. */
const byStart = (a: FunnelCampaignFact, b: FunnelCampaignFact) =>
  (a.campaign.lockedAt ?? "￿").localeCompare(b.campaign.lockedAt ?? "￿") ||
  a.campaign.createdAt.localeCompare(b.campaign.createdAt) ||
  a.campaign.id.localeCompare(b.campaign.id);

const flowCampaign = (c: FunnelCampaignFact): FlowCampaign => ({
  id: c.campaign.id,
  name: c.campaign.name,
  href: campaignPath(c.campaign.id),
  state: campaignState(c.campaign),
  startedAt: c.campaign.lockedAt,
});

// ─── The build ───────────────────────────────────────────────────────────────

/** Pure — the whole page from the facts. */
export function buildFunnel(facts: FunnelFacts): FunnelView {
  const programme = funnelProgramme({ checkupMonths: facts.switches.checkupMonths, reviewRequestDays: facts.switches.reviewRequestDays });
  const segments = facts.segments.map(readSegment);
  const segmentById = new Map(segments.map((s) => [s.fact.id, s]));
  const campaigns = [...facts.campaigns].sort(byStart);
  const ref = (c: FunnelCampaignFact): CampaignRef => ({ id: c.campaign.id, name: c.campaign.name });

  // A campaign's Segment, read; null for an Audience that is not a Segment, or a Segment no longer live.
  const segmentOf = (c: FunnelCampaignFact) =>
    c.campaign.audience === "segment" && c.campaign.segmentId ? (segmentById.get(c.campaign.segmentId) ?? null) : null;

  const byId = new Map(campaigns.map((c) => [c.campaign.id, c]));

  // The live campaign `c` follows up: its Segment reads what that one did
  // (*got it*, *clicked it*, *got it, didn't click*). *Didn't get it* is the
  // people it never reached: an ordinary campaign, not a follow-up.
  const readsOf = (c: FunnelCampaignFact): { parent: FunnelCampaignFact; did: CampaignFilterState } | null => {
    const read = segmentOf(c)?.campaign;
    if (!read || !FOLLOW_UP_STATES.has(read.state) || read.id === c.campaign.id) return null;
    const parent = byId.get(read.id);
    return parent ? { parent, did: read.state } : null;
  };

  // A cycle of follow-ups (A reads B, B reads A) has no first email: the one
  // of the cycle that started first (a draft counted as newest, ties by when
  // made, then id) follows up nothing and is its root, in the stages its
  // cycle's Segments name. Walked with a visited set, so it always ends.
  const cycleRoots = new Map<string, ReadonlySet<LifecycleStage>>();
  for (const c of campaigns) {
    const path: FunnelCampaignFact[] = [];
    const seen = new Set<string>();
    let cur: FunnelCampaignFact | undefined = c;
    while (cur && !seen.has(cur.campaign.id)) {
      seen.add(cur.campaign.id);
      path.push(cur);
      cur = readsOf(cur)?.parent;
    }
    if (cur?.campaign.id !== c.campaign.id) continue;
    const root = [...path].sort(byStart)[0];
    cycleRoots.set(root.campaign.id, new Set(path.flatMap((m) => [...(segmentOf(m)?.stages ?? [])])));
  }
  const followOf = (c: FunnelCampaignFact) => (cycleRoots.has(c.campaign.id) ? null : readsOf(c));

  // The stages a campaign sits in: its Segment's own, or, for a follow-up
  // whose Segment names none, the stages of the campaign it follows up. A
  // cycle (A reads B, B reads A) ends with no stage.
  const stagesMemo = new Map<string, ReadonlySet<LifecycleStage>>();
  const stagesOf = (c: FunnelCampaignFact, seen: ReadonlySet<string> = new Set()): ReadonlySet<LifecycleStage> => {
    const memo = stagesMemo.get(c.campaign.id);
    if (memo) return memo;
    const own = segmentOf(c)?.stages.size ? segmentOf(c)!.stages : (cycleRoots.get(c.campaign.id) ?? new Set<LifecycleStage>());
    let out: ReadonlySet<LifecycleStage> = own;
    if (!own.size) {
      const f = followOf(c);
      out = f && !seen.has(f.parent.campaign.id) ? stagesOf(f.parent, new Set([...seen, c.campaign.id])) : own;
    }
    if (!seen.size) stagesMemo.set(c.campaign.id, out);
    return out;
  };

  // Each live campaign's rows, by id.
  const rowsByCampaign = new Map<string, Record<string, unknown>[]>();
  for (const row of facts.stageResults) {
    const id = String(row.campaign_id);
    rowsByCampaign.set(id, [...(rowsByCampaign.get(id) ?? []), row]);
  }
  const rowsOf = (c: FunnelCampaignFact) => rowsByCampaign.get(c.campaign.id) ?? [];

  const stages = FUNNEL_STAGES.map((stage): FunnelStageView => {
    const steps = stage === "lost" ? [] : stepsOfStage(programme, stage);
    const playbooks = steps.filter((s): s is PlaybookStep => s.kind === "playbook");
    const inStage = campaigns.filter((c) => stagesOf(c).has(stage));

    // Each Playbook's campaigns: those whose Segment has its filters.
    const playbookCampaigns = new Map(
      playbooks.map((p) => {
        const key = filtersKey(p.segment.filters);
        return [p.id, inStage.filter((c) => key !== null && segmentOf(c)?.key === key)] as const;
      }),
    );
    const claimed = new Set([...playbookCampaigns.values()].flat().map((c) => c.campaign.id));
    const stageCampaignIds = new Set(inStage.map((c) => c.campaign.id));

    const flow: FlowStep[] =
      stage === "lost"
        ? []
        : [
            ...steps.map((s) => programmeFlowStep(s, facts.switches, playbookCampaigns.get(s.id) ?? [])),
            ...inStage
              .filter((c) => !claimed.has(c.campaign.id))
              .map((c): FlowStep => {
                const seg = segmentOf(c)!;
                const keeps = c.campaign.keepSending?.on === true;
                const f = followOf(c);
                const after = f && stageCampaignIds.has(f.parent.campaign.id) ? { campaignId: f.parent.campaign.id, did: f.did } : null;
                const fc = flowCampaign(c);
                return {
                  key: `campaign:${c.campaign.id}`,
                  kind: "campaign",
                  name: c.campaign.name,
                  purpose: "marketing",
                  consent: "Marketing consent: only to people subscribed",
                  who: seg.fact.name,
                  when: keeps ? "As they join the Segment" : "Once, when a person sends a Wave",
                  stops: "",
                  state: fc.state,
                  href: fc.href,
                  setUpHref: null,
                  templates: [],
                  starterId: null,
                  campaigns: [fc],
                  after,
                };
              }),
          ];

    // Segments: every live one naming the stage, then each Playbook's that is not created.
    const listed: FunnelSegmentView[] = segments
      .filter((s) => s.stages.has(stage))
      .map((s) => ({
        id: s.fact.id,
        name: s.fact.name,
        params: shownParams(s.fact.params),
        searchHidden: s.fact.params.search !== undefined,
        count: s.fact.count,
        needsReview: s.fact.needsReview,
        unreadable: s.unreadable,
        notCreated: false,
        starterId: null,
        sendsTo: campaigns.filter((c) => c.campaign.audience === "segment" && c.campaign.segmentId === s.fact.id).map(ref),
        leftOutBy: campaigns.filter((c) => c.campaign.excludeSegmentIds.includes(s.fact.id)).map(ref),
      }));
    const notCreated: FunnelSegmentView[] = playbooks
      .filter((p) => {
        const key = filtersKey(p.segment.filters);
        return !segments.some((s) => s.key !== null && s.key === key);
      })
      .map((p) => ({
        id: null,
        name: p.segment.name,
        params: shownParams(Object.fromEntries(new URLSearchParams(p.segment.filters))),
        searchHidden: false,
        count: null,
        needsReview: false,
        unreadable: false,
        notCreated: true,
        starterId: p.starterId,
        sendsTo: [],
        leftOutBy: [],
      }));

    // Results: Automatic steps, then campaigns that reached people at this stage, first sent first.
    const automaticRows = steps.flatMap((s): FunnelResultRow[] => {
      if (s.kind !== "automatic" || s.outcome === null) return [];
      const count = facts.automatic[s.id];
      const base = { kind: "automatic" as const, stepId: s.id, name: s.name, href: s.href, outcomeLabel: s.outcome, acrossStages: s.stages.length > 1 };
      if (count == null) return [{ ...base, counted: false, sent: null, outcome: null, also: [] }];
      return count.sent > 0
        ? [{ ...base, counted: true, sent: count.sent, outcome: count.outcome, also: (count.also ?? []).map((a) => ({ ...a })) }]
        : [];
    });
    const stageRows = (c: FunnelCampaignFact) => rowsOf(c).filter((r) => r.stage === stage);
    const campaignRows = [...campaigns]
      .sort((a, b) => (a.stats.firstSentAt ?? "￿").localeCompare(b.stats.firstSentAt ?? "￿") || byStart(a, b))
      .flatMap((c): FunnelResultRow[] => {
        const numbers = resultsFromRows(stageRows(c)).total;
        if (numbers.people <= 0) return [];
        return [
          {
            kind: "campaign",
            campaignId: c.campaign.id,
            name: c.campaign.name,
            href: campaignPath(c.campaign.id),
            keepsSending: c.campaign.keepSending?.on === true,
            audience: c.campaign.audience,
            numbers,
          },
        ];
      });
    const counted = automaticRows.filter((r) => r.kind === "automatic" && r.counted);

    const summary = facts.summary?.stages.find((s) => s.stage === stage);
    return {
      stage,
      param: stageFilterParam(stage),
      header: {
        label: LIFECYCLE_STAGE_LABEL[stage],
        rule: LIFECYCLE_STAGE_RULE[stage],
        customers: facts.summary ? (summary?.customers ?? 0) : null,
        subscribed: facts.subscribed[stage] ?? null,
        parts: (summary?.parts ?? []).map((p) => ({ key: p.key, label: p.label, customers: p.customers })),
      },
      entry: { ...STAGE_ENTRIES[stage] },
      segments: [...listed, ...notCreated],
      flow,
      results: {
        rows: [...automaticRows, ...campaignRows],
        totals: {
          campaigns: campaignRows.length ? resultsFromRows(campaigns.flatMap(stageRows)).total : { ...NO_RESULTS },
          automaticSent: counted.reduce((n, r) => n + (r.kind === "automatic" && !r.acrossStages ? (r.sent ?? 0) : 0), 0),
          automaticAcrossStages: counted.reduce((n, r) => n + (r.kind === "automatic" && r.acrossStages ? (r.sent ?? 0) : 0), 0),
          automaticNotCounted: automaticRows.length - counted.length,
        },
        unsubscribedFrom:
          stage === "lost"
            ? campaigns
                .map((c) => ({ ...ref(c), unsubscribed: resultsFromRows(rowsOf(c)).total.unsubscribed }))
                .filter((c) => c.unsubscribed > 0)
                .sort((a, b) => b.unsubscribed - a.unsubscribed || a.name.localeCompare(b.name))
            : null,
      },
    };
  });

  return {
    stages,
    restPeriod: { days: REST_DAYS, maxPer30Days: REST_MAX_PER_30_DAYS, text: REST_PERIOD_TEXT },
    resultWindowDays: RESULT_WINDOW_DAYS,
    notRead: [...(facts.notRead ?? [])],
  };
}

/** A programme step as a flow step, its state from the switches or its campaigns. */
function programmeFlowStep(s: ProgrammeStep, switches: FunnelFacts["switches"], matched: readonly FunnelCampaignFact[]): FlowStep {
  const base = {
    key: s.id,
    name: s.name,
    purpose: s.purpose,
    consent: s.consent,
    who: s.who,
    when: s.when,
    stops: s.stops,
    after: null,
  };
  if (s.kind === "automatic") {
    const on = s.switch === null || switches[s.switch];
    return {
      ...base,
      kind: "automatic",
      state: on ? { state: "on", label: "On" } : { state: "off_in_settings", label: "Off in settings" },
      href: s.href,
      setUpHref: null,
      templates: [...s.templates],
      starterId: null,
      campaigns: [],
    };
  }
  const campaigns = matched.map(flowCampaign);
  const approved = APPROVED_PLAYBOOKS.has(s.starterId);
  const state: StepState = !approved
    ? { state: "words_waiting", label: "Words waiting for the owner" }
    : campaigns.length
      ? campaigns.reduce((best, c) => (PROGRESS[c.state.state] > PROGRESS[best.state] ? c.state : best), campaigns[0].state)
      : { state: "not_set_up", label: "Not set up" };
  const setUpHref = state.state === "not_set_up" ? newFromStarterPath(s.starterId) : null;
  return {
    ...base,
    kind: "playbook",
    state,
    href: campaigns[0]?.href ?? setUpHref ?? FUNNEL_PATHS.campaigns,
    setUpHref,
    templates: [],
    starterId: s.starterId,
    campaigns,
  };
}

/** Pure — a row's rates over people sent, each null when nobody was (a dash, never `NaN`). */
export function resultRates(n: ResultNumbers): { clicked: number | null; unsubscribed: number | null; complained: number | null; bought: number | null } {
  return {
    clicked: rate(n.clicked, n.people),
    unsubscribed: rate(n.unsubscribed, n.people),
    complained: rate(n.complained, n.people),
    bought: rate(n.bought, n.people),
  };
}
