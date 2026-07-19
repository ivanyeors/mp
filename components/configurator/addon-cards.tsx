"use client";

import { Check } from "lucide-react";

/** Add-on option as served by /api/results/addons (image from the Item's primary Media Asset). */
export type AddonOption = {
  item_id: number;
  name: string;
  msrp: number;
  currency: string;
  image_url?: string | null;
};

/**
 * Right-rail add-on option. Image card when the Item has a primary Media Asset,
 * otherwise the original text row. Selection state lives in the parent.
 */
export function AddonOptionButton({
  addon,
  selected,
  onToggle,
}: {
  addon: AddonOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 ${
        selected ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        {addon.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={addon.image_url}
            alt={addon.name}
            className="size-12 shrink-0 rounded-md border object-cover"
          />
        )}
        <span className="truncate text-sm font-medium">{addon.name}</span>
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
        {addon.currency} {addon.msrp.toFixed(2)}
        {selected && <Check className="ml-2 inline size-4 text-primary" />}
      </span>
    </button>
  );
}

/**
 * Selected add-on images under the product silhouette.
 * Stacked on mobile, horizontal row on desktop (lg matches the configurator grid).
 */
export function SelectedAddonPreviews({
  addons,
  selectedIds,
}: {
  addons: AddonOption[];
  selectedIds: Set<number>;
}) {
  const selected = addons.filter((a) => selectedIds.has(a.item_id) && a.image_url);
  if (selected.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-center">
      {selected.map((a) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={a.item_id}
          src={a.image_url!}
          alt={a.name}
          title={a.name}
          className="size-14 rounded-lg border border-white/40 bg-white object-cover shadow-sm"
        />
      ))}
    </div>
  );
}
