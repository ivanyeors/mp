"use client";

import type { ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SortableRow } from "@/components/ui/sortable-row";
import { removePiece, sectionInsertOrder, setSectionInsertOrder } from "@/lib/configurator/staff-assist";
import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";
import { SECTIONS, type PillowPlacement, type Section } from "@/lib/spatial-fillings/core";
import { fillingLabel, type FillingItemLike } from "@/lib/spatial-fillings/filling-groups";
import { cn } from "@/lib/utils";

const pieceId = (p: PillowPlacement) => `${p.subSection}/${p.slot}`;

function Step({
  n,
  label,
  where,
  grip,
  onRemove,
  removeLabel,
}: {
  n: number;
  label: string;
  where: string;
  grip?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="flex min-h-9 min-w-0 items-center gap-2 text-sm">
      {grip}
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
        {n}
      </span>
      <span className="min-w-0 truncate rounded-full bg-primary/10 px-2.5 py-0.5 font-medium" title={label}>
        {label}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs capitalize text-muted-foreground">{where}</span>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function InsertOrderList({
  placements,
  onPlacementsChange,
  items,
  columns = false,
  className,
}: {
  placements: PillowPlacement[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  items: Array<FillingItemLike & { label?: string }>;
  columns?: boolean;
  className?: string;
}) {
  const labelOf = (itemId: number) => {
    const item = items.find((i) => i.id === itemId);
    return item ? item.label ?? fillingLabel(item) : `Item #${itemId}`;
  };
  const stacked = new Set(placements.filter((p) => (p.row ?? 0) > 0).map((p) => `${p.section}/${p.subSection}`));
  const whereOf = (p: PillowPlacement) =>
    stacked.has(`${p.section}/${p.subSection}`) ? `${p.subSection} · layer ${(p.row ?? 0) + 1}` : p.subSection;

  const reorder = (section: Section, steps: PillowPlacement[]) => (event: SortableDragEndEvent) => {
    const next = sortableMove(steps, event, pieceId);
    if (next) onPlacementsChange?.(setSectionInsertOrder(placements, section, next));
  };
  const remove = (p: PillowPlacement) =>
    onPlacementsChange && (() => onPlacementsChange(removePiece(placements, { section: p.section, subSection: p.subSection }, p.slot)));

  return (
    <div className={cn(columns ? "grid gap-x-6 gap-y-4 md:grid-cols-3" : "space-y-3", className)}>
      {SECTIONS.map((section) => {
        const steps = sectionInsertOrder(placements, section);
        const authored = steps.some((p) => p.insertOrder != null);
        const step = (p: PillowPlacement, i: number, grip?: ReactNode) => (
          <Step
            n={i + 1}
            label={labelOf(p.itemId)}
            where={whereOf(p)}
            grip={grip}
            onRemove={remove(p)}
            removeLabel={`Remove step ${i + 1}, ${labelOf(p.itemId)}, from ${section} ${whereOf(p)}`}
          />
        );
        return (
          <div key={section} className="min-w-0 space-y-1" data-insert-order-section={section}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section}
                {columns && steps.length > 0 && <span className="ml-1.5 font-normal tabular-nums">{steps.length}</span>}
              </span>
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
                    {(grip) => step(p, i, grip)}
                  </SortableRow>
                ))}
              </DragDropProvider>
            ) : (
              steps.map((p, i) => <div key={pieceId(p)}>{step(p, i)}</div>)
            )}
          </div>
        );
      })}
    </div>
  );
}
