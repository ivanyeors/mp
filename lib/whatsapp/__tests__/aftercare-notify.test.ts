import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAftercareDb, type AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";

const send = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/appointments/whatsapp", async (orig) => {
  const real = await orig<typeof import("@/lib/appointments/whatsapp")>();
  return { ...real, sendTemplateMessage: send.fn };
});
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { WhatsAppSendError } = await import("@/lib/appointments/whatsapp");
const {
  aftercareSendError,
  aftercareTemplateName,
  decideAftercareWhatsApp,
  latestAftercareSentAt,
  notifyAftercareWhatsApp,
  recordAftercareDeliveryFailure,
} = await import("@/lib/whatsapp/aftercare-notify");

const base = {
  templateName: "aftercare_review_request",
  optedIn: true,
  stopRequested: false,
  phone: "9123 4567",
  nonProdAllowed: () => true,
};

describe("decideAftercareWhatsApp", () => {
  it("sends to the normalised mobile when every gate is open", () => {
    expect(decideAftercareWhatsApp(base)).toEqual({ send: true, e164: "+6591234567", templateName: "aftercare_review_request" });
  });

  it.each([
    ["template_unconfigured", { templateName: null }],
    ["template_unconfigured", { templateName: "  " }],
    ["opted_out", { optedIn: false }],
    ["opted_out", { optedIn: null }],
    ["stop_requested", { stopRequested: true }],
    ["no_mobile", { phone: null }],
    ["no_mobile", { phone: " " }],
    ["invalid_mobile", { phone: "12345" }],
    ["not_allowed_outside_production", { nonProdAllowed: () => false }],
  ] as const)("skips with %s", (skip, over) => {
    expect(decideAftercareWhatsApp({ ...base, ...over })).toEqual({ send: false, skip });
  });

  it("checks the cheap, common gates first", () => {
    expect(decideAftercareWhatsApp({ ...base, optedIn: false, stopRequested: true })).toEqual({ send: false, skip: "opted_out" });
    expect(decideAftercareWhatsApp({ ...base, templateName: null, optedIn: false })).toEqual({
      send: false,
      skip: "template_unconfigured",
    });
  });

  it("hands the allowlist the normalised number", () => {
    const allowed = vi.fn(() => true);
    decideAftercareWhatsApp({ ...base, phone: "65 9123 4567", nonProdAllowed: allowed });
    expect(allowed).toHaveBeenCalledWith("+6591234567");
  });
});

describe("aftercareTemplateName", () => {
  it("reads each template's env var, and nothing when unset", () => {
    const env = { WHATSAPP_TEMPLATE_AFTERCARE_REVIEW: " aftercare_review_request ", WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP: "" };
    expect(aftercareTemplateName("aftercare.review_request", env)).toBe("aftercare_review_request");
    expect(aftercareTemplateName("aftercare.checkup_12m", env)).toBeNull();
    expect(aftercareTemplateName("aftercare.checkup_12m", { WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP: "aftercare_checkup" })).toBe(
      "aftercare_checkup",
    );
  });
});

describe("aftercareSendError", () => {
  it("records a 131050 refusal as whatsapp_marketing_off, at send or on the webhook", () => {
    expect(aftercareSendError(new WhatsAppSendError("WhatsApp send failed (400): Unable to deliver", 400, 131050))).toBe(
      "whatsapp_marketing_off",
    );
    expect(aftercareSendError(new Error("WhatsApp delivery failed (131050): marketing messages off"))).toBe(
      "whatsapp_marketing_off",
    );
  });

  it("keeps any other reason as it is", () => {
    expect(aftercareSendError(new WhatsAppSendError("WhatsApp send failed (400): bad param", 400, 132000))).toBe(
      "WhatsApp send failed (400): bad param",
    );
  });
});

