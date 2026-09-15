import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Re-submitting an existing Result through POST /api/results/hold (slice 05).
 *
 * The real exported POST against a small in-memory `mp_config_responses`, so the
 * assertions are about what the row looks like afterwards, not which calls ran.
 * Pricing, settings and the Rules Engine are stubbed to a payable quote; the
 * ownership gate (lib/results/access.ts) runs for real.
 */

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  requireAnyAdmin: vi.fn(),
  getAuthUser: vi.fn(),
  createHoldCheckout: vi.fn(),
  sendEmail: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let op: "select" | "update" | "insert" | "delete" = "select";
      let payload: Record<string, unknown> = {};
      const run = () => {
        if (table === "items") {
          return [{ id: 1, category: "cover", name: "Cover" }, { id: 2, category: "case", name: "Case" }];
        }
        if (table !== "mp_config_responses") return [];
        if (op === "insert") {
          h.rows.set(payload.id as string, { ...payload });
          return [{ ...payload }];
        }
        const hit = [...h.rows.values()].filter((r) => filters.every(([c, v]) => (r[c] ?? null) === v));
        for (const r of hit) {
          if (op === "delete") h.rows.delete(r.id as string);
          if (op === "update") h.rows.set(r.id as string, { ...r, ...payload });
        }
        return hit.map((r) => ({ ...r }));
      };
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push([c, v]), b),
        is: (c: string, v: unknown) => (filters.push([c, v]), b),
        in: () => b,
        delete: () => ((op = "delete"), b),
        update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), b),
        insert: (p: Record<string, unknown>) => ((op = "insert"), (payload = p), b),
        upsert: async (row: Record<string, unknown>) => {
          const id = row.id as string;
          h.rows.set(id, { ...h.rows.get(id), ...row });
          return { error: null };
        },
        maybeSingle: async () => {
          if (table === "shipping_methods") return { data: { slug: "standard" }, error: null };
          const [row] = run();
          return { data: row ?? null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(resolve),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: h.getAuthUser }));
vi.mock("@/lib/auth/admin", () => ({
  requireAnyAdmin: h.requireAnyAdmin,
  getAdminContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/authorization-hold", () => ({ createHoldCheckout: h.createHoldCheckout }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: h.sendEmail }) }));
vi.mock("@/lib/email/transport", () => ({ getDefaultFromAddress: () => "from@x.test" }));
vi.mock("@/lib/email/results", () => ({
  renderResultHeldEmail: () => ({ subject: "held", html: "", text: "" }),
}));
vi.mock("@/lib/discovery-source", () => ({
  getDiscoverySourceCatalog: vi.fn().mockResolvedValue([]),
  validateDiscoverySource: () => null,
  normalizeDiscoverySourceOther: () => null,
}));
vi.mock("@/lib/results/composed-sellable", () => ({
  BOLSTER_LENGTHS: ["short", "medium", "long"],
  loadComposedSellable: vi.fn().mockResolvedValue({
    ok: true,
    sellable: { currency: "SGD", msrpByFamily: {}, defaultCover: null, defaultCase: null, caseOptions: [] },
  }),
}));
vi.mock("@/lib/pricing/composed-price", () => ({
  placedChargeLines: () => [],
  resolvePreferences: () => ({ chosenCover: null, chosenCase: null }),
  priceComposedBuild: () => ({ ok: true, subtotal: 200 }),
}));
vi.mock("@/lib/shop/customization-inventory", () => ({
  isCaseInventoryCategory: () => false,
  isProtectorInventoryCategory: () => false,
  itemMatchesPreferenceRole: () => true,
}));
vi.mock("@/lib/ecommerce/shipping", () => ({ calculateShippingRate: () => 0 }));
vi.mock("@/lib/ecommerce/tax", () => ({
  resolveTaxRuleForRegion: vi.fn().mockResolvedValue(null),
  computeTax: () => ({ taxAmount: 0 }),
}));
vi.mock("@/lib/result-pricing", () => ({ priceResult: () => ({ total: 200 }) }));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/sla-reminders", () => ({
  SLA_SETTING_KEYS: [],
  parseSlaSettings: () => ({ authHoldEnabled: true }),
}));
vi.mock("@/lib/configurator/pre-order-persist", () => ({
  loadPreOrderTriggerAtHold: vi.fn().mockResolvedValue(null),
  preOrderFlagForResult: () => false,
}));
vi.mock("@/lib/referrals", () => ({ getPartnerByReferralCode: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/rules-engine", () => ({
  assertPreStripeRouteResolved: () => ({ ok: true }),
  inputsFromBolsterHeight: vi.fn(),
  inputsFromMpConfigData: vi.fn(),
  parseRecommendationRecord: () => ({}),
  recommendWithEngine: vi.fn(),
  toPersistedRecommendationRecord: vi.fn(),
}));

