import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_BLOCKERS,
  CAMPAIGN_EMAIL_IDS,
  CAMPAIGN_SEND_STATUSES,
  CAMPAIGN_TEMPLATES,
  REMINDER_AFTER_DAYS,
  SERVICE_NOTICE_SETTING_KEY,
  campaignBlocker,
  type CampaignFacts,
  type CampaignSendFact,
  type CampaignTemplate,
} from "@/lib/customer-migration/campaign";
import { MARKETING_EMAIL_STATES, type MarketingEmailState } from "@/lib/marketing-consent/state";
import { EMAIL_REGISTRY } from "@/lib/email/registry";

const ROOT = process.cwd();
const CASES = JSON.parse(readFileSync(join(ROOT, "supabase/tests/customer-migration/campaign-cases.json"), "utf8")) as {
  now: string;
  cases: Array<{
    name: string;
    template: CampaignTemplate;
    retryFailed?: boolean;
    customer: {
      migrated?: boolean;
      claimed?: boolean;
      marketing_email: MarketingEmailState;
      sends?: Record<string, { status: CampaignSendFact["status"]; days_ago: number; bounced?: boolean; complained?: boolean }>;
    };
    expected: string | null;
  }>;
};
const SQL = readFileSync(join(ROOT, "supabase/migrations/20261020130000_customer_campaign_sends.sql"), "utf8");

const DAY = 86400_000;
const NOW = new Date(CASES.now);

function factsOf(c: (typeof CASES.cases)[number]["customer"]): CampaignFacts {
  const sends: Record<string, CampaignSendFact> = {};
  for (const [template, s] of Object.entries(c.sends ?? {})) {
    sends[template] = {
      status: s.status,
      sentAt: new Date(NOW.getTime() - s.days_ago * DAY).toISOString(),
      bounced: s.status === "bounced" || s.bounced === true,
      complained: s.status === "complained" || s.complained === true,
    };
  }
  return {
    migrated: c.migrated ?? true,
    claimedAt: c.claimed ? new Date(NOW.getTime() - DAY).toISOString() : null,
    marketingEmail: c.marketing_email,
    sends,
  };
}

describe("campaignBlocker: campaign-cases.json", () => {
  it("covers every template and every reason", () => {
    expect(new Set(CASES.cases.map((c) => c.template))).toEqual(new Set(CAMPAIGN_TEMPLATES));
    expect(new Set(CASES.cases.map((c) => c.expected).filter(Boolean))).toEqual(new Set(CAMPAIGN_BLOCKERS));
  });

  it.each(CASES.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(campaignBlocker(c.template, factsOf(c.customer), { now: NOW, retryFailed: c.retryFailed ?? false })).toBe(c.expected);
  });
});

function everyWorld(): CampaignFacts[] {
  const sendsOptions: Array<Partial<Record<string, CampaignSendFact>>> = [{}];
  for (const template of CAMPAIGN_TEMPLATES) {
    for (const status of CAMPAIGN_SEND_STATUSES) {
      for (const days of [1, 30]) {
        sendsOptions.push({ [template]: { status, sentAt: new Date(NOW.getTime() - days * DAY).toISOString() } });
      }
    }
  }
  return MARKETING_EMAIL_STATES.flatMap((marketingEmail) =>
    sendsOptions.map((sends) => ({ migrated: true, claimedAt: null, marketingEmail, sends })),
  );
}

describe("who never gets what (acceptance criteria)", () => {
  it("an unsubscribed Customer is never selected, for any template", () => {
    for (const facts of everyWorld().filter((f) => f.marketingEmail === "unsubscribed")) {
      for (const template of CAMPAIGN_TEMPLATES) {
        for (const retryFailed of [false, true]) {
          expect(campaignBlocker(template, facts, { now: NOW, retryFailed })).not.toBeNull();
        }
      }
    }
  });

  it("a not_subscribed Customer never gets the announcement or the reminder", () => {
    for (const facts of everyWorld().filter((f) => f.marketingEmail === "not_subscribed")) {
      for (const template of ["migration_announcement", "migration_reminder"] as const) {
        expect(campaignBlocker(template, facts, { now: NOW, retryFailed: true })).not.toBeNull();
      }
    }
  });

  it("a subscribed Customer never gets the service notice", () => {
    for (const facts of everyWorld().filter((f) => f.marketingEmail === "subscribed")) {
      expect(campaignBlocker("migration_service_notice", facts, { now: NOW, retryFailed: true })).not.toBeNull();
    }
  });

  it("a Customer who bounced or complained gets nothing more", () => {
    for (const facts of everyWorld()) {
      const suppressed = Object.values(facts.sends).some((s) => s?.status === "bounced" || s?.status === "complained");
      if (!suppressed) continue;
      for (const template of CAMPAIGN_TEMPLATES) expect(campaignBlocker(template, facts, { now: NOW })).not.toBeNull();
    }
  });

  it("a template already sent, in flight, or answered is never sent again, retrying or not", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      for (const status of ["pending", "sent", "bounced", "complained"] as const) {
        for (const marketingEmail of MARKETING_EMAIL_STATES) {
          const facts: CampaignFacts = {
            migrated: true,
            claimedAt: null,
            marketingEmail,
            sends: { [template]: { status, sentAt: new Date(NOW.getTime() - 30 * DAY).toISOString() } },
          };
          expect(campaignBlocker(template, facts, { now: NOW, retryFailed: true })).not.toBeNull();
        }
      }
    }
  });
});

describe("the SQL names the same things", () => {
  it("templates, statuses and reasons", () => {
    for (const t of CAMPAIGN_TEMPLATES) expect(SQL).toContain(`'${t}'`);
    for (const s of CAMPAIGN_SEND_STATUSES) expect(SQL).toContain(`'${s}'`);
    for (const b of CAMPAIGN_BLOCKERS) expect(SQL).toMatch(new RegExp(`then '${b}'`));
    expect(SQL).toContain(`interval '${REMINDER_AFTER_DAYS} days'`);
    expect(SQL).toContain(`'${SERVICE_NOTICE_SETTING_KEY}'`);
  });

  it("each template is a registered campaign email", () => {
    for (const t of CAMPAIGN_TEMPLATES) {
      const entry = EMAIL_REGISTRY.find((e) => e.id === CAMPAIGN_EMAIL_IDS[t]);
      expect(entry, t).toBeDefined();
      expect(entry!.campaign).toBe(true);
      expect(entry!.group).toBe("migration");
    }
  });
});
