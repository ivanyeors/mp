"use client";

import { bolsterFitMessage, fitMessage, overCells, type BolsterFit, type PillowFit } from "@/lib/spatial-fillings/fit";

export function confirmSaveWithOverCells(fit: PillowFit | null | undefined, action: string): boolean {
  if (!fit) return true;
  const over = overCells(fit);
  if (over.length === 0) return true;
  const heading = over.length === 1 ? "One cell cannot close" : `${over.length} cells cannot close`;
  return window.confirm(
    `${heading} at Size ${fit.size}:\n${over.map((c) => fitMessage(c, fit.size)).join("\n")}\n\n${action} anyway?`,
  );
}

export function confirmSaveWithBolsterFit(fit: BolsterFit | null | undefined, action: string): boolean {
  if (!fit || fit.status !== "over") return true;
  return window.confirm(`The ${fit.length} Mbolster cannot fit this mix:\n${bolsterFitMessage(fit)}\n\n${action} anyway?`);
}
