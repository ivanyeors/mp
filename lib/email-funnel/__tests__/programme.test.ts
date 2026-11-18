import { describe, expect, it } from "vitest";
import { CHECKUP_EMAIL_ID } from "@/lib/aftercare/checkup";
import { parseCustomerFilters } from "@/lib/crm/customer-filters";
import { LIFECYCLE_STAGES } from "@/lib/crm/lifecycle-stage";
import { DRAFT_REMINDERS } from "@/lib/draft-reminders";
import { EMAIL_REGISTRY } from "@/lib/email/registry";
import { PLAYBOOK_DRAFTS, PLAYBOOK_STARTERS } from "@/lib/email-campaigns/starters";
import { daysWords, FUNNEL_PROGRAMME, funnelProgramme, STAGE_ENTRIES, stepsOfStage, type AutomaticStep } from "../programme";

/**
 * The designed programme (PRD-email-funnel, *The programme*): each step names
 * what really exists, and its timings are the sending code's.
 */

const step = (id: string) => {
  const s = FUNNEL_PROGRAMME.find((x) => x.id === id);
  if (!s) throw new Error(`no step ${id}`);
  return s;
};

describe("the programme", () => {
  it("names only Playbooks that exist", () => {
    const drafts = new Set(PLAYBOOK_DRAFTS.map((p) => p.id));
    const playbooks = FUNNEL_PROGRAMME.filter((s) => s.kind === "playbook");
    expect(playbooks.length).toBe(5);
    for (const s of playbooks) expect(drafts.has(s.starterId), s.id).toBe(true);
  });

  it("names only emails the registry has", () => {
    const ids = new Set(EMAIL_REGISTRY.map((e) => e.id));
    const automatic = FUNNEL_PROGRAMME.filter((s): s is AutomaticStep => s.kind === "automatic");
    expect(automatic.length).toBeGreaterThan(0);
    for (const s of automatic) {
      expect(s.templates.length, s.id).toBeGreaterThan(0);
      for (const t of s.templates) expect(ids.has(t), `${s.id}: ${t}`).toBe(true);
    }
  });

  it("times the draft reminders by DRAFT_REMINDERS: 1 day, 1 week, 1 month", () => {
    const s = step("lead.draft_reminders") as AutomaticStep;
    // Both sides pinned: a change to either alone fails here.
    expect(DRAFT_REMINDERS.map((r) => r.afterDays)).toEqual([1, 7, 30]);
    expect(s.afterDays).toEqual([1, 7, 30]);
    expect(s.afterDays).toEqual(DRAFT_REMINDERS.map((r) => r.afterDays));
    expect(s.templates).toEqual(DRAFT_REMINDERS.map((r) => r.template));
    expect(s.when).toBe("1 day, 1 week and 1 month after they last saved it");
    expect(s.name).toBe("Finish your pillow (3 reminders)");
  });

  it("times the Check-up and the Review request from their settings", () => {
    expect(step("aftercare.checkup_reminder").when).toBe("Every 12 months after delivery");
    expect(step("new.review_request").when).toBe("14 days after delivery, once per Customer ever");
    const changed = funnelProgramme({ checkupMonths: 18, reviewRequestDays: 10 });
    expect(changed.find((s) => s.id === "aftercare.checkup_reminder")!.when).toBe("Every 18 months after delivery");
    expect(changed.find((s) => s.id === "new.review_request")!.when).toBe("10 days after delivery, once per Customer ever");
  });

  it("reads the Second purchase days from its Playbook's Segment", () => {
    const filters = PLAYBOOK_DRAFTS.find((p) => p.id === "playbook_second_purchase")!.audience;
    const days = filters?.audience === "segment" ? parseCustomerFilters(new URLSearchParams(filters.filters)).filters.delivered?.days : null;
    expect(step("new.second_purchase").who).toBe(`Delivered over ${days} days ago`);
  });

  it("gives every stage an entry, and Lost no steps", () => {
    for (const stage of LIFECYCLE_STAGES) expect(STAGE_ENTRIES[stage].enters.length, stage).toBeGreaterThan(0);
    expect(stepsOfStage(FUNNEL_PROGRAMME, "lost")).toEqual([]);
    expect(STAGE_ENTRIES.lost.nothingSent).toMatch(/Nothing is sent/);
    for (const stage of ["lead", "new", "loyal", "at_risk"] as const) {
      expect(stepsOfStage(FUNNEL_PROGRAMME, stage).length, stage).toBeGreaterThan(0);
      expect(STAGE_ENTRIES[stage].nothingSent, stage).toBeNull();
    }
  });

  it("shows the sunset rule on Lead and At risk only", () => {
    expect(LIFECYCLE_STAGES.filter((s) => STAGE_ENTRIES[s].sunsetRule)).toEqual(["lead", "at_risk"]);
  });

  it("lists the Check-up reminder once, under Loyal and At risk", () => {
    const checkup = FUNNEL_PROGRAMME.filter((s) => s.kind === "automatic" && s.templates.includes(CHECKUP_EMAIL_ID));
    expect(checkup.map((s) => s.stages)).toEqual([["loyal", "at_risk"]]);
    expect(stepsOfStage(FUNNEL_PROGRAMME, "at_risk").map((s) => s.name)).toEqual(["Check-up reminder", "We miss you", "Welcome back"]);
  });

  it("marks draft reminders and the Check-up Marketing, order, return and quote emails Service with no numbers", () => {
    const purpose = Object.fromEntries(FUNNEL_PROGRAMME.map((s) => [s.id, s.purpose]));
    expect(purpose["lead.draft_reminders"]).toBe("marketing");
    expect(purpose["aftercare.checkup_reminder"]).toBe("marketing");
    for (const id of ["lead.quote_emails", "new.order_emails", "new.return_emails"]) {
      const s = step(id) as AutomaticStep;
      expect(s.purpose, id).toBe("service");
      expect(s.switch, id).toBeNull();
      expect(s.outcome, id).toBeNull();
    }
  });

  it("keeps step ids unique", () => {
    const ids = FUNNEL_PROGRAMME.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never says automation, drip or conversions", () => {
    const words = JSON.stringify([FUNNEL_PROGRAMME, STAGE_ENTRIES]);
    expect(words).not.toMatch(/automation|drip|conversion|frequency cap|Money Pillow/i);
  });

  it("puts the new Lead Playbook in the drafts, not among the Starters offered", () => {
    expect(PLAYBOOK_DRAFTS.some((p) => p.id === "playbook_how_its_made")).toBe(true);
    expect(PLAYBOOK_STARTERS.some((p) => p.id === "playbook_how_its_made")).toBe(false);
  });

  it("writes days as people say them", () => {
    expect([1, 7, 14, 30, 10].map(daysWords)).toEqual(["1 day", "1 week", "14 days", "1 month", "10 days"]);
  });
});
