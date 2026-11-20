"use client";

import { useId, useMemo } from "react";
import { Feedback, PointerSensor } from "@dnd-kit/dom";
import { useDraggable } from "@dnd-kit/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useBlockEditor, type PaletteDrag } from "./block-editor";
import type { BlockCatalogue, EditorBlock, PaletteItem, PaletteItemsTab, PaletteTab } from "./types";

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
  const adds = useMemo(() => item.blocks().length, [item]);
  const why = item.disabledReason ?? ctx.noRoom(adds);
  const uid = useId();
  const { ref, isDragging } = useDraggable({
    id: `palette:${uid}:${tab}:${item.id}`,
    data: { palette: item } satisfies PaletteDrag,
    sensors: [PointerSensor],
    plugins: [Feedback.configure({ feedback: "clone" })],
    disabled: !draggable || Boolean(why),
  });
  const Icon = item.icon;
  const press = () => {
    if (why) return;
    ctx.add(item.blocks(), item);
    onAdded?.();
  };
  const words = (
    <>
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <span className="min-w-0">
        <span className="block font-medium">{item.label}</span>
        {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
      </span>
    </>
  );
  if (item.preview) {
    return (
      <li
        className={cn(
          "relative rounded-md border bg-background shadow-xs transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
          why && "opacity-50",
          isDragging && "opacity-60",
        )}
      >
        <div aria-hidden className="pointer-events-none p-1.5 pb-0">
          {item.preview}
        </div>
        <button
          ref={ref}
          type="button"
          aria-disabled={why ? true : undefined}
          title={why ?? undefined}
          onClick={press}
          className={cn(
            "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none before:absolute before:inset-0 before:rounded-md aria-disabled:cursor-not-allowed max-md:min-h-11",
            draggable && !why && "cursor-grab active:cursor-grabbing",
          )}
        >
          {words}
        </button>
      </li>
    );
  }
  return (
    <li>
      <button
        ref={ref}
        type="button"
        aria-disabled={why ? true : undefined}
        title={why ?? undefined}
        onClick={press}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-md border bg-background px-2.5 py-2 text-left text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 max-md:min-h-11",
          draggable && !why && "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-60",
        )}
      >
        {words}
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
  draggable?: boolean;
  onAdded?: () => void;
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
