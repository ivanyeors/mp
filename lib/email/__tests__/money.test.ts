/**
 * Every email speaks one money format: the explicit ISO code.
 *
 * This existed as two formats — `$389.00` in order/RMA/partner emails and
 * `SGD 389.00` in the configurator emails — and an earlier attempt to unify
 * them silently stripped the code off the payment-authorization emails. This
 * pins the direction so that cannot happen again in either direction.
 */

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { money, negativeMoney } from "../format";
import { EMAIL_REGISTRY } from "../registry";

/** Amounts as they appear in a body: a currency-ish prefix then digits. */
const BARE_SYMBOL = /(?<![A-Z])[$¥](?:\s|&nbsp;)?\d/;

describe("money()", () => {
  it("carries the ISO code, not a bare symbol", () => {
    expect(money(389, "SGD")).toContain("SGD");
    expect(money(389, "SGD")).not.toMatch(/^\$/);
  });

  it("groups digits", () => {
    expect(money(1234567.5, "SGD")).toContain("1,234,567.50");
  });

  it("falls back readably on a malformed currency code", () => {
    // The only input that makes Intl throw is a bad code out of the DB.
    expect(money(12, "not-a-code")).toBe("not-a-code 12.00");
  });
});

describe("negativeMoney()", () => {
  it("separates a true minus sign from the ISO code", () => {
    // "-SGD 40.00" glues a hyphen to letters and reads as a compound word.
    for (const c of ["SGD", "MYR", "USD", "CNY"]) {
      const out = negativeMoney(40, c);
      expect(out.startsWith("− ")).toBe(true);
      expect(out).not.toMatch(/^-/);
      expect(out).toContain(c);
    }
  });

  it("is insensitive to the sign of its input", () => {
    // Discounts arrive as positive magnitudes today, but a stored negative
    // would otherwise render "− − SGD 40.00".
    expect(negativeMoney(-40, "SGD")).toBe(negativeMoney(40, "SGD"));
  });
});

describe("no email shows a bare currency symbol", () => {
  // SGD renders in en-SG as "$", indistinguishable from USD to a reader.
  const withMoney = EMAIL_REGISTRY.filter((c) =>
    /SGD/.test(c.render("happy").text),
  );

  it("finds the templates that quote money", () => {
    // Orders, receipts, refunds, the two configurator emails, partner payouts…
    expect(withMoney.length).toBeGreaterThanOrEqual(8);
  });

  it.each(withMoney.map((c) => [c.id, c] as const))("%s", (_id, entry) => {
    const { text, html } = entry.render("happy");
    expect(text).not.toMatch(BARE_SYMBOL);
    expect(html).not.toMatch(BARE_SYMBOL);
  });
});
