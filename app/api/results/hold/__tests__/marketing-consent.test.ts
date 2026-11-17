import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * The email and the marketing email box on a customisation's contact step
 * (PRD-campaign-audiences slice 02; ADR 0039, 0051). The hold makes the email
 * typed on the form a Customer, ticked or not, with its name and mobile, and
 * records the box with it, once a Paired build included, and only once every
 * gate has passed. Same in-memory harness as telegram-switch.test.ts; finding
 * or creating the Customer and the consent write are
 * lib/crm/__tests__/customisation-customer.test.ts's.
 */

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  /** The stored `crm_telegram_updates` value, or null for no row. */
  telegramUpdates: null as string | null,
  /** Make every `site_settings` read fail. */
  settingsFail: false,
  requireAnyAdmin: vi.fn(),
  getAuthUser: vi.fn(),
  createHoldCheckout: vi.fn(),
  sendEmail: vi.fn(),
  total: 200,
  fetch: vi.fn(),
  customerForCustomisation: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let op: "select" | "update" | "insert" | "delete" = "select";
      let payload: Record<string, unknown> = {};
      const run = () => {
        if (table === "items") {
          return [{ id: 1, category: "cover", name: "Cover" }, { id: 2, category: "case", name: "Case" }];
        }
        if (table === "site_settings") {
          const stored = h.telegramUpdates === null ? [] : [{ key: "crm_telegram_updates", value: h.telegramUpdates }];
          return stored.filter((r) => filters.every((f) => f(r)));
        }
        if (table !== "mp_config_responses") return [];
        if (op === "insert") {
          h.rows.set(payload.id as string, { ...payload });
          return [{ ...payload }];
        }
        const hit = [...h.rows.values()].filter((r) => filters.every((f) => f(r)));
        for (const r of hit) {
          if (op === "delete") h.rows.delete(r.id as string);
          if (op === "update") h.rows.set(r.id as string, { ...r, ...payload });
        }
        return hit.map((r) => ({ ...r }));
      };
      const failed = () => table === "site_settings" && h.settingsFail;
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
        neq: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), b),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
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
          if (failed()) return { data: null, error: { message: "connection reset" } };
          if (table === "shipping_methods") return { data: { slug: "standard" }, error: null };
          const [row] = run();
          return { data: row ?? null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            failed() ? { data: null, error: { message: "connection reset" } } : { data: run(), error: null },
          ).then(resolve),
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
vi.mock("@/lib/email/results", async (orig) => ({
  RESULT_EMAIL_COPY: (await orig<typeof import("@/lib/email/results")>()).RESULT_EMAIL_COPY,
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
vi.mock("@/lib/result-pricing", () => ({ priceResult: () => ({ total: h.total }) }));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/sla-reminders", () => ({
  SLA_SETTING_KEYS: [],
  parseSlaSettings: () => ({ authHoldEnabled: true }),
}));
vi.mock("@/lib/configurator/pre-order-persist", () => ({
  loadPreOrderTriggerAtHold: vi.fn().mockResolvedValue(null),
  preOrderFlagForResult: () => false,
}));
vi.mock("@/lib/referrals", () => ({
  getPartnerByReferralCode: vi.fn().mockResolvedValue(null),
  isSelfReferral: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/rules-engine", () => ({
  assertPreStripeRouteResolved: () => ({ ok: true }),
  inputsFromBolsterHeight: vi.fn(),
  inputsFromMpConfigData: vi.fn(),
  parseRecommendationRecord: () => ({}),
  recommendWithEngine: vi.fn(),
  toPersistedRecommendationRecord: vi.fn(),
}));

vi.mock("@/lib/crm/customisation-customer", () => ({ customerForCustomisation: h.customerForCustomisation }));

const { POST } = await import("@/app/api/results/hold/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "11111111-1111-4111-8111-111111111111";

const heldRow = {
  id: ID,
  status: "held",
  source: "online_purchase",
  access_token: TOKEN,
  customer_id: null,
  customer_email: "owner@x.test",
  payment_intent_id: null,
  order_id: null,
  paired_build_id: null,
};

const pairedBolster = {
  responseId: COMPANION,
  suggestedLength: "medium",
  measurements: { height_cm: 170 },
  preferenceLines: [{ item_id: 2, quantity: 1, category: "case" }],
};

const post = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://x.test/api/results/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responseId: ID,
        token: TOKEN,
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
  resetRateLimits();
  vi.clearAllMocks();
  h.total = 200;
  h.rows.clear();
  h.rows.set(ID, { ...heldRow });
  h.telegramUpdates = JSON.stringify({ online_result_held: { enabled: false } });
  h.settingsFail = false;
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.createHoldCheckout.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
  h.sendEmail.mockResolvedValue(undefined);
  h.customerForCustomisation.mockResolvedValue("c-1");
  h.fetch.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", h.fetch);
});

const consentCalls = () =>
  h.customerForCustomisation.mock.calls.map(([, contact, ticked]) => ({ email: contact.email, ticked, source: "customisation" }));

describe("POST /api/results/hold — the marketing email box", () => {
  it("ticked: records it for the email typed, as customisation", async () => {
    const res = await post({ marketingEmail: true });
    expect(res.status).toBe(200);
    expect(consentCalls()).toEqual([{ email: "owner@x.test", ticked: true, source: "customisation" }]);
  });

  it("unticked, or absent as from a tab opened before the box, is unticked", async () => {
    await post({ marketingEmail: false });
    h.rows.set(ID, { ...heldRow });
    await post();
    expect(consentCalls()).toEqual([
      { email: "owner@x.test", ticked: false, source: "customisation" },
      { email: "owner@x.test", ticked: false, source: "customisation" },
    ]);
  });

  it("reads the box only as a boolean", async () => {
    const res = await post({ marketingEmail: "yes" });
    expect(res.status).toBe(400);
    expect(h.customerForCustomisation).not.toHaveBeenCalled();
  });

  it("asks once for a Paired build, on the anchor", async () => {
    const res = await post({ marketingEmail: true, pairedBolster });
    expect(res.status).toBe(200);
    expect(consentCalls()).toEqual([{ email: "owner@x.test", ticked: true, source: "customisation" }]);
  });

  it("on a Staff member's device, records the shopper's email, never the Staff login's", async () => {
    h.getAuthUser.mockResolvedValue({ id: "staff-user", email: "staff@mpillow.test" });
    h.rows.set(ID, { ...heldRow, status: null, source: "staff_assisted", customer_email: null, payment_intent_id: null });
    const res = await post({
      deferred: true,
      email: "shopper@x.test",
      marketingEmail: true,
      preferenceLines: [],
      shippingMethodId: undefined,
      shippingAddress: undefined,
    });
    expect(res.status).toBe(200);
    expect(consentCalls()).toEqual([{ email: "shopper@x.test", ticked: true, source: "customisation" }]);
  });

  it("makes the email a Customer with the name and mobile given, ticked or not (ADR 0051)", async () => {
    const res = await post({ marketingEmail: false, measurements: { name: "Ada Lim" } });
    expect(res.status).toBe(200);
    expect(h.customerForCustomisation).toHaveBeenCalledWith(
      expect.anything(),
      { email: "owner@x.test", name: "Ada Lim", phone: "+6591234567" },
      false,
    );
  });

  it("records nothing for a hold that is refused", async () => {
    h.rows.set(ID, { ...heldRow, status: "assigned" });
    const res = await post({ marketingEmail: true });
    expect(res.status).toBe(409);
    expect(h.customerForCustomisation).not.toHaveBeenCalled();
  });
});
