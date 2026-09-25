"use client";

/**
 * Fit feedback shared by the three editing surfaces (X-ray pillow UX slice 04,
 * ADR 0019): a banner listing the cells that cannot close even fully
 * compressed, and the one confirm a save or a hold asks when such a cell is
 * present. Advisory, never blocking — the same posture as the Spatially
 * authored warning. Both read the host's fit object; nothing is recomputed.
 */

import { bolsterFitMessage, fitMessage, overCells, type BolsterFit, type PillowFit } from "@/lib/spatial-fillings/fit";

export function FitBanner({ fit, className }: { fit: PillowFit; className?: string }) {
  const over = overCells(fit);
  if (over.length === 0) return null;
  return (
    <div
      role="alert"
      data-xray-fit-banner
      className={`rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm ${className ?? ""}`}
    >
      <div className="font-medium">
        {over.length === 1 ? "One cell cannot close" : `${over.length} cells cannot close`} at Size {fit.size}.
      </div>
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {over.map((c) => (
          <li key={`${c.section}/${c.subSection}`}>{fitMessage(c, fit.size)}</li>
        ))}
      </ul>
      <p className="mt-1 text-muted-foreground">
        Remove or swap a piece, or pick a larger Size. Saving is still allowed.
      </p>
    </div>
  );
}

/**
 * One confirm, never a block: true when the save may go ahead. `action` is the
 * verb on the button ("Hold", "Save", "Save assignment").
 */
export function confirmSaveWithOverCells(fit: PillowFit | null | undefined, action: string): boolean {
  if (!fit) return true;
  const over = overCells(fit);
  if (over.length === 0) return true;
  const heading = over.length === 1 ? "One cell cannot close" : `${over.length} cells cannot close`;
  return window.confirm(
    `${heading} at Size ${fit.size}:\n${over.map((c) => fitMessage(c, fit.size)).join("\n")}\n\n${action} anyway?`,
  );
}

/** The Mbolster's one confirm (slice 09): true when the save may go ahead; asks only when the pack cannot fit even fully squeezed. */
export function confirmSaveWithBolsterFit(fit: BolsterFit | null | undefined, action: string): boolean {
  if (!fit || fit.status !== "over") return true;
  return window.confirm(`The ${fit.length} Mbolster cannot fit this mix:\n${bolsterFitMessage(fit)}\n\n${action} anyway?`);
}
