"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gem, LayoutTemplate, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffToolbox, type ToolSpec } from "@/components/configurator/staff-toolbox";
import { SaveFillingTemplate } from "@/components/configurator/save-filling-template";
import { isNeckSupportItem } from "@/lib/spatial-fillings/filling-groups";
import {
  confirmGate,
  PILLOW_SIZES,
  PILLOW_TIERS,
  saveAffordance,
  type ConfirmGateState,
  type LoadedTemplate,
  type SizeTier,
} from "@/lib/configurator/staff-assist";
import {
  pillowPlacementsToRows,
  rowsToPillowPlacements,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings/core";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";

const TIER_LABEL: Record<(typeof PILLOW_TIERS)[number], string> = {
  basic: "Basic",
  premium: "Premium",
};

export type FillingItem = {
  id: number;
  name: string;
  subtype: string | null;
  size: string | null;
  /** Set by the assist route: a neck support ("accessories") is charged at its MSRP. */
  category?: string;
  msrp?: number | null;
};
type TemplateRow = { id: number; name: string };

/** A pillow Filling Template's full placements, as the x-ray editor loads them. */
export async function fetchPillowTemplate(
  templateId: number,
): Promise<{ id: number; placements: PillowPlacement[] }> {
  const res = await fetch(`/api/mp-config/assist?templateId=${templateId}`);
  const data = (await res.json()) as { placements?: PillowPlacementRow[]; error?: string };
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Load failed");
  return { id: templateId, placements: rowsToPillowPlacements(data.placements ?? []) };
}

/**
 * Staff assist mode panel (slice 04, Staff-only): size×tier control with a
 * confirm gate and a size-scoped Filling Template picker. Per-piece filling
 * edits live on the x-ray itself (slices 07/08); the stage's Derived pack list
 * card removes a filling outright, reading the same lifted mix.
 *
 * An edited mix can be published back to the catalog — overwriting the loaded
 * template or forking a new one — which the Admin Panel then curates. That
 * write needs the inventory permission, so Staff without it still get the full
 * session editor, just no save.
 */
export function StaffAssistPanel({
  current,
  placements,
  onPlacementsChange,
  loadedTemplate,
  onLoadTemplate,
  suggestedTemplateId = null,
  sessionFillingTemplateId,
  onApplySizeTier,
  onItemsChange,
  onColorOverridesChange,
  onDimensionOverridesChange,
  className,
}: {
  current: SizeTier;
  /** Live session mix, edited on the x-ray — the thing a save publishes. */
  placements: PillowPlacement[];
  onPlacementsChange: (next: PillowPlacement[]) => void;
  loadedTemplate: LoadedTemplate | null;
  onLoadTemplate: (loaded: LoadedTemplate | null) => void;
  /** The engine's Filling Template for this size, marked in the picker. */
  suggestedTemplateId?: number | null;
  /** Kept only while the mix exactly matches the loaded template (slice 05 snapshot). */
  sessionFillingTemplateId: number | null;
  /** Applies a confirmed change; `from` is the size×tier the change leaves. */
  onApplySizeTier: (next: SizeTier, from: SizeTier) => Promise<void>;
  /** Loaded filling items, surfaced for the x-ray renderer (slice 07). */
  onItemsChange?: (items: FillingItem[]) => void;
  /** Product Builder color overrides, surfaced for the x-ray CSS vars (slice 11). */
  onColorOverridesChange?: (overrides: ColorOverrideRow[]) => void;
  /** Settings dimension overrides, surfaced for the true-scale x-ray (slice 02). */
  onDimensionOverridesChange?: (overrides: DimensionOverridesPayload | null) => void;
  /** Passed to the toolbox rail (the stage spans it across its column). */
  className?: string;
}) {
  const [gate, setGate] = useState<ConfirmGateState>({ pending: null });
  const [applying, setApplying] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  // Bumped after a save so the picker refetches and lists the saved template.
  const [catalogVersion, setCatalogVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mp-config/assist?size=${encodeURIComponent(current.size)}`)
      .then((r) => r.json())
      .then(
        (d: {
          templates?: TemplateRow[];
          items?: FillingItem[];
          colorOverrides?: ColorOverrideRow[];
          dimensionOverrides?: DimensionOverridesPayload;
        }) => {
          if (cancelled) return;
          // A neck support is for premium pillows only — basic never offers it.
          const offered = (d.items ?? []).filter(
            (i) => current.tier === "premium" || !isNeckSupportItem({ category: i.category, name: i.name }),
          );
          setTemplates(d.templates ?? []);
          onItemsChange?.(offered);
          onColorOverridesChange?.(d.colorOverrides ?? []);
          onDimensionOverridesChange?.(d.dimensionOverrides ?? null);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
          onItemsChange?.([]);
          onColorOverridesChange?.([]);
          onDimensionOverridesChange?.(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onItemsChange is a setState setter
  }, [current.size, current.tier, catalogVersion]);

  const request = (next: SizeTier) => {
    setGate((g) => confirmGate(g, { type: "request", current, next }).state);
  };

  const resolveGate = async (action: "confirm" | "cancel") => {
    const { state, apply } = confirmGate(gate, { type: action });
    setGate(state);
    if (!apply) return;
    setApplying(true);
    try {
      await onApplySizeTier(apply, current);
    } finally {
      setApplying(false);
    }
  };

  const loadTemplate = async (templateId: number) => {
    try {
      const loaded = await fetchPillowTemplate(templateId);
      onLoadTemplate(loaded);
      onPlacementsChange(loaded.placements);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load template");
    }
  };

  const tools: ToolSpec[] = [
    {
      id: "size",
      label: "Size",
      icon: Ruler,
      value: current.size,
      options: PILLOW_SIZES.map((sz) => ({ value: sz, label: sz })),
      onSelect: (size) => request({ ...current, size: size as SizeTier["size"] }),
      disabled: applying,
    },
    {
      id: "tier",
      label: "Tier",
      icon: Gem,
      value: current.tier,
      options: PILLOW_TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })),
      onSelect: (tier) => request({ ...current, tier: tier as SizeTier["tier"] }),
      disabled: applying,
    },
    {
      id: "template",
      label: "Filling Template",
      icon: LayoutTemplate,
      layout: "list",
      value: loadedTemplate ? String(loadedTemplate.id) : "",
      options: templates.map((t) => ({
        value: String(t.id),
        label: t.id === suggestedTemplateId ? `${t.name} · Suggested` : t.name,
      })),
      onSelect: (v) => void loadTemplate(Number(v)),
      placeholder: templates.length === 0 ? "None for this size" : "Load template…",
    },
  ];

  const affordance = saveAffordance({ placements, loaded: loadedTemplate });
  // Templates are scoped by size alone, so only a size change replaces the mix.
  const sizeChange = gate.pending !== null && gate.pending.size !== current.size;
  const loadedName = loadedTemplate
    ? templates.find((t) => t.id === loadedTemplate.id)?.name ?? "this template"
    : null;

  return (
    <StaffToolbox
      tools={tools}
      className={className}
      action={
        affordance.dirty ? (
          <SaveFillingTemplate
            scope={{ size: current.size }}
            placements={pillowPlacementsToRows(placements)}
            overwrite={
              affordance.canOverwrite && loadedTemplate && loadedName
                ? { id: loadedTemplate.id, name: loadedName }
                : null
            }
            onSaved={(templateId) => {
              // Re-link the session to what was just written: the claim only
              // survives while the mix matches, so pass the saved mix itself.
              onLoadTemplate({ id: templateId, placements });
              setCatalogVersion((v) => v + 1);
            }}
          />
        ) : null
      }
      status={
        loadedTemplate
          ? sessionFillingTemplateId !== null
            ? { label: "Matches template", tone: "synced" }
            : { label: "Edited", tone: "edited" }
          : null
      }
    >
      {/* Confirm gate: without confirm, placements stay untouched */}
      <Dialog open={gate.pending !== null} onOpenChange={(open) => !open && void resolveGate("cancel")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sizeChange ? "Change size?" : "Change tier?"}</DialogTitle>
            <DialogDescription>
              {!gate.pending
                ? ""
                : sizeChange
                  ? `Switching to Size ${gate.pending.size} (${TIER_LABEL[gate.pending.tier]}) clears the current fillings and loads that size's Filling Template as the starting mix.`
                  : gate.pending.tier === "basic"
                    ? "Switching to Basic keeps the current fillings, except any neck support — that is for Premium pillows only."
                    : "Switching to Premium keeps the current fillings."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => void resolveGate("cancel")}>
              Cancel
            </Button>
            <Button onClick={() => void resolveGate("confirm")} disabled={applying}>
              {sizeChange ? "Change & clear fillings" : "Change tier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StaffToolbox>
  );
}
