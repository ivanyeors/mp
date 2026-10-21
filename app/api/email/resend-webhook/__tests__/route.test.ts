import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AftercareFakeDb, RpcHandler } from "@/lib/aftercare/__tests__/fake-db";

/**
 * Resend's webhook for campaign mail (migration slice 08). A forged, missing
 * or stale signature is a 401 and changes nothing. A hard bounce marks the
 * send `bounced`; a complaint marks it `complained` and unsubscribes the
 * Customer with source `complaint`, writing the consent event. Repeats change
 * nothing, and anything that is not a campaign send is acknowledged and left
 * alone.
 */

const h = vi.hoisted(() => ({ db: {} as AftercareFakeDb, calls: [] as string[] }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeAftercareDb } = await import("@/lib/aftercare/__tests__/fake-db");
  const { setMarketingEmailRpc } = await import("@/lib/marketing-consent/__tests__/fake-consent");
  /** record_campaign_send_event as 20261020130000 defines it. */
  const recordEvent: RpcHandler = (args, db) => {
    h.calls.push(`${String(args.p_event)}:${String(args.p_provider_message_id)}`);
    const row = (db.customer_campaign_sends ?? []).find((s) => s.provider_message_id === args.p_provider_message_id);
    if (!row) return { data: [], error: null };
    const at = (args.p_at as string | null) ?? new Date().toISOString();
    let changed = false;
    let unsubscribed = false;
    if (args.p_event === "bounced") {
      if (row.status === "sent") {
        Object.assign(row, { status: "bounced", bounced_at: row.bounced_at ?? at });
        changed = true;
      }
    } else {
      if (row.status === "sent" || row.status === "bounced") {
        Object.assign(row, { status: "complained", complained_at: row.complained_at ?? at });
        changed = true;
      }
      const r = setMarketingEmailRpc({ p_customer_id: row.customer_id, p_to: "unsubscribed", p_source: "complaint" }, db);
      unsubscribed = r.data === true;
    }
    return { data: [{ send_id: row.id, customer_id: row.customer_id, changed, unsubscribed }], error: null };
  };
  return { supabaseAdmin: () => fakeAftercareDb(h.db, { record_campaign_send_event: recordEvent }) };
});

const { signWebhook } = await import("@/lib/email/resend-webhook");
const route = await import("../route");

const SECRET = `whsec_${Buffer.from("campaign-webhook-test-key").toString("base64")}`;
const CUSTOMER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const URL_ = "https://custom.mpillow.com/api/email/resend-webhook";

const nowSeconds = () => String(Math.floor(Date.now() / 1000));

function signed(payload: unknown, { secret = SECRET, id = "msg_1", timestamp = nowSeconds(), signature }: { secret?: string; id?: string; timestamp?: string; signature?: string } = {}) {
  const body = JSON.stringify(payload);
  return new Request(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature ?? `v1,${signWebhook(secret, id, timestamp, body)}`,
    },
    body,
  });
}

const event = (type: string, emailId = "re_sent_1", data: Record<string, unknown> = {}) => ({
  type,
  created_at: "2026-10-21T05:00:00.000Z",
  data: { email_id: emailId, to: ["ann@example.com"], ...data },
});

const send = () => h.db.customer_campaign_sends[0];
const customer = () => h.db.customers[0];

