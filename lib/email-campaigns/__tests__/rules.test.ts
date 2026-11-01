import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_COLUMNS,
  CAMPAIGN_PLACEHOLDERS,
  CAMPAIGN_RULE_BLOCKERS,
  CampaignDraftSchema,
  CampaignPreviewSchema,
  EMPTY_CAMPAIGN_DRAFT,
  FIRST_CAMPAIGN_DRAFT,
  MAX_EXCLUDED_SEGMENTS,
  REST_DAYS,
  REST_MAX_PER_30_DAYS,
  REST_PERIOD_TEXT,
  REST_WINDOW_DAYS,
  campaignFromRow,
  campaignLedgerKey,
  campaignRowFromDraft,
  candidateFromRow,
  composedCampaignBlocker,
  excludeSegmentMembers,
  mentionsPoints,
  newCampaignDraft,
  nextWaveLabel,
  planCampaignWave,
  restUntil,
  variablesInEmail,
  type CampaignAudience,
  type CampaignCandidate,
  type CampaignSendStatus,
} from "../rules";
import type { EmailBlock } from "../content";
import { isUnengaged, latestCampaignEngagement } from "@/lib/crm/engagement";
import { lifecycleDetail, lifecycleStage } from "@/lib/crm/lifecycle-stage";
import { monthsBefore } from "@/lib/crm/months";

type Case = {
  name: string;
  audience: CampaignAudience;
  retryFailed?: boolean;
  includeUnengaged?: boolean;
  customer: {
    migrated?: boolean;
    claimed?: boolean;
    marketing_email: "subscribed" | "not_subscribed" | "unsubscribed";
    suppressedBy?: string;
    own?: CampaignSendStatus;
    recent?: { daysAgo: number; kind?: "campaign" | "points_expiry" | "transactional"; status?: CampaignSendStatus }[];
    engagement?: { stage: "lead" | "new" | "at_risk" | "lapsed"; customerMonths?: number; campaigns: ("sent" | "clicked" | "held_out")[] };
  };
  expected: string | null;
};

const DAY = 86_400_000;
/** Each `engagement.stage`'s one purchase, in months before now, as the SQL assert inserts it. */
const PURCHASE_MONTHS = { lead: null, new: 2, at_risk: 18, lapsed: 30 } as const;

/**
 * Slice 12: the overview's `unengaged` for a case, through the TypeScript
 * twins (`lifecycleStage`, `isUnengaged`), from the rows the SQL assert
 * inserts: a purchase for the stage, the Customer's age, and every campaign
 * send of theirs the provider accepted, newest first (the case's `campaigns`,
 * its other campaigns in `recent`, and this one's `own`).
 */
function unengagedOf(c: Case, now: Date): boolean {
  const e = c.customer.engagement;
  const months = e ? PURCHASE_MONTHS[e.stage] : null;
  const lastPurchaseAt = months == null ? null : monthsBefore(now, months).toISOString();
  const facts = {
    purchases: lastPurchaseAt ? 1 : 0,
    lastPurchaseAt,
    bookings: 0,
    lastBookingAt: null,
    // The assert dates the consent 30 days ago.
    unsubscribedAt: c.customer.marketing_email === "unsubscribed" ? new Date(now.getTime() - 30 * DAY).toISOString() : null,
    lastPurchaseDeliveredAt: null,
  };
  const accepted = (status: string | undefined) => ["sent", "bounced", "complained"].includes(status ?? "sent");
  const sends = [
    ...(e?.campaigns ?? []).flatMap((x, k) => (x === "held_out" ? [] : [{ daysAgo: 40 + k, clicked: x === "clicked" }])),
    ...(c.customer.recent ?? []).filter((r) => (r.kind ?? "campaign") === "campaign" && accepted(r.status)).map((r) => ({ daysAgo: r.daysAgo, clicked: false })),
    ...(c.customer.own && accepted(c.customer.own) ? [{ daysAgo: 0, clicked: false }] : []),
  ].sort((a, b) => a.daysAgo - b.daysAgo);
  return isUnengaged(
    {
      stage: lifecycleStage(facts, now),
      detail: lifecycleDetail(facts, now),
      customerSince: monthsBefore(now, e?.customerMonths ?? 0).toISOString(),
      ...latestCampaignEngagement(sends.map((x) => x.clicked)),
    },
    now,
  );
}

/**
 * The `marketing_recent` the view would give for a case's other email: every
 * campaign send but a failed or held-out one, and points-expiry reminders;
 * never an order email. The SQL assert inserts the raw rows instead, so the view's filter is
 * held to these too.
 */
const recentOf = (c: Case, now: Date) =>
  (c.customer.recent ?? [])
    .filter((r) => (r.kind ?? "campaign") === "points_expiry" || ((r.kind ?? "campaign") === "campaign" && r.status !== "failed" && r.status !== "held_out"))
    .map((r) => new Date(now.getTime() - r.daysAgo * 86_400_000).toISOString());

