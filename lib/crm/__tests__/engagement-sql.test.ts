import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { monthsBefore } from "@/lib/crm/months";
import {
  LEAD_UNENGAGED_AFTER_MONTHS,
  UNENGAGED_AFTER_CAMPAIGNS,
  isUnengaged,
  latestCampaignEngagement,
  type EngagementFacts,
} from "@/lib/crm/engagement";

/**
 * PRD-campaign-audiences slice 12: **Unengaged** is computed in SQL
 * (`customer_unengaged`, called by `admin_customer_overview`) and mirrored in
 * lib/crm/engagement.ts. This holds the latest migration's numbers to the
 * TypeScript's, so a threshold changed on one side fails here;
 * campaign-rule-cases.json runs both on the same cases
 * (lib/email-campaigns/__tests__/rules.test.ts and assert-01-email-campaigns.sql).
 */

const dir = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, dir), "utf8").replace(/--.*$/gm, ""));

/** The latest definition matching `re`, whitespace folded. */
function latest(re: RegExp): string {
  const defs = files.flatMap((sql) => [...sql.matchAll(re)].map((m) => m[0]));
  expect(defs.length).toBeGreaterThan(0);
  return defs.at(-1)!.replace(/\s+/g, " ");
}

const NOW = new Date("2026-10-31T04:00:00.000Z");
const facts = (over: Partial<EngagementFacts> = {}): EngagementFacts => ({
  stage: "at_risk",
  detail: "lapsed",
  customerSince: "2020-01-01T00:00:00Z",
  latestSent: 6,
  latestClicked: 0,
  ...over,
});

describe("customer_unengaged", () => {
  const fn = latest(/create (?:or replace )?function public\.customer_unengaged\s*\([\s\S]*?\$\$[\s\S]*?\$\$/gi);

  it("uses the same numbers as lib/crm/engagement.ts", () => {
    expect(fn).toContain(`p_latest_sent >= ${UNENGAGED_AFTER_CAMPAIGNS}`);
    expect(fn).toContain("p_latest_clicked = 0");
    expect(fn).toContain(`interval '${LEAD_UNENGAGED_AFTER_MONTHS} months'`);
    expect(fn).toContain("(p_stage = 'at_risk' and p_detail = 'lapsed')");
    expect(fn).toContain("p_stage = 'lead'");
  });

  it("is read by the overview from the latest 6 campaign emails the provider accepted", () => {
    const view = latest(/create (?:or replace )?view (?:public\.)?admin_customer_overview\b[\s\S]*?;/gi);
    expect(view).toContain("as unengaged from public.customers c");
    expect(view).toContain(`order by s.sent_at desc, s.id desc limit ${UNENGAGED_AFTER_CAMPAIGNS}`);
    expect(view).toContain("and s.campaign_id is not null and s.status in ('sent', 'bounced', 'complained')");
  });

  it("is what the campaign rule reads, unless the campaign includes the Unengaged", () => {
    const rule = latest(/create (?:or replace )?function public\.marketing_campaign_blocker\s*\([\s\S]*?\$\$[\s\S]*?\$\$/gi);
    expect(rule).toContain(
      "when not e.include_unengaged and coalesce((select o.unengaged from admin_customer_overview o where o.id = k.id), false) then 'unengaged'",
    );
  });
});

describe("isUnengaged", () => {
  it("is Lapsed or a long-standing Lead, with no click in their last 6 campaigns", () => {
    expect(isUnengaged(facts(), NOW)).toBe(true);
    expect(isUnengaged(facts({ stage: "lead", detail: null, customerSince: monthsBefore(NOW, 13).toISOString() }), NOW)).toBe(true);
  });

  it("never for anyone who bought or visited in the last 24 months", () => {
    for (const stage of ["new", "loyal"] as const) expect(isUnengaged(facts({ stage, detail: null }), NOW)).toBe(false);
    expect(isUnengaged(facts({ stage: "at_risk", detail: null }), NOW)).toBe(false);
    expect(isUnengaged(facts({ stage: "lost", detail: null }), NOW)).toBe(false);
  });

  it("never before 6 campaigns, after any click among them, or for a Lead under 12 months", () => {
    expect(isUnengaged(facts({ latestSent: 5 }), NOW)).toBe(false);
    expect(isUnengaged(facts({ latestClicked: 1 }), NOW)).toBe(false);
    expect(isUnengaged(facts({ stage: "lead", detail: null, customerSince: monthsBefore(NOW, 12).toISOString() }), NOW)).toBe(false);
    expect(isUnengaged(facts({ stage: "lead", detail: null, customerSince: "not a date" }), NOW)).toBe(false);
  });

  it("counts only their latest 6 campaigns", () => {
    expect(latestCampaignEngagement([false, false, false, false, false, false, true])).toEqual({ latestSent: 6, latestClicked: 0 });
    expect(latestCampaignEngagement([true, false])).toEqual({ latestSent: 2, latestClicked: 1 });
  });
});
