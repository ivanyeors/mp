"use client";

import { cn } from "@/lib/utils";

export function XraySectionDock({
  dived,
  onSlot,
  className,
}: {
  dived: string | null;
  onSlot: (el: HTMLElement | null) => void;
  className?: string;
}) {
  return (
    <aside className={cn("flex-col rounded-xl border", className)} data-xray-section-dock>
      {!dived && (
        <>
          <div className="border-b p-3 text-sm font-medium">Section editor</div>
          <p className="p-3 text-sm text-muted-foreground">Click a section on the x-ray to edit its fillings.</p>
        </>
      )}
      <div ref={onSlot} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" />
    </aside>
  );
}
