import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Who measured, and the Measurement service fee it decides (ADR 0024).
 *
 * The hold route used to write `measured_by_type: "by_user"` over every Draft it
 * submitted. On a Draft a Staff device had stamped `staff`, that either broke the
 * 0025 consistency check (by_user with a staff id) or erased the attribution — and
 * once the fee keys on that column, it would silently drop $50 from every Staff
 * assist mode sale. Same in-memory harness as ownership.test.ts, with the real
 * priceResult and service-lines rule so the asserted amounts are the charged ones.
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
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let op: "select" | "update" | "insert" | "delete" = "select";
      let payload: Record<string, unknown> = {};
      const run = () => {
        if (table === "service_prices") {
          return [
            { key: "measurement_premium", msrp: "50.00", cost_price: null, currency: "SGD" },
            { key: "measurement_basic", msrp: "30.00", cost_price: null, currency: "SGD" },
            { key: "readjustment", msrp: "30.00", cost_price: null, currency: "SGD" },
          ];
        }
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
  getAdminContext: vi.fn(async () => h.adminCtx),
}));
vi.mock("@/lib/staff/working-as", () => ({
  getWorkingAs: vi.fn(async () => h.workingAs),
  actingProfile: vi.fn(async () => h.workingAs),
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
const STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A Draft Result created on a Staff device: the working-as profile measured. */
const staffDraft = {
  id: ID,
  status: null,
  source: null,
  access_token: TOKEN,
  customer_id: null,
  customer_email: null,
  payment_intent_id: null,
  order_id: null,
  measured_by_type: "staff",
  measured_by_staff_id: STAFF,
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
  vi.clearAllMocks();
  h.rows.clear();
  h.adminCtx = null;
  h.workingAs = null;
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.createHoldCheckout.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
  h.sendEmail.mockResolvedValue(undefined);
  h.fetch.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", h.fetch);
  process.env.TELEGRAM_BOT_TOKEN = "bot";
});

describe("POST /api/results/hold — who measured, and the fee it decides", () => {
  it("keeps a staff-stamped Draft's attribution and charges the Premium measurement fee", async () => {
    h.rows.set(ID, { ...staffDraft });
    const res = await post();
    expect(res.status).toBe(200);
    const row = h.rows.get(ID)!;
    expect(row.measured_by_type).toBe("staff");
    expect(row.measured_by_staff_id).toBe(STAFF);
    // Goods 200 (stubbed quote) + Measurement service (Premium) 50.
    expect(row.authorized_amount).toBe(250);
  });

  it("charges the Basic fee on a Basic build", async () => {
    h.rows.set(ID, { ...staffDraft });
    await post({ suggestedTier: "basic" });
    expect(h.rows.get(ID)!.authorized_amount).toBe(230);
  });

  it("charges nothing for a Draft the customer measured themselves", async () => {
    h.rows.set(ID, { ...staffDraft, measured_by_type: "by_user", measured_by_staff_id: null });
    await post();
    expect(h.rows.get(ID)!.authorized_amount).toBe(200);
    expect(h.rows.get(ID)!.measured_by_type).toBe("by_user");
  });

  it("names the fee in the Telegram review message", async () => {
    h.rows.set(ID, { ...staffDraft });
    await post();
    const body = JSON.parse(String(h.fetch.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(String(body.text)).toContain("Measurement service (Premium): SGD 50.00");
  });

  it("stamps a brand-new row with the Staff profile working this device", async () => {
    h.adminCtx = { userId: "u1", email: "staff@x.test", memberId: "m1" };
    h.workingAs = { id: STAFF, name: "Wei" };
    const res = await post({ token: undefined });
    expect(res.status).toBe(200);
    const row = h.rows.get(ID)!;
    expect(row.measured_by_type).toBe("staff");
    expect(row.measured_by_staff_id).toBe(STAFF);
    expect(row.authorized_amount).toBe(250);
  });

  it("stamps a brand-new guest row as measured by the customer, with no fee", async () => {
    const res = await post({ token: undefined });
    expect(res.status).toBe(200);
    const row = h.rows.get(ID)!;
    expect(row.measured_by_type).toBe("by_user");
    expect(row.measured_by_staff_id).toBeNull();
    expect(row.authorized_amount).toBe(200);
  });
});