const CASES = JSON.parse(
  readFileSync(join(process.cwd(), "supabase/tests/email-marketing/campaign-rule-cases.json"), "utf8"),
) as { cases: Case[] };

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261021100000_email_campaigns.sql"), "utf8");
/** The rule's latest definition: the rest period's (PRD-campaign-audiences slice 07). */
const RULE_MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261031144935_campaign_rest_period.sql"), "utf8");
/** The rule's latest definition: slice 12 added `unengaged`. */
const BLOCKER_MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261101081436_campaign_unengaged.sql"), "utf8");

const NOW = new Date("2026-10-31T04:00:00.000Z");

describe("composedCampaignBlocker: campaign-rule-cases.json", () => {
  it("has the cases", () => expect(CASES.cases.length).toBeGreaterThanOrEqual(20));

  it.each(CASES.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const own = c.customer.own ?? null;
    const suppressed =
      c.customer.suppressedBy === "bounced" ||
      c.customer.suppressedBy === "complained" ||
      own === "bounced" ||
      own === "complained";
    expect(
      composedCampaignBlocker(
        c.audience,
        {
          migrated: Boolean(c.customer.migrated),
          claimedAt: c.customer.claimed ? "2026-10-20T00:00:00Z" : null,
          marketingEmail: c.customer.marketing_email,
          suppressed,
          own: own ? { status: own, wave: "cases", sentAt: "2026-10-20T00:00:00Z" } : null,
          recentMarketing: recentOf(c, NOW),
          unengaged: unengagedOf(c, NOW),
        },
        { retryFailed: c.retryFailed, now: NOW, includeUnengaged: c.includeUnengaged },
      ),
    ).toBe(c.expected);
  });

  it("never lets anyone unsubscribed or never subscribed through, whatever the audience", () => {
    for (const audience of ["imported_not_signed_in", "subscribed", "segment"] as const) {
      for (const marketingEmail of ["unsubscribed", "not_subscribed"] as const) {
        for (const retryFailed of [false, true]) {
          expect(
            composedCampaignBlocker(audience, { migrated: true, claimedAt: null, marketingEmail, suppressed: false, own: null }, { retryFailed }),
          ).not.toBeNull();
        }
      }
    }
  });

  it("names the same reasons, in the same order, as marketing_campaign_blocker()", () => {
    const fn = BLOCKER_MIGRATION.slice(BLOCKER_MIGRATION.indexOf("function public.marketing_campaign_blocker"));
    const sqlOrder = CAMPAIGN_RULE_BLOCKERS.map((b) => fn.indexOf(`'${b}'`));
    expect(sqlOrder.every((i) => i > 0)).toBe(true);
    expect([...sqlOrder].sort((a, b) => a - b)).toEqual(sqlOrder);
  });

  it("keys a campaign's sends as the ledger's check does", () => {
    expect(campaignLedgerKey("abc")).toBe("campaign:abc");
    expect(MIGRATION).toContain("template = 'campaign:' || campaign_id::text");
  });
});

const SEGMENT = "3f2b6c1e-8d4a-4f0b-9c7e-1a2b3c4d5e6f";

describe("CampaignDraftSchema", () => {
  it("accepts the first campaign's draft as it is", () => {
    expect(CampaignDraftSchema.parse(FIRST_CAMPAIGN_DRAFT)).toEqual(FIRST_CAMPAIGN_DRAFT);
  });

  it("trims, and stores an empty preview line as none", () => {
    const d = CampaignDraftSchema.parse({ ...FIRST_CAMPAIGN_DRAFT, name: "  News  ", preheader: "   " });
    expect(d.name).toBe("News");
    expect(d.preheader).toBeNull();
  });

  it("needs a Segment for the Segment audience, and drops one for any other", () => {
    expect(CampaignDraftSchema.safeParse({ ...FIRST_CAMPAIGN_DRAFT, audience: "segment", segmentId: null }).success).toBe(false);
    expect(CampaignDraftSchema.parse({ ...FIRST_CAMPAIGN_DRAFT, audience: "segment", segmentId: SEGMENT }).segmentId).toBe(SEGMENT);
    expect(CampaignDraftSchema.parse({ ...FIRST_CAMPAIGN_DRAFT, audience: "subscribed", segmentId: SEGMENT }).segmentId).toBeNull();
  });

  it("takes a link button's link as https only, and keeps none for the sign-in button", () => {
    const link = (url: string | null) =>
      CampaignDraftSchema.safeParse({ ...FIRST_CAMPAIGN_DRAFT, button: { target: "url", label: "Shop", url } });
    expect(link("https://custom.mpillow.com/shop").success).toBe(true);
    for (const bad of [null, "", "http://custom.mpillow.com", "javascript:alert(1)", "custom.mpillow.com"]) {
      expect(link(bad).success, String(bad)).toBe(false);
    }
    const signIn = CampaignDraftSchema.parse({ ...FIRST_CAMPAIGN_DRAFT, button: { target: "sign_in", label: "Sign in", url: "https://x.test" } });
    expect(signIn.button).toEqual({ target: "sign_in", label: "Sign in", url: null });
  });

  it("refuses an empty subject or body", () => {
    expect(CampaignDraftSchema.safeParse({ ...FIRST_CAMPAIGN_DRAFT, subject: "  " }).success).toBe(false);
    expect(CampaignDraftSchema.safeParse({ ...FIRST_CAMPAIGN_DRAFT, body: "\n\n" }).success).toBe(false);
  });

  it("round-trips through the table's columns", () => {
    const row = { id: "c1", ...campaignRowFromDraft(FIRST_CAMPAIGN_DRAFT), created_at: "t", updated_at: "t", locked_at: null, archived_at: null, creator: { name: "Ivan" } };
    const back = campaignFromRow(row);
    expect(back).toMatchObject({ ...FIRST_CAMPAIGN_DRAFT, id: "c1", createdBy: "Ivan", lockedAt: null });
  });
});

