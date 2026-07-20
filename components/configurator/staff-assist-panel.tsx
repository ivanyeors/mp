"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
  confirmGate,
  PILLOW_SIZES,
  PILLOW_TIERS,
  type ConfirmGateState,
  type LoadedTemplate,
  type SizeTier,
} from "@/lib/configurator/staff-assist";
import {
  rowsToPillowPlacements,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings/core";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";

export type FillingItem = { id: number; name: string; subtype: string | null; size: string | null };
type TemplateRow = { id: number; name: string };

/**
 * Staff assist mode panel (slice 04, Staff-only): size×tier control with a
 * confirm gate and a size-scoped Filling Template picker. Per-piece filling
 * edits live on the x-ray itself (slices 07/08) — no list editor here. No
 * template create/save-as — catalog stays curated in the Admin Panel.
 */
export function StaffAssistPanel({
  current,
  onPlacementsChange,
  loadedTemplate,
  onLoadTemplate,
  sessionFillingTemplateId,
  onApplySizeTier,
  onItemsChange,
  onColorOverridesChange,
}: {
  current: SizeTier;
  onPlacementsChange: (next: PillowPlacement[]) => void;
  loadedTemplate: LoadedTemplate | null;
  onLoadTemplate: (loaded: LoadedTemplate | null) => void;
  /** Kept only while the mix exactly matches the loaded template (slice 05 snapshot). */
  sessionFillingTemplateId: number | null;
  onApplySizeTier: (next: SizeTier) => Promise<void>;
  /** Loaded filling items, surfaced for the x-ray renderer (slice 07). */
  onItemsChange?: (items: FillingItem[]) => void;
  /** Product Builder color overrides, surfaced for the x-ray CSS vars (slice 11). */
  onColorOverridesChange?: (overrides: ColorOverrideRow[]) => void;
}) {
  const [gate, setGate] = useState<ConfirmGateState>({ pending: null });
  const [applying, setApplying] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mp-config/assist?size=${encodeURIComponent(current.size)}`)
      .then((r) => r.json())
      .then(
        (d: {
          templates?: TemplateRow[];
          items?: FillingItem[];
          colorOverrides?: ColorOverrideRow[];
        }) => {
          if (cancelled) return;
          setTemplates(d.templates ?? []);
          onItemsChange?.(d.items ?? []);
          onColorOverridesChange?.(d.colorOverrides ?? []);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
          onItemsChange?.([]);
          onColorOverridesChange?.([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onItemsChange is a setState setter
  }, [current.size]);

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

      {/* Filling Template picker (active, size-scoped); edits happen on the x-ray */}
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
