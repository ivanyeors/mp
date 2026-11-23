"use client";

import { ChevronDown } from "lucide-react";

import { CELLS } from "@/lib/spatial-fillings/cells";
import type { BolsterPlacementRow, PillowPlacementRow } from "@/lib/spatial-fillings/core";
import { cn } from "@/lib/utils";

export function PlacementBreakdown({
    placements,
    bolster,
    nameOf,
    open,
    onToggle,
}: {
    placements: ReadonlyArray<PillowPlacementRow | BolsterPlacementRow>;
    bolster: boolean;
    nameOf: (itemId: number) => string;
    open: boolean;
    onToggle: () => void;
}) {
    if (placements.length === 0) return null;

    if (bolster) {
        const pieces = [...placements].sort((a, b) => a.slot - b.slot).map((p) => nameOf(p.item_id));
        return (
            <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Placement breakdown</div>
                <div className="flex justify-between text-xs gap-2">
                    <span className="text-muted-foreground">Compartment</span>
                    <span className="text-right">{pieces.join(", ")}</span>
                </div>
            </div>
        );
    }

    const cells = placements.filter((p): p is PillowPlacementRow => "section" in p);
    if (cells.length === 0) return null;
    return (
        <div>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors active:bg-press md:hidden"
            >
                Placement breakdown
                <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            <div className="text-xs font-medium text-muted-foreground mb-1 max-md:hidden">Placement breakdown</div>
            <div className={cn("space-y-1", !open && "max-md:hidden")}>
                {CELLS.map(({ section, subSection }) => {
                    const pieces = cells
                        .filter((p) => p.section === section && p.sub_section === subSection)
                        .sort((a, b) => a.slot - b.slot)
                        .map((p) => nameOf(p.item_id));
                    return (
                        <div key={`${section}-${subSection}`} className="flex justify-between text-xs gap-2">
                            <span className="capitalize text-muted-foreground">
                                {section}, {subSection}
                            </span>
                            <span className="text-right">{pieces.length ? pieces.join(", ") : "—"}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