describe("placeholders, not prefilled words (PRD-campaign-email-editor slice 01)", () => {
  const SEGMENTS = [
    { id: SEGMENT, name: "Premium, lapsed", needsReview: false },
    { id: "5e000000-0000-4000-8000-000000000002", name: "Old region", needsReview: true },
  ];

  it("opens every new campaign empty, with no button and the greeting on, in today's default audience", () => {
    for (const param of [undefined, "", "not-a-uuid", "5e000000-0000-4000-8000-000000000099", SEGMENTS[1].id, [""]]) {
      expect(newCampaignDraft(param, SEGMENTS), String(param)).toEqual({
        name: "",
        subject: "",
        preheader: null,
        body: "",
        // Written in blocks, none yet (slice 03).
        content: { v: 1, blocks: [], fallbacks: {} },
        greeting: true,
        button: null,
        audience: "imported_not_signed_in",
        segmentId: null,
        excludeSegmentIds: [],
        includeUnengaged: false,
      });
    }
    expect(EMPTY_CAMPAIGN_DRAFT.audience).toBe(FIRST_CAMPAIGN_DRAFT.audience);
  });

  it("keeps the Segment start: empty, sent to the Segment, named after it", () => {
    expect(newCampaignDraft(SEGMENT, SEGMENTS)).toEqual({ ...EMPTY_CAMPAIGN_DRAFT, name: "Premium, lapsed", audience: "segment", segmentId: SEGMENT });
  });

  it("never saves an empty field: each is today's field error, not its placeholder", () => {
    const errorsOf = (input: unknown) => {
      const r = CampaignDraftSchema.safeParse(input);
      expect(r.success).toBe(false);
      return Object.fromEntries(r.error!.issues.map((i) => [i.path.join("."), i.message]));
    };
    expect(errorsOf(EMPTY_CAMPAIGN_DRAFT)).toEqual({
      name: "Give the campaign a name.",
      subject: "Write a subject.",
      "content.blocks": "Add a block to the email.",
    });
    expect(errorsOf({ ...EMPTY_CAMPAIGN_DRAFT, content: null })).toEqual({
      name: "Give the campaign a name.",
      subject: "Write a subject.",
      body: "Write the email.",
    });
    const noLabel = CampaignDraftSchema.safeParse({ ...FIRST_CAMPAIGN_DRAFT, button: { target: "sign_in", label: "", url: null } });
    expect(noLabel.error?.issues.map((i) => i.message)).toEqual(["Give the button a label."]);
  });

  it("saves only what was typed: an empty preview line is none, and no placeholder reaches the row", () => {
    const typed = CampaignDraftSchema.parse({ ...EMPTY_CAMPAIGN_DRAFT, content: null, name: "December", subject: "Hello", preheader: "", body: "Hi" });
    const row = JSON.stringify(campaignRowFromDraft(typed));
    expect(campaignRowFromDraft(typed)).toMatchObject({ name: "December", subject: "Hello", preheader: null, body: "Hi", button_label: null });
    for (const hint of Object.values(CAMPAIGN_PLACEHOLDERS)) expect(row).not.toContain(hint);
  });

  it("previews an empty email, with the same checks on everything else", () => {
    expect(CampaignPreviewSchema.parse(EMPTY_CAMPAIGN_DRAFT)).toEqual(EMPTY_CAMPAIGN_DRAFT);
    expect(CampaignPreviewSchema.parse({ ...EMPTY_CAMPAIGN_DRAFT, content: null, button: { target: "sign_in", label: "", url: null } }).button).toEqual({
      target: "sign_in",
      label: "",
      url: null,
    });
    expect(CampaignPreviewSchema.safeParse({ ...EMPTY_CAMPAIGN_DRAFT, subject: "x".repeat(151) }).success).toBe(false);
    expect(CampaignPreviewSchema.safeParse({ ...EMPTY_CAMPAIGN_DRAFT, content: null, button: { target: "url", label: "", url: "http://x.test" } }).success).toBe(false);
    expect(CampaignPreviewSchema.safeParse({ ...EMPTY_CAMPAIGN_DRAFT, audience: "segment" }).success).toBe(false);
  });

  it("keeps a placeholder a hint: none could pass for finished words", () => {
    expect(CAMPAIGN_PLACEHOLDERS.subject).toMatch(/^e\.g\. /);
    expect(CAMPAIGN_PLACEHOLDERS.preheader).toMatch(/^e\.g\. /);
    expect(CAMPAIGN_PLACEHOLDERS.name).toMatch(/^e\.g\. /);
    expect(CAMPAIGN_PLACEHOLDERS.buttonLabel).toMatch(/^e\.g\. /);
  });
});

