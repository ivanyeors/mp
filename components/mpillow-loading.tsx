import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";

import { classifyCrawler } from "@/lib/analytics/ai-crawlers";

export const LOADING_BUBBLES = 3;
export const LOADING_BUBBLE_PX = 14;
export const LOADING_BUBBLE_GAP_PX = 10;
export const LOADING_BUBBLE_GRADIENT = "linear-gradient(135deg, #a5d8ff 0%, #1298ff 55%, #1f5fc0 100%)";
export const LOADING_BUBBLE_OPACITY_AT_REST = 0.55;

export function MpillowLoading({ label }: { label: string }) {
  return (
    <div role="status" className="min-h-svh">
      <div className="pointer-events-none fixed inset-0 grid place-items-center">
        <div className="flex" style={{ gap: LOADING_BUBBLE_GAP_PX }}>
          {Array.from({ length: LOADING_BUBBLES }, (_, index) => (
            <div
              key={index}
              className="mp-loading-bubble rounded-full"
              style={{
                width: LOADING_BUBBLE_PX,
                height: LOADING_BUBBLE_PX,
                backgroundImage: LOADING_BUBBLE_GRADIENT,
                animationDelay: `${index * 0.16}s`,
              }}
            />
          ))}
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
