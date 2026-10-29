"use client";

import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";

/**
 * A Starter's thumbnail, or the blank email's (`BLANK_PREVIEW`), in the Start
 * panel and the palette's Starters tab (PRD-campaign-email-editor slice 08):
 * a muted card until its frame and its render have loaded, which they do
 * when the first one shows, not with the page (./thumbnail-frame.tsx).
 */

const ThumbnailFrame = lazy(() => import("./thumbnail-frame").then((m) => ({ default: m.ThumbnailFrame })));

export function StarterThumbnail(props: { id: string; shape?: "portrait" | "landscape"; className?: string }) {
    const loading = <div className={cn("w-full animate-pulse rounded-sm border bg-muted", props.shape === "landscape" ? "aspect-[4/3]" : "aspect-[3/4]", props.className)} />;
    return (
        <Suspense fallback={loading}>
            <ThumbnailFrame {...props} />
        </Suspense>
    );
}
