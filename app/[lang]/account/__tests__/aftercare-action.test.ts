import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";

const h = vi.hoisted(() => ({
  db: {} as AftercareFakeDb,
  sessionCustomerId: null as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/shop/customer-addresses", () => ({ getCurrentCustomerId: () => Promise.resolve(h.sessionCustomerId) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeAftercareDb, setAftercarePreferenceRpc } = await import("@/lib/aftercare/__tests__/fake-db");
  return { supabaseAdmin: () => fakeAftercareDb(h.db, { set_aftercare_preference: setAftercarePreferenceRpc }) };
});

const { setMyAftercarePreference } = await import("../actions");

const WORDING =
  "Mpillow may WhatsApp me at +65 9123 4567 with a review request after delivery and, for a Premium Mpillow, a yearly reminder about a paid re-adjustment visit. I can turn this off here at any time.";

beforeEach(() => {
  h.sessionCustomerId = "c-own";
  h.db = {
    customers: [
      { id: "c-own", phone: "9123 4567", aftercare_email: true, aftercare_whatsapp: false },
      { id: "c-other", phone: "98765432", aftercare_email: true, aftercare_whatsapp: false },
    ],
    customer_preference_events: [],
  };
});

const own = () => h.db.customers.find((c) => c.id === "c-own")!;
const other = () => h.db.customers.find((c) => c.id === "c-other")!;

describe("setMyAftercarePreference", () => {
  it("changes only the signed-in Customer's own row, whatever the body says", async () => {
    const result = await setMyAftercarePreference({
      preference: "aftercare_email",
      value: false,
      customerId: "c-other",
      customer_id: "c-other",
    });
    expect(result).toMatchObject({ ok: true, email: false });
    expect(own().aftercare_email).toBe(false);
    expect(other().aftercare_email).toBe(true);
    expect(h.db.customer_preference_events).toEqual([
      expect.objectContaining({ customer_id: "c-own", preference: "aftercare_email", to_value: false, source: "profile" }),
    ]);
  });

  it("writes one event per change and nothing for the same value", async () => {
    await setMyAftercarePreference({ preference: "aftercare_email", value: false });
    await setMyAftercarePreference({ preference: "aftercare_email", value: false });
    expect(h.db.customer_preference_events).toHaveLength(1);
  });

  it("stores the wording shown when turning WhatsApp on", async () => {
    expect(await setMyAftercarePreference({ preference: "aftercare_whatsapp", value: true })).toMatchObject({
      ok: true,
      whatsapp: true,
    });
    expect(h.db.customer_preference_events[0]).toMatchObject({
      preference: "aftercare_whatsapp",
      to_value: true,
      source: "profile",
      wording: WORDING,
    });
  });

  it("asks for a mobile first when none valid is on file, and changes nothing", async () => {
    for (const phone of [null, "12345"]) {
      own().phone = phone;
      expect(await setMyAftercarePreference({ preference: "aftercare_whatsapp", value: true })).toMatchObject({
        ok: false,
        needsMobile: true,
      });
      expect(await setMyAftercarePreference({ preference: "aftercare_whatsapp", value: true, mobile: "123" })).toMatchObject({
        ok: false,
        needsMobile: true,
      });
    }
    expect(own().aftercare_whatsapp).toBe(false);
    expect(h.db.customer_preference_events).toEqual([]);
  });

  it("saves the mobile typed, normalised, then turns WhatsApp on with it in the wording", async () => {
    own().phone = null;
    const result = await setMyAftercarePreference({ preference: "aftercare_whatsapp", value: true, mobile: "9123 4567" });
    expect(result).toEqual({ ok: true, email: true, whatsapp: true, phone: "+6591234567" });
    expect(own().phone).toBe("+6591234567");
    expect(h.db.customer_preference_events[0].wording).toBe(WORDING);
  });

  it("ignores a typed mobile when a valid one is already on file", async () => {
    await setMyAftercarePreference({ preference: "aftercare_whatsapp", value: true, mobile: "98765432" });
    expect(own().phone).toBe("9123 4567");
    expect(h.db.customer_preference_events[0].wording).toBe(WORDING);
  });

  it("does nothing without a signed-in Customer", async () => {
    h.sessionCustomerId = null;
    expect(await setMyAftercarePreference({ preference: "aftercare_email", value: false })).toMatchObject({ ok: false });
    expect(own().aftercare_email).toBe(true);
    expect(h.db.customer_preference_events).toEqual([]);
  });

  it("refuses a malformed change", async () => {
    expect(await setMyAftercarePreference({ preference: "marketing_email", value: true })).toMatchObject({ ok: false });
    expect(await setMyAftercarePreference({ preference: "aftercare_email", value: "no" })).toMatchObject({ ok: false });
  });
});
