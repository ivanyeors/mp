/**
 * Every page of the site a customer (or a Partner) can open, before the locale
 * (`/en-US/shop` is `/shop`). A `[segment]` stands for any one path segment,
 * as in the app's folders.
 *
 * What an email's links to our own site are checked against, instead of
 * fetching them (PRD-campaign-email-editor slice 11): a function calling its
 * own site waits on itself, and a page the app has is a page that answers.
 * Pure. lib/routing/__tests__/site-pages.test.ts holds the list equal to
 * app/[lang]: a new page joins it, or `NOT_FOR_CUSTOMERS`, in the same change.
 */
import { stripLocale } from "@/lib/i18n/routing";

export const SITE_PAGES = [
  "/",
  "/account",
  "/account/addresses",
  "/account/login",
  "/account/orders",
  "/account/orders/[orderNumber]",
  "/account/results",
  "/account/welcome",
  "/appointments",
  "/appointments/confirmed",
  "/articles",
  "/blog",
  "/blog/[slug]",
  "/faq",
  "/guides/[topic]",
  "/mbolster-config",
  "/mp-basic",
  "/mp-care",
  "/mp-config",
  "/mp-maker",
  "/our-partners",
  "/partner",
  "/partner/apply",
  "/partner/settings",
  "/pay/[token]",
  "/points",
  "/privacy-policy",
  "/results",
  "/results/[id]",
  "/shipping-refund-policies",
  "/shop",
  "/shop/[slug]",
  "/shop/cart",
  "/shop/checkout",
  "/shop/checkout/confirmation",
  "/support",
  "/terms-of-service",
  "/unsubscribe",
] as const;

/** Pages of the app that are not for customers: the Admin Panel, its preview, a demo. */
export const NOT_FOR_CUSTOMERS = ["/settings", "/page-builder-preview", "/sunburst-demo"] as const;

const segments = (path: string) => path.split("/").filter(Boolean);
const PATTERNS = SITE_PAGES.map(segments);

/** Pure — `pathname` (with or without its locale) is a page of the site a customer can open. */
export function isSitePage(pathname: string): boolean {
  const parts = segments(stripLocale(pathname));
  return PATTERNS.some((p) => p.length === parts.length && p.every((s, i) => (s.startsWith("[") && s.endsWith("]")) || s === parts[i]));
}
