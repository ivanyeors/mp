"use client";

import type { ReactNode, RefCallback } from "react";

import { cn } from "@/lib/utils";

/**
 * The Filling mix layout on the Result detail page, in the Configure
 * workbench's terms: the x-ray with a slim rail beside it (the template, the
 * Section editor the dive docks into, the save), the three cuts in one row
 * under both, then the pack list and the insert order side by side.
 *
 * The rail is kept short on purpose, so the x-ray and the rail end level and
 * the cuts follow without a gap. Layout only: every editor is mounted by the
 * page and passed in, so the surface-parity check still finds them there.
 *
 * `wide` follows the space the card is given, not the viewport, because the
 * page can sit beside an open or a collapsed sidebar; the page measures it
 * (it also decides whether the dive docks into the rail) and hands it here.
 */
export function FillingMixWorkbench({
  measureRef,
  wide,
  notice,
  picker,
  xray,
  dock,
  actions,
  cuts,
  packList,
  insertOrder,
}: {
  /** The page's width measure, on the element whose width decides `wide`. */
  measureRef: RefCallback<HTMLDivElement>;
  wide: boolean;
  /** A line above everything: what this mix is and what saving it does. */
  notice?: ReactNode;
  /** The template select and the engine's pick. */
  picker?: ReactNode;
  /** The top view: the pillow x-ray, or the Mbolster's compartment list. */
  xray: ReactNode;
  /** The Section editor slot (wide only — narrow, the dive opens over the x-ray). */
  dock?: ReactNode;
  /** Save assignment / Save mix, or Edit configuration on a read-only build. */
  actions?: ReactNode;
  /** The cross-sections: all three pillow cuts, or the Mbolster's end-on cut. */
  cuts?: ReactNode;
  packList: ReactNode;
  insertOrder?: ReactNode;
}) {
  const rail = (picker || dock || actions) && (
    <div className="space-y-3">
      {picker}
      {dock}
      {actions}
    </div>
  );

  return (
    <div ref={measureRef} className="w-full max-w-[72rem] space-y-3">
      {notice}
      {wide ? (
        <div className={cn("grid items-start gap-4", rail ? "grid-cols-[minmax(0,1fr)_22rem]" : "grid-cols-1")}>
          <div className="min-w-0">{xray}</div>
          {rail}
        </div>
      ) : (
        <>
          {picker}
          {xray}
        </>
      )}
      {cuts}
      <div className={cn("grid items-start gap-3", wide && insertOrder ? "grid-cols-2" : "grid-cols-1")}>
        {packList}
        {insertOrder}
      </div>
      {/* Narrow: the save comes last, after everything it saves. */}
      {!wide && actions}
    </div>
  );
}

/** A titled tile for the lists under the cuts, matching the page's value tiles. */
export function WorkbenchTile({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/30 p-3 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{title}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}
