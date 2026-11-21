"use client";

import { useCallback, useMemo, useState } from "react";

import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { useElementWidth } from "@/hooks/use-element-width";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import { SECTIONS, type PillowPlacement, type Section } from "@/lib/spatial-fillings/core";
import type { Cut } from "@/lib/spatial-fillings/cross-section";
import type { ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import type { PillowFit } from "@/lib/spatial-fillings/fit";
import type { SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import { cn } from "@/lib/utils";
import { CrossSectionDisclosure, XrayCrossSection, type CutReadoutValue } from "./xray-cross-section";

const ROW_MIN_PX = 840;
const FULL_LAYOUT_MIN_PX = 560;

const TONE_CLASS: Record<CutReadoutValue["tone"], string> = {
  muted: "text-muted-foreground",
  drop: "text-sky-600 dark:text-sky-300",
  compressed: "text-amber-600 dark:text-amber-300",
  over: "text-amber-600 dark:text-amber-300",
};

const EMPTY_BY_SECTION = { left: null, center: null, right: null } as const;

export function XrayCrossSectionStrip({
  fit,
  active,
  onActiveChange,
  itemSubtypes,
  itemSizes,
  itemDims,
  placements,
  onPlacementsChange,
  items,
  colorOverrides = [],
  softBody,
  className,
}: {
  fit: PillowFit;
  active?: Section | null;
  onActiveChange?: (cut: Cut) => void;
  itemSubtypes: ReadonlyMap<number, string | null>;
  itemSizes?: ReadonlyMap<number, string | null>;
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  placements?: PillowPlacement[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  items?: FillingItem[];
  colorOverrides?: ColorOverrideRow[];
  softBody?: SoftBodySettings;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [measure, width] = useElementWidth<HTMLDivElement>();
  const row = !isMobile && width >= ROW_MIN_PX;
  const compact = row || width < FULL_LAYOUT_MIN_PX;
  const editable = Boolean(placements && onPlacementsChange && onActiveChange);

  const [readouts, setReadouts] = useState<Record<Section, CutReadoutValue | null>>(EMPTY_BY_SECTION);
  const [dropInto, setDropInto] = useState<Record<Section, Section | null>>(EMPTY_BY_SECTION);
  const reporters = useMemo(
    () =>
      Object.fromEntries(
        SECTIONS.map((section) => [
          section,
          {
            readout: (r: CutReadoutValue | null) =>
              setReadouts((prev) =>
                prev[section]?.text === r?.text && prev[section]?.tone === r?.tone ? prev : { ...prev, [section]: r },
              ),
            drop: (s: Section | null) => setDropInto((prev) => (prev[section] === s ? prev : { ...prev, [section]: s })),
          },
        ]),
      ) as Record<Section, { readout: (r: CutReadoutValue | null) => void; drop: (s: Section | null) => void }>,
    [],
  );
  const dropTarget = SECTIONS.map((s) => dropInto[s]).find(Boolean) ?? null;
  const readout = SECTIONS.map((s) => readouts[s]).find(Boolean) ?? null;
  const addHint = editable && items?.length ? (isMobile ? "Tap Front, Middle or Back to add a filling. " : "Click a column to add a filling. ") : "";
  const idleHint = editable
    ? isMobile
      ? `${addHint}Drag a filling and it lands where you let go; drop it on another cut to move it to that Section.`
      : `${addHint}Drag a filling within a cut and it lands where you let go, or onto another cut to move it to that Section. Keys: ← → front / back · Alt ← → nudge (+ Shift: 1 mm) · ↑ ↓ layer · Shift ← → Section.`
    : null;

  const titleFor = useCallback(
    (section: Section) => {
      const sf = fit.sections[section];
      return (
        <div className="flex items-center gap-1.5 px-1 text-xs font-medium capitalize text-[color:var(--xray-shell)]">
          {section}
          {sf.pieces.length > 0 && <span className="tabular-nums opacity-70">{sf.pieces.length}</span>}
          {sf.status !== "ok" && (
            <span
              className="inline-block size-1.5 rounded-full bg-amber-400"
              aria-label={sf.status === "over" ? "cannot close" : "compressed"}
              role="img"
            />
          )}
        </div>
      );
    },
    [fit],
  );

  const panels = (
    <div ref={measure} className={cn("grid gap-2", row ? "grid-cols-3 items-start" : "grid-cols-1")}>
      {SECTIONS.map((section) => (
        <div
          key={section}
          data-drop-section={section}
          data-xray-strip-panel={section}
          className={cn(
            "min-w-0 rounded-lg ring-offset-2 ring-offset-background transition-shadow",
            active === section && "ring-2 ring-primary/50",
            dropTarget === section && "ring-2 ring-sky-400",
          )}
        >
          <XrayCrossSection
            fit={fit}
            cut={{ section }}
            onCutChange={onActiveChange}
            tabs={false}
            title={titleFor(section)}
            compact={compact}
            collapsible={false}
            itemSubtypes={itemSubtypes}
            itemSizes={itemSizes}
            itemDims={itemDims}
            placements={placements}
            onPlacementsChange={onPlacementsChange}
            items={items}
            colorOverrides={colorOverrides}
            softBody={softBody}
            onReadout={reporters[section].readout}
            onDropSection={reporters[section].drop}
          />
        </div>
      ))}
    </div>
  );

  const line = readout ?? (idleHint ? { tone: "muted" as const, text: idleHint } : null);
  const body = (
    <div className="space-y-1.5">
      {panels}
      {line && (
        <p
          className={cn("min-h-8 px-1 text-[11px] leading-4", TONE_CLASS[line.tone])}
          aria-live="polite"
          data-xray-cut-readout
        >
          {line.text}
        </p>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <CrossSectionDisclosure label="Cross-sections" className={className}>
        {body}
      </CrossSectionDisclosure>
    );
  }
  return <div className={className}>{body}</div>;
}
