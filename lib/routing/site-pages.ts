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
  "/explore",
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

export const NOT_FOR_CUSTOMERS = ["/settings", "/page-builder-preview", "/sunburst-demo"] as const;

const segments = (path: string) => path.split("/").filter(Boolean);
const PATTERNS = SITE_PAGES.map(segments);

export function isSitePage(pathname: string): boolean {
  const parts = segments(stripLocale(pathname));
  return PATTERNS.some((p) => p.length === parts.length && p.every((s, i) => (s.startsWith("[") && s.endsWith("]")) || s === parts[i]));
}
