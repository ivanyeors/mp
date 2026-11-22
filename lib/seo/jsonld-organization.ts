import { getSiteOrigin } from "@/lib/site-url";
import { localeUrl } from "@/lib/seo/locale-url";

const SAME_AS = [
  "https://www.facebook.com/thempillow",
  "https://www.instagram.com/thempillow/",
  "https://www.youtube.com/channel/UCgwq2h5BygQmCAXHRzLJHrQ",
  "https://www.tiktok.com/@thempillow",
];

export function organizationId(): string {
  return `${getSiteOrigin()}/#organization`;
}

export function buildOrganizationJsonLd(lang = "en-US"): Record<string, unknown> {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId(),
    name: "Mpillow",
    url: origin,
    logo: `${origin}/mpillow_logo_2026.png`,
    description:
      "Singapore-based maker of fully customisable cervical pillows and bolsters, fitted in-store for neck support and ergonomic sleep.",
    address: {
      "@type": "PostalAddress",
      addressCountry: "SG",
    },
    award: "Singapore Good Design 2022",
    sameAs: SAME_AS,
  };
}

export function buildWebSiteJsonLd(lang = "en-US"): Record<string, unknown> {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Mpillow",
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${localeUrl(lang, "/shop")}?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
