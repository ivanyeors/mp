import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { APPLE_SPLASH_BACKGROUND, APPLE_SPLASH_IMAGES } from "@/lib/apple-splash";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return APPLE_SPLASH_IMAGES.map(({ file }) => ({ file }));
}

const TILE_PX = 96;
const TILE_RADIUS_PX = 22;
const LOGO_PX = 72;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const image = APPLE_SPLASH_IMAGES.find((candidate) => candidate.file === file);
  if (!image) return new Response("Not found", { status: 404 });

  const logo = await readFile(path.join(process.cwd(), "public", "icon-512.png"));
  const px = (cssPx: number) => cssPx * image.ratio;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: APPLE_SPLASH_BACKGROUND[image.scheme],
        }}
      >
        <div
          style={{
            width: px(TILE_PX),
            height: px(TILE_PX),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: px(TILE_RADIUS_PX),
            border: `${px(1)}px solid rgba(0, 23, 54, 0.1)`,
            boxShadow: `0 ${px(8)}px ${px(24)}px ${px(-12)}px rgba(0, 23, 54, 0.45)`,
            background: "#ffffff",
          }}
        >
          <div
            style={{
              width: px(LOGO_PX),
              height: px(LOGO_PX),
              backgroundImage: `url(data:image/png;base64,${logo.toString("base64")})`,
              backgroundSize: "100% 100%",
            }}
          />
        </div>
      </div>
    ),
    { width: image.widthPx, height: image.heightPx },
  );
}
