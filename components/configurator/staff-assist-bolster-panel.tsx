"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BolsterCompartmentList,
  type BolsterListItem,
} from "@/components/spatial/bolster-compartment-list";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import type { LoadedTemplate } from "@/lib/configurator/staff-assist";
import {
  rowsToBolsterPlacements,
  type BolsterPlacement,
  type BolsterPlacementRow,
} from "@/lib/spatial-fillings/core";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";

type TemplateRow = { id: number; name: string };

/**
 * Staff assist panel for /mbolster-config (slice 13, Staff-only). Mirrors the
 * pillow panel minus the size×tier confirm gate — the surface models length
 * from the height recommendation, so templates scope to that length
 * (length-based eligibility). Single-compartment list editor, NO cap, never
 * the pillow cell grid (ADR 0008 amendment). No template create/save-as —
 * catalog stays curated in the Admin Panel.
 */
export function StaffAssistBolsterPanel({
  length,
  placements,
  onPlacementsChange,
  loadedTemplate,
  onLoadTemplate,
  sessionFillingTemplateId,
  onItemsChange,
  onColorOverridesChange,
}: {
  /** Recommended bolster length (short | medium | long) — scopes the template picker. */
  length: string;
  placements: BolsterPlacement[];
  onPlacementsChange: (next: BolsterPlacement[]) => void;
  loadedTemplate: LoadedTemplate | null;
  onLoadTemplate: (loaded: LoadedTemplate | null) => void;
  /** Kept only while the mix exactly matches the loaded template (snapshot claim). */
  sessionFillingTemplateId: number | null;
  /** Loaded filling items, surfaced for the x-ray renderer. */
  onItemsChange?: (items: FillingItem[]) => void;
  /** Product Builder color overrides, surfaced for the x-ray CSS vars. */
  onColorOverridesChange?: (overrides: ColorOverrideRow[]) => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [items, setItems] = useState<FillingItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mp-config/assist?length=${encodeURIComponent(length)}`)
      .then((r) => r.json())
      .then(
        (d: {
          templates?: TemplateRow[];
          items?: FillingItem[];
          colorOverrides?: ColorOverrideRow[];
        }) => {
          if (cancelled) return;
          setTemplates(d.templates ?? []);
          setItems(d.items ?? []);
          onItemsChange?.(d.items ?? []);
          onColorOverridesChange?.(d.colorOverrides ?? []);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
          setItems([]);
          onItemsChange?.([]);
          onColorOverridesChange?.([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onItemsChange is a setState setter
  }, [length]);

  const loadTemplate = async (templateId: number) => {
    try {
      const res = await fetch(`/api/mp-config/assist?templateId=${templateId}`);
      const data = (await res.json()) as { placements?: BolsterPlacementRow[]; error?: string };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Load failed");
      const loaded = rowsToBolsterPlacements(data.placements ?? []);
      onLoadTemplate({ id: templateId, placements: loaded });
      onPlacementsChange(loaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load template");
    }
  };

  const listItems: BolsterListItem[] = items.map((i) => ({
    id: i.id,
    label: i.subtype ? `${i.name} (${i.subtype})` : i.name,
  }));

  return (
    <div className="w-full max-w-md rounded-xl border bg-background/95 p-4 text-left shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Staff assist · <span className="capitalize">{length}</span>
        </p>
        {loadedTemplate ? (
          <Badge variant="outline" className="text-xs">
            {sessionFillingTemplateId !== null ? "Matches template" : "Edited from template"}
          </Badge>
        ) : null}
      </div>

      {/* Filling Template picker (active, length-scoped) */}
      <div className="mb-3">
        <Select
          value={loadedTemplate ? String(loadedTemplate.id) : ""}
          onValueChange={(v) => void loadTemplate(Number(v))}
        >
          <SelectTrigger aria-label="Filling Template" className="w-full min-w-0">
            <SelectValue
              placeholder={
                templates.length === 0 ? "No templates for this length" : "Load Filling Template…"
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

      {/* Single long compartment: ordered list, add/remove, no cap */}
      <div className="max-h-[38vh] overflow-y-auto pr-1">
        <BolsterCompartmentList value={placements} onChange={onPlacementsChange} items={listItems} />
      </div>
    </div>
  );
}
