"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addBolsterPiece, removeBolsterPiece } from "@/lib/configurator/staff-assist";
import type { BolsterPlacement } from "@/lib/spatial-fillings/core";

/** Filling Items only — callers filter (category === "filling") and label before passing. */
export type BolsterListItem = { id: number; label: string };

/**
 * Mbolster single-compartment mix editor (ADR 0008 amendment): one ordered
 * list, add/remove, NO piece cap, never the pillow Section/sub-section grid.
 * Dumb + controlled: no data fetching; parent owns the placements value.
 * Shared by Configure's Filling Config tab, Admin Result assign, and the
 * /mbolster-config staff assist panel.
 */
export function BolsterCompartmentList({
  value,
  onChange,
  items,
}: {
  value: BolsterPlacement[];
  onChange: (next: BolsterPlacement[]) => void;
  items: BolsterListItem[];
}) {
  const pieces = [...value].sort((a, b) => a.slot - b.slot);
  const label = (itemId: number) =>
    items.find((i) => i.id === itemId)?.label ?? `Item #${itemId}`;

  return (
    <div className="space-y-1 rounded-lg border p-2">
      <div className="text-right text-xs text-muted-foreground">
        {pieces.length} piece{pieces.length === 1 ? "" : "s"}
      </div>
      {pieces.map((p) => (
        <div key={p.slot} className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{label(p.itemId)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={`Remove ${label(p.itemId)}`}
            onClick={() => onChange(removeBolsterPiece(value, p.slot))}
          >
            <X className="size-3" />
            <span className="sr-only">Remove piece</span>
          </Button>
        </div>
      ))}
      <Select
        value=""
        onValueChange={(v) => {
          if (v) onChange(addBolsterPiece(value, Number(v)));
        }}
      >
        <SelectTrigger className="w-full" disabled={items.length === 0} aria-label="Add filling">
          <SelectValue placeholder="Add piece…" />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.id} value={String(i.id)}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