describe("notifyAftercareWhatsApp", () => {
  let db: AftercareFakeDb;
  let client: ReturnType<typeof fakeAftercareDb>;
  const admin = () => client as unknown as SupabaseClient;
  const input = {
    customerId: "c1",
    template: "aftercare.review_request" as const,
    entityId: "c1",
    bodyParams: ["Ivan", "#1042", "Premium Mpillow", "3 Nov 2026", "+65 8780 5311"],
    urlButtonParam: "Zx81kQ",
  };

  beforeEach(() => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "sender";
    process.env.WHATSAPP_TOKEN = "token";
    process.env.WHATSAPP_TEMPLATE_AFTERCARE_REVIEW = "aftercare_review_request";
    db = {
      customers: [{ id: "c1", phone: "91234567", aftercare_whatsapp: true }],
      customer_preference_events: [],
      whatsapp_inbound: [],
      customer_whatsapp: [],
    };
    client = fakeAftercareDb(db);
    send.fn.mockReset();
    send.fn.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return "wamid.1";
    });
  });

  afterEach(() => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_TEMPLATE_AFTERCARE_REVIEW;
  });

  it("claims, sends with the URL button, and marks the ledger sent", async () => {
    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: true });
    expect(send.fn).toHaveBeenCalledWith("+6591234567", "aftercare_review_request", input.bodyParams, {
      urlButtonParam: "Zx81kQ",
    });
    expect(db.customer_whatsapp).toEqual([
      expect.objectContaining({
        customer_id: "c1",
        template: "aftercare.review_request",
        entity_id: "c1",
        phone: "+6591234567",
        status: "sent",
        wa_id: "wamid.1",
        sent_at: expect.any(String),
      }),
    ]);
  });

  it("sends once under concurrent runs: the ledger key decides, not timing", async () => {
    const results = await Promise.all([
      notifyAftercareWhatsApp(admin(), input),
      notifyAftercareWhatsApp(admin(), input),
      notifyAftercareWhatsApp(admin(), input),
    ]);
    expect(send.fn).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(results.filter((r) => "skip" in r && r.skip === "duplicate")).toHaveLength(2);
    expect(db.customer_whatsapp).toHaveLength(1);
  });

  it("records a 131050 as whatsapp_marketing_off, and does not retry a failure", async () => {
    send.fn.mockRejectedValueOnce(new WhatsAppSendError("WhatsApp send failed (400): Unable to deliver", 400, 131050));
    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: false, error: "whatsapp_marketing_off" });
    expect(db.customer_whatsapp[0]).toMatchObject({ status: "failed", last_error: "whatsapp_marketing_off" });
    expect(db.customers[0].aftercare_whatsapp).toBe(true);

    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: false, skip: "duplicate" });
    expect(send.fn).toHaveBeenCalledTimes(1);
  });

  it("skips silently, without a ledger row, for each closed gate", async () => {
    db.customers[0].aftercare_whatsapp = false;
    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: false, skip: "opted_out" });

    db.customers[0].aftercare_whatsapp = true;
    db.whatsapp_inbound.push({ message_id: "m1", phone: "+6591234567", kind: "stop", received_at: new Date().toISOString() });
    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: false, skip: "stop_requested" });

    delete process.env.WHATSAPP_TEMPLATE_AFTERCARE_REVIEW;
    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: false, skip: "template_unconfigured" });

    delete process.env.WHATSAPP_TOKEN;
    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: false, skip: "transport_unconfigured" });

    expect(send.fn).not.toHaveBeenCalled();
    expect(db.customer_whatsapp).toEqual([]);
  });

  it("resumes after a later preference change closes the STOP request", async () => {
    db.whatsapp_inbound.push({ message_id: "m1", phone: "+6591234567", kind: "stop", received_at: "2026-11-03T02:00:00Z" });
    db.customer_preference_events.push({
      customer_id: "c1",
      preference: "aftercare_whatsapp",
      to_value: true,
      source: "profile",
      created_at: "2026-11-04T02:00:00Z",
    });
    expect(await notifyAftercareWhatsApp(admin(), input)).toEqual({ sent: true });
  });
});

describe("the ledger reads the webhook uses", () => {
  it("finds the number's latest delivered aftercare send", async () => {
    const client = fakeAftercareDb({
      customer_whatsapp: [
        { phone: "+6591234567", status: "sent", sent_at: "2026-11-01T00:00:00Z" },
        { phone: "+6591234567", status: "sent", sent_at: "2026-11-03T00:00:00Z" },
        { phone: "+6591234567", status: "failed", sent_at: "2026-11-05T00:00:00Z" },
        { phone: "+6590000000", status: "sent", sent_at: "2026-11-06T00:00:00Z" },
      ],
    });
    expect(await latestAftercareSentAt("+6591234567", client as unknown as SupabaseClient)).toBe("2026-11-03T00:00:00Z");
    expect(await latestAftercareSentAt("+6599999999", client as unknown as SupabaseClient)).toBeNull();
  });

  it("marks a late delivery failure on the matching row, 131050 by name", async () => {
    const db: AftercareFakeDb = {
      customer_whatsapp: [
        { id: 1, wa_id: "wamid.a", status: "sent", last_error: null },
        { id: 2, wa_id: "wamid.b", status: "sent", last_error: null },
      ],
    };
    const client = fakeAftercareDb(db) as unknown as SupabaseClient;
    expect(await recordAftercareDeliveryFailure("wamid.a", "WhatsApp delivery failed (131050): marketing off", client)).toBe(1);
    expect(await recordAftercareDeliveryFailure("wamid.appointment", "WhatsApp delivery failed (131026): x", client)).toBe(0);
    expect(db.customer_whatsapp).toEqual([
      { id: 1, wa_id: "wamid.a", status: "failed", last_error: "whatsapp_marketing_off" },
      { id: 2, wa_id: "wamid.b", status: "sent", last_error: null },
    ]);
  });
});
