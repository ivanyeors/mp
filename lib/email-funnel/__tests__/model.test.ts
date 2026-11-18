import { describe, expect, it } from "vitest";
import { lifecycleSummary } from "@/lib/crm/lifecycle-summary";
import type { LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { NO_RESULTS } from "@/lib/email-campaigns/results";
import {
  buildFunnel,
  filtersKey,
  rate,
  resultRates,
  type FunnelCampaignFact,
  type FunnelFacts,
  type FunnelResultRow,
  type FunnelSegmentFact,
  type FunnelStageView,
} from "../model";

/**
 * The Email funnel's view (PRD-email-funnel slice 02): Segments, flow and
 * results per stage, derived from plain facts. Each case is built to fail the
 * plausible wrong version, named beside it.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const seg = (n: number, name: string, params: Record<string, string>, extra: Partial<FunnelSegmentFact> = {}): FunnelSegmentFact => ({
  id: id(n),
  name,
  params,
  count: 10,
  needsReview: false,
  ...extra,
});

type CampaignOpts = {
  audience?: FunnelCampaignFact["campaign"]["audience"];
  segment?: number;
  exclude?: number[];
  lockedAt?: string | null;
  createdAt?: string;
  keep?: { on: boolean; dailyCap?: number; pausedAt?: string | null; pausedReason?: string | null };
  firstSentAt?: string | null;
};

const camp = (n: number, name: string, o: CampaignOpts = {}): FunnelCampaignFact => ({
  campaign: {
    id: id(n),
    name,
    audience: o.audience ?? "segment",
    segmentId: o.segment != null ? id(o.segment) : null,
    excludeSegmentIds: (o.exclude ?? []).map(id),
    lockedAt: o.lockedAt === undefined ? "2026-11-01T02:00:00Z" : o.lockedAt,
    createdAt: o.createdAt ?? "2026-10-30T02:00:00Z",
    keepSending: o.keep
      ? { on: o.keep.on, dailyCap: o.keep.dailyCap ?? 20, pausedAt: o.keep.pausedAt ?? null, pausedReason: o.keep.pausedReason ?? null, holdoutAt: null }
      : undefined,
  },
  stats: { handed: 0, firstSentAt: o.firstSentAt ?? o.lockedAt ?? null, lastSentAt: null },
});

const row = (n: number, stage: string, people: number, more: Record<string, unknown> = {}) => ({
  campaign_id: id(n),
  cohort: "sent",
  stage,
  people,
  clicked: 0,
  unsubscribed: 0,
  complained: 0,
  bought: 0,
  bought_after_click: 0,
  bought_total: "0.00",
  counting: 0,
  ...more,
});

const SUMMARY = lifecycleSummary([
  { stage: "lead", detail: null, undated: false, customers: 400 },
  { stage: "new", detail: "delivered", undated: false, customers: 50 },
  { stage: "new", detail: "settled", undated: false, customers: 90 },
  { stage: "loyal", detail: "repeat_purchases", undated: false, customers: 70 },
  { stage: "at_risk", detail: null, undated: false, customers: 120 },
  { stage: "at_risk", detail: "lapsed", undated: false, customers: 80 },
  { stage: "lost", detail: null, undated: false, customers: 30 },
]);

const facts = (f: Partial<FunnelFacts> = {}): FunnelFacts => ({
  summary: SUMMARY,
  subscribed: { lead: 300, new: 120, loyal: 60, at_risk: 150, lost: 0 },
  segments: [],
  campaigns: [],
  stageResults: [],
  automatic: {},
  switches: { draftReminders: true, reviewRequests: true, checkups: true, checkupMonths: 12 },
  ...f,
});

const stageOf = (view: ReturnType<typeof buildFunnel>, s: LifecycleStage): FunnelStageView => view.stages.find((x) => x.stage === s)!;
const flowOf = (view: ReturnType<typeof buildFunnel>, s: LifecycleStage) => stageOf(view, s).flow;
const stepOf = (view: ReturnType<typeof buildFunnel>, s: LifecycleStage, key: string) => flowOf(view, s).find((x) => x.key === key)!;

// ─── The demo: five Segments, six campaigns ──────────────────────────────────

const DEMO_SEGMENTS = [
  // The We miss you Playbook's filters, in the other key order.
  seg(1, "At risk · 12 to 24 months", { last_order: "within:24", stage: "at-risk" }),
  seg(2, "At risk · Lapsed", { stage: "at-risk:lapsed" }),
  seg(3, "Lead", { stage: "lead" }),
  seg(4, "New or Loyal", { stage: "new,loyal" }),
  seg(5, "Premium owners", { bought: "premium" }),
];
const DEMO_CAMPAIGNS = [
  camp(11, "We miss you", { segment: 1, lockedAt: "2026-11-02T02:00:00Z", keep: { on: true, dailyCap: 20 } }),
  camp(12, "November news", { audience: "subscribed", lockedAt: "2026-11-03T02:00:00Z" }),
  camp(13, "Pillow care", { segment: 4, exclude: [2], lockedAt: "2026-11-04T02:00:00Z" }),
  camp(14, "How your pillow is made", { segment: 3, lockedAt: null }),
  camp(15, "Premium cover", { segment: 5, lockedAt: "2026-11-05T02:00:00Z", keep: { on: true, pausedAt: "2026-11-10T02:00:00Z", pausedReason: "Spam reports over 0.1%" } }),
  camp(16, "Draft to everyone", { audience: "subscribed", lockedAt: null }),
];
const DEMO_ROWS = [
  row(11, "at_risk", 40, { clicked: 4, bought: 2, bought_total: "240.00" }),
  row(12, "new", 100, { clicked: 10 }),
  row(12, "at_risk", 60, { clicked: 3, unsubscribed: 2 }),
  row(13, "new", 30),
  row(13, "loyal", 20),
];

describe("buildFunnel: the demo", () => {
  const view = buildFunnel(
    facts({
      segments: DEMO_SEGMENTS,
      campaigns: DEMO_CAMPAIGNS,
      stageResults: DEMO_ROWS,
      automatic: { "aftercare.checkup_reminder": { sent: 12, outcome: 3 } },
    }),
  );
  const atRisk = stageOf(view, "at_risk");

  it("gives At risk its two Segments", () => {
    expect(atRisk.segments.map((s) => s.name)).toEqual(["At risk · 12 to 24 months", "At risk · Lapsed"]);
    expect(atRisk.segments.every((s) => !s.notCreated)).toBe(true);
    expect(atRisk.segments[0].sendsTo).toEqual([{ id: id(11), name: "We miss you" }]);
    expect(atRisk.segments[1].leftOutBy).toEqual([{ id: id(13), name: "Pillow care" }]);
  });

  it("draws At risk's flow: Check-up reminder, We miss you keeping on, Welcome back not set up", () => {
    expect(atRisk.flow.map((s) => [s.name, s.state.label])).toEqual([
      ["Check-up reminder", "On"],
      ["We miss you", "Keeps sending, 20 a day"],
      ["Welcome back", "Not set up"],
    ]);
    expect(atRisk.flow[1].campaigns.map((c) => c.id)).toEqual([id(11)]);
    expect(atRisk.flow[1].href).toBe(`/settings/campaigns/${id(11)}`);
    expect(atRisk.flow[2].setUpHref).toBe("/settings/campaigns/new?starter=playbook_welcome_back");
    expect(atRisk.entry.sunsetRule).toBe(true);
  });

  it("gives a results row per email that reached At risk", () => {
    expect(atRisk.results.rows.map((r) => (r.kind === "campaign" ? r.name : r.stepId))).toEqual([
      "aftercare.checkup_reminder",
      "We miss you",
      "November news",
    ]);
    const missYou = atRisk.results.rows[1] as Extract<FunnelResultRow, { kind: "campaign" }>;
    expect(missYou.keepsSending).toBe(true);
    expect(missYou.numbers).toMatchObject({ people: 40, clicked: 4, bought: 2, boughtTotal: 240 });
    expect(atRisk.results.totals.campaigns.people).toBe(100);
    expect(atRisk.results.totals.automaticSent).toBe(12);
  });

  it("heads each stage with its Customers, subscribed and sub-statuses", () => {
    expect(view.stages.map((s) => s.param)).toEqual(["lead", "new", "loyal", "at-risk", "lost"]);
    expect(atRisk.header).toMatchObject({ label: "At risk", customers: 200, subscribed: 150 });
    expect(atRisk.header.parts.map((p) => [p.label, p.customers])).toEqual([
      ["12 to 24 months", 120],
      ["Lapsed", 80],
    ]);
  });

  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view);
  });
});

// ─── Segments by stage ───────────────────────────────────────────────────────

describe("Segments by stage", () => {
  const view = buildFunnel(facts({ segments: [seg(1, "Lapsed", { stage: "at-risk:lapsed" }), seg(2, "New or Loyal", { stage: "new,loyal" })] }));
  const names = (s: LifecycleStage) => stageOf(view, s).segments.filter((x) => !x.notCreated).map((x) => x.name);

  it("lists a sub-status's Segment under its stage, and nowhere else", () => {
    expect(names("at_risk")).toEqual(["Lapsed"]);
    expect(names("lead")).toEqual([]);
  });

  it("lists a Segment of two stages under both", () => {
    expect(names("new")).toEqual(["New or Loyal"]);
    expect(names("loyal")).toEqual(["New or Loyal"]);
    expect(names("lost")).toEqual([]);
  });

  it("lists a Playbook's missing Segment as Not created, with the Playbook's name for it", () => {
    const missing = stageOf(view, "at_risk").segments.filter((x) => x.notCreated);
    expect(missing.map((x) => [x.name, x.starterId, x.id])).toEqual([["At risk · 12 to 24 months", "playbook_we_miss_you", null]]);
    // The Lapsed Segment exists, so Welcome back's is not Not created.
    expect(missing.some((x) => x.starterId === "playbook_welcome_back")).toBe(false);
  });

  it("flags a Segment that needs review or does not parse, and never matches it to a Playbook", () => {
    const v = buildFunnel(
      facts({
        segments: [
          seg(1, "Old lapsed", { stage: "at-risk:lapsed" }, { needsReview: true }),
          seg(2, "Broken", { stage: "at-risk", last_order: "within:999999" }),
        ],
        campaigns: [camp(11, "Welcome back", { segment: 1 }), camp(12, "We miss you", { segment: 2 })],
      }),
    );
    const s = stageOf(v, "at_risk");
    expect(s.segments.filter((x) => !x.notCreated).map((x) => [x.name, x.needsReview, x.unreadable])).toEqual([
      ["Old lapsed", true, false],
      ["Broken", false, true],
    ]);
    expect(stepOf(v, "at_risk", "at_risk.welcome_back").state.state).toBe("not_set_up");
    expect(stepOf(v, "at_risk", "at_risk.we_miss_you").state.state).toBe("not_set_up");
  });
});

// ─── Set up: same filters, any key order ─────────────────────────────────────

describe("a Playbook is set up by its Segment's filters", () => {
  const withSegment = (params: Record<string, string>) =>
    buildFunnel(facts({ segments: [seg(1, "Renamed by Staff", params)], campaigns: [camp(11, "Second purchase", { segment: 1 })] }));

  it("is set up when the stored filters are the Playbook's in another key order", () => {
    const step = stepOf(withSegment({ delivered: "over:60", stage: "new" }), "new", "new.second_purchase");
    expect(step.state.state).toBe("started");
    expect(step.campaigns.map((c) => c.id)).toEqual([id(11)]);
  });

  it("is not set up when one filter differs", () => {
    const view = withSegment({ delivered: "over:30", stage: "new" });
    const step = stepOf(view, "new", "new.second_purchase");
    expect(step.state.state).toBe("not_set_up");
    expect(step.campaigns).toEqual([]);
    // The campaign is still in the flow, as one Staff wrote.
    expect(flowOf(view, "new").some((s) => s.key === `campaign:${id(11)}`)).toBe(true);
  });

  it("compares through the schema: order and canonical forms agree, a different value does not", () => {
    expect(filtersKey("stage=new&delivered=over:60")).toBe(filtersKey({ delivered: "over:60", stage: "new" }));
    expect(filtersKey("stage=at-risk,at-risk:lapsed")).toBe(filtersKey("stage=at-risk"));
    expect(filtersKey("stage=new&delivered=over:30")).not.toBe(filtersKey("stage=new&delivered=over:60"));
    expect(filtersKey("stage=nowhere")).toBeNull();
    expect(filtersKey("sort=oldest&stage=new")).toBeNull();
  });
});

// ─── The states ──────────────────────────────────────────────────────────────

describe("each step's state", () => {
  const segments = [
    seg(1, "Lead", { stage: "lead" }),
    seg(2, "Loyal", { stage: "loyal" }),
    seg(3, "We miss you", { stage: "at-risk", last_order: "within:24" }),
    seg(4, "Lapsed", { stage: "at-risk:lapsed" }),
  ];
  const state = (campaigns: FunnelCampaignFact[], stage: LifecycleStage, key: string) =>
    stepOf(buildFunnel(facts({ segments, campaigns })), stage, key).state;

  it("Words waiting for the owner: an unapproved Playbook, never Not set up, even with no campaign", () => {
    expect(state([], "lead", "lead.how_its_made")).toEqual({ state: "words_waiting", label: "Words waiting for the owner" });
    const step = stepOf(buildFunnel(facts({ segments })), "lead", "lead.how_its_made");
    expect(step.setUpHref).toBeNull();
  });

  it("Not set up: an approved Playbook with no campaign, linked to New campaign from it", () => {
    const step = stepOf(buildFunnel(facts({ segments })), "loyal", "loyal.thank_you");
    expect(step.state).toEqual({ state: "not_set_up", label: "Not set up" });
    expect(step.setUpHref).toBe("/settings/campaigns/new?starter=playbook_thank_you");
  });

  it("Draft, then Started", () => {
    expect(state([camp(11, "Thanks", { segment: 2, lockedAt: null })], "loyal", "loyal.thank_you").state).toBe("draft");
    expect(state([camp(11, "Thanks", { segment: 2 })], "loyal", "loyal.thank_you").state).toBe("started");
  });

  it("Keeps sending, n a day", () => {
    expect(state([camp(11, "Miss you", { segment: 3, keep: { on: true, dailyCap: 35 } })], "at_risk", "at_risk.we_miss_you")).toEqual({
      state: "keeps_sending",
      label: "Keeps sending, 35 a day",
      dailyCap: 35,
    });
  });

  it("Paused, carrying its reason; or paused by a person", () => {
    const why = "Bounces over 2% in the last Wave";
    expect(
      state([camp(11, "Back", { segment: 4, keep: { on: true, pausedAt: "2026-11-10T00:00:00Z", pausedReason: why } })], "at_risk", "at_risk.welcome_back"),
    ).toEqual({ state: "paused", label: `Paused: ${why}`, reason: why });
    expect(
      state([camp(11, "Back", { segment: 4, keep: { on: true, pausedAt: "2026-11-10T00:00:00Z" } })], "at_risk", "at_risk.welcome_back"),
    ).toEqual({ state: "paused", label: "Paused by a person", reason: null });
  });

  it("an unapproved Playbook stays waiting with a campaign to its Segment, which is listed under it", () => {
    const step = stepOf(buildFunnel(facts({ segments, campaigns: [camp(11, "Made", { segment: 1 })] })), "lead", "lead.how_its_made");
    expect(step.state.state).toBe("words_waiting");
    expect(step.campaigns.map((c) => c.id)).toEqual([id(11)]);
  });

  it("lists every matching campaign oldest started first, the step reading the furthest along", () => {
    const step = stepOf(
      buildFunnel(
        facts({
          segments,
          campaigns: [
            camp(12, "Later", { segment: 2, lockedAt: "2026-11-05T00:00:00Z", keep: { on: true } }),
            camp(13, "Draft", { segment: 2, lockedAt: null, createdAt: "2026-10-01T00:00:00Z" }),
            camp(11, "Earlier", { segment: 2, lockedAt: "2026-11-01T00:00:00Z" }),
          ],
        }),
      ),
      "loyal",
      "loyal.thank_you",
    );
    expect(step.campaigns.map((c) => c.name)).toEqual(["Earlier", "Later", "Draft"]);
    expect(step.state.state).toBe("keeps_sending");
  });

  it("an Automatic step is Off in settings by its switch; a Service step without one is always On", () => {
    const view = buildFunnel(facts({ switches: { draftReminders: false, reviewRequests: false, checkups: false, checkupMonths: 12 } }));
    expect(stepOf(view, "lead", "lead.draft_reminders").state.state).toBe("off_in_settings");
    expect(stepOf(view, "new", "new.review_request").state.state).toBe("off_in_settings");
    expect(stepOf(view, "loyal", "aftercare.checkup_reminder").state.state).toBe("off_in_settings");
    expect(stepOf(view, "lead", "lead.quote_emails").state.state).toBe("on");
    expect(stepOf(view, "new", "new.order_emails").state.state).toBe("on");
    expect(stepOf(view, "lead", "lead.draft_reminders").href).toBe("/settings/general");
  });

  it("times the Check-up from the switches' months", () => {
    const view = buildFunnel(facts({ switches: { draftReminders: true, reviewRequests: true, checkups: true, checkupMonths: 18 } }));
    expect(stepOf(view, "at_risk", "aftercare.checkup_reminder").when).toBe("Every 18 months after delivery");
  });
});

// ─── Everyone subscribed ─────────────────────────────────────────────────────

describe("a campaign to everyone subscribed", () => {
  const view = buildFunnel(
    facts({
      campaigns: [camp(12, "November news", { audience: "subscribed" })],
      stageResults: [row(12, "new", 100), row(12, "at_risk", 60)],
    }),
  );

  it("is in no stage's flow", () => {
    for (const s of view.stages) expect(s.flow.some((x) => x.key === `campaign:${id(12)}`), s.stage).toBe(false);
  });

  it("is in the results of exactly the stages its rows name, flagged one-off", () => {
    const has = view.stages.filter((s) => s.results.rows.some((r) => r.kind === "campaign" && r.campaignId === id(12))).map((s) => s.stage);
    expect(has).toEqual(["new", "at_risk"]);
    const r = stageOf(view, "new").results.rows.find((x) => x.kind === "campaign") as Extract<FunnelResultRow, { kind: "campaign" }>;
    expect(r.keepsSending).toBe(false);
    expect(r.numbers.people).toBe(100);
  });
});

// ─── Follow-ups ──────────────────────────────────────────────────────────────

describe("a follow-up", () => {
  it("hangs under the campaign of the stage its Segment reads", () => {
    const view = buildFunnel(
      facts({
        segments: [
          seg(1, "We miss you", { stage: "at-risk", last_order: "within:24" }),
          seg(2, "Got We miss you, didn't click", { stage: "at-risk", campaign: `${id(11)}:not-clicked` }),
        ],
        campaigns: [camp(11, "We miss you", { segment: 1, keep: { on: true } }), camp(12, "Second nudge", { segment: 2, lockedAt: "2026-11-09T00:00:00Z" })],
      }),
    );
    const followUp = stepOf(view, "at_risk", `campaign:${id(12)}`);
    expect(followUp.after).toEqual({ campaignId: id(11), did: "not-clicked" });
    expect(followUp.kind).toBe("campaign");
    expect(stepOf(view, "at_risk", "at_risk.we_miss_you").after).toBeNull();
  });

  it("hangs under nothing when the campaign it reads is not of the stage", () => {
    const view = buildFunnel(
      facts({
        segments: [seg(1, "Premium", { bought: "premium" }), seg(2, "Got it", { stage: "at-risk", campaign: `${id(11)}:sent` })],
        campaigns: [camp(11, "Premium news", { segment: 1 }), camp(12, "Follow", { segment: 2 })],
      }),
    );
    expect(stepOf(view, "at_risk", `campaign:${id(12)}`).after).toBeNull();
  });
});

// ─── Numbers ─────────────────────────────────────────────────────────────────

describe("results numbers", () => {
  it("adds only the sent cohort: held out and sent since the holdout are not people sent", () => {
    const view = buildFunnel(
      facts({
        campaigns: [camp(11, "Miss you", { audience: "subscribed", keep: { on: true } })],
        stageResults: [
          row(11, "at_risk", 90, { bought: 9 }),
          { ...row(11, "at_risk", 10, { bought: 0 }), cohort: "held_out" },
          { ...row(11, "at_risk", 50, { bought: 5 }), cohort: "sent_since_holdout" },
        ],
      }),
    );
    const s = stageOf(view, "at_risk");
    const rows = s.results.rows.filter((r): r is Extract<FunnelResultRow, { kind: "campaign" }> => r.kind === "campaign");
    expect(rows).toHaveLength(1);
    expect(rows[0].numbers).toMatchObject({ people: 90, bought: 9 });
    expect(s.results.totals.campaigns).toMatchObject({ people: 90, bought: 9 });
  });

  it("puts a row of stage unknown in no stage", () => {
    const view = buildFunnel(facts({ campaigns: [camp(11, "Old", { audience: "subscribed" })], stageResults: [row(11, "unknown", 25)] }));
    for (const s of view.stages) expect(s.results.rows.filter((r) => r.kind === "campaign"), s.stage).toEqual([]);
  });

  it("gives null rates when nobody was sent, never NaN", () => {
    expect(rate(0, 0)).toBeNull();
    expect(resultRates(NO_RESULTS)).toEqual({ clicked: null, unsubscribed: null, complained: null, bought: null });
    const lead = stageOf(buildFunnel(facts()), "lead");
    expect(lead.results.totals.campaigns.people).toBe(0);
    expect(Object.values(resultRates(lead.results.totals.campaigns)).every((r) => r === null)).toBe(true);
    expect(resultRates({ ...NO_RESULTS, people: 4, clicked: 1 }).clicked).toBe(0.25);
  });

  it("shows a missing Automatic count as not counted, not 0", () => {
    const view = buildFunnel(facts({ automatic: { "new.review_request": { sent: 30, outcome: 6 }, "lead.draft_reminders": null } }));
    const lead = stageOf(view, "lead").results.rows.find((r) => r.kind === "automatic" && r.stepId === "lead.draft_reminders");
    expect(lead).toMatchObject({ counted: false, sent: null, outcome: null, outcomeLabel: "Drafts finished afterwards" });
    const review = stageOf(view, "new").results.rows.find((r) => r.kind === "automatic" && r.stepId === "new.review_request");
    expect(review).toMatchObject({ counted: true, sent: 30, outcome: 6 });
    // Absent from the facts altogether reads the same as a failed read.
    const checkup = stageOf(view, "loyal").results.rows.find((r) => r.kind === "automatic" && r.stepId === "aftercare.checkup_reminder");
    expect(checkup).toMatchObject({ counted: false, sent: null, acrossStages: true });
    expect(stageOf(view, "lead").results.totals).toMatchObject({ automaticSent: 0, automaticNotCounted: 1 });
    // Service emails show no numbers.
    expect(stageOf(view, "new").results.rows.some((r) => r.kind === "automatic" && r.stepId === "new.order_emails")).toBe(false);
  });

  it("carries an Automatic email's other counts, and none when not counted", () => {
    const view = buildFunnel(
      facts({
        automatic: {
          "new.review_request": { sent: 30, outcome: 6, also: [{ label: "Reviews linked", count: 2 }] },
          "lead.draft_reminders": null,
        },
      }),
    );
    const review = stageOf(view, "new").results.rows.find((r) => r.kind === "automatic" && r.stepId === "new.review_request");
    expect(review).toMatchObject({ also: [{ label: "Reviews linked", count: 2 }] });
    const lead = stageOf(view, "lead").results.rows.find((r) => r.kind === "automatic" && r.stepId === "lead.draft_reminders");
    expect(lead).toMatchObject({ counted: false, also: [] });
  });
});

describe("a part not read", () => {
  it("leaves the stage counts null, not 0, when the summary was not read", () => {
    const view = buildFunnel(facts({ summary: null }));
    expect(view.stages.map((s) => s.header.customers)).toEqual([null, null, null, null, null]);
    expect(stageOf(buildFunnel(facts()), "lead").header.customers).toBe(400);
  });

  it("names the parts not read, and none by default", () => {
    expect(buildFunnel(facts()).notRead).toEqual([]);
    expect(buildFunnel(facts({ notRead: ["segments", "results"] })).notRead).toEqual(["segments", "results"]);
  });
});

// ─── Lost ────────────────────────────────────────────────────────────────────

describe("Lost", () => {
  const view = buildFunnel(
    facts({
      segments: [seg(1, "Lost", { stage: "lost" })],
      campaigns: [camp(11, "A", { audience: "subscribed" }), camp(12, "B", { audience: "subscribed" }), camp(13, "C", { segment: 1 })],
      stageResults: [
        row(11, "new", 100, { unsubscribed: 1 }),
        row(11, "at_risk", 50, { unsubscribed: 1 }),
        row(12, "lead", 80, { unsubscribed: 5 }),
        { ...row(12, "lead", 9, { unsubscribed: 9 }), cohort: "held_out" },
      ],
    }),
  );
  const lost = stageOf(view, "lost");

  it("has no steps, and says nothing is sent", () => {
    expect(lost.flow).toEqual([]);
    expect(lost.entry.nothingSent).toMatch(/Nothing is sent/);
  });

  it("lists campaigns by the people who unsubscribed from them, every stage added, most first", () => {
    expect(lost.results.unsubscribedFrom).toEqual([
      { id: id(12), name: "B", unsubscribed: 5 },
      { id: id(11), name: "A", unsubscribed: 2 },
    ]);
    expect(stageOf(view, "new").results.unsubscribedFrom).toBeNull();
  });
});
