"use client";

/**
 * The Section editor column (CONTEXT.md: X-ray editor): where a host docks the
 * dived Section's controls off the pillow art. XrayPillow portals them into the
 * slot this renders (`controlsSlot`); the pillow then keeps only its hover hint.
 *
 * One component for Configure → Filling Template and the configurator's Staff
 * assist stage, so Staff find the controls in the same place on both. The host
 * owns placement (sticky column, panel under the x-ray) through `className`.
 */

import { cn } from "@/lib/utils";

export function XraySectionDock({
  dived,
  onSlot,
  className,
}: {
  /** The dived Section, as the x-ray reports it through `onDiveChange`. */
  dived: string | null;
  /** Ref callback for the slot element, handed to XrayEditor / XrayPillow as `controlsSlot`. */
  onSlot: (el: HTMLElement | null) => void;
  className?: string;
}) {
  return (
    <aside className={cn("flex-col rounded-xl border", className)} data-xray-section-dock>
      {/* Dived, the controls bring their own header (the Section's name, Mirror and Done), so the dock's own
          title would only say the Section's name a second time. */}
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
