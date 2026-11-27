import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { LOADING_GLOW, LOADING_GLOW_AT_REST, LOADING_GLOW_PX, LOADING_LOGO_PX } from "@/components/mpillow-loading";
import { retroGridStillSvg } from "@/components/ui/shadcn-io/retro-grid";
import { APPLE_SPLASH_BACKGROUND, APPLE_SPLASH_IMAGES } from "@/lib/apple-splash";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return APPLE_SPLASH_IMAGES.map(({ file }) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const image = APPLE_SPLASH_IMAGES.find((candidate) => candidate.file === file);
  if (!image) return new Response("Not found", { status: 404 });

  const logo = await readFile(path.join(process.cwd(), "public", "icon-512.png"));
  const grid = retroGridStillSvg(image.widthPx, image.heightPx, image.ratio);
  const glow = LOADING_GLOW_PX * image.ratio * LOADING_GLOW_AT_REST.scale;
  const logoSize = LOADING_LOGO_PX * image.ratio;
  const centred = { position: "absolute", display: "flex" } as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: APPLE_SPLASH_BACKGROUND[image.scheme],
        }}
      >
        <div
          style={{
            ...centred,
            left: 0,
            top: 0,
            width: image.widthPx,
            height: image.heightPx,
            backgroundImage: `url(data:image/svg+xml;base64,${Buffer.from(grid).toString("base64")})`,
            backgroundSize: "100% 100%",
          }}
        />
        <div
          style={{
            ...centred,
            left: (image.widthPx - glow) / 2,
            top: (image.heightPx - glow) / 2,
            width: glow,
            height: glow,
            borderRadius: glow / 2,
            opacity: LOADING_GLOW_AT_REST.opacity,
            backgroundImage: LOADING_GLOW,
          }}
        />
        <div
          style={{
            ...centred,
            left: (image.widthPx - logoSize) / 2,
            top: (image.heightPx - logoSize) / 2,
            width: logoSize,
            height: logoSize,
            backgroundImage: `url(data:image/png;base64,${logo.toString("base64")})`,
            backgroundSize: "100% 100%",
          }}
        />
      </div>
    ),
    { width: image.widthPx, height: image.heightPx },
  );
}
