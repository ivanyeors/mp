"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatTemplateKeys,
  templateKeyLabel,
  templateKeysForKind,
  type FillingKind,
} from "@/lib/filling-templates/keys";

/**
 * Which sizes a Filling Template serves.
 *
 * A recipe is not size-specific — the 3×3 grid, the pack list and the
 * fingerprint are all identical whatever the pillow measures — so the same mix
 * often belongs to several sizes. These are the three surfaces that make that
 * shared scope visible: a chip strip on a list row, an editable set in the
 * editor, and the warning that a save reaches sizes the operator is not looking
 * at.
 */

/** Read-only scope strip for a list row. Sizes not served are dimmed, not hidden,
 * so a row reads as a position on the full size range rather than a bare list. */
export function TemplateScopeChips({
  kind,
  keys,
  currentKey,
  className,
}: {
  kind: FillingKind;
  keys: string[];
  currentKey: string;
  className?: string;
}) {
  const all = templateKeysForKind(kind);
  const noun = kind === "bolster" ? "lengths" : "sizes";
  // Dim-vs-filled is a convention nobody is told, so the strip carries the same
  // fact in words for a screen reader and on hover.
  const label = `Applies to ${noun} ${formatTemplateKeys(kind, keys)}`;
  return (
    <span
      className={cn("flex flex-wrap items-center gap-1", className)}
      title={label}
      aria-label={label}
      role="img"
    >
      {all.map((key) => {
        const served = keys.includes(key);
        return (
          <span
            key={key}
            aria-hidden="true"
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium leading-none",
              served
                ? "bg-muted-foreground/15 text-foreground"
                : "text-muted-foreground/40",
              served && key === currentKey && "ring-1 ring-foreground/30",
            )}
          >
            {templateKeyLabel(kind, key)}
          </span>
        );
      })}
    </span>
  );
}

/** Editable scope. At least one size must stay on — a template serving none
 * would vanish from every list with no way back. */
export function TemplateScopeField({
  kind,
  keys,
  currentKey,
  disabled,
  onChange,
}: {
  kind: FillingKind;
  keys: string[];
  currentKey: string;
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const all = templateKeysForKind(kind);
  const noun = kind === "bolster" ? "lengths" : "sizes";
  const toggle = (key: string) => {
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    if (!next.length) return;
    onChange(all.filter((k) => next.includes(k)));
  };
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-muted-foreground lg:text-foreground">
        Applies to {noun}
      </div>
      <div className="flex flex-wrap gap-2">
        {all.map((key) => {
          const on = keys.includes(key);
          const last = on && keys.length === 1;
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              disabled={disabled || last}
              aria-pressed={on}
              title={
                last
                  ? `A Filling Template must apply to at least one ${kind === "bolster" ? "length" : "size"}`
                  : undefined
              }
              onClick={() => toggle(key)}
              className={cn("min-w-14", key === currentKey && !on && "border-dashed")}
            >
              {templateKeyLabel(kind, key)}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {keys.includes(currentKey)
          ? `One recipe, shared by every ${kind === "bolster" ? "length" : "size"} switched on.`
          : `Saving removes this template from ${templateKeyLabel(kind, currentKey)} — it will leave this list.`}
      </p>
    </div>
  );
}

/** The cost of sharing: a save here rewrites the recipe everywhere it is used.
 * The fork CTA is what keeps that safe — one size can always stop tracking. */
export function SharedTemplateNotice({
  kind,
  keys,
  currentKey,
  onFork,
  forking,
}: {
  kind: FillingKind;
  keys: string[];
  currentKey: string;
  onFork: () => void;
  forking?: boolean;
}) {
  const others = keys.filter((k) => k !== currentKey);
  if (!others.length) return null;
  const noun = kind === "bolster" ? "length" : "size";
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <div className="font-medium">
        Shared with {noun === "size" ? "sizes" : "lengths"} {formatTemplateKeys(kind, others)}.
      </div>
      <p className="mt-1 text-muted-foreground">
        Saving rewrites the recipe for all {keys.length} — including builds assigned from them
        later. Past Results keep the mix they were built with.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={forking}
        onClick={onFork}
      >
        {forking ? "Copying…" : `Make a separate copy for ${templateKeyLabel(kind, currentKey)}`}
      </Button>
    </div>
  );
}