beforeEach(() => {
  vi.stubEnv("CAMPAIGN_RESEND_WEBHOOK_SECRET", SECRET);
  h.calls = [];
  h.db = {
    customers: [{ id: CUSTOMER, email: "ann@example.com", marketing_email: "subscribed", marketing_email_source: "shopify_import" }],
    customer_consent_events: [],
    customer_campaign_sends: [
      { id: "s1", customer_id: CUSTOMER, template: "migration_announcement", wave: "w1", status: "sent", provider_message_id: "re_sent_1", bounced_at: null, complained_at: null },
    ],
  };
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/email/resend-webhook: the signature", () => {
  it("refuses a forged signature with a 401, and changes nothing", async () => {
    const forged = signed(event("email.complained"), { signature: `v1,${signWebhook(`whsec_${Buffer.from("someone-else").toString("base64")}`, "msg_1", nowSeconds(), "{}")}` });
    const res = await route.POST(forged);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_signature" });
    expect(h.calls).toEqual([]);
    expect(send().status).toBe("sent");
    expect(customer().marketing_email).toBe("subscribed");
  });

  it("refuses a body changed after signing", async () => {
    const req = signed(event("email.bounced"));
    const tampered = new Request(URL_, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(event("email.complained")),
    });
    expect((await route.POST(tampered)).status).toBe(401);
    expect(h.calls).toEqual([]);
  });

  it("refuses a missing signature, and one older than five minutes", async () => {
    const bare = new Request(URL_, { method: "POST", body: JSON.stringify(event("email.bounced")) });
    expect((await route.POST(bare)).status).toBe(401);
    const stale = String(Math.floor(Date.now() / 1000) - 6 * 60);
    expect((await route.POST(signed(event("email.bounced"), { timestamp: stale }))).status).toBe(401);
    expect(h.calls).toEqual([]);
  });

  it("accepts any one valid signature among several", async () => {
    const payload = event("email.delivered");
    const ts = nowSeconds();
    const good = signWebhook(SECRET, "msg_9", ts, JSON.stringify(payload));
    const res = await route.POST(signed(payload, { id: "msg_9", timestamp: ts, signature: `v1,bm9wZQ== v1,${good}` }));
    expect(res.status).toBe(200);
  });

  it("answers 503 while the secret is not set", async () => {
    vi.stubEnv("CAMPAIGN_RESEND_WEBHOOK_SECRET", "");
    expect((await route.POST(signed(event("email.bounced")))).status).toBe(503);
  });
});

describe("POST /api/email/resend-webhook: the events", () => {
  it("a hard bounce marks the send bounced, once, and leaves consent alone", async () => {
    const res = await route.POST(signed(event("email.bounced", "re_sent_1", { bounce: { type: "Permanent", message: "No such user" } })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, event: "bounced", matched: true, changed: true, unsubscribed: false });
    expect(send()).toMatchObject({ status: "bounced", bounced_at: "2026-10-21T05:00:00.000Z" });
    expect(customer().marketing_email).toBe("subscribed");

    const again = await route.POST(signed(event("email.bounced"), { id: "msg_2" }));
    expect(await again.json()).toMatchObject({ changed: false });
  });

  it("a transient bounce is not a hard bounce", async () => {
    const res = await route.POST(signed(event("email.bounced", "re_sent_1", { bounce: { type: "Transient" } })));
    expect(await res.json()).toMatchObject({ ok: true, ignored: "email.bounced (transient)" });
    expect(send().status).toBe("sent");
    expect(h.calls).toEqual([]);
  });

  it("a complaint marks the send and unsubscribes the Customer, source complaint, with one event", async () => {
    const res = await route.POST(signed(event("email.complained")));
    expect(await res.json()).toMatchObject({ ok: true, event: "complained", changed: true, unsubscribed: true });
    expect(send()).toMatchObject({ status: "complained" });
    expect(customer()).toMatchObject({ marketing_email: "unsubscribed", marketing_email_source: "complaint" });
    expect(h.db.customer_consent_events).toEqual([
      expect.objectContaining({ customer_id: CUSTOMER, from_state: "subscribed", to_state: "unsubscribed", source: "complaint" }),
    ]);

    const again = await route.POST(signed(event("email.complained"), { id: "msg_3" }));
    expect(await again.json()).toMatchObject({ changed: false, unsubscribed: false });
    expect(h.db.customer_consent_events).toHaveLength(1);
  });

  it("acknowledges what is not a campaign send, or not an event it handles", async () => {
    const other = await route.POST(signed(event("email.bounced", "re_order_mail")));
    expect(await other.json()).toMatchObject({ ok: true, matched: false, changed: false });
    const delivered = await route.POST(signed(event("email.delivered")));
    expect(await delivered.json()).toEqual({ ok: true, ignored: "email.delivered" });
    const noId = await route.POST(signed({ type: "email.complained", data: {} }));
    expect(await noId.json()).toMatchObject({ ok: true, ignored: "email.complained" });
    expect(send().status).toBe("sent");
  });
});
