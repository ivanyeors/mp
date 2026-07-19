"use client";

import { Fragment } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MAX_PIECES_PER_CELL,
  type PillowPlacement,
  type Section,
  type SubSection,
} from "@/lib/spatial-fillings/core";

/** Filling Items only — callers filter (category === "filling") and label before passing. */
export type PillowGridItem = { id: number; label: string };

const SECTIONS: Section[] = ["left", "center", "right"];
const SUB_SECTIONS: SubSection[] = ["front", "middle", "back"];

/** Stable cell order: sub-section rows (front→back) × Section columns (left→right). */
export const CELLS: Array<{ section: Section; subSection: SubSection }> = SUB_SECTIONS.flatMap(
  (subSection) => SECTIONS.map((section) => ({ section, subSection })),
);

const cellKey = (section: Section, subSection: SubSection) => `${section}/${subSection}`;

/** Grid state: ordered item ids per cell keyed "section/subSection" (slot = index + 1). */
export type CellMap = Map<string, number[]>;

/** Placements → per-cell ordered item lists (slot order preserved). */
export function placementsToCells(value: PillowPlacement[]): CellMap {
  const cells: CellMap = new Map();
  for (const p of [...value].sort((a, b) => a.slot - b.slot)) {
    const key = cellKey(p.section, p.subSection);
    cells.set(key, [...(cells.get(key) ?? []), p.itemId]);
  }
  return cells;
}

/** Per-cell item lists → placements; slot numbers are the 1-based position in each cell's list. */
export function cellsToPlacements(cells: CellMap): PillowPlacement[] {
  const out: PillowPlacement[] = [];
  for (const { section, subSection } of CELLS) {
    (cells.get(cellKey(section, subSection)) ?? []).forEach((itemId, i) => {
      out.push({ section, subSection, slot: i + 1, itemId });
    });
  }
  return out;
}

/**
 * Spatial 3×3 cell editor for Mpillow filling recipes (ADR 0008).
 * Dumb + controlled: no data fetching; parent owns the placements value.
 */
export function PillowCellGrid({
  value,
  onChange,
  items,
}: {
  value: PillowPlacement[];
  onChange: (next: PillowPlacement[]) => void;
  items: PillowGridItem[];
}) {
  const cells = placementsToCells(value);

  const setCell = (section: Section, subSection: SubSection, itemIds: number[]) => {
    const next = new Map(cells);
    next.set(cellKey(section, subSection), itemIds);
    onChange(cellsToPlacements(next));
  };

  const itemOptions = items.map((it) => (
    <SelectItem key={it.id} value={String(it.id)}>
      {it.label}
    </SelectItem>
  ));

  return (
    <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2">
      <div />
      {SECTIONS.map((section) => (
        <div key={section} className="text-center text-sm font-medium capitalize text-muted-foreground">
          {section}
        </div>
      ))}
      {SUB_SECTIONS.map((subSection) => (
        <Fragment key={subSection}>
          <div className="self-center text-sm font-medium capitalize text-muted-foreground">{subSection}</div>
          {SECTIONS.map((section) => {
            const ids = cells.get(cellKey(section, subSection)) ?? [];
            const full = ids.length >= MAX_PIECES_PER_CELL;
            return (
              <div key={section} className="space-y-1 rounded-lg border p-2">
                <div className="text-right text-xs text-muted-foreground">
                  {ids.length}/{MAX_PIECES_PER_CELL}
                </div>
                {ids.map((itemId, idx) => (
                  <div key={`${idx}-${itemId}`} className="flex items-center gap-1">
                    <Select
                      value={String(itemId)}
                      onValueChange={(v) =>
                        setCell(section, subSection, ids.map((id, i) => (i === idx ? Number(v) : id)))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>{itemOptions}</SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setCell(section, subSection, ids.filter((_, i) => i !== idx))}
                      title="Remove piece"
                    >
                      <X className="size-4" />
                      <span className="sr-only">Remove piece</span>
                    </Button>
                  </div>
                ))}
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v) setCell(section, subSection, [...ids, Number(v)]);
                  }}
                >
                  <SelectTrigger className="w-full" disabled={full || items.length === 0}>
                    <SelectValue
                      placeholder={
                        full ? `Cell full (${MAX_PIECES_PER_CELL}/${MAX_PIECES_PER_CELL})` : "Add piece…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>{itemOptions}</SelectContent>
                </Select>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
