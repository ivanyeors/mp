"use client";

/**
 * Fit feedback shared by the three editing surfaces (X-ray pillow UX slice 04,
 * ADR 0019): the one confirm a save or a hold asks when a cell cannot close
 * even fully compressed. Advisory, never blocking — the same posture as the
 * Spatially authored warning. It reads the host's fit object; nothing is
 * recomputed.
 *
 * There is no banner above the x-ray any more (Ivan, 1-11-2026): a cell that
 * cannot close shows on the pillow itself — its pieces tinted red in the
 * x-ray and the cut, a red dot on its Section tab — and in this confirm.
 */

import { bolsterFitMessage, fitMessage, overCells, type BolsterFit, type PillowFit } from "@/lib/spatial-fillings/fit";

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
