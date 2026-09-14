"use client";

/**
 * Derived pack list for an x-ray mix: one row per filling with its count, and a
 * remove that drops every piece of that filling from the placements. Mounted
 * next to every x-ray editor so the list staff read is the list they can edit.
 *
 * Read-only when `onPlacementsChange` is omitted, like the editor itself.
 */

import { useMemo } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { removeFilling } from "@/lib/configurator/staff-assist";
import { flattenToPackList, type AnyPlacement } from "@/lib/spatial-fillings/core";
import { fillingLabel, type FillingItemLike } from "@/lib/spatial-fillings/filling-groups";

export function XrayPackList<T extends AnyPlacement>({
  placements,
  onPlacementsChange,
  items,
  className,
}: {
  placements: T[];
  onPlacementsChange?: (next: T[]) => void;
  /** The items handed to the editor; a pre-formatted `label` wins over the type label. */
  items: Array<FillingItemLike & { label?: string }>;
  className?: string;
}) {
  const lines = useMemo(() => flattenToPackList(placements), [placements]);
  const labelOf = (itemId: number) => {
    const item = items.find((i) => i.id === itemId);
    return item ? item.label ?? fillingLabel(item) : `Item #${itemId}`;
  };
  const editable = Boolean(onPlacementsChange);

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          <TableHead>Filling</TableHead>
          <TableHead>Count</TableHead>
          {editable && (
            <TableHead className="w-0">
              <span className="sr-only">Remove</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const label = labelOf(line.item_id);
          return (
            <TableRow key={line.item_id}>
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="tabular-nums">{line.count}</TableCell>
              {editable && (
                <TableCell className="py-0 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove all ${label} from the pack list`}
                    title={`Remove all ${label}`}
                    onClick={() => onPlacementsChange?.(removeFilling(placements, line.item_id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
        {lines.length === 0 && (
          <TableRow>
            <TableCell colSpan={editable ? 3 : 2} className="text-sm text-muted-foreground">
              No pieces placed yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