const cand = (over: Partial<CampaignCandidate> & { customerId: string }): CampaignCandidate => ({
  email: `${over.customerId}@x.test`,
  firstName: null,
  marketingEmail: "subscribed",
  migrated: true,
  claimedAt: null,
  ordersCount: 0,
  since: "2026-10-10T00:00:00Z",
  suppressed: false,
  own: null,
  locale: "en-US",
  ...over,
});

describe("planCampaignWave", () => {
  const list = [
    cand({ customerId: "a", since: "2026-10-01T00:00:00Z" }),
    cand({ customerId: "b", ordersCount: 2, since: "2026-09-01T00:00:00Z" }),
    cand({ customerId: "c", since: "2026-10-05T00:00:00Z" }),
    cand({ customerId: "d", marketingEmail: "unsubscribed" }),
    cand({ customerId: "e", claimedAt: "2026-10-12T00:00:00Z" }),
    cand({ customerId: "f", own: { status: "sent", wave: "w1", sentAt: "t" } }),
    cand({ customerId: "g", own: { status: "failed", wave: "w1", sentAt: "t" } }),
    cand({ customerId: "h", migrated: false }),
  ];

  it("puts buyers first, then the newest, and takes the wave's size", () => {
    const plan = planCampaignWave("imported_not_signed_in", list, { size: 2 });
    expect(plan.selection.map((c) => c.customerId)).toEqual(["b", "c"]);
    expect(plan.eligible).toBe(3);
    expect(plan.eligibleBuyers).toBe(1);
    expect(plan.considered).toBe(8);
    expect(plan.excluded).toEqual({ unsubscribed: 1, claimed: 1, already_sent: 1, failed: 1, not_migrated: 1 });
    expect(plan.alreadySent).toBe(1);
    expect(plan.failed).toBe(1);
  });

  it("takes the Claimed and the never-imported for an audience that is not the import", () => {
    const plan = planCampaignWave("subscribed", list, { size: 100 });
    expect(plan.selection.map((c) => c.customerId).sort()).toEqual(["a", "b", "c", "e", "h"]);
  });

  it("retries only this campaign's failures", () => {
    const plan = planCampaignWave("imported_not_signed_in", list, { size: 100, retryFailed: true });
    expect(plan.selection.map((c) => c.customerId)).toEqual(["g"]);
    expect(plan.excluded.not_failed).toBe(3);
  });

  it("never plans more than the largest wave", () => {
    const many = Array.from({ length: 1500 }, (_, i) => cand({ customerId: `x${String(i).padStart(4, "0")}` }));
    expect(planCampaignWave("subscribed", many, { size: 5000 }).selection).toHaveLength(1000);
    expect(planCampaignWave("subscribed", many, { size: 0 }).selection).toHaveLength(0);
  });
});

describe("nextWaveLabel", () => {
  it("counts on from the waves there are", () => {
    expect(nextWaveLabel([])).toBe("w1");
    expect(nextWaveLabel(["w1", "w2"])).toBe("w3");
    expect(nextWaveLabel(["w1", "w3"])).toBe("w4");
  });
});

describe("planCampaignWave counts who reads the site in Chinese (PRD-campaign-email-editor slice 17)", () => {
  it("of everyone who can get it, and of the wave", () => {
    const list = [
      cand({ customerId: "a", locale: "zh-CN", ordersCount: 1 }),
      cand({ customerId: "b" }),
      cand({ customerId: "c", locale: "zh-CN" }),
      cand({ customerId: "d", locale: "zh-CN", marketingEmail: "unsubscribed" }),
    ];
    const plan = planCampaignWave("subscribed", list, { size: 2 });
    expect(plan.selection.map((c) => c.customerId)).toEqual(["a", "b"]);
    expect({ eligible: plan.eligible, eligibleChinese: plan.eligibleChinese, selectedChinese: plan.selectedChinese }).toEqual({ eligible: 3, eligibleChinese: 2, selectedChinese: 1 });
  });
});

