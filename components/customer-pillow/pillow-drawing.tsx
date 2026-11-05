"use client";

import dynamic from "next/dynamic";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import type { FillingMixItem } from "@/lib/results/admin/filling-mix";

/**
 * The pillow on record drawn read-only (ADR 0042 j, k): the x-ray and, folded
 * under it, one row per filling with its count. Shared by the Customer page
 * and the customer's own Profile, so both draw the same pillow the same way.
 */

// The x-ray brings @dnd-kit and the sunburst picker with it; nothing to render on the server.
const XrayEditor = dynamic(() => import("@/components/spatial/xray-editor").then((m) => m.XrayEditor), {
    ssr: false,
    loading: () => <Skeleton className="aspect-[664/374] w-full rounded-lg" />,
});

export function PillowXray({
    placements,
    items,
    size,
    colorOverrides,
    dimensionOverrides,
}: {
    placements: PillowPlacement[];
    items: FillingMixItem[];
    size: string | null;
    colorOverrides: ColorOverrideRow[];
    dimensionOverrides: DimensionOverridesPayload | undefined;
}) {
    return (
        <div className="mx-auto w-full max-w-[52rem]">
            <XrayEditor
                placements={placements}
                items={items}
                pillowSize={size}
                colorOverrides={colorOverrides}
                dimensionOverrides={dimensionOverrides}
            />
        </div>
    );
}

export function PillowContents({
    label,
    placements,
    items,
}: {
    label: string;
    placements: PillowPlacement[];
    items: FillingMixItem[];
}) {
    const pieces = placements.length;
    return (
        <Collapsible className="rounded-md border">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted/50 max-md:min-h-11 [&[data-state=open]>svg]:rotate-180">
                <span>
                    {label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                        {pieces} piece{pieces === 1 ? "" : "s"}
                    </span>
                </span>
                <ChevronDown className="size-4 transition-transform" aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t">
                <XrayPackList placements={placements} items={items} />
            </CollapsibleContent>
        </Collapsible>
    );
}
