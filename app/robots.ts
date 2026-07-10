import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site-url";

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
