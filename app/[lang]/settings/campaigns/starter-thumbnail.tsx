"use client";

import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";

const ThumbnailFrame = lazy(() => import("./thumbnail-frame").then((m) => ({ default: m.ThumbnailFrame })));

export function StarterThumbnail(props: { id: string; shape?: "portrait" | "landscape"; className?: string }) {
    const loading = <div className={cn("w-full animate-pulse rounded-sm border bg-muted", props.shape === "landscape" ? "aspect-[4/3]" : "aspect-[3/4]", props.className)} />;
    return (
        <Suspense fallback={loading}>
            <ThumbnailFrame {...props} />
        </Suspense>
    );
}
