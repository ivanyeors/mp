"use client";

/**
 * Insert order (CONTEXT.md): the numbered steps for putting pieces into each
 * Section — left, center, right — when the pillow is assembled. Sub-sections
 * and layers are not part of it. Mounted beside the derived pack list on the
 * Admin Panel surfaces (Configure, Result detail assign); drag to reorder when
 * `onPlacementsChange` is given, read-only otherwise. Pieces never ordered sort
 * last, so a piece added after ordering is simply the next step.
 */

import type { ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";

import { Badge } from "@/components/ui/badge";
import { SortableRow } from "@/components/ui/sortable-row";
import { sectionInsertOrder, setSectionInsertOrder } from "@/lib/configurator/staff-assist";
import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import { SECTIONS, type PillowPlacement, type Section } from "@/lib/spatial-fillings/core";
import { fillingLabel, type FillingItemLike } from "@/lib/spatial-fillings/filling-groups";
import { cn } from "@/lib/utils";

// Unique within a Section (the cell PK minus section), which is one provider's scope.
const pieceId = (p: PillowPlacement) => `${p.subSection}/${p.slot}`;

function Step({ n, label, grip }: { n: number; label: string; grip?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2 text-sm">
      {grip}
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
        {n}
      </span>
      <span className="truncate rounded-full bg-primary/10 px-2.5 py-0.5 font-medium">{label}</span>
    </div>
  );
}

export function InsertOrderList({
  placements,
  onPlacementsChange,
  items,
  className,
}: {
  placements: PillowPlacement[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  /** The items handed to the editor; a pre-formatted `label` wins over the type label. */
  items: Array<FillingItemLike & { label?: string }>;
  className?: string;
}) {
  const labelOf = (itemId: number) => {
    const item = items.find((i) => i.id === itemId);
    return item ? item.label ?? fillingLabel(item) : `Item #${itemId}`;
  };

  const reorder = (section: Section, steps: PillowPlacement[]) => (event: SortableDragEndEvent) => {
    const next = sortableMove(steps, event, pieceId);
    if (next) onPlacementsChange?.(setSectionInsertOrder(placements, section, next));
  };

  return (
    <div className={cn("space-y-3", className)}>
      {SECTIONS.map((section) => {
        const steps = sectionInsertOrder(placements, section);
        const authored = steps.some((p) => p.insertOrder != null);
        return (
          <div key={section} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section}</span>
              {steps.length > 0 && !authored && (
                <Badge variant="outline" title="Order not set yet — showing reading order">
                  auto
                </Badge>
              )}
            </div>
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pieces.</p>
            ) : onPlacementsChange ? (
              <DragDropProvider onDragEnd={reorder(section, steps)}>
                {steps.map((p, i) => (
                  <SortableRow
                    key={pieceId(p)}
                    id={pieceId(p)}
                    index={i}
                    label={`step ${i + 1}, ${labelOf(p.itemId)}`}
                  >
                    {(grip) => <Step n={i + 1} label={labelOf(p.itemId)} grip={grip} />}
                  </SortableRow>
                ))}
              </DragDropProvider>
            ) : (
              steps.map((p, i) => <Step key={pieceId(p)} n={i + 1} label={labelOf(p.itemId)} />)
            )}
          </div>
        );
      })}
    </div>
  );
}
