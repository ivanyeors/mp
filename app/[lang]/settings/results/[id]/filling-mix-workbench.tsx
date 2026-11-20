"use client";

import type { ReactNode, RefCallback } from "react";

import { cn } from "@/lib/utils";

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
  measureRef: RefCallback<HTMLDivElement>;
  wide: boolean;
  notice?: ReactNode;
  picker?: ReactNode;
  xray: ReactNode;
  dock?: ReactNode;
  actions?: ReactNode;
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
      {!wide && actions}
    </div>
  );
}

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
