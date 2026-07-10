import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site-url";

/**
 * Crawl policy for public marketing + commerce URLs.
 * AI crawlers also use /llms.txt (curated brand index at app/llms.txt/route.ts) —
 * Next MetadataRoute.Robots has no first-class llms field, so discovery is via
 * sitemap + well-known path.
 *
 * Allowed (do not add to disallow): home, shop, mp-config, mbolster-config,
 * guides, blog, faq, our-partners, support, product PDPs.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Routes are locale-prefixed (e.g. /en-US/settings), so disallow
        // patterns use a wildcard segment to match any locale.
        disallow: [
          "/api/",
          "/*/settings/",
          "/*/mp-basic",
          "/*/shop/checkout",
          "/*/shop/cart",
          "/*/account/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
