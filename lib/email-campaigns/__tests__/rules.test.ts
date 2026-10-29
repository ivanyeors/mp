import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_PLACEHOLDERS,
  CAMPAIGN_RULE_BLOCKERS,
  CampaignDraftSchema,
  CampaignPreviewSchema,
  EMPTY_CAMPAIGN_DRAFT,
  FIRST_CAMPAIGN_DRAFT,
  campaignFromRow,
  campaignLedgerKey,
  campaignRowFromDraft,
  candidateFromRow,
  composedCampaignBlocker,
  mentionsPoints,
  newCampaignDraft,
  nextWaveLabel,
  planCampaignWave,
  type CampaignAudience,
  type CampaignCandidate,
  type CampaignSendStatus,
} from "../rules";
import type { EmailBlock } from "../content";

type Case = {
  name: string;
  audience: CampaignAudience;
  retryFailed?: boolean;
  customer: { migrated?: boolean; claimed?: boolean; marketing_email: "subscribed" | "not_subscribed" | "unsubscribed"; suppressedBy?: string; own?: CampaignSendStatus };
  expected: string | null;
};

const CASES = JSON.parse(
  readFileSync(join(process.cwd(), "supabase/tests/email-marketing/campaign-rule-cases.json"), "utf8"),
) as { cases: Case[] };

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261021100000_email_campaigns.sql"), "utf8");

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
        },
        { retryFailed: c.retryFailed },
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
    const fn = MIGRATION.slice(MIGRATION.indexOf("function public.marketing_campaign_blocker"));
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
    expect(candidateFromRow(row, "c1")).toMatchObject({ firstName: "Ann", ordersCount: 3, own: { status: "failed", wave: "w2" } });
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
    const r = CampaignDraftSchema.safeParse({ ...draft, subject: "{last_name}, hello", preheader: "{points}" });
    expect(Object.fromEntries(r.error!.issues.map((i) => [i.path.join("."), i.message]))).toEqual({
      subject: "{last_name} is not a Variable: only {first_name} is.",
      preheader: "{points} is not a Variable: only {first_name} is.",
    });
    // A legacy campaign's subject is its words, braces and all.
    expect(CampaignDraftSchema.safeParse({ ...FIRST_CAMPAIGN_DRAFT, subject: "{last_name}" }).success).toBe(true);
  });

  it("refuses a {name} in the blocks' words that the sender never fills, under the field that holds it", () => {
    const blocks = [
      { id: "h", type: "heading", level: 1, text: "{first_name}, sleep cooler" },
      { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Hi {frist_name}, our covers are back" }] }] },
    ];
    const r = CampaignDraftSchema.safeParse({ ...draft, content: { ...content, blocks } });
    expect(Object.fromEntries(r.error!.issues.map((i) => [i.path.join("."), i.message]))).toEqual({
      "content.blocks.0.text": "{first_name} can go in a text block, the subject or the preview line, not here.",
      "content.blocks.1.paragraphs": "{frist_name} is not a Variable: only {first_name} is.",
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
