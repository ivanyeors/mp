import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";

const h = vi.hoisted(() => ({
  db: {} as AftercareFakeDb,
  sessionCustomerId: null as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/shop/customer-addresses", () => ({ getCurrentCustomerId: () => Promise.resolve(h.sessionCustomerId) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeAftercareDb } = await import("@/lib/aftercare/__tests__/fake-db");
  const { setMarketingEmailRpc } = await import("@/lib/marketing-consent/__tests__/fake-consent");
  return { supabaseAdmin: () => fakeAftercareDb(h.db, { set_marketing_email: setMarketingEmailRpc }) };
});

const { setMyMarketingEmail } = await import("../actions");

beforeEach(() => {
  h.sessionCustomerId = "c-own";
  h.db = {
    customers: [
      { id: "c-own", marketing_email: "not_subscribed", marketing_email_source: null },
      { id: "c-other", marketing_email: "not_subscribed", marketing_email_source: null },
    ],
    customer_consent_events: [],
  };
});

const own = () => h.db.customers.find((c) => c.id === "c-own")!;
const events = () => h.db.customer_consent_events;

describe("setMyMarketingEmail", () => {
  it("round-trips: on, then off, each read back and each recorded", async () => {
    expect(await setMyMarketingEmail({ subscribed: true })).toEqual({ ok: true, state: "subscribed" });
    expect(own()).toMatchObject({ marketing_email: "subscribed", marketing_email_source: "account" });

    expect(await setMyMarketingEmail({ subscribed: false })).toEqual({ ok: true, state: "unsubscribed" });
    expect(own()).toMatchObject({ marketing_email: "unsubscribed", marketing_email_source: "account" });

    expect(events()).toEqual([
      expect.objectContaining({ customer_id: "c-own", from_state: "not_subscribed", to_state: "subscribed", source: "account" }),
      expect.objectContaining({ customer_id: "c-own", from_state: "subscribed", to_state: "unsubscribed", source: "account" }),
    ]);
  });

  it("writes nothing for the state they already have", async () => {
    await setMyMarketingEmail({ subscribed: true });
    await setMyMarketingEmail({ subscribed: true });
    expect(events()).toHaveLength(1);
  });

  it("re-subscribes someone who unsubscribed from a link: their own action is the one way back", async () => {
    Object.assign(own(), { marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" });
    expect(await setMyMarketingEmail({ subscribed: true })).toEqual({ ok: true, state: "subscribed" });
    expect(events()).toEqual([
      expect.objectContaining({ from_state: "unsubscribed", to_state: "subscribed", source: "account" }),
    ]);
  });

  it("changes only the signed-in Customer's own row, whatever the body says", async () => {
    await setMyMarketingEmail({ subscribed: true, customerId: "c-other", customer_id: "c-other" });
    expect(own().marketing_email).toBe("subscribed");
    expect(h.db.customers.find((c) => c.id === "c-other")!.marketing_email).toBe("not_subscribed");
  });

  it("does nothing without a signed-in Customer, or for a malformed change", async () => {
    h.sessionCustomerId = null;
    expect(await setMyMarketingEmail({ subscribed: true })).toMatchObject({ ok: false });
    h.sessionCustomerId = "c-own";
    expect(await setMyMarketingEmail({ subscribed: "yes" })).toMatchObject({ ok: false });
    expect(await setMyMarketingEmail({ state: "subscribed" })).toMatchObject({ ok: false });
    expect(events()).toEqual([]);
  });
});
