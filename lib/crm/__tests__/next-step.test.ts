import { describe, expect, it } from "vitest";
import { nextStep, type NextStepFacts } from "@/lib/crm/next-step";

/**
 * PRD-crm-retention-loop slice 05: the next step on a Customer, first match
 * wins, one step or none. No step asks for a review or offers a discount.
 */

// 1 Nov 2026, 12:00 in Singapore.
const NOW = new Date("2026-11-01T04:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const facts = (over: Partial<NextStepFacts> = {}): NextStepFacts => ({
  stage: "new",
  detail: "settled",
  lastDeliveredAt: daysAgo(200),
  reviewRequestedAt: daysAgo(180),
  reviewRequest: { enabled: true, daysAfter: 14, maxAgeDays: 60 },
  checkup: { enabled: true, months: 12 },
  ownsPremium: true,
  lastReadjustedAt: null,
  readjustmentBooked: false,
  marketingEmail: "subscribed",
  unengaged: false,
  overdueFollowUp: null,
  ...over,
});

describe("nextStep", () => {
  it("shows nothing when nothing is due", () => {
    expect(nextStep(facts(), NOW)).toBeNull();
    expect(nextStep(facts({ stage: "loyal", detail: "repeat_purchases" }), NOW)).toBeNull();
    expect(nextStep(facts({ stage: "lead", detail: null, lastDeliveredAt: null, ownsPremium: false }), NOW)).toBeNull();
  });

  it("1. an overdue Follow-up comes first", () => {
    const s = nextStep(facts({ detail: "awaiting_delivery", overdueFollowUp: { title: "Call about the bolster", dueOn: "2026-10-28" } }), NOW);
    expect(s).toEqual({ kind: "followup_overdue", text: "Follow-up overdue: “Call about the bolster”, due 28 Oct 2026", addFollowUp: false });
    // Due today is not overdue.
    expect(nextStep(facts({ overdueFollowUp: { title: "Today", dueOn: "2026-11-01" } }), NOW)).toBeNull();
  });

  it("2. a purchase on its way", () => {
    expect(nextStep(facts({ detail: "awaiting_delivery", lastDeliveredAt: null }), NOW)?.kind).toBe("awaiting_delivery");
  });

  it("3. says when the Review request goes, and never asks Staff to send one", () => {
    const nineDays = facts({ detail: "delivered", lastDeliveredAt: daysAgo(9), reviewRequestedAt: null });
    expect(nextStep(nineDays, NOW)).toEqual({
      kind: "review_request",
      text: "Review request goes on 6 Nov 2026 (automatic)",
      addFollowUp: false,
    });
    expect(nextStep(facts({ lastDeliveredAt: daysAgo(20), reviewRequestedAt: null }), NOW)?.text).toBe(
      "Review request goes with the next daily run (automatic)",
    );
    // Past the window, sent already, or switched off: not this step.
    expect(nextStep(facts({ lastDeliveredAt: daysAgo(61), reviewRequestedAt: null, ownsPremium: false }), NOW)).toBeNull();
    expect(nextStep(facts({ lastDeliveredAt: daysAgo(9), reviewRequestedAt: daysAgo(1) }), NOW)).toBeNull();
    expect(nextStep(facts({ lastDeliveredAt: daysAgo(9), reviewRequestedAt: null, reviewRequest: { enabled: false, daysAfter: 14, maxAgeDays: 60 } }), NOW)).toBeNull();
  });

  it("4. the check-up due, with Add a follow-up, unless re-adjusted or booked", () => {
    const due = facts({ lastDeliveredAt: daysAgo(400) });
    expect(nextStep(due, NOW)).toEqual({ kind: "checkup_due", text: "Check-up due: no re-adjustment in a year", addFollowUp: true });
    expect(nextStep({ ...due, lastReadjustedAt: daysAgo(100) }, NOW)).toBeNull();
    expect(nextStep({ ...due, readjustmentBooked: true }, NOW)).toBeNull();
    expect(nextStep({ ...due, ownsPremium: false }, NOW)).toBeNull();
    expect(nextStep({ ...due, checkup: { enabled: false, months: 12 } }, NOW)).toBeNull();
    expect(nextStep({ ...due, checkup: { enabled: true, months: 6 }, lastDeliveredAt: daysAgo(200) }, NOW)?.text).toBe(
      "Check-up due: no re-adjustment in 6 months",
    );
  });

  it("5. At risk and subscribed: the next campaign, or only a win-back when Unengaged", () => {
    const atRisk = facts({ stage: "at_risk", detail: null, lastDeliveredAt: daysAgo(450), ownsPremium: false });
    expect(nextStep(atRisk, NOW)).toEqual({ kind: "at_risk_campaign", text: "At risk: the next campaign to At risk reaches them", addFollowUp: false });
    expect(nextStep({ ...atRisk, unengaged: true }, NOW)).toMatchObject({ kind: "at_risk_unengaged", addFollowUp: true });
  });

  it("6. At risk and not on marketing email: a personal call", () => {
    const atRisk = facts({ stage: "at_risk", detail: null, ownsPremium: false, marketingEmail: "unsubscribed" });
    expect(nextStep(atRisk, NOW)).toMatchObject({ kind: "at_risk_call", addFollowUp: true });
    expect(nextStep({ ...atRisk, marketingEmail: "not_subscribed" }, NOW)?.kind).toBe("at_risk_call");
  });

  it("never suggests asking for a review or offers a discount", () => {
    const all: NextStepFacts[] = [
      facts({ overdueFollowUp: { title: "x", dueOn: "2026-01-01" } }),
      facts({ detail: "awaiting_delivery" }),
      facts({ lastDeliveredAt: daysAgo(9), reviewRequestedAt: null }),
      facts({ lastDeliveredAt: daysAgo(400) }),
      facts({ stage: "at_risk", ownsPremium: false }),
      facts({ stage: "at_risk", ownsPremium: false, unengaged: true }),
      facts({ stage: "at_risk", ownsPremium: false, marketingEmail: "unsubscribed" }),
    ];
    for (const f of all) {
      const text = nextStep(f, NOW)?.text ?? "";
      expect(text).not.toMatch(/discount|% off|voucher|coupon|ask (them )?for a review|leave a review/i);
    }
  });
});
