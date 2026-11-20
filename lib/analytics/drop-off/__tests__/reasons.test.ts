import { describe, expect, it } from "vitest";
import { DeclineReasonSchema, SiteDropOffAnswerSchema } from "@/lib/analytics/drop-off/schema";
import {
  ASK_COOLDOWN_MS,
  REASONS_FOR_STEP,
  dropOffStepForPath,
  isEngaged,
  isExitIntent,
  isStaffEdit,
  mayAsk,
  shuffledReasons,
} from "@/lib/analytics/drop-off/reasons";

const VISIT = "7a000000-0000-4000-8000-000000000001";

describe("dropOffStepForPath", () => {
  it("asks on the configurators and checkout, in any locale", () => {
    expect(dropOffStepForPath("/mp-config")).toBe("configurator");
    expect(dropOffStepForPath("/en-US/mp-basic")).toBe("configurator");
    expect(dropOffStepForPath("/zh-CN/mbolster-config/")).toBe("configurator");
    expect(dropOffStepForPath("/en-US/shop/checkout?step=2")).toBe("checkout");
  });

  it("asks nowhere else: not the confirmation, not the Admin Panel", () => {
    for (const path of ["/", "/en-US", "/en-US/shop", "/en-US/shop/checkout/confirmation", "/en-US/results/abc", "/en-US/settings/customers", "/en-US/mp-config-other"]) {
      expect(dropOffStepForPath(path), path).toBeNull();
    }
  });
});

describe("when to ask", () => {
  const now = new Date("2026-10-27T12:00:00Z");

  it("asks a browser once in 30 days", () => {
    expect(mayAsk(null, now)).toBe(true);
    expect(mayAsk(new Date(now.getTime() - ASK_COOLDOWN_MS + 1000).toISOString(), now)).toBe(false);
    expect(mayAsk(new Date(now.getTime() - ASK_COOLDOWN_MS).toISOString(), now)).toBe(true);
    expect(mayAsk("garbage", now)).toBe(true);
  });

  it("waits until the visitor has started: 20 seconds and one interaction", () => {
    expect(isEngaged({ enteredAt: 0, interactions: 0, now: 60_000 })).toBe(false);
    expect(isEngaged({ enteredAt: 0, interactions: 3, now: 19_999 })).toBe(false);
    expect(isEngaged({ enteredAt: 0, interactions: 1, now: 20_000 })).toBe(true);
  });

  it("reads exit intent as the pointer leaving through the top of the window", () => {
    expect(isExitIntent({ clientY: -2, relatedTarget: null })).toBe(true);
    expect(isExitIntent({ clientY: 0, relatedTarget: null })).toBe(true);
    expect(isExitIntent({ clientY: 6, relatedTarget: null })).toBe(true);
    expect(isExitIntent({ clientY: 300, relatedTarget: null })).toBe(false);
    expect(isExitIntent({ clientY: -2, relatedTarget: {} })).toBe(false);
  });

  it("never asks Staff editing a Result in the configurator", () => {
    expect(isStaffEdit("?result=abc&edit=1")).toBe(true);
    expect(isStaffEdit("?result=abc")).toBe(false);
    expect(isStaffEdit("")).toBe(false);
  });
});

describe("shuffledReasons", () => {
  it("keeps every answer, Other last, in an order the random source decides", () => {
    const a = shuffledReasons("configurator", () => 0);
    const b = shuffledReasons("configurator", () => 0.99);
    expect(a.at(-1)).toBe("other");
    expect(b.at(-1)).toBe("other");
    expect([...a].sort()).toEqual([...REASONS_FOR_STEP.configurator].sort());
    expect(a).not.toEqual(b);
  });
});

describe("SiteDropOffAnswerSchema", () => {
  const ok = { step: "configurator", reason: "price", visitId: VISIT, visitorId: VISIT, path: "/en-US/mp-config" };

  it("accepts an answer and drops text the answer does not take", () => {
    expect(SiteDropOffAnswerSchema.parse({ ...ok, text: "too much" }).text).toBeNull();
    expect(SiteDropOffAnswerSchema.parse({ ...ok, reason: "other", text: "  need a gift box  " }).text).toBe("need a gift box");
    expect(SiteDropOffAnswerSchema.parse({ ...ok, reason: "other", text: "   " }).text).toBeNull();
  });

  it("refuses an unknown step or reason, a decline-only answer, long text and extra keys", () => {
    expect(SiteDropOffAnswerSchema.safeParse({ ...ok, step: "quote_decline" }).success).toBe(false);
    expect(SiteDropOffAnswerSchema.safeParse({ ...ok, reason: "hate_it" }).success).toBe(false);
    expect(SiteDropOffAnswerSchema.safeParse({ ...ok, reason: "changed_mind" }).success).toBe(false);
    expect(SiteDropOffAnswerSchema.safeParse({ ...ok, reason: "other", text: "x".repeat(501) }).success).toBe(false);
    expect(SiteDropOffAnswerSchema.safeParse({ ...ok, email: "a@b.c" }).success).toBe(false);
    expect(SiteDropOffAnswerSchema.safeParse({ ...ok, visitId: "not-a-uuid" }).success).toBe(false);
    expect(SiteDropOffAnswerSchema.safeParse({ ...ok, path: undefined }).success).toBe(false);
  });

  it("strips control characters Postgres would refuse from typed text", () => {
    expect(SiteDropOffAnswerSchema.parse({ ...ok, reason: "other", text: "a\u0000b\u001Fc\nd" }).text).toBe("abc\nd");
    expect(SiteDropOffAnswerSchema.parse({ ...ok, reason: "other", text: "\u0000" }).text).toBeNull();
  });
});

describe("DeclineReasonSchema", () => {
  it("takes the decline's answers only: Changed my mind in place of Just looking", () => {
    expect(DeclineReasonSchema.parse({ reason: "changed_mind" })).toEqual({ reason: "changed_mind", text: null });
    expect(DeclineReasonSchema.parse({ reason: "not_working", text: "Card page froze" })).toEqual({
      reason: "not_working",
      text: "Card page froze",
    });
    expect(DeclineReasonSchema.safeParse({ reason: "just_looking" }).success).toBe(false);
  });
});
