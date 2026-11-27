import { Suspense, type ReactNode } from "react";
import { headers } from "next/headers";

import { classifyCrawler } from "@/lib/analytics/ai-crawlers";

export function MpillowLoading({ label }: { label: string }) {
  return (
    <div role="status" className="min-h-svh">
      <div className="pointer-events-none fixed inset-0 grid place-items-center">
        <div className="size-10 animate-spin rounded-full border-[3px] border-foreground/10 border-t-[#2b69bc] motion-reduce:[animation-duration:2.5s] dark:border-t-[#66a7ff]" />
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
