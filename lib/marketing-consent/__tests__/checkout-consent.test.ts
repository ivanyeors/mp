import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeAftercareDb, type AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";
import { setMarketingEmailRpc } from "@/lib/marketing-consent/__tests__/fake-consent";
import { recordCheckoutConsent } from "@/lib/marketing-consent/consent";
import { MARKETING_BOX_LABEL, describeConsent } from "@/lib/marketing-consent/state";

/**
 * The checkout box, ticked by default (ADR 0039): ticked, it subscribes a
 * Customer nobody has asked, with source `checkout`, and nobody else; unticked,
 * it changes nothing; a failure never stops the sale.
 */

let db: AftercareFakeDb;
const client = () => fakeAftercareDb(db, { set_marketing_email: setMarketingEmailRpc }) as unknown as SupabaseClient;
const customer = (id: string) => db.customers.find((c) => c.id === id)!;

beforeEach(() => {
  db = {
    customers: [
      { id: "c-new", marketing_email: "not_subscribed", marketing_email_source: null },
      { id: "c-left", marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" },
      { id: "c-in", marketing_email: "subscribed", marketing_email_source: "account" },
    ],
    customer_consent_events: [],
  };
});

describe("recordCheckoutConsent", () => {
  it("ticked: subscribes someone nobody has asked, from the box at checkout", async () => {
    await recordCheckoutConsent(client(), "c-new", true);
    expect(customer("c-new")).toMatchObject({ marketing_email: "subscribed", marketing_email_source: "checkout" });
    expect(db.customer_consent_events).toEqual([
      expect.objectContaining({ customer_id: "c-new", from_state: "not_subscribed", to_state: "subscribed", source: "checkout" }),
    ]);
  });

  it("ticked: never re-subscribes someone who unsubscribed, nor replaces their own choice", async () => {
    await recordCheckoutConsent(client(), "c-left", true);
    await recordCheckoutConsent(client(), "c-in", true);
    expect(customer("c-left")).toMatchObject({ marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" });
    expect(customer("c-in")).toMatchObject({ marketing_email: "subscribed", marketing_email_source: "account" });
    expect(db.customer_consent_events).toEqual([]);
  });

  it("unticked: changes nothing, and asks nothing", async () => {
    const c = fakeAftercareDb(db, { set_marketing_email: setMarketingEmailRpc });
    await recordCheckoutConsent(c as unknown as SupabaseClient, "c-in", false);
    expect(c.rpcCalls).toEqual([]);
    expect(customer("c-in").marketing_email).toBe("subscribed");
  });

  it("never throws: a failed write is logged and the checkout goes on", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recordCheckoutConsent(client(), "c-missing", true)).resolves.toBeUndefined();
    const broken = { rpc: () => Promise.reject(new Error("network")) } as unknown as SupabaseClient;
    await expect(recordCheckoutConsent(broken, "c-new", true)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe("the box's words and its provenance", () => {
  it("says what the emails are and promises no spam, in one line", () => {
    expect(MARKETING_BOX_LABEL).toMatch(/important updates/);
    expect(MARKETING_BOX_LABEL).toMatch(/offers/);
    expect(MARKETING_BOX_LABEL).toMatch(/No spam/);
    expect(MARKETING_BOX_LABEL.length).toBeLessThanOrEqual(100);
  });

  it("names each new source on the Customer page", () => {
    const at = "2026-10-31T03:00:00.000Z";
    expect(describeConsent({ state: "subscribed", source: "checkout", updatedAt: at })).toBe(
      "Subscribed on 31 Oct 2026, from the box at checkout.",
    );
    expect(describeConsent({ state: "subscribed", source: "import_default", updatedAt: at })).toBe(
      "Subscribed on 31 Oct 2026, from the import, by default.",
    );
    expect(describeConsent({ state: "unsubscribed", source: "shopify_unsubscribed", updatedAt: at })).toBe(
      "Unsubscribed on 31 Oct 2026, from Shopify's unsubscribed list.",
    );
  });
});
