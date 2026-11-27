import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import { headers } from "next/headers";

import { RetroGrid } from "@/components/ui/shadcn-io/retro-grid";
import { classifyCrawler } from "@/lib/analytics/ai-crawlers";
import { LOGO_SRC } from "@/lib/brand-logo";

export const LOADING_LOGO_PX = 108;
export const LOADING_GLOW_PX = 260;
export const LOADING_GLOW =
  "radial-gradient(circle closest-side, rgba(214, 235, 255, 0.95) 0%, rgba(165, 216, 255, 0.8) 26%, rgba(102, 167, 255, 0.5) 48%, rgba(18, 152, 255, 0.22) 70%, rgba(18, 152, 255, 0) 96%)";
export const LOADING_GLOW_AT_REST = { opacity: 0.75, scale: 0.94 };

export function MpillowLoading({ label }: { label: string }) {
  return (
    <div role="status" className="min-h-svh">
      <div className="pointer-events-none fixed inset-0 grid place-items-center">
        <RetroGrid speed="steady" />
        <div className="relative grid place-items-center" style={{ width: LOADING_LOGO_PX, height: LOADING_LOGO_PX }}>
          <div
            className="mp-loading-glow absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: LOADING_GLOW_PX,
              height: LOADING_GLOW_PX,
              margin: -LOADING_GLOW_PX / 2,
              backgroundImage: LOADING_GLOW,
            }}
          />
          <Image
            src={LOGO_SRC}
            unoptimized
            alt=""
            width={LOADING_LOGO_PX}
            height={LOADING_LOGO_PX}
            className="relative object-contain"
            priority
          />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export async function LoadingUntilReady({ label, children }: { label: string; children: ReactNode }) {
  const crawler = classifyCrawler((await headers()).get("user-agent"));
  if (crawler) return children;
  return <Suspense fallback={<MpillowLoading label={label} />}>{children}</Suspense>;
}
