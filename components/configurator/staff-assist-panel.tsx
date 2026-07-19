"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addPiece,
  cellPieces,
  confirmGate,
  PILLOW_CELLS,
  PILLOW_SIZES,
  PILLOW_TIERS,
  removePiece,
  type ConfirmGateState,
  type LoadedTemplate,
  type SizeTier,
} from "@/lib/configurator/staff-assist";
import {
  MAX_PIECES_PER_CELL,
  rowsToPillowPlacements,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings/core";

export type FillingItem = { id: number; name: string; subtype: string | null };
type TemplateRow = { id: number; name: string };

/**
 * Staff assist mode panel (slice 04, Staff-only): size×tier control with a
 * confirm gate, size-scoped Filling Template picker, and the v1 per-cell list
 * editor (x-ray replaces it in slices 07/08). No template create/save-as here —
 * catalog stays curated in the Admin Panel.
 */
export function StaffAssistPanel({
  current,
  placements,
  onPlacementsChange,
  loadedTemplate,
  onLoadTemplate,
  sessionFillingTemplateId,
  onApplySizeTier,
  onItemsChange,
}: {
  current: SizeTier;
  placements: PillowPlacement[];
  onPlacementsChange: (next: PillowPlacement[]) => void;
  loadedTemplate: LoadedTemplate | null;
  onLoadTemplate: (loaded: LoadedTemplate | null) => void;
  /** Kept only while the mix exactly matches the loaded template (slice 05 snapshot). */
  sessionFillingTemplateId: number | null;
  onApplySizeTier: (next: SizeTier) => Promise<void>;
  /** Loaded filling items, surfaced for the x-ray renderer (slice 07). */
  onItemsChange?: (items: FillingItem[]) => void;
}) {
  const [gate, setGate] = useState<ConfirmGateState>({ pending: null });
  const [applying, setApplying] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [items, setItems] = useState<FillingItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mp-config/assist?size=${encodeURIComponent(current.size)}`)
      .then((r) => r.json())
      .then((d: { templates?: TemplateRow[]; items?: FillingItem[] }) => {
        if (cancelled) return;
        setTemplates(d.templates ?? []);
        setItems(d.items ?? []);
        onItemsChange?.(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
          setItems([]);
          onItemsChange?.([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onItemsChange is a setState setter
  }, [current.size]);

  const itemName = (id: number) => {
    const item = items.find((i) => i.id === id);
    if (!item) return `Item #${id}`;
    return item.subtype ? `${item.name} (${item.subtype})` : item.name;
  };

  const request = (next: SizeTier) => {
    setGate((g) => confirmGate(g, { type: "request", current, next }).state);
  };

  const resolveGate = async (action: "confirm" | "cancel") => {
    const { state, apply } = confirmGate(gate, { type: action });
    setGate(state);
    if (!apply) return;
    setApplying(true);
    try {
      await onApplySizeTier(apply);
    } finally {
      setApplying(false);
    }
  };

  const loadTemplate = async (templateId: number) => {
    try {
      const res = await fetch(`/api/mp-config/assist?templateId=${templateId}`);
      const data = (await res.json()) as { placements?: PillowPlacementRow[]; error?: string };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Load failed");
      const loaded = rowsToPillowPlacements(data.placements ?? []);
      onLoadTemplate({ id: templateId, placements: loaded });
      onPlacementsChange(loaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load template");
    }
  };

  const addToCell = (cell: (typeof PILLOW_CELLS)[number], itemId: number) => {
    const result = addPiece(placements, cell, itemId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onPlacementsChange(result.placements);
  };

  return (
    <div className="w-full max-w-md rounded-xl border bg-background/95 p-4 text-left shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Staff assist</p>
        {loadedTemplate ? (
          <Badge variant="outline" className="text-xs">
            {sessionFillingTemplateId !== null ? "Matches template" : "Edited from template"}
          </Badge>
        ) : null}
      </div>

      {/* Size × tier control (confirm gate clears fillings, loads default template) */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Select
          value={current.size}
          onValueChange={(size) => request({ ...current, size: size as SizeTier["size"] })}
        >
          <SelectTrigger aria-label="Size" className="w-full min-w-0" disabled={applying}>
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            {PILLOW_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                Size {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={current.tier}
          onValueChange={(tier) => request({ ...current, tier: tier as SizeTier["tier"] })}
        >
          <SelectTrigger aria-label="Tier" className="w-full min-w-0 capitalize" disabled={applying}>
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            {PILLOW_TIERS.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filling Template picker (active, size-scoped) */}
      <div className="mb-3">
        <Select
          value={loadedTemplate ? String(loadedTemplate.id) : ""}
          onValueChange={(v) => void loadTemplate(Number(v))}
        >
          <SelectTrigger aria-label="Filling Template" className="w-full min-w-0">
            <SelectValue
              placeholder={
                templates.length === 0 ? "No templates for this size" : "Load Filling Template…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* v1 per-cell list editor (Section × sub-section; x-ray replaces in 07/08) */}
      <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
        {PILLOW_CELLS.map((cell) => {
          const pieces = cellPieces(placements, cell);
          const full = pieces.length >= MAX_PIECES_PER_CELL;
          return (
            <div key={`${cell.section}-${cell.subSection}`} className="rounded-lg border p-2">
              <p className="mb-1 text-xs font-medium capitalize text-muted-foreground">
                {cell.section} · {cell.subSection}
                {full ? " — max 5 pieces" : ""}
              </p>
              {pieces.length > 0 && (
                <ul className="mb-1 space-y-1">
                  {pieces.map((p) => (
                    <li key={p.slot} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{itemName(p.itemId)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 shrink-0"
                        aria-label={`Remove ${itemName(p.itemId)}`}
                        onClick={() => onPlacementsChange(removePiece(placements, cell, p.slot))}
                      >
                        <X className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Select value="" onValueChange={(v) => addToCell(cell, Number(v))}>
                <SelectTrigger
                  size="sm"
                  className="w-full min-w-0"
                  disabled={full}
                  aria-label={`Add filling to ${cell.section} ${cell.subSection}`}
                >
                  <SelectValue placeholder={full ? "Cell full (max 5)" : "Add filling…"} />
                </SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.subtype ? `${i.name} (${i.subtype})` : i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {/* Confirm gate: without confirm, placements stay untouched */}
      <Dialog open={gate.pending !== null} onOpenChange={(open) => !open && void resolveGate("cancel")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change size and tier?</DialogTitle>
            <DialogDescription>
              {gate.pending
                ? `Switching to Size ${gate.pending.size} (${gate.pending.tier}) clears the current fillings and loads that size's default Filling Template as the starting mix.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => void resolveGate("cancel")}>
              Cancel
            </Button>
            <Button onClick={() => void resolveGate("confirm")} disabled={applying}>
              Change &amp; clear fillings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
