"use client";

/**
 * All three cuts at once — left, center and right side by side — where a host
 * has the room (the Result detail page). Three `XrayCrossSection`s, each
 * pinned to one Section with its tabs off: every behaviour (the drawing, the
 * drag, the keys, the fit) stays in that one component, so this is a layout,
 * never a second cross-section.
 *
 * Each cut still edits. A tap on a column adds a filling there. A pouch dragged within a panel lands where it is let
 * go; dragged onto a sibling panel it moves to that Section, at home in the
 * same column — the drop a Section tab takes on the single cut. One readout
 * line serves all three, so the panels never jump as the pointer moves.
 *
 * Wide (three fit at a readable size): one row. Narrower: stacked, at the full
 * layout while there is room for it. Phones: stacked under one "Cross-sections"
 * disclosure, closed by default, as the single cut is; a read-only host whose
 * cuts are the point (the Customer's pillow) opens it with `defaultOpen`.
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useElementWidth } from "@/hooks/use-element-width";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import { SECTIONS, type PillowPlacement, type Section } from "@/lib/spatial-fillings/core";
import type { Cut } from "@/lib/spatial-fillings/cross-section";
import type { ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import type { PillowFit } from "@/lib/spatial-fillings/fit";
import type { SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import { cn } from "@/lib/utils";
import { XrayCrossSection, type CutReadoutValue } from "./xray-cross-section";

/** Three cuts in a row from here (px of the strip): each at ~280 px, where the compact layout's type stays readable. */
const ROW_MIN_PX = 840;
/** Stacked below this, a cut draws the compact layout (larger type in a narrow view). */
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
  defaultOpen = false,
  className,
}: {
  fit: PillowFit;
  /** The Section the host is working in (the x-ray's dive): its panel is ringed. */
  active?: Section | null;
  /** The host's cut setter. A move into another Section hands it that Section, so the ring follows the pouch. */
  onActiveChange?: (cut: Cut) => void;
  itemSubtypes: ReadonlyMap<number, string | null>;
  itemSizes?: ReadonlyMap<number, string | null>;
  itemDims?: ReadonlyMap<number, ResolvedDims>;
  /** With `onPlacementsChange` and `onActiveChange`, every cut is an editor; without, all three are read-only. */
  placements?: PillowPlacement[];
  onPlacementsChange?: (next: PillowPlacement[]) => void;
  items?: FillingItem[];
  colorOverrides?: ColorOverrideRow[];
  softBody?: SoftBodySettings;
  /** Phones: start with the "Cross-sections" disclosure open. */
  defaultOpen?: boolean;
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
  // A tap on a column adds a filling there (each cut's own menu), once there are Items to pick from.
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
          // A sibling panel is a drop target, as a Section tab is on the single cut.
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
      <Collapsible className={className} defaultOpen={defaultOpen} data-xray-cross-section-disclosure>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-background/90 px-3 py-2 text-sm font-medium [&[data-state=open]>svg]:rotate-180">
          Cross-sections
          <ChevronDown className="size-4 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">{body}</CollapsibleContent>
      </Collapsible>
    );
  }
  return <div className={className}>{body}</div>;
}
