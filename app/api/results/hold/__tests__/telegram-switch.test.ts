import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The online Result notice's switch (CRM slice 14). Off: the hold succeeds and
 * nothing is posted. On, missing, or unreadable: exactly today's text, Paired
 * build lines included. Same in-memory harness as paired.test.ts, with a
 * `site_settings` row the test controls.
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

/** The texts posted to Telegram. */
const telegrams = () =>
  h.fetch.mock.calls
    .filter(([url]) => String(url).startsWith("https://api.telegram.org/"))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).text as string);

/** Today's notice for this harness's hold, exactly as the route wrote it before the switch. */
const todaysText = (origin: string, paired: boolean) =>
  [
    "💤 Held Result (online purchase) — review needed",
    "Size×tier (suggested): M × premium",
    "Email: owner@x.test",
    "Authorized: SGD 200.00",
    ...(paired
      ? [
          "",
          "➕ Paired Mbolster medium — same hold, ships with this pillow",
          "Quoted: SGD 200.00",
          `Platform: ${origin}/settings/results/${COMPANION}`,
        ]
      : []),
    "",
    `Platform: ${origin}/settings/results/${ID}`,
  ].join("\n");

const originOf = (body: { statusUrl: string }) => new URL(body.statusUrl).origin;

beforeEach(() => {
  vi.clearAllMocks();
  h.total = 200;
  h.rows.clear();
  h.rows.set(ID, { ...heldRow });
  h.telegramUpdates = null;
  h.settingsFail = false;
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.createHoldCheckout.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
  h.sendEmail.mockResolvedValue(undefined);
  h.fetch.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", h.fetch);
  process.env.TELEGRAM_BOT_TOKEN = "bot";
});

describe("POST /api/results/hold — the online Result switch", () => {
  it("with online_result_held off, the hold succeeds and posts nothing", async () => {
    h.telegramUpdates = JSON.stringify({ online_result_held: { enabled: false } });
    const res = await post({ pairedBolster });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, telegramStatus: "skipped", authorizedAmount: 400 });
    expect(telegrams()).toEqual([]);
    // Everything else the hold does still happens.
    expect(h.createHoldCheckout).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.rows.get(ID)).toMatchObject({ status: "held", authorized_amount: 200 });
  });

  it("switching off another type leaves the notice on", async () => {
    h.telegramUpdates = JSON.stringify({ new_sign_ups: { enabled: false }, weekly_summary: { enabled: false, day: "mon" } });
    const body = await (await post()).json();
    expect(body.telegramStatus).toBe("sent");
    expect(telegrams()).toEqual([todaysText(originOf(body), false)]);
  });

  it.each([
    ["on", () => (h.telegramUpdates = JSON.stringify({ online_result_held: { enabled: true } }))],
    ["missing (the default)", () => (h.telegramUpdates = null)],
    ["unreadable", () => (h.settingsFail = true)],
    ["malformed", () => (h.telegramUpdates = "{oops")],
  ])("when the setting is %s, posts exactly today's text with the Paired build lines", async (_label, arrange) => {
    arrange();
    const res = await post({ pairedBolster });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.telegramStatus).toBe("sent");
    expect(telegrams()).toEqual([todaysText(originOf(body), true)]);
  });

  it("posts the single-build form when there is no Mbolster", async () => {
    const body = await (await post()).json();
    expect(telegrams()).toEqual([todaysText(originOf(body), false)]);
  });
});
