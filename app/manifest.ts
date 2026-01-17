import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mpillow",
    short_name: "Mpillow",
    description: "Mpillow",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    icons: [
      {
        src: "/mpillow_logo_2026.png",
        sizes: "1318x1301",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
