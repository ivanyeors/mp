import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeAftercareDb, type AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";
import { setMarketingEmailRpc } from "@/lib/marketing-consent/__tests__/fake-consent";
import { recordBoxConsent, recordBoxConsentByEmail } from "@/lib/marketing-consent/consent";
import { CONSENT_BOX_SOURCES, MARKETING_BOX_LABEL, consentSourcePhrase, describeConsent } from "@/lib/marketing-consent/state";
import { enUS as en } from "@/lib/i18n/messages/en-US";
import { zhCN as zh } from "@/lib/i18n/messages/zh-CN";

/**
 * The boxes past checkout (PRD-campaign-audiences slice 02; ADR 0039): a
 * customisation's contact step and booking an appointment. Each moves as the
 * checkout box does, under its own source; a form with no Customer of its own
 * finds or creates one by the email typed, and only when ticked.
 */

let db: AftercareFakeDb;
const client = () => fakeAftercareDb(db, { set_marketing_email: setMarketingEmailRpc }) as unknown as SupabaseClient;
const customer = (id: string) => db.customers.find((c) => c.id === id)!;

/** Finds a Customer by email in the fake, or creates one: findOrCreateCustomer's part. */
const byEmail = vi.fn(async (email: string) => {
  const normalized = email.trim().toLowerCase();
  const found = db.customers.find((c) => c.email === normalized);
  if (found) return found.id as string;
  const id = `c-${db.customers.length + 1}`;
  db.customers.push({ id, email: normalized, marketing_email: "not_subscribed", marketing_email_source: null });
  return id;
});

beforeEach(() => {
  byEmail.mockClear();
  db = {
    customers: [
      { id: "c-new", email: "new@x.test", marketing_email: "not_subscribed", marketing_email_source: null },
      { id: "c-left", email: "left@x.test", marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" },
      { id: "c-in", email: "in@x.test", marketing_email: "subscribed", marketing_email_source: "account" },
    ],
    customer_consent_events: [],
  };
});

describe("recordBoxConsent", () => {
  it.each(["customisation", "appointment"] as const)("%s, ticked: subscribes someone nobody has asked, under its own source", async (source) => {
    await recordBoxConsent(client(), "c-new", true, source);
    expect(customer("c-new")).toMatchObject({ marketing_email: "subscribed", marketing_email_source: source });
    expect(db.customer_consent_events).toEqual([
      expect.objectContaining({ customer_id: "c-new", from_state: "not_subscribed", to_state: "subscribed", source }),
    ]);
  });

  it.each(["customisation", "appointment"] as const)("%s, ticked: never re-subscribes someone who unsubscribed, nor replaces their choice", async (source) => {
    await recordBoxConsent(client(), "c-left", true, source);
    await recordBoxConsent(client(), "c-in", true, source);
    expect(customer("c-left")).toMatchObject({ marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" });
    expect(customer("c-in")).toMatchObject({ marketing_email: "subscribed", marketing_email_source: "account" });
    expect(db.customer_consent_events).toEqual([]);
  });

  it("unticked: asks nothing", async () => {
    const c = fakeAftercareDb(db, { set_marketing_email: setMarketingEmailRpc });
    await recordBoxConsent(c as unknown as SupabaseClient, "c-new", false, "appointment");
    expect(c.rpcCalls).toEqual([]);
  });
});

describe("recordBoxConsentByEmail", () => {
  it("ticked: finds the Customer by the email typed, in any case", async () => {
    await recordBoxConsentByEmail(client(), " NEW@x.test ", true, "customisation", byEmail);
    expect(customer("c-new")).toMatchObject({ marketing_email: "subscribed", marketing_email_source: "customisation" });
    expect(db.customers).toHaveLength(3);
  });

  it("ticked: creates a Customer for an email nobody has given before, and subscribes them", async () => {
    await recordBoxConsentByEmail(client(), "guest@x.test", true, "appointment", byEmail);
    expect(db.customers.find((c) => c.email === "guest@x.test")).toMatchObject({
      marketing_email: "subscribed",
      marketing_email_source: "appointment",
    });
  });

  it("unticked: neither looks anyone up nor creates anyone", async () => {
    await recordBoxConsentByEmail(client(), "guest@x.test", false, "appointment", byEmail);
    expect(byEmail).not.toHaveBeenCalled();
    expect(db.customers).toHaveLength(3);
  });

  it("ticked: still never re-subscribes someone who unsubscribed", async () => {
    await recordBoxConsentByEmail(client(), "left@x.test", true, "customisation", byEmail);
    expect(customer("c-left").marketing_email).toBe("unsubscribed");
  });

  it("never throws: a lookup or a write that fails is logged, and the hold or booking goes on", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = vi.fn(() => Promise.reject(new Error("duplicate key")));
    await expect(recordBoxConsentByEmail(client(), "x@x.test", true, "appointment", failing)).resolves.toBeUndefined();
    const broken = { rpc: () => Promise.reject(new Error("network")) } as unknown as SupabaseClient;
    await expect(recordBoxConsentByEmail(broken, "new@x.test", true, "customisation", byEmail)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe("the boxes' words and their provenance", () => {
  it("are the checkout box's words, in English and in Chinese on the booking form", () => {
    expect(en.slides.bookAppointment.flow.marketingEmail).toBe(MARKETING_BOX_LABEL);
    expect(zh.slides.bookAppointment.flow.marketingEmail).toMatch(/垃圾邮件/);
    expect(zh.slides.bookAppointment.flow.marketingEmail).toMatch(/退订/);
  });

  it("names each box on the Customer page", () => {
    const at = "2026-10-31T03:00:00.000Z";
    expect(describeConsent({ state: "subscribed", source: "customisation", updatedAt: at })).toBe(
      "Subscribed on 31 Oct 2026, from the box when they customised.",
    );
    expect(describeConsent({ state: "subscribed", source: "appointment", updatedAt: at })).toBe(
      "Subscribed on 31 Oct 2026, from the box when they booked.",
    );
    for (const source of CONSENT_BOX_SOURCES.filter((s) => s !== "newsletter")) {
      expect(consentSourcePhrase(source)).toMatch(/^from the box /);
    }
    // The footer sign-up acts as a box but is a form of its own (slice 03).
    expect(consentSourcePhrase("sign_in")).toBe("from the box when they signed in");
    expect(consentSourcePhrase("newsletter")).toBe("from the email sign-up in the site footer");
  });
});
