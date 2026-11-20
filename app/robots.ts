import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/*/settings/",
          "/*/mp-basic",
          "/*/shop/checkout",
          "/*/shop/cart",
          "/*/account",
          "/*/appointments?type=readjustment",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
