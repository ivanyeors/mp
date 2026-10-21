import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";

/**
 * One-click unsubscribe (migration slice 07): a GET changes nothing; a POST
 * with a valid token unsubscribes, writes one event and is idempotent, from
 * the confirm page's button and from a mail client's RFC 8058 one-click; a
 * POST with a bad token is a 400 with no change. The route's answer to an
 * empty POST is what a campaign sender probes before it sends.
 */

const h = vi.hoisted(() => ({ db: {} as AftercareFakeDb, rpcCalls: 0 }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeAftercareDb } = await import("@/lib/aftercare/__tests__/fake-db");
  const { setMarketingEmailRpc } = await import("@/lib/marketing-consent/__tests__/fake-consent");
  return {
    supabaseAdmin: () =>
      fakeAftercareDb(h.db, {
        set_marketing_email: (args, db) => {
          h.rpcCalls++;
          return setMarketingEmailRpc(args, db);
        },
      }),
  };
});

const { unsubscribeToken, probeUnsubscribeRoute } = await import("@/lib/marketing-consent/unsubscribe");
const route = await import("../route");

const SECRET = "route-test-secret";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BASE = "https://custom.mpillow.com/api/email/unsubscribe";

const own = () => h.db.customers.find((c) => c.id === ID)!;
const link = (u = ID, t = unsubscribeToken(ID, SECRET)!) => `${BASE}?u=${u}&t=${encodeURIComponent(t)}`;
const form = (url: string, body: Record<string, string>) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
const oneClick = (url = link()) => route.POST(form(url, { "List-Unsubscribe": "One-Click" }));

beforeEach(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", SECRET);
  h.rpcCalls = 0;
  h.db = {
    customers: [
      { id: ID, email: "a@x.test", marketing_email: "subscribed", marketing_email_source: "shopify_import" },
    ],
    customer_consent_events: [],
  };
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/email/unsubscribe", () => {
  it("changes nothing, and sends a browser to the confirm page with the link", async () => {
    const res = await route.GET(new Request(link()));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/en-US/unsubscribe");
    expect(to.searchParams.get("u")).toBe(ID);
    expect(to.searchParams.get("t")).toBe(unsubscribeToken(ID, SECRET));
    expect(h.rpcCalls).toBe(0);
    expect(own().marketing_email).toBe("subscribed");
    expect(h.db.customer_consent_events).toEqual([]);
  });
});

describe("POST /api/email/unsubscribe", () => {
  it("honours an RFC 8058 one-click POST: 200, unsubscribed, one event", async () => {
    const res = await oneClick();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(own()).toMatchObject({ marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" });
    expect(h.db.customer_consent_events).toEqual([
      expect.objectContaining({
        customer_id: ID,
        channel: "email",
        from_state: "subscribed",
        to_state: "unsubscribed",
        source: "unsubscribe_link",
      }),
    ]);
  });

  it("is idempotent: a second click answers the same and writes nothing", async () => {
    await oneClick();
    const again = await oneClick();
    expect(again.status).toBe(200);
    expect(h.db.customer_consent_events).toHaveLength(1);
  });

  it("takes the confirm page's button and sends the browser back to that page", async () => {
    const t = unsubscribeToken(ID, SECRET)!;
    const res = await route.POST(form(BASE, { u: ID, t, lang: "zh-CN", via: "page" }));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/zh-CN/unsubscribe");
    expect(to.searchParams.get("u")).toBe(ID);
    expect(own().marketing_email).toBe("unsubscribed");
  });

  it("refuses a bad token with a 400 and changes nothing", async () => {
    const t = unsubscribeToken(ID, SECRET)!;
    const forged = [
      link(ID, `${t.slice(0, -2)}xx`),
      link(ID, unsubscribeToken(ID, "someone-elses-secret")!),
      link("1f8fad5b-d9cb-469f-a165-70867728950e", t),
      `${BASE}?u=${ID}`,
      BASE,
    ];
    for (const url of forged) {
      const res = await oneClick(url);
      expect(res.status, url).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "invalid_link" });
    }
    expect(h.rpcCalls).toBe(0);
    expect(own().marketing_email).toBe("subscribed");
    expect(h.db.customer_consent_events).toEqual([]);
  });

  it("answers 503 while UNSUBSCRIBE_SECRET is unset, and changes nothing", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    const res = await oneClick();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "not_configured" });
    expect(h.rpcCalls).toBe(0);
  });

  it("treats a Customer since deleted as done", async () => {
    h.db.customers = [];
    expect((await oneClick()).status).toBe(200);
  });
});

describe("probeUnsubscribeRoute against this route", () => {
  const viaRoute = (async (_url: string, init: RequestInit) =>
    route.POST(new Request(BASE, init))) as unknown as typeof fetch;

  it("reads it as live, without changing anyone", async () => {
    expect(await probeUnsubscribeRoute("https://custom.mpillow.com", viaRoute)).toEqual({ ready: true });
    expect(h.rpcCalls).toBe(0);
  });

  it("reads it as not ready without its secret", async () => {
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    expect((await probeUnsubscribeRoute("https://custom.mpillow.com", viaRoute)).ready).toBe(false);
  });
});
