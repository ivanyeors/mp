"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Spacer padding pages add to their scroll content so it clears the fixed
 * MobileStickyActionBar (mobile only; desktop unchanged).
 */
export const mobileStickyActionBarSpacerClassName =
  "pb-[calc(var(--mobile-bottom-clearance)+env(safe-area-inset-bottom,0px))] md:pb-0";

/**
 * Mobile-only fixed bottom action bar. Extracted verbatim from the cart page's
 * sticky checkout bar so checkout / PDP reuse the same dock clearance + safe-area.
 */
export function MobileStickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div
        className={cn(
          "mx-auto max-w-7xl px-4 py-3 pb-[calc(var(--mobile-bottom-clearance)+env(safe-area-inset-bottom,0px))]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
