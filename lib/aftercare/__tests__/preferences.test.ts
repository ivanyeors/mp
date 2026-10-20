import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  listOpenStopRequests,
  readAftercareView,
  readWhatsAppGate,
  setAftercarePreference,
} from "@/lib/aftercare/preferences";
import { fakeAftercareDb, setAftercarePreferenceRpc, type AftercareFakeDb } from "./fake-db";

/**
 * Aftercare preferences (CRM slice 13): the one write path, the Customer page's
 * view, and the derived STOP request. The SQL function itself is exercised
 * against Postgres when the migration is checked; here it is the fake's rpc.
 */

let db: AftercareFakeDb;
let client: ReturnType<typeof fakeAftercareDb>;
const admin = () => client as unknown as SupabaseClient;

beforeEach(() => {
  db = {
    customers: [
      { id: "c1", phone: "9123 4567", aftercare_email: true, aftercare_whatsapp: true },
      { id: "c2", phone: "+6598765432", aftercare_email: true, aftercare_whatsapp: false },
      { id: "c3", phone: null, aftercare_email: true, aftercare_whatsapp: true },
    ],
    customer_preference_events: [],
    whatsapp_inbound: [],
    customer_whatsapp: [],
    mp_staff: [{ id: "p-mei", name: "Mei" }],
  };
  client = fakeAftercareDb(db, { set_aftercare_preference: setAftercarePreferenceRpc });
});

describe("setAftercarePreference", () => {
  it("goes through the one SQL function with every argument", async () => {
    await setAftercarePreference(admin(), {
      customerId: "c1",
      preference: "aftercare_email",
      value: false,
      source: "staff",
      profileId: "p-mei",
      note: "asked by email reply",
    });
    expect(client.rpcCalls).toEqual([
      {
        name: "set_aftercare_preference",
        args: {
          p_customer_id: "c1",
          p_preference: "aftercare_email",
          p_value: false,
          p_source: "staff",
          p_profile_id: "p-mei",
          p_note: "asked by email reply",
          p_wording: null,
        },
      },
    ]);
  });

  it("writes the column and exactly one event, and nothing for the same value", async () => {
    expect(
      await setAftercarePreference(admin(), { customerId: "c1", preference: "aftercare_email", value: false, source: "staff" }),
    ).toEqual({ ok: true, changed: true });
    expect(
      await setAftercarePreference(admin(), { customerId: "c1", preference: "aftercare_email", value: false, source: "staff" }),
    ).toEqual({ ok: true, changed: false });
    expect(db.customers[0].aftercare_email).toBe(false);
    expect(db.customer_preference_events).toHaveLength(1);
  });

  it("reports a refusal instead of throwing", async () => {
    expect(
      await setAftercarePreference(admin(), { customerId: "c2", preference: "aftercare_whatsapp", value: true, source: "staff" }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/needs a note/) });
    expect(db.customer_preference_events).toHaveLength(0);
  });
});

describe("the derived STOP request", () => {
  it("is open for an opted-in Customer whose number sent STOP after their last change", async () => {
    db.customer_preference_events.push({
      customer_id: "c1",
      preference: "aftercare_whatsapp",
      to_value: true,
      source: "profile",
      created_at: "2026-10-20T00:00:00Z",
    });
    db.whatsapp_inbound.push({ message_id: "m1", phone: "+6591234567", kind: "stop", received_at: "2026-11-03T02:00:00Z" });

    expect(await readWhatsAppGate(admin(), "c1")).toEqual({ optedIn: true, phone: "9123 4567", stopRequested: true });
    const view = await readAftercareView(admin(), "c1");
    expect(view?.whatsapp.stopRequestedAt).toBe("2026-11-03T02:00:00Z");
    expect(await listOpenStopRequests(admin())).toEqual([{ customerId: "c1", stopRequestedAt: "2026-11-03T02:00:00Z" }]);
  });

  it("is closed by a later preference change", async () => {
    db.whatsapp_inbound.push({ message_id: "m1", phone: "+6591234567", kind: "stop", received_at: "2026-11-03T02:00:00Z" });
    db.customer_preference_events.push({
      customer_id: "c1",
      preference: "aftercare_whatsapp",
      to_value: true,
      source: "profile",
      created_at: "2026-11-04T00:00:00Z",
    });
    expect((await readWhatsAppGate(admin(), "c1"))?.stopRequested).toBe(false);
    expect(await listOpenStopRequests(admin())).toEqual([]);
  });

  it("ignores other numbers and other kinds of message", async () => {
    db.whatsapp_inbound.push(
      { message_id: "m1", phone: "+6590000000", kind: "stop", received_at: "2026-11-03T02:00:00Z" },
      { message_id: "m2", phone: "+6591234567", kind: "unknown", received_at: "2026-11-03T02:00:00Z" },
    );
    expect((await readWhatsAppGate(admin(), "c1"))?.stopRequested).toBe(false);
    expect(await listOpenStopRequests(admin())).toEqual([]);
  });
});

describe("readAftercareView", () => {
  it("returns each switch with its last change, the history and who made it", async () => {
    db.customer_preference_events.push(
      {
        customer_id: "c1",
        preference: "aftercare_email",
        to_value: false,
        source: "staff",
        changed_by_profile_id: "p-mei",
        note: "asked on WhatsApp",
        wording: null,
        created_at: "2026-10-20T03:00:00Z",
      },
      {
        customer_id: "c1",
        preference: "aftercare_whatsapp",
        to_value: true,
        source: "profile",
        changed_by_profile_id: null,
        note: null,
        wording: "Mpillow may WhatsApp me at +65 9123 4567 …",
        created_at: "2026-10-19T03:00:00Z",
      },
    );
    db.customers[0].aftercare_email = false;

    const view = await readAftercareView(admin(), "c1");
    expect(view?.email).toEqual({
      on: false,
      last: {
        preference: "aftercare_email",
        toValue: false,
        source: "staff",
        profileName: "Mei",
        note: "asked on WhatsApp",
        wording: null,
        createdAt: "2026-10-20T03:00:00Z",
      },
    });
    expect(view?.whatsapp).toMatchObject({ on: true, stopRequestedAt: null, marketingOff: false });
    expect(view?.whatsapp.last?.wording).toMatch(/^Mpillow may WhatsApp me/);
    expect(view?.history.map((e) => e.preference)).toEqual(["aftercare_email", "aftercare_whatsapp"]);
  });

  it("shows when WhatsApp refused the latest send because marketing is off", async () => {
    db.customer_whatsapp.push({
      customer_id: "c1",
      template: "aftercare.review_request",
      status: "failed",
      last_error: "whatsapp_marketing_off",
      created_at: "2026-11-05T00:00:00Z",
    });
    expect((await readAftercareView(admin(), "c1"))?.whatsapp.marketingOff).toBe(true);
  });

  it("is null for no such Customer", async () => {
    expect(await readAftercareView(admin(), "nope")).toBeNull();
  });
});
