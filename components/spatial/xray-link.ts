"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import type { PillowFit } from "@/lib/spatial-fillings/fit";

export type XrayView = "top" | "cut";

export type XrayDraft = {
  placements: PillowPlacement[];
  fit: PillowFit;
  key: string;
  from: XrayView;
};

type Link = { draft: XrayDraft | null; listeners: Set<() => void> };

const links = new WeakMap<readonly PillowPlacement[], Link>();

function linkOf(placements: readonly PillowPlacement[]): Link {
  let link = links.get(placements);
  if (!link) {
    link = { draft: null, listeners: new Set() };
    links.set(placements, link);
  }
  return link;
}

export function publishXrayDraft(placements: readonly PillowPlacement[] | undefined, draft: XrayDraft | null): void {
  if (!placements) return;
  const link = linkOf(placements);
  if (link.draft === draft) return;
  link.draft = draft;
  for (const listener of link.listeners) listener();
}

export function clearXrayDraft(placements: readonly PillowPlacement[] | undefined, from: XrayView): void {
  if (!placements) return;
  if (links.get(placements)?.draft?.from === from) publishXrayDraft(placements, null);
}

const noSubscribe = () => () => {};

export function useXrayDraft(placements: readonly PillowPlacement[] | undefined): XrayDraft | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!placements) return () => {};
      const link = linkOf(placements);
      link.listeners.add(onChange);
      return () => {
        link.listeners.delete(onChange);
      };
    },
    [placements],
  );
  const read = useCallback(() => (placements ? (links.get(placements)?.draft ?? null) : null), [placements]);
  return useSyncExternalStore(placements ? subscribe : noSubscribe, read, () => null);
}

export function placementsSignature(placements: readonly PillowPlacement[]): string {
  return placements
    .map((p) => `${p.section}/${p.subSection}/${p.slot}:${p.itemId}:${p.row ?? ""}:${p.offsetXMm ?? 0}:${p.offsetYMm ?? 0}`)
    .join("|");
}
