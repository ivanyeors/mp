import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Live shipping on a customisation (ADR 0032). A live method is quoted when the
 * hold is placed, charged in the authorised total, and its rate is stored on the
 * Result so assign and accept charge the same figure. No courier for the
 * address refuses the hold — it never falls back to the method's base_rate.
 * Same in-memory harness as measured-by.test.ts.
 */

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  requireAnyAdmin: vi.fn(),
  getAuthUser: vi.fn(),
  createHoldCheckout: vi.fn(),
  sendEmail: vi.fn(),
  total: 200,
  fetch: vi.fn(),
  adminCtx: null as null | { userId: string; email: string; memberId: string },
  workingAs: null as null | { id: string; name: string },
  method: { slug: "standard" } as Record<string, unknown>,
  quoteShippingMethods: vi.fn(),
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
          if (table === "shipping_methods") return { data: h.method, error: null };
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
  getAdminContext: vi.fn(async () => h.adminCtx),
}));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => h.workingAs) }));
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
vi.mock("@/lib/shipping/quote", async (orig) => ({
  ...(await orig<typeof import("@/lib/shipping/quote")>()),
  quoteShippingMethods: h.quoteShippingMethods,
}));
vi.mock("@/lib/shipping/settings", () => ({
  readShippingSettings: async () => ({ estimate_declared_value: 150 }),
}));
vi.mock("@/lib/ecommerce/tax", () => ({
  resolveTaxRuleForRegion: vi.fn().mockResolvedValue(null),
  computeTax: () => ({ taxAmount: 0 }),
}));
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

const { POST } = await import("@/app/api/results/hold/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "11111111-1111-4111-8111-111111111111";

const draft = {
  id: ID,
  status: null,
  source: null,
  access_token: TOKEN,
  customer_id: null,
  customer_email: null,
  payment_intent_id: null,
  order_id: null,
  measured_by_type: "by_user",
  measured_by_staff_id: null,
};

const LIVE = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  slug: "standard",
  rate_source: "easyship",
  base_rate: 0,
  free_above: null,
  currency: "SGD",
  countries: ["SG", "US"],
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
        shippingMethodId: LIVE.id,
        shippingAddress: {
          recipient: "Ada",
          line1: "1 Road",
          city: "North Hollywood",
          postal_code: "91606",
          country: "US",
        },
        recommendationRecord: {},
        ...extra,
      }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.clear();
  h.adminCtx = null;
  h.workingAs = null;
  h.method = { ...LIVE };
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.createHoldCheckout.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
  h.sendEmail.mockResolvedValue(undefined);
  h.fetch.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", h.fetch);
  process.env.TELEGRAM_BOT_TOKEN = "bot";
});

describe("POST /api/results/hold — live shipping", () => {
  it("charges the live rate on top of the build and keeps it on the Result", async () => {
    h.rows.set(ID, { ...draft });
    h.quoteShippingMethods.mockResolvedValue({ options: [{ amount: 37.5 }], rates: null });
    const res = await post();
    expect(res.status).toBe(200);
    const row = h.rows.get(ID)!;
    // Goods 200 (stubbed quote) + live shipping 37.50.
    expect(row.authorized_amount).toBe(237.5);
    expect(row.shipping_rate).toBe(37.5);
    // One Mpillow, boxed as the configurator quoted it, to the typed address.
    const input = h.quoteShippingMethods.mock.calls[0][1];
    expect(input.lines.map((l: { product_type: string }) => l.product_type)).toEqual(["pillow"]);
    expect(input.destination).toMatchObject({ country: "US", postal_code: "91606" });
  });

  it("refuses the hold when no courier delivers to the address", async () => {
    h.rows.set(ID, { ...draft });
    h.quoteShippingMethods.mockResolvedValue({ options: [], rates: null });
    const res = await post();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not available for this address/);
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
  });

  it("asks no courier for a flat method and stores no rate", async () => {
    h.rows.set(ID, { ...draft });
    h.method = { ...LIVE, rate_source: "flat", base_rate: 8 };
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.quoteShippingMethods).not.toHaveBeenCalled();
    const row = h.rows.get(ID)!;
    expect(row.shipping_rate).toBeNull();
    expect(row.authorized_amount).toBe(208);
  });
});
