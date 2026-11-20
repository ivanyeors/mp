import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { buildCartMessages } from "@/lib/shop/cart-messages";

vi.mock("@/components/shop/cart-page-client", () => ({
  CartPageClient: () => null,
}));

import CartPage from "../page";
import { CartPageClient } from "@/components/shop/cart-page-client";

function functionPaths(value: unknown, path = "props"): string[] {
  if (typeof value === "function") return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => functionPaths(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => functionPaths(v, `${path}.${k}`));
  }
  return [];
}

async function renderPage(lang: string) {
  return CartPage({ params: Promise.resolve({ lang }) });
}

describe("shop cart page → client component boundary", () => {
  it.each(SUPPORTED_LOCALES)("passes only serialisable props for %s", async (lang) => {
    const element = await renderPage(lang);
    expect(element.type).toBe(CartPageClient);
    expect(functionPaths(element.props)).toEqual([]);
  });

  it.each(SUPPORTED_LOCALES)("hands the client %s's own cart strings and locale", async (lang) => {
    const element = await renderPage(lang);
    expect(element.props.locale).toBe(lang);
    expect(element.props.dictionary).toEqual(getMessages(lang).shop.cart);
  });

  it("falls back to the default locale rather than throwing for an unknown lang", async () => {
    const element = await renderPage("fr-FR");
    expect(element.props.locale).toBe("en-US");
    expect(element.props.dictionary).toEqual(getMessages("en-US").shop.cart);
  });
});

describe("buildCartMessages", () => {
  it("formats the templated strings on the client side of the boundary", () => {
    const messages = buildCartMessages(getMessages("en-US").shop.cart);
    expect(messages.couponApplied("SAVE10")).toBe('Discount code "SAVE10" active');
    expect(messages.referralApplied("ABCD2345")).toBe('Referral code "ABCD2345" active');
    expect(messages.freeShipping("S$12.00")).toBe("S$12.00 away from free shipping");
  });
});
