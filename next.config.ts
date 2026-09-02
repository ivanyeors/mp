import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