const { POST } = await import("@/app/api/results/hold/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "11111111-1111-4111-8111-111111111111";

/** A Result through hold whose Checkout was abandoned: re-submittable by its Owner. */
const heldRow = {
  id: ID,
  status: "held",
  source: "online_purchase",
  access_token: TOKEN,
  customer_id: null,
  customer_email: "owner@x.test",
  payment_intent_id: null,
  order_id: null,
};
/** The same Result once the Owner authorised a card on it. */
const paidRow = { ...heldRow, payment_intent_id: "pi_owner" };

/** Signs in an admin whose role carries exactly these permissions. */
const signInAdmin = (perms: string[]) =>
  h.requireAnyAdmin.mockImplementation(async (wanted: string[]) =>
    wanted.some((p) => perms.includes(p))
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  );

const post = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://x.test/api/results/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responseId: ID,
        email: "owner@x.test",
        phone: "91234567",
        discoverySource: "instagram",
        suggestedSize: "M",
        suggestedTier: "premium",
        preferenceLines: [
          { item_id: 1, quantity: 1, category: "cover" },
          { item_id: 2, quantity: 1, category: "case" },
        ],
        shippingMethodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        shippingAddress: { recipient: "Ada", line1: "1 Road", city: "SG", postal_code: "123456" },
        recommendationRecord: {},
        ...extra,
      }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.clear();
  h.rows.set(ID, { ...heldRow });
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.createHoldCheckout.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
  h.sendEmail.mockResolvedValue(undefined);
  h.fetch.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", h.fetch);
  process.env.TELEGRAM_BOT_TOKEN = "bot";
});

