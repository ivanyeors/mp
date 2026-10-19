"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate, Ruler } from "lucide-react";
import { StaffToolbox, type ToolSpec } from "@/components/configurator/staff-toolbox";
import { SaveFillingTemplate } from "@/components/configurator/save-filling-template";
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { saveAffordance, type LoadedTemplate } from "@/lib/configurator/staff-assist";
import {
  bolsterPlacementsToRows,
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
 * (length-based eligibility). Per-piece edits live on the x-ray itself —
 * no list editor here. An edited mix saves back to the catalog the same way
 * the pillow panel does (overwrite or fork), gated on inventory.
 */
export function StaffAssistBolsterPanel({
  length,
  placements,
  onPlacementsChange,
  loadedTemplate,
  onLoadTemplate,
  suggestedTemplateId = null,
  sessionFillingTemplateId,
  onItemsChange,
  onColorOverridesChange,
}: {
  /** Recommended bolster length (short | medium | long) — scopes the template picker. */
  length: string;
  /** Live session mix, edited on the x-ray — the thing a save publishes. */
  placements: BolsterPlacement[];
  onPlacementsChange: (next: BolsterPlacement[]) => void;
  loadedTemplate: LoadedTemplate | null;
  onLoadTemplate: (loaded: LoadedTemplate | null) => void;
  /** The engine's Filling Template for this length, marked in the picker. */
  suggestedTemplateId?: number | null;
  /** Kept only while the mix exactly matches the loaded template (snapshot claim). */
  sessionFillingTemplateId: number | null;
  /** Loaded filling items, surfaced for the x-ray renderer. */
  onItemsChange?: (items: FillingItem[]) => void;
  /** Product Builder color overrides, surfaced for the x-ray CSS vars. */
  onColorOverridesChange?: (overrides: ColorOverrideRow[]) => void;
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [items, setItems] = useState<FillingItem[]>([]);
  // Bumped after a save so the picker refetches and lists the saved template.
  const [catalogVersion, setCatalogVersion] = useState(0);

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
  }, [length, catalogVersion]);

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

  const tools: ToolSpec[] = [
    // Length is derived from the height recommendation, not a staff pick — it
    // shows as context because it scopes the template list below.
    {
      id: "length",
      label: "Length",
      icon: Ruler,
      readOnly: true,
      value: length,
      options: [{ value: length, label: length.charAt(0).toUpperCase() + length.slice(1) }],
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
      placeholder: templates.length === 0 ? "None for this length" : "Load template…",
    },
  ];

  const affordance = saveAffordance({ placements, loaded: loadedTemplate });
  const loadedName = loadedTemplate
    ? templates.find((t) => t.id === loadedTemplate.id)?.name ?? "this template"
    : null;

  return (
    <StaffToolbox
      tools={tools}
      action={
        affordance.dirty ? (
          <SaveFillingTemplate
            scope={{ length }}
            placements={bolsterPlacementsToRows(placements)}
            overwrite={
              affordance.canOverwrite && loadedTemplate && loadedName
                ? { id: loadedTemplate.id, name: loadedName }
                : null
            }
            onSaved={(templateId) => {
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
      {placements.length > 0 && (
        <div className="mt-1.5 rounded-2xl border border-border/60 bg-background/70 px-2 shadow-xl backdrop-blur-xl">
          <XrayPackList placements={placements} onPlacementsChange={onPlacementsChange} items={items} />
        </div>
      )}
    </StaffToolbox>
  );
}
