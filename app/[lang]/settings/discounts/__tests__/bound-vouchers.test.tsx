import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * Discounts (migration slice 06): account-bound vouchers are hidden from the
 * list by default, with a toggle to show them, and the Welcome-back voucher
 * card says what a Claim made now would do.
 */

const h = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/discounts",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      h.calls.push(["from", table]);
      const q = {
        select: (...a: unknown[]) => (h.calls.push(["select", ...a]), q),
        is: (...a: unknown[]) => (h.calls.push(["is", ...a]), q),
        eq: (...a: unknown[]) => (h.calls.push(["eq", ...a]), q),
        order: (...a: unknown[]) => (h.calls.push(["order", ...a]), q),
        range: (...a: unknown[]) => (h.calls.push(["range", ...a]), Promise.resolve({ data: [], error: null, count: 0 })),
      };
      return q;
    },
  }),
}));

const { listAdminCoupons } = await import("@/lib/ecommerce/admin/coupons");
const { DiscountsClient } = await import("../discounts-client");
const { welcomeVoucherIssuingText } = await import("../welcome-voucher-card");

beforeEach(() => {
  h.calls = [];
});

describe("listAdminCoupons", () => {
  it("lists bearer codes only by default", async () => {
    await listAdminCoupons(new URLSearchParams({ limit: "100" }));
    expect(h.calls).toContainEqual(["is", "customer_id", null]);
  });

  it("lists account-bound vouchers too with bound=show", async () => {
    await listAdminCoupons(new URLSearchParams({ limit: "100", bound: "show" }));
    expect(h.calls.some((c) => c[0] === "is")).toBe(false);
  });
});

const coupon = (over: Record<string, unknown>) => ({
  id: "k1",
  code: "SPRING10",
  discount_type: "percentage" as const,
  discount_value: 10,
  currency: "SGD",
  usage_count: 0,
  usage_limit: null,
  is_active: true,
  starts_at: null,
  expires_at: null,
  customer_id: null,
  issued_for: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const list = (rows: ReturnType<typeof coupon>[], showBound = false) =>
  renderToString(
    <DiscountsClient
      initialData={{ coupons: { ok: true, rows, total: rows.length, page: 1, limit: 100 } }}
      initialShowBound={showBound}
      welcomeVoucher={{
        terms: { enabled: false, type: null, value: null, minOrder: null, validDays: 60, issueUntil: null },
        malformed: [],
        issuing: { issuing: false, reason: "off" },
        summary: {
          issued: 4,
          redeemed: 1,
          outstanding: 2,
          expired: 1,
          freeShipping: 0,
          valueIssued: 80,
          valueOutstanding: 40,
          valueRedeemed: 20,
        },
      }}
    />,
  );

describe("the Discounts list", () => {
  it("offers the toggle, off by default, and marks a bound voucher when shown", () => {
    expect(list([coupon({})])).toContain("Show account-bound vouchers");
    const html = list([coupon({ id: "k2", code: "WB-ABCDEFGHJK", customer_id: "c1", issued_for: "welcome_back" })], true);
    expect(html).toContain("WB-ABCDEFGHJK");
    expect(html).toContain("Welcome-back");
  });

  it("shows the live liability beside the realised cost", () => {
    const html = list([]);
    expect(html).toContain("Welcome-back voucher");
    expect(html).toContain("Live liability");
    expect(html).toContain("40.00");
    expect(html).toContain("Realised cost");
    expect(html).toContain("20.00");
    expect(html).toContain("Issuing is off: a Claim issues no voucher.");
  });
});

describe("welcomeVoucherIssuingText", () => {
  it("says what a Claim made now would do", () => {
    expect(welcomeVoucherIssuingText({ issuing: true, until: "2026-12-31" })).toBe(
      "Each Claim issues one voucher, until 31 Dec 2026.",
    );
    expect(welcomeVoucherIssuingText({ issuing: false, reason: "ended" })).toMatch(/has ended/);
    expect(welcomeVoucherIssuingText({ issuing: false, reason: "malformed" })).toMatch(/can't be read/);
    expect(welcomeVoucherIssuingText({ issuing: false, reason: "no_value" })).toMatch(/incomplete/);
  });
});
