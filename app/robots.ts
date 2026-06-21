import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mpillow.com";

export default function robots(): MetadataRoute.Robots {
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
          "/*/mp-config",
          "/*/mbolster-config",
          "/*/shop/checkout",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