describe("POST /api/results/hold — re-submitting an existing Result", () => {
  it("refuses a stranger holding only the Result id, and leaves the row untouched", async () => {
    h.rows.set(ID, { ...paidRow });
    const res = await post({ email: "attacker@x.test" });
    expect(res.status).toBe(403);
    expect(h.rows.get(ID)).toEqual(paidRow);
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
  });

  it("sends no Telegram or email notification on a refusal", async () => {
    await post({ email: "attacker@x.test" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("lets the Owner re-submit and keeps the same access token", async () => {
    const res = await post({ token: TOKEN });
    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toBe(TOKEN);
    expect(h.rows.get(ID)?.access_token).toBe(TOKEN);
    expect(h.createHoldCheckout.mock.calls[0][0].successUrl).toContain(`token=${TOKEN}`);
  });

  it("never deletes an existing Result when Stripe fails on a re-submit", async () => {
    h.createHoldCheckout.mockRejectedValue(new Error("stripe down"));
    const res = await post({ token: TOKEN, email: "new@x.test" });
    expect(res.status).toBe(500);
    expect(h.rows.get(ID)).toEqual(heldRow);
  });

  it("leaves no row behind when Stripe fails on a brand-new submit", async () => {
    h.rows.clear();
    h.createHoldCheckout.mockRejectedValue(new Error("stripe down"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(h.rows.has(ID)).toBe(false);
  });

  it("sends Stripe the same key with the same parameters on two identical re-submits", async () => {
    await post({ token: TOKEN });
    await post({ token: TOKEN });
    const [first, second] = h.createHoldCheckout.mock.calls.map((c) => c[0]);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    // Stripe rejects a reused key whose parameters differ.
    expect(second).toEqual(first);
  });

  it("uses a new key when what Stripe is sent changes", async () => {
    await post({ token: TOKEN });
    await post({ token: TOKEN, email: "other@x.test" });
    const [first, second] = h.createHoldCheckout.mock.calls.map((c) => c[0]);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("keeps the legacy Draft allowance: no token and no status is still writable", async () => {
    h.rows.set(ID, { ...heldRow, status: null, access_token: null });
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.rows.get(ID)?.access_token).toEqual(expect.any(String));
  });

  it("does not extend the legacy allowance to an order-linked row", async () => {
    const linked = { ...heldRow, status: null, access_token: null, order_id: "ord_1" };
    h.rows.set(ID, { ...linked });
    const res = await post({ email: "attacker@x.test" });
    expect(res.status).toBe(403);
    expect(h.rows.get(ID)).toEqual(linked);
  });

  it("refuses to re-submit a held Result whose card is already authorised", async () => {
    h.rows.set(ID, { ...paidRow });
    const res = await post({ token: TOKEN });
    expect(res.status).toBe(409);
    expect(h.rows.get(ID)).toEqual(paidRow);
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("mints a fresh token when Staff re-submit without the Owner's token", async () => {
    signInAdmin(["results", "orders"]);
    const res = await post({ email: "next-customer@x.test" });
    expect(res.status).toBe(200);
    const { accessToken } = await res.json();
    expect(accessToken).not.toBe(TOKEN);
    expect(h.rows.get(ID)?.access_token).toBe(accessToken);
  });

  it("refuses a viewer (orders, no results) re-submitting a customer's Result", async () => {
    signInAdmin(["orders", "analytics"]);
    const res = await post({ email: "viewer@x.test" });
    expect(res.status).toBe(403);
    expect(h.rows.get(ID)).toEqual(heldRow);
  });

  it("does not reset a Result Staff assigned while Checkout was being created", async () => {
    h.createHoldCheckout.mockImplementation(async () => {
      h.rows.set(ID, { ...h.rows.get(ID), status: "assigned" });
      return { sessionId: "cs_1", url: "https://stripe.test/cs_1" };
    });
    const res = await post({ token: TOKEN, email: "new@x.test" });
    expect(res.status).toBe(409);
    expect(h.rows.get(ID)).toEqual({ ...heldRow, status: "assigned" });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("does not null a card the webhook attached while Checkout was being created", async () => {
    h.createHoldCheckout.mockImplementation(async () => {
      h.rows.set(ID, { ...h.rows.get(ID), payment_intent_id: "pi_raced" });
      return { sessionId: "cs_1", url: "https://stripe.test/cs_1" };
    });
    const res = await post({ token: TOKEN });
    expect(res.status).toBe(409);
    expect(h.rows.get(ID)?.payment_intent_id).toBe("pi_raced");
  });
});

describe("POST /api/results/hold — Assisted customisation (deferred)", () => {
  const assistedDraft = { ...heldRow, status: null, source: "staff_assisted", customer_email: null, payment_intent_id: null };
  const deferred = { deferred: true, preferenceLines: [], shippingMethodId: undefined, shippingAddress: undefined };

  it("refuses a stranger even on a staff_assisted Draft", async () => {
    h.rows.set(ID, { ...assistedDraft });
    const res = await post(deferred);
    expect(res.status).toBe(403);
    expect(h.rows.get(ID)).toEqual(assistedDraft);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("accepts the customer's device holding the token, with no card", async () => {
    h.rows.set(ID, { ...assistedDraft });
    const res = await post({ ...deferred, token: TOKEN });
    expect(res.status).toBe(200);
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
    expect(h.rows.get(ID)).toMatchObject({ status: "held", source: "staff_assisted", access_token: TOKEN });
  });
});
