import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import { headers } from "next/headers";

import { classifyCrawler } from "@/lib/analytics/ai-crawlers";
import { LOGO_SRC } from "@/lib/brand-logo";

export const LOADING_TILE_PX = 96;
export const LOADING_LOGO_PX = 72;
export const LOADING_TILE_RADIUS_PX = 22;

export function MpillowLoading({ label }: { label: string }) {
  return (
    <div role="status" className="min-h-svh">
      <div className="pointer-events-none fixed inset-0 grid place-items-center">
        <div className="relative">
          <div
            className="mp-loading-tile grid place-items-center border border-[#001736]/10 bg-white shadow-[0_8px_24px_-12px_rgba(0,23,54,0.45)]"
            style={{ width: LOADING_TILE_PX, height: LOADING_TILE_PX, borderRadius: LOADING_TILE_RADIUS_PX }}
          >
            <Image
              src={LOGO_SRC}
              unoptimized
              alt=""
              width={LOADING_LOGO_PX}
              height={LOADING_LOGO_PX}
              className="object-contain"
              priority
            />
          </div>
          <div className="absolute left-0 top-full mt-6 h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
            <div className="mp-top-loading-bar" />
          </div>
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
