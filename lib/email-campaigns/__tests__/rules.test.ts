import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_RULE_BLOCKERS,
  CampaignDraftSchema,
  FIRST_CAMPAIGN_DRAFT,
  campaignFromRow,
  campaignLedgerKey,
  campaignRowFromDraft,
  candidateFromRow,
  composedCampaignBlocker,
  nextWaveLabel,
  planCampaignWave,
  type CampaignAudience,
  type CampaignCandidate,
  type CampaignSendStatus,
} from "../rules";

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
