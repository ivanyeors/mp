import { ImageResponse } from "next/og";

import {
  LOADING_BUBBLE_GAP_PX,
  LOADING_BUBBLE_GRADIENT,
  LOADING_BUBBLE_OPACITY_AT_REST,
  LOADING_BUBBLE_PX,
  LOADING_BUBBLES,
} from "@/components/mpillow-loading";
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

  const bubble = LOADING_BUBBLE_PX * image.ratio;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: LOADING_BUBBLE_GAP_PX * image.ratio,
          background: APPLE_SPLASH_BACKGROUND[image.scheme],
        }}
      >
        {Array.from({ length: LOADING_BUBBLES }, (_, index) => (
          <div
            key={index}
            style={{
              width: bubble,
              height: bubble,
              borderRadius: bubble / 2,
              opacity: LOADING_BUBBLE_OPACITY_AT_REST,
              backgroundImage: LOADING_BUBBLE_GRADIENT,
            }}
          />
        ))}
      </div>
    ),
    { width: image.widthPx, height: image.heightPx },
  );
}
