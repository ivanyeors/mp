import type { NextConfig } from "next";

/**
 * Baseline response headers for every route.
 *
 * frame-ancestors / X-Frame-Options: only our own pages may frame us (the Page
 * Builder preview is a same-origin iframe), which stops clickjacking of the
 * Admin Panel and checkout. The CSP carries directives that cannot break a
 * script, style or connection; a full script-src policy needs report-only
 * soak time against GTM, GA, Stripe and Supabase first.
 *
 * Permissions-Policy denies only features nothing uses. Camera stays allowed
 * (sizing photo `capture` inputs), as do autoplay and fullscreen (the YouTube
 * embed).
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@tabler/icons-react",
      "date-fns",
      "@visx/scale",
      "@visx/shape",
      "@visx/axis",
      "@visx/group",
      "@visx/grid",
      "@visx/tooltip",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "irgxjthamhiaolvdfgar.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "work.mpillow.com" }],
        destination: "https://custom.mpillow.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
