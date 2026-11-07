"use client";

/**
 * Linked views (7-11-2026): the top-down x-ray and the cross-section of one
 * recipe move together. While a pouch is in hand in either view, that view
 * publishes a draft — the Placements a release there would commit, and their
 * fit — and both draw it, so the top view follows a drag on the cut and the
 * cut follows a drag on the top view, frame by frame. Nothing is written
 * until the release, which commits through the host as before.
 *
 * The link is the recipe itself: every host hands both views the same lifted
 * Placements array, so a draft is keyed by that array. A commit hands both a
 * new array, which has no draft. Nothing to wire on a host, and two recipes
 * on one page never cross.
 */

import { useCallback, useSyncExternalStore } from "react";

import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import type { PillowFit } from "@/lib/spatial-fillings/fit";

/** Which view holds the pouch: the other one follows. */
export type XrayView = "top" | "cut";

export type XrayDraft = {
  /** What a release would commit. */
  placements: PillowPlacement[];
  /** Their fit, computed once by the view that holds the pouch. */
  fit: PillowFit;
  /** The pouch in hand, by its key in `placements`. */
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

/** Show `draft` in every view of the recipe `placements` (null: the committed recipe again). */
export function publishXrayDraft(placements: readonly PillowPlacement[] | undefined, draft: XrayDraft | null): void {
  if (!placements) return;
  const link = linkOf(placements);
  if (link.draft === draft) return;
  link.draft = draft;
  for (const listener of link.listeners) listener();
}

/** Clear the draft `from` published, leaving one the other view holds. */
export function clearXrayDraft(placements: readonly PillowPlacement[] | undefined, from: XrayView): void {
  if (!placements) return;
  if (links.get(placements)?.draft?.from === from) publishXrayDraft(placements, null);
}

const noSubscribe = () => () => {};

/** The draft either view holds for the recipe `placements`, or null. */
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

/** A cheap identity for a set of Placements, so a pointer move that lands the same pouch in the same place publishes nothing new. */
export function placementsSignature(placements: readonly PillowPlacement[]): string {
  return placements
    .map((p) => `${p.section}/${p.subSection}/${p.slot}:${p.itemId}:${p.row ?? ""}:${p.offsetXMm ?? 0}:${p.offsetYMm ?? 0}`)
    .join("|");
}
