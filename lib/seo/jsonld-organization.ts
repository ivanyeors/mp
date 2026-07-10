import { getSiteOrigin } from "@/lib/site-url";
import { localeUrl } from "@/lib/seo/locale-url";

export function buildOrganizationJsonLd(lang = "en-US"): Record<string, unknown> {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Mpillow",
    url: origin,
    logo: `${origin}/mpillow_logo_2026.png`,
    description:
      "Singapore-based maker of fully customisable cervical pillows and bolsters, fitted in-store for neck pain relief and ergonomic sleep.",
    address: {
      "@type": "PostalAddress",
      addressCountry: "SG",
    },
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
