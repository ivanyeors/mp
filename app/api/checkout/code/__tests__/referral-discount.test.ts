import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import type { PartnerTerms } from "@/lib/partner-terms";
import { resetRateLimits } from "@/lib/rate-limit";

/**
 * What a partner's code takes off at checkout (ADR 0034). The customer gets the
 * pool the partner leaves (pool − the partner's commission in effect today) only
 * when ALL hold: a customisation, of a premium pillow, Staff have turned the
 * customer discount on for that partner, and the buyer is not the partner. Never
 * more than the build's goods. The response names the partner, never its id.
 *
 * The code resolver is stubbed to the partner under test; the self-referral
 * check is stubbed to the spec's rule (a signed-in session for that partner, or
 * an email on that partner's account) so the test sees what the route asks it.
 */

const PARTNER_ID = "7c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5";
const OTHER_PARTNER_ID = "1f2e3d4c-5b6a-4978-8a6b-5c4d3e2f1a0b";
const PARTNER_EMAIL = "front-desk@spineclinic.test";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  resolveCheckoutCode: vi.fn(),
  getPartnerContext: vi.fn(),
  accountEmails: {} as Record<string, string[]>,
}));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/checkout-code", async (orig) => ({
  ...(await orig<typeof import("@/lib/checkout-code")>()),
  resolveCheckoutCode: h.resolveCheckoutCode,
}));
vi.mock("@/lib/auth/partner", () => ({ getPartnerContext: h.getPartnerContext }));
vi.mock("@/lib/referrals", async (orig) => ({
  ...(await orig<typeof import("@/lib/referrals")>()),
  isSelfReferral: vi.fn(
    async (partnerId: string, buyer: { sessionPartnerId?: string | null; email?: string | null }) =>
      (!!buyer.sessionPartnerId && buyer.sessionPartnerId === partnerId) ||
      (!!buyer.email && (h.accountEmails[partnerId] ?? []).includes(buyer.email.trim().toLowerCase())),
  ),
}));

const { POST } = await import("@/app/api/checkout/code/route");

const terms = (over: Partial<PartnerTerms> = {}): PartnerTerms => ({
  pool: 50,
  choice: 30,
  nextChoice: null,
  nextChoiceFrom: null,
  customerDiscount: true,
  ...over,
});

function givePartner(t: PartnerTerms) {
  h.resolveCheckoutCode.mockResolvedValue({
    kind: "referral",
    partner: { id: PARTNER_ID, name: "Spine Clinic", referral_code: "ABCD2345", terms: t },
  });
}

const premiumPillow = (goods = 300) => ({
  flow: "customisation",
  build: { product_type: "pillow", size: "M", tier: "premium" },
  goods,
});
const basicPillow = (goods = 300) => ({
  flow: "customisation",
  build: { product_type: "pillow", size: "M", tier: "basic" },
  goods,
});
const bolster = (goods = 300) => ({
  flow: "customisation",
  build: { product_type: "bolster", length: "medium" },
  goods,
});
const shop = (subtotal = 300) => ({
  flow: "shop",
  subtotal,
  line_items: [{ product_id: "22222222-2222-4222-8222-222222222222", line_total: subtotal }],
});

