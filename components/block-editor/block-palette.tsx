"use client";

import { useId, useMemo } from "react";
import { PointerSensor } from "@dnd-kit/dom";
import { useDraggable } from "@dnd-kit/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useBlockEditor, type PaletteDrag } from "./block-editor";
import type { BlockCatalogue, EditorBlock, PaletteItem, PaletteItemsTab, PaletteTab } from "./types";

/**
 * The palette beside the column (PRD-campaign-email-editor slice 04): tabs
 * the page supplies (Blocks here; Starters in slice 08; Variables, a
 * `VariablePalette`, in slice 13), each item dragged into the column, or
 * added after the selected block with a click or Enter. Inside a
 * `BlockEditorRoot`.
 */

/** Pure — the Blocks tab: one item per block type in the catalogue, in its order. */
export function blockPaletteTab<B extends EditorBlock>(catalogue: BlockCatalogue<B>, label = "Blocks"): PaletteItemsTab<B> {
  const kinds = catalogue as unknown as Record<string, BlockCatalogue<B>[B["type"]]>;
  return {
    value: "blocks",
    label,
    items: Object.entries(kinds).map(([type, kind]) => ({
      id: type,
      label: kind.label,
      description: kind.description,
      icon: kind.icon,
      blocks: () => [kind.create() as B],
    })),
  };
}

function Item({ item, tab, draggable, onAdded }: { item: PaletteItem<EditorBlock>; tab: string; draggable: boolean; onAdded?: () => void }) {
  const ctx = useBlockEditor();
  // How many it adds: a Starter that doesn't fit is turned off, not put in half.
  const adds = useMemo(() => item.blocks().length, [item]);
  const why = item.disabledReason ?? ctx.noRoom(adds);
  // Unique to this palette: the phone's Add sheet holds a second one beside the laptop's, and dnd-kit keeps one draggable per id.
  const uid = useId();
  const { ref, isDragging } = useDraggable({
    id: `palette:${uid}:${tab}:${item.id}`,
    data: { palette: item } satisfies PaletteDrag,
    // Enter and Space add the item, so only a pointer drags it.
    sensors: [PointerSensor],
    feedback: "clone",
    disabled: !draggable || Boolean(why),
  });
  const Icon = item.icon;
  return (
    <li>
      <button
        ref={ref}
        type="button"
        aria-disabled={why ? true : undefined}
        title={why ?? undefined}
        onClick={() => {
          if (why) return;
          ctx.add(item.blocks());
          onAdded?.();
        }}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-md border bg-background px-2.5 py-2 text-left text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 max-md:min-h-11",
          draggable && !why && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-60",
        )}
      >
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0">
          <span className="block font-medium">{item.label}</span>
          {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
        </span>
      </button>
    </li>
  );
}

export function BlockPalette<B extends EditorBlock>({
  tabs,
  draggable = true,
  onAdded,
  tab,
  onTab,
  className,
}: {
  tabs: PaletteTab<B>[];
  /** Off in the phone's *Add* sheet, where a tap adds. */
  draggable?: boolean;
  /** After a click adds an item: the sheet closes. */
  onAdded?: () => void;
  /** The tab open, when the page chooses it (a Save error under Variables opens that tab); else the first. */
  tab?: string;
  onTab?: (value: string) => void;
  className?: string;
}) {
  const list = (tab: PaletteTab<B>) =>
    "items" in tab ? (
      tab.items.length ? (
        <ul className="space-y-1.5" aria-label={tab.label}>
          {tab.items.map((item) => (
            <Item key={item.id} item={item as unknown as PaletteItem<EditorBlock>} tab={tab.value} draggable={draggable} onAdded={onAdded} />
          ))}
        </ul>
      ) : (
        <div className="text-sm text-muted-foreground">{tab.empty}</div>
      )
    ) : (
      tab.content
    );
  if (tabs.length === 1) {
    return (
      <div className={className}>
        <p className="mb-2 text-sm font-medium">{tabs[0].label}</p>
        {list(tabs[0])}
      </div>
    );
  }
  const chosen = tab !== undefined ? { value: tab, onValueChange: onTab } : { defaultValue: tabs[0]?.value };
  return (
    <Tabs {...chosen} className={className}>
      <TabsList className="w-full">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {list(t)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
