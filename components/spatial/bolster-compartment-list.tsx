"use client";

import { useMemo } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SunburstMenu } from "@/components/ui/sunburst-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { fillingItemsToSunburst } from "@/lib/spatial-fillings/filling-groups";
import { addBolsterPiece, removeBolsterPiece } from "@/lib/configurator/staff-assist";
import type { BolsterPlacement } from "@/lib/spatial-fillings/core";

export type BolsterListItem = {
  id: number;
  label: string;
  name: string;
  subtype: string | null;
  size: string | null;
};

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
  const isMobile = useIsMobile();
  const label = (itemId: number) =>
    items.find((i) => i.id === itemId)?.label ?? `Item #${itemId}`;
  const tree = useMemo(() => fillingItemsToSunburst(items), [items]);

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
      {items.length === 0 ? (
        <p className="py-1 text-center text-xs text-muted-foreground">No fillings available</p>
      ) : (
        <div className="flex justify-center pt-1">
          <SunburstMenu
            root={tree}
            display="text"
            size={isMobile ? 280 : 200}
            ringWidth={isMobile ? 48 : 40}
            holeRadius={isMobile ? 26 : 18}
            centerIcon={Plus}
            ariaLabel="Add piece"
            onSelect={(leaf) => onChange(addBolsterPiece(value, Number(leaf.id)))}
          />
        </div>
      )}
    </div>
  );
}
