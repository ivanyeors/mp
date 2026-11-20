"use client";

import { Check, UserCheck } from "lucide-react";

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

/**
 * Shown once a shopper picks an add-on: every add-on is the pillow advisor's
 * call, made against the shopper's measurements before the build is made.
 * `chargedAfterReview` adds the money half only where it holds — a build paid
 * after Staff have reviewed it, never a finish link paid on the spot.
 */
export function AddonReviewNotice({ chargedAfterReview }: { chargedAfterReview: boolean }) {
  return (
    <div role="note" className="flex gap-2.5 rounded-lg bg-muted/50 p-3 text-sm">
      <UserCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="space-y-0.5">
        <p className="font-medium">Add-ons are reviewed by your pillow advisor</p>
        <p className="text-muted-foreground">
          Each one is checked against your measurements before your build is made, and
          your advisor has the final say.
          {chargedAfterReview ? " If one is left out, you are not charged for it." : null}
        </p>
      </div>
    </div>
  );
}
