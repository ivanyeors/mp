// ponytail: numbers are since each email started (PRD decision 6): `email_campaign_stage_results`
// has no dates, so there is no period picker. The upgrade is a dated results view and a `since` on
// `FunnelFacts`.

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
import { APPROVED_PLAYBOOKS, PLAYBOOK_DRAFTS } from "@/lib/email-campaigns/starters";
import type { CampaignStats } from "@/lib/email-campaigns/store";
import {
  campaignPath,
  FUNNEL_PATHS,
  FUNNEL_PROGRAMME as FUNNEL_PROGRAMME_STEPS,
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

export { formatRate, formatSgd, rate } from "@/lib/email-campaigns/results";
export { filtersKey } from "@/lib/crm/filters-key";

export type FunnelSegmentFact = Pick<CustomerSegment, "id" | "name" | "count" | "needsReview"> & {
  params: Readonly<Record<string, string | undefined>>;
};

export interface FunnelCampaignFact {
  campaign: Pick<Campaign, "id" | "name" | "subject" | "audience" | "segmentId" | "excludeSegmentIds" | "lockedAt" | "createdAt"> & {
    keepSending?: Pick<KeepSending, "on" | "dailyCap" | "pausedAt" | "pausedReason" | "holdoutAt">;
  };
  stats: Pick<CampaignStats, "handed" | "firstSentAt" | "lastSentAt">;
}

export interface AutomaticCount {
  sent: number;
  sentLabel?: string;
  outcome: number;
  also?: readonly AutomaticAlso[];
}

export interface AutomaticAlso {
  label: string;
  count: number;
}

export type FunnelPart = "summary" | "segments" | "campaigns" | "results" | "switches";

export interface FunnelFacts {
  summary: LifecycleSummary | null;
  subscribed: Readonly<Partial<Record<LifecycleStage, number | null>>>;
  segments: readonly FunnelSegmentFact[];
  campaigns: readonly FunnelCampaignFact[];
  stageResults: readonly Record<string, unknown>[];
  automatic: Readonly<Partial<Record<string, AutomaticCount | null>>>;
  switches: Readonly<Record<FunnelSwitch, boolean>> & { checkupMonths: number; reviewRequestDays?: number };
  notRead?: readonly FunnelPart[];
}

export interface CampaignRef {
  id: string;
  name: string;
}

export type StepState =
  | { state: "on"; label: string }
  | { state: "off_in_settings"; label: string }
  | { state: "words_waiting"; label: string }
  | { state: "not_set_up"; label: string }
  | { state: "draft"; label: string }
  | { state: "started"; label: string }
  | { state: "keeps_sending"; label: string; dailyCap: number }
  | { state: "paused"; label: string; reason: string | null };

export interface FlowCampaign {
  id: string;
  name: string;
  subject: string;
  href: string;
  state: StepState;
  startedAt: string | null;
  lock: string | null;
}

export interface FollowUp {
  campaignId: string;
  did: CampaignFilterState;
}

export interface FlowStep {
  key: string;
  kind: "automatic" | "playbook" | "campaign";
  name: string;
  purpose: "service" | "marketing";
  consent: string;
  who: string;
  when: string;
  stops: string;
  state: StepState;
  href: string;
  setUpHref: string | null;
  templates: string[];
  starterId: string | null;
  campaigns: FlowCampaign[];
  after: FollowUp | null;
}

export interface FunnelSegmentView {
  id: string | null;
  name: string;
  params: Record<string, string>;
  searchHidden: boolean;
  count: number | null;
  needsReview: boolean;
  unreadable: boolean;
  notCreated: boolean;
  starterId: string | null;
  sendsTo: CampaignRef[];
  leftOutBy: CampaignRef[];
}

export type FunnelResultRow =
  | {
      kind: "campaign";
      campaignId: string;
      name: string;
      href: string;
      keepsSending: boolean;
      audience: CampaignAudience;
      numbers: ResultNumbers;
    }
  | {
      kind: "automatic";
      stepId: string;
      name: string;
      href: string;
      outcomeLabel: string;
      counted: boolean;
      sent: number | null;
      sentLabel: string;
      outcome: number | null;
      also: AutomaticAlso[];
      acrossStages: boolean;
    };

export interface FunnelStageTotals {
  campaigns: ResultNumbers;
  automaticSent: number;
  automaticAcrossStages: number;
  automaticNotCounted: number;
}

export interface FunnelStageView {
  stage: LifecycleStage;
  param: string;
  header: {
    label: string;
    rule: string;
    customers: number | null;
    subscribed: number | null;
    parts: { key: LifecyclePartKey; label: string; customers: number }[];
  };
  entry: StageEntry;
  segments: FunnelSegmentView[];
  flow: FlowStep[];
  results: {
    rows: FunnelResultRow[];
    totals: FunnelStageTotals;
    unsubscribedFrom: (CampaignRef & { unsubscribed: number })[] | null;
  };
}

export interface FunnelView {
  stages: FunnelStageView[];
  restPeriod: { days: number; maxPer30Days: number; text: string };
  resultWindowDays: number;
  notRead: FunnelPart[];
  unplaced: FlowCampaign[];
}

const namesStage = (values: readonly StageFilter[], stage: LifecycleStage) =>
  values.some((v) => v === stage || (v in LIFECYCLE_DETAIL_STAGE && LIFECYCLE_DETAIL_STAGE[v as keyof typeof LIFECYCLE_DETAIL_STAGE] === stage));

interface ReadSegment {
  fact: FunnelSegmentFact;
  stages: Set<LifecycleStage>;
  key: string | null;
  unreadable: boolean;
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

const FOLLOW_UP_STATES: ReadonlySet<CampaignFilterState> = new Set(["sent", "clicked", "not-clicked"]);

const shownParams = (params: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "search"));

const same = (a: string | null | undefined, b: string | null | undefined) => {
  const x = (a ?? "").trim().toLowerCase();
  return x !== "" && x === (b ?? "").trim().toLowerCase();
};

function playbookWords(starterId: string): { name: string; subject: string } | null {
  const w = PLAYBOOK_DRAFTS.find((p) => p.id === starterId)?.words;
  return w ? { name: w.name, subject: w.subject } : null;
}

export function campaignState(c: FunnelCampaignFact["campaign"]): StepState {
  if (!c.lockedAt) return { state: "draft", label: "Draft" };
  const k = c.keepSending;
  if (k?.on && k.pausedAt) {
    return { state: "paused", label: k.pausedReason ? `Paused: ${k.pausedReason}` : "Paused by a person", reason: k.pausedReason };
  }
  if (k?.on) return { state: "keeps_sending", label: `Keeps sending, ${k.dailyCap} a day`, dailyCap: k.dailyCap };
  return { state: "started", label: "Started" };
}

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

const byStart = (a: FunnelCampaignFact, b: FunnelCampaignFact) =>
  (a.campaign.lockedAt ?? "￿").localeCompare(b.campaign.lockedAt ?? "￿") ||
  a.campaign.createdAt.localeCompare(b.campaign.createdAt) ||
  a.campaign.id.localeCompare(b.campaign.id);

const plainFlowCampaign = (c: FunnelCampaignFact): Omit<FlowCampaign, "lock"> => ({
  id: c.campaign.id,
  name: c.campaign.name,
  subject: c.campaign.subject,
  href: campaignPath(c.campaign.id),
  state: campaignState(c.campaign),
  startedAt: c.campaign.lockedAt,
});

export interface ReadSegmentView {
  fact: FunnelSegmentFact;
  stages: ReadonlySet<LifecycleStage>;
  key: string | null;
  unreadable: boolean;
  campaign: { id: string; state: CampaignFilterState } | null;
}

export interface FunnelReading {
  campaigns: readonly FunnelCampaignFact[];
  byId: ReadonlyMap<string, FunnelCampaignFact>;
  segments: readonly ReadSegmentView[];
  segmentOf: (c: FunnelCampaignFact) => ReadSegmentView | null;
  followOf: (c: FunnelCampaignFact) => { parent: FunnelCampaignFact; did: CampaignFilterState } | null;
  stagesOf: (c: FunnelCampaignFact) => ReadonlySet<LifecycleStage>;
  playbookCampaigns: (stage: LifecycleStage) => Map<string, FunnelCampaignFact[]>;
  playbookIds: ReadonlySet<string>;
}

export function readFunnel(facts: Pick<FunnelFacts, "segments" | "campaigns"> & Partial<Pick<FunnelFacts, "switches">>): FunnelReading {
  const programme = funnelProgramme({ checkupMonths: facts.switches?.checkupMonths, reviewRequestDays: facts.switches?.reviewRequestDays });
  const segments = facts.segments.map(readSegment);
  const segmentById = new Map(segments.map((s) => [s.fact.id, s]));
  const campaigns = [...facts.campaigns].sort(byStart);

  const segmentOf = (c: FunnelCampaignFact) =>
    c.campaign.audience === "segment" && c.campaign.segmentId ? (segmentById.get(c.campaign.segmentId) ?? null) : null;

  const byId = new Map(campaigns.map((c) => [c.campaign.id, c]));

  const readsOf = (c: FunnelCampaignFact): { parent: FunnelCampaignFact; did: CampaignFilterState } | null => {
    const read = segmentOf(c)?.campaign;
    if (!read || !FOLLOW_UP_STATES.has(read.state) || read.id === c.campaign.id) return null;
    const parent = byId.get(read.id);
    return parent ? { parent, did: read.state } : null;
  };

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

  const playbookCampaigns = (stage: LifecycleStage) => {
    const steps = stage === "lost" ? [] : stepsOfStage(programme, stage);
    const inStage = campaigns.filter((c) => stagesOf(c).has(stage));
    return new Map(
      steps
        .filter((s): s is PlaybookStep => s.kind === "playbook")
        .map((p) => {
          const key = filtersKey(p.segment.filters);
          const words = playbookWords(p.starterId);
          const claims = (c: FunnelCampaignFact) =>
            APPROVED_PLAYBOOKS.has(p.starterId) &&
            key !== null &&
            segmentOf(c)?.key === key &&
            words !== null &&
            (same(c.campaign.name, words.name) || same(c.campaign.subject, words.subject));
          return [p.id, inStage.filter(claims)] as const;
        }),
    );
  };
  const playbookIds = new Set(FUNNEL_STAGES.flatMap((s) => [...playbookCampaigns(s).values()].flat().map((c) => c.campaign.id)));

  return { campaigns, byId, segments, segmentOf, followOf, stagesOf, playbookCampaigns, playbookIds };
}

export function stageFollowOf(
  r: FunnelReading,
  c: FunnelCampaignFact,
  stage: LifecycleStage,
): { parent: FunnelCampaignFact; did: CampaignFilterState } | null {
  if (!r.stagesOf(c).has(stage) || r.playbookIds.has(c.campaign.id)) return null;
  const f = r.followOf(c);
  return f && r.stagesOf(f.parent).has(stage) ? f : null;
}

export function stagesNamedBy(param: string | undefined): LifecycleStage[] {
  if (param === undefined) return [];
  const parsed = customerFiltersSchema.shape.stage.safeParse(param);
  const values = parsed.success && parsed.data ? parsed.data : [];
  return FUNNEL_STAGES.filter((s) => namesStage(values, s));
}

export function playbookCampaignsOf(r: FunnelReading, starterId: string): FunnelCampaignFact[] {
  const step = FUNNEL_PROGRAMME_STEPS.find((p) => p.kind === "playbook" && p.starterId === starterId);
  if (!step) return [];
  return [...new Set(step.stages.flatMap((st) => r.playbookCampaigns(st).get(step.id) ?? []))];
}

export function moveLock(r: FunnelReading, c: FunnelCampaignFact): string | null {
  if (c.campaign.lockedAt) return "Started: it keeps who it goes to. Duplicate it to send a copy somewhere else.";
  if (r.playbookIds.has(c.campaign.id)) return "A Playbook's draft starts its own sequence: its Segment is what makes it the Playbook. Add emails after it.";
  if (c.campaign.audience === "segment" && c.campaign.segmentId) {
    const seg = r.segmentOf(c);
    if (!seg) return "Its Segment is archived or could not be read. Choose who it goes to in the campaign first.";
    if (seg.key === null) return `Its Segment “${seg.fact.name}” needs review, so it cannot be moved until that is fixed.`;
  }
  return null;
}

export function isUnplaced(r: FunnelReading, c: FunnelCampaignFact): boolean {
  if (c.campaign.lockedAt) return false;
  if (c.campaign.audience !== "segment" || !c.campaign.segmentId) return true;
  const seg = r.segmentOf(c);
  return seg !== null && seg.key !== null && seg.stages.size === 0 && seg.campaign === null;
}

export function buildFunnel(facts: FunnelFacts): FunnelView {
  const programme = funnelProgramme({ checkupMonths: facts.switches.checkupMonths, reviewRequestDays: facts.switches.reviewRequestDays });
  const reading = readFunnel(facts);
  const { campaigns, segments, segmentOf, stagesOf } = reading;
  const ref = (c: FunnelCampaignFact): CampaignRef => ({ id: c.campaign.id, name: c.campaign.name });
  const flowCampaign = (c: FunnelCampaignFact): FlowCampaign => ({ ...plainFlowCampaign(c), lock: moveLock(reading, c) });

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

    const playbookCampaigns = reading.playbookCampaigns(stage);
    const claimed = new Set([...playbookCampaigns.values()].flat().map((c) => c.campaign.id));

    const flow: FlowStep[] =
      stage === "lost"
        ? []
        : [
            ...steps.map((s) => programmeFlowStep(s, facts.switches, (playbookCampaigns.get(s.id) ?? []).map(flowCampaign))),
            ...inStage
              .filter((c) => !claimed.has(c.campaign.id))
              .map((c): FlowStep => {
                const seg = segmentOf(c)!;
                const keeps = c.campaign.keepSending?.on === true;
                const f = stageFollowOf(reading, c, stage);
                const after = f ? { campaignId: f.parent.campaign.id, did: f.did } : null;
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

    const automaticRows = steps.flatMap((s): FunnelResultRow[] => {
      if (s.kind !== "automatic" || s.outcome === null) return [];
      const count = facts.automatic[s.id];
      const base = { kind: "automatic" as const, stepId: s.id, name: s.name, href: s.href, outcomeLabel: s.outcome, acrossStages: s.stages.length > 1 };
      if (count == null) return [{ ...base, counted: false, sent: null, sentLabel: "Emails sent", outcome: null, also: [] }];
      return count.sent > 0
        ? [
            {
              ...base,
              counted: true,
              sent: count.sent,
              sentLabel: count.sentLabel ?? "Emails sent",
              outcome: count.outcome,
              also: (count.also ?? []).map((a) => ({ ...a })),
            },
          ]
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
    unplaced: campaigns.filter((c) => isUnplaced(reading, c)).map(flowCampaign),
  };
}

function programmeFlowStep(s: ProgrammeStep, switches: FunnelFacts["switches"], matched: readonly FlowCampaign[]): FlowStep {
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
  const campaigns = [...matched];
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

export function resultRates(n: ResultNumbers): { clicked: number | null; unsubscribed: number | null; complained: number | null; bought: number | null } {
  return {
    clicked: rate(n.clicked, n.people),
    unsubscribed: rate(n.unsubscribed, n.people),
    complained: rate(n.complained, n.people),
    bought: rate(n.bought, n.people),
  };
}