describe("candidateFromRow", () => {
  it("reads this campaign's send out of the row's sends", () => {
    const row = {
      customer_id: "u1",
      email: "a@x.test",
      first_name: "  Ann ",
      marketing_email: "subscribed",
      migrated: true,
      claimed_at: null,
      orders_count: 3,
      since: "2026-10-01T00:00:00Z",
      suppressed: false,
      campaign_sends: { c1: { status: "failed", wave: "w2", sent_at: "t" }, c2: { status: "sent", wave: "w1", sent_at: "t" } },
    };
    expect(candidateFromRow(row, "c1")).toMatchObject({ firstName: "Ann", ordersCount: 3, own: { status: "failed", wave: "w2" }, locale: "en-US" });
    expect(candidateFromRow({ ...row, locale: "zh-CN" }, "c1")?.locale).toBe("zh-CN");
    expect(candidateFromRow(row, "c3")?.own).toBeNull();
    expect(candidateFromRow({ ...row, marketing_email: "weird" }, "c1")?.marketingEmail).toBe("not_subscribed");
    expect(candidateFromRow({ email: "x" }, "c1")).toBeNull();
  });
});

describe("mentionsPoints", () => {
  const base = { subject: "Hello", preheader: null, body: "News.", button: null, content: null };
  it("finds points in any part a customer reads", () => {
    expect(mentionsPoints(base)).toBe(false);
    expect(mentionsPoints({ ...base, subject: "1,000 points for you" })).toBe(true);
    expect(mentionsPoints({ ...base, preheader: "Collect your points" })).toBe(true);
    expect(mentionsPoints({ ...base, body: "Earn a Point on every dollar." })).toBe(true);
    expect(mentionsPoints({ ...base, button: { target: "sign_in" as const, label: "Collect points", url: null } })).toBe(true);
    expect(mentionsPoints(FIRST_CAMPAIGN_DRAFT)).toBe(true);
  });

  it("does not read other words as points", () => {
    expect(mentionsPoints({ ...base, body: "Appointments are open, and the pointed tip is new." })).toBe(false);
  });

  it("reads every block's words (slice 03)", () => {
    const blocks = (b: EmailBlock) => ({ ...base, body: "", content: { v: 1 as const, blocks: [b], fallbacks: {} } });
    expect(mentionsPoints(blocks({ id: "a", type: "heading", level: 1, text: "Points are here" }))).toBe(true);
    expect(mentionsPoints(blocks({ id: "a", type: "text", paragraphs: [{ kind: "bullets", items: [[{ text: "1,000 " }, { text: "points", bold: true }]] }] }))).toBe(true);
    expect(mentionsPoints(blocks({ id: "a", type: "buttons", buttons: [{ label: "Collect points", target: "sign_in", style: "primary" }] }))).toBe(true);
    expect(mentionsPoints(blocks({ id: "a", type: "heading", level: 1, text: "Sleep cooler" }))).toBe(false);
  });
});