async function check(context: unknown, extra: Record<string, unknown> = {}) {
  const res = await POST(
    new Request("https://x.test/api/checkout/code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ code: "abcd2345", context, ...extra }),
    }),
  );
  expect(res.status).toBe(200);
  const json = await res.json();
  // Whatever it answers, the partner's id never leaves the server.
  expect(JSON.stringify(json)).not.toContain(PARTNER_ID);
  expect(json).not.toHaveProperty("partner_id");
  return json as { ok: boolean; kind: string; partner_name?: string; discount_amount?: number };
}

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
  h.db = { partners: [], coupons: [], products: [], mp_config_responses: [] };
  h.accountEmails = { [PARTNER_ID]: [PARTNER_EMAIL] };
  h.getPartnerContext.mockResolvedValue(null);
  givePartner(terms());
});
afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/checkout/code — a partner's code on an eligible build", () => {
  it("customised premium pillow, discount on: the customer gets pool − commission", async () => {
    expect(await check(premiumPillow())).toEqual({
      ok: true,
      kind: "referral",
      partner_name: "Spine Clinic",
      discount_amount: 20,
    });
  });

  it("partner takes nothing (pick 0): the whole pool comes off", async () => {
    givePartner(terms({ choice: 0 }));
    expect((await check(premiumPillow())).discount_amount).toBe(50);
  });

  it("a per-partner pool: pool 80, pick 30 → 50 off", async () => {
    givePartner(terms({ pool: 80, choice: 30 }));
    expect((await check(premiumPillow())).discount_amount).toBe(50);
  });

  it("partner takes the whole pool (no pick): nothing left, 0 off", async () => {
    givePartner(terms({ choice: null }));
    expect((await check(premiumPillow())).discount_amount).toBe(0);
  });

  it("pool lowered below the pick: the partner gets the pool, 0 off (never negative)", async () => {
    givePartner(terms({ pool: 25, choice: 30 }));
    expect((await check(premiumPillow())).discount_amount).toBe(0);
  });

  it("is money, to the cent", async () => {
    givePartner(terms({ pool: 50, choice: 33.33 }));
    expect((await check(premiumPillow())).discount_amount).toBe(16.67);
  });

  it("never exceeds the build's goods", async () => {
    expect((await check(premiumPillow(15))).discount_amount).toBe(15);
    expect((await check(premiumPillow(0))).discount_amount).toBe(0);
  });

  it("uses the commission in effect today, by the Singapore calendar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    givePartner(terms({ choice: 30, nextChoice: 10, nextChoiceFrom: "2026-10-31" }));
    // 23:59 on 30 Oct in Singapore: the old pick (30) → 20 off.
    vi.setSystemTime(new Date("2026-10-30T15:59:00Z"));
    expect((await check(premiumPillow())).discount_amount).toBe(20);
    // 00:00 on 31 Oct in Singapore: the waiting pick (10) → 40 off.
    vi.setSystemTime(new Date("2026-10-30T16:00:00Z"));
    expect((await check(premiumPillow())).discount_amount).toBe(40);
  });
});

describe("POST /api/checkout/code — every other case takes nothing off", () => {
  it("shop checkout", async () => {
    expect(await check(shop())).toEqual({ ok: true, kind: "referral", partner_name: "Spine Clinic", discount_amount: 0 });
  });

  it('nothing priced yet (flow "none")', async () => {
    expect(await check({ flow: "none" })).toEqual({
      ok: true,
      kind: "referral",
      partner_name: "Spine Clinic",
      discount_amount: 0,
    });
  });

  it("a basic pillow", async () => {
    expect((await check(basicPillow())).discount_amount).toBe(0);
  });

  it("a bolster", async () => {
    expect((await check(bolster())).discount_amount).toBe(0);
  });

  it("Staff have not turned the customer discount on for this partner", async () => {
    givePartner(terms({ customerDiscount: false }));
    expect((await check(premiumPillow())).discount_amount).toBe(0);
  });

  it("the partner's own build: signed in as that partner", async () => {
    h.getPartnerContext.mockResolvedValue({
      userId: "u-1",
      email: PARTNER_EMAIL,
      partnerId: PARTNER_ID,
      status: "approved",
      partnerName: "Spine Clinic",
      agreedVersion: "1",
    });
    expect((await check(premiumPillow())).discount_amount).toBe(0);
  });

  it("the partner's own build: the email is on the partner's account", async () => {
    expect((await check(premiumPillow(), { email: PARTNER_EMAIL })).discount_amount).toBe(0);
  });
});

describe("POST /api/checkout/code — someone else is not the partner", () => {
  it("signed in as a different partner still gets the discount", async () => {
    h.getPartnerContext.mockResolvedValue({
      userId: "u-2",
      email: "other@clinic.test",
      partnerId: OTHER_PARTNER_ID,
      status: "approved",
      partnerName: "Other Clinic",
      agreedVersion: "1",
    });
    expect((await check(premiumPillow())).discount_amount).toBe(20);
  });

  it("a customer email that is not on the partner's account gets the discount", async () => {
    expect((await check(premiumPillow(), { email: "patient@example.test" })).discount_amount).toBe(20);
  });
});