describe("a block campaign (PRD-campaign-email-editor slice 03)", () => {
  const content = {
    v: 1 as const,
    blocks: [
      { id: "h", type: "heading" as const, level: 1 as const, text: "Sleep cooler" },
      { id: "t", type: "text" as const, paragraphs: [{ kind: "p" as const, runs: [{ text: "Hi " }, { var: "first_name" as const }] }] },
    ],
    fallbacks: { first_name: "there" },
  };
  const draft = { ...EMPTY_CAMPAIGN_DRAFT, name: "December", subject: "{first_name}, sleep cooler", content };

  it("saves its blocks, with no body and no button columns, and reads them back", () => {
    const parsed = CampaignDraftSchema.parse(draft);
    expect(parsed).toMatchObject({ body: "", button: null, content });
    const row = campaignRowFromDraft(parsed);
    expect(row).toMatchObject({ body: null, content, button_label: null, button_target: null, button_url: null });
    const back = campaignFromRow({ id: "c1", ...row, created_at: "t", updated_at: "t", locked_at: null, archived_at: null });
    expect(back).toMatchObject({ body: "", content, button: null });
  });

  it("is its blocks or its message, never both", () => {
    const both = CampaignDraftSchema.safeParse({ ...draft, body: "Hello" });
    expect(both.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([["content", "An email is its blocks or its message, not both."]]);
    expect(CampaignDraftSchema.safeParse({ ...draft, button: { target: "sign_in", label: "Go", url: null } }).success).toBe(false);
  });

  it("fills only known Variables in its subject and preview line", () => {
    const r = CampaignDraftSchema.safeParse({ ...draft, subject: "{nickname}, hello", preheader: "{points}" });
    expect(Object.fromEntries(r.error!.issues.map((i) => [i.path.join("."), i.message]))).toEqual({
      subject: "{nickname} is not a Variable: the Variables are {first_name}, {last_name}, {points_balance} and {your_pillow}.",
      preheader: "{points} is not a Variable: the Variables are {first_name}, {last_name}, {points_balance} and {your_pillow}.",
    });
    // A legacy campaign's subject is its words, braces and all.
    expect(CampaignDraftSchema.safeParse({ ...FIRST_CAMPAIGN_DRAFT, subject: "{nickname}" }).success).toBe(true);
  });

  it("refuses a {name} in the blocks' words that the sender never fills, under the field that holds it", () => {
    const blocks = [
      { id: "h", type: "heading", level: 1, text: "{first_name}, sleep cooler {soon}" },
      { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Hi {frist_name}, our covers are back" }] }] },
      { id: "b", type: "buttons", buttons: [{ label: "For {first_name}", target: "shop", style: "primary" }] },
    ];
    const r = CampaignDraftSchema.safeParse({ ...draft, content: { ...content, blocks } });
    expect(Object.fromEntries(r.error!.issues.map((i) => [i.path.join("."), i.message]))).toEqual({
      "content.blocks.0.text": "{soon} is not a Variable: the Variables are {first_name}, {last_name}, {points_balance} and {your_pillow}.",
      "content.blocks.1.paragraphs": "{frist_name} is not a Variable: the Variables are {first_name}, {last_name}, {points_balance} and {your_pillow}.",
      "content.blocks.2.buttons.0.label": "{first_name} can go in a heading, a text block, the subject or the preview line, not here.",
    });
  });

  describe("its Variables' fallback words (slice 13)", () => {
    const text = (...runs: unknown[]) => ({ id: "t", type: "text", paragraphs: [{ kind: "p", runs }] });
    const issues = (d: unknown) => Object.fromEntries((CampaignDraftSchema.safeParse(d).error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

    it("refuses to save a used Variable with no fallback words, wherever it is used", () => {
      const withLast = { ...draft, content: { ...content, blocks: [text({ text: "Dear " }, { var: "last_name" })], fallbacks: {} } };
      expect(issues(withLast)).toEqual({ "content.fallbacks.last_name": "Write what to say to a customer with no last name." });
      expect(issues({ ...withLast, content: { ...withLast.content, fallbacks: { last_name: "   " } } })).toEqual({
        "content.fallbacks.last_name": "Write what to say to a customer with no last name.",
      });
      expect(CampaignDraftSchema.safeParse({ ...withLast, content: { ...withLast.content, fallbacks: { last_name: "friend" } } }).success).toBe(true);
      // In the subject, the preview line or a heading alike.
      const plain = { ...content, blocks: [text({ text: "Hello" })], fallbacks: {} };
      expect(issues({ ...draft, subject: "Points: {points_balance}", content: plain })).toEqual({
        "content.fallbacks.points_balance": "Write what to say to a customer with no points balance.",
      });
      expect(Object.keys(issues({ ...draft, subject: "Hello", preheader: "For {last_name}", content: plain }))).toEqual(["content.fallbacks.last_name"]);
      const heading = { ...plain, blocks: [{ id: "h", type: "heading", level: 1, text: "{last_name}" }] };
      expect(Object.keys(issues({ ...draft, subject: "Hello", content: heading }))).toEqual(["content.fallbacks.last_name"]);
    });

    it("uses the catalogue's default for the first name until Staff empty it, and counts the greeting as a use", () => {
      const greet = { ...draft, subject: "Hello", greeting: true, content: { ...content, blocks: [text({ text: "Hello" })], fallbacks: {} } };
      expect(CampaignDraftSchema.safeParse(greet).success).toBe(true);
      expect(issues({ ...greet, content: { ...greet.content, fallbacks: { first_name: "" } } })).toEqual({
        "content.fallbacks.first_name": "Write what to say to a customer with no first name.",
      });
      // Without the greeting, and nowhere else, the first name is unused: an empty fallback is no matter.
      expect(CampaignDraftSchema.safeParse({ ...greet, greeting: false, content: { ...greet.content, fallbacks: { first_name: "" } } }).success).toBe(true);
      expect(variablesInEmail({ ...greet, preheader: "{points_balance}" } as never)).toEqual(["first_name", "points_balance"]);
      expect(variablesInEmail({ ...FIRST_CAMPAIGN_DRAFT, subject: "{last_name}" })).toEqual([]);
    });

    it("previews a used Variable with no fallback words", () => {
      expect(CampaignPreviewSchema.safeParse({ ...draft, content: { ...content, blocks: [text({ var: "last_name" })], fallbacks: {} } }).success).toBe(true);
    });

    it("counts Points balance as a mention of points", () => {
      expect(mentionsPoints({ ...draft, subject: "Hello", content: { ...content, blocks: [text({ text: "You have " }, { var: "points_balance" })] } } as never)).toBe(true);
      expect(mentionsPoints({ ...draft, subject: "{points_balance} waiting", content: { ...content, blocks: [] } } as never)).toBe(true);
      expect(mentionsPoints({ ...draft, subject: "Hello", content: { ...content, blocks: [text({ var: "last_name" })] } } as never)).toBe(false);
    });
  });

  it("names each empty block field on save, and previews it empty", () => {
    const empty = { ...draft, content: { ...content, blocks: [{ id: "h", type: "heading", level: 2, text: "" }] } };
    const r = CampaignDraftSchema.safeParse(empty);
    expect(r.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([["content.blocks.0.text", "Write the heading."]]);
    expect(CampaignPreviewSchema.safeParse(empty).success).toBe(true);
  });

  it("does not open a row whose blocks fail the schema", () => {
    const row = { id: "c1", ...campaignRowFromDraft(CampaignDraftSchema.parse(draft)), audience: "subscribed" };
    expect(campaignFromRow({ ...row, content: { v: 1, blocks: [{ id: "x", type: "html", html: "<script>" }], fallbacks: {} } })).toBeNull();
    expect(campaignFromRow({ ...row, content: { v: 2, blocks: [], fallbacks: {} } })).toBeNull();
  });
});

// PRD-campaign-audiences slice 06.
describe("leaving Segments out", () => {
  const SEG_A = "5e000000-0000-4000-8000-0000000000a1";
  const SEG_B = "5e000000-0000-4000-8000-0000000000b2";
  const SEG_C = "5e000000-0000-4000-8000-0000000000c3";
  const SEG_D = "5e000000-0000-4000-8000-0000000000d4";
  const base = { ...FIRST_CAMPAIGN_DRAFT, audience: "subscribed" as const };
  const issues = (input: Record<string, unknown>) => {
    const r = CampaignDraftSchema.safeParse({ ...base, ...input });
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  describe("excludeSegmentMembers", () => {
    const c = (customerId: string) => ({ customerId });
    const set = (...ids: string[]) => new Set(ids);

    it("only narrows: what comes out is what went in, less the left out, in order", () => {
      // Every combination of 6 candidates and 2 exclusions drawn from 8 ids.
      const all = Array.from({ length: 8 }, (_, i) => `id-${i}`);
      for (let seed = 0; seed < 200; seed++) {
        const pick = (salt: number) => all.filter((_, i) => ((seed * 31 + salt * 17) >> i) & 1);
        const candidates = pick(1).slice(0, 6).map(c);
        const exclusions = [
          { segmentId: "a", name: "A", customerIds: set(...pick(2)) },
          { segmentId: "b", name: "B", customerIds: set(...pick(3), "not-a-candidate") },
        ];
        const { candidates: kept, leftOut } = excludeSegmentMembers(candidates, exclusions);
        const inputIds = candidates.map((x) => x.customerId);
        // Never one that was not there; never one a left-out Segment holds.
        expect(kept.every((x) => inputIds.includes(x.customerId))).toBe(true);
        expect(kept.some((x) => exclusions.some((e) => e.customerIds.has(x.customerId)))).toBe(false);
        expect(kept.map((x) => x.customerId)).toEqual(inputIds.filter((x) => kept.some((k) => k.customerId === x)));
        expect(kept.length + leftOut.reduce((sum, x) => sum + x.count, 0)).toBe(candidates.length);
      }
    });

    it("counts someone in two against the first, and lists one that took nobody", () => {
      const out = excludeSegmentMembers([c("1"), c("2"), c("3")], [
        { segmentId: "a", name: "A", customerIds: set("2") },
        { segmentId: "b", name: "B", customerIds: set("2", "3") },
        { segmentId: "c", name: "C", customerIds: set("9") },
      ]);
      expect(out.candidates).toEqual([c("1")]);
      expect(out.leftOut).toEqual([
        { segmentId: "a", name: "A", count: 1 },
        { segmentId: "b", name: "B", count: 1 },
        { segmentId: "c", name: "C", count: 0 },
      ]);
    });

    it("leaves everyone in with no exclusions", () => {
      expect(excludeSegmentMembers([c("1")], [])).toEqual({ candidates: [c("1")], leftOut: [] });
    });
  });

  describe("the draft", () => {
    it("leaves nobody out by default, with any audience", () => {
      expect(CampaignDraftSchema.parse(base).excludeSegmentIds).toEqual([]);
      expect(CampaignDraftSchema.parse({ ...base, excludeSegmentIds: [SEG_A, SEG_B] }).excludeSegmentIds).toEqual([SEG_A, SEG_B]);
    });

    it("takes at most 3, each once, and never the Segment it is sent to", () => {
      expect(issues({ excludeSegmentIds: [SEG_A, SEG_B, SEG_C, SEG_D] })).toContain(
        `Leave out at most ${MAX_EXCLUDED_SEGMENTS} Segments.`,
      );
      expect(issues({ excludeSegmentIds: [SEG_A, SEG_A] })).toContain("A Segment is left out twice.");
      expect(issues({ audience: "segment", segmentId: SEG_A, excludeSegmentIds: [SEG_A] })).toContain(
        "It cannot leave out the Segment it is sent to.",
      );
      expect(issues({ excludeSegmentIds: ["not-a-uuid"] }).length).toBeGreaterThan(0);
    });

    it("is stored as exclude_segment_ids and read back", () => {
      const draft = CampaignDraftSchema.parse({ ...base, excludeSegmentIds: [SEG_B] });
      expect(campaignRowFromDraft(draft).exclude_segment_ids).toEqual([SEG_B]);
      expect(CAMPAIGN_COLUMNS).toContain("exclude_segment_ids");
      const row = { id: "5e000000-0000-4000-8000-000000000001", audience: "subscribed", exclude_segment_ids: [SEG_B, 7] };
      expect(campaignFromRow(row)?.excludeSegmentIds).toEqual([SEG_B]);
      expect(campaignFromRow({ ...row, exclude_segment_ids: null })?.excludeSegmentIds).toEqual([]);
    });
  });
});

// PRD-campaign-audiences slice 07: the rest period.
describe("restUntil", () => {
  const now = new Date("2026-10-31T04:00:00.000Z");
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it("rests someone emailed in the last 7 days, until 7 days after it", () => {
    expect(restUntil([ago(2)], now)).toBe(new Date(now.getTime() + 5 * 86_400_000).toISOString());
    expect(restUntil([ago(7.01)], now)).toBeNull();
    expect(restUntil([], now)).toBeNull();
    expect(restUntil(undefined, now)).toBeNull();
  });

  it("rests someone with 4 in 30 days until the 4th most recent leaves the window", () => {
    // Latest 8 days ago (the 7-day rest is over), 4th most recent 29 days ago: 1 day more.
    expect(restUntil([ago(8), ago(12), ago(20), ago(29)], now)).toBe(new Date(now.getTime() + 86_400_000).toISOString());
    expect(restUntil([ago(8), ago(12), ago(20)], now)).toBeNull();
    // The 5th does not matter; the order given does not either.
    expect(restUntil([ago(29), ago(8), ago(40), ago(20), ago(12)], now)).toBe(new Date(now.getTime() + 86_400_000).toISOString());
  });

  it("takes the later of the two", () => {
    expect(restUntil([ago(1), ago(12), ago(20), ago(25)], now)).toBe(new Date(now.getTime() + 6 * 86_400_000).toISOString());
    expect(restUntil([ago(6), ago(7), ago(8), ago(9)], now)).toBe(new Date(now.getTime() + 21 * 86_400_000).toISOString());
  });

  it("ignores unreadable times and times after now", () => {
    expect(restUntil(["not a date", new Date(now.getTime() + 86_400_000).toISOString()], now)).toBeNull();
  });

  it("uses the SQL function's numbers, and says them in words", () => {
    expect([REST_DAYS, REST_MAX_PER_30_DAYS, REST_WINDOW_DAYS]).toEqual([7, 4, 30]);
    const fn = RULE_MIGRATION.slice(RULE_MIGRATION.indexOf("function public.marketing_rest_until"));
    expect(fn).toContain("r[1] + interval '7 days'");
    expect(fn).toContain("cardinality(r) >= 4 then r[4] + interval '30 days'");
    expect(RULE_MIGRATION).toContain("s.sent_at > p_now - interval '30 days'");
    expect(REST_PERIOD_TEXT).toMatch(/7 days/);
    expect(REST_PERIOD_TEXT).toMatch(/more than 4 in 30 days/);
  });
});

describe("planCampaignWave: resting", () => {
  const now = new Date("2026-10-31T04:00:00.000Z");
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it("counts the resting apart, never as failed, and says when the first can get it", () => {
    const list = [
      cand({ customerId: "a" }),
      cand({ customerId: "b", recentMarketing: [ago(2)] }),
      cand({ customerId: "c", recentMarketing: [ago(5)] }),
      cand({ customerId: "d", recentMarketing: [ago(9)] }),
      cand({ customerId: "e", marketingEmail: "unsubscribed", recentMarketing: [ago(1)] }),
    ];
    const plan = planCampaignWave("subscribed", list, { size: 10, now });
    expect(plan.selection.map((c) => c.customerId).sort()).toEqual(["a", "d"]);
    expect(plan.excluded).toEqual({ resting: 2, unsubscribed: 1 });
    expect(plan.failed).toBe(0);
    // c rests until 2 days from now, b until 5: the first is c.
    expect(plan.restingUntil).toBe(new Date(now.getTime() + 2 * 86_400_000).toISOString());
  });

  it("has no date when nobody rests", () => {
    expect(planCampaignWave("subscribed", [cand({ customerId: "a" })], { size: 1, now }).restingUntil).toBeNull();
  });

  it("reads the view's marketing_recent", () => {
    const row = { customer_id: "a", email: "a@x.test", marketing_recent: [ago(2), 7, null] };
    expect(candidateFromRow(row, "camp")?.recentMarketing).toEqual([ago(2)]);
    expect(candidateFromRow({ customer_id: "a", email: "a@x.test" }, "camp")?.recentMarketing).toEqual([]);
  });
});
