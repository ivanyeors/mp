"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { pinToScreenBottom, screenBottomPinClassName } from "@/hooks/use-screen-bottom-pin";
import { publishMobileBottomBarHeight } from "@/lib/mobile-bottom-bar-height";
import { cn } from "@/lib/utils";

/**
 * Spacer padding pages add to their scroll content so it clears the fixed
 * MobileStickyActionBar (mobile only; desktop unchanged).
 *
 * The bar publishes its rendered height as `--mobile-sticky-action-bar-height`
 * while mounted, so the spacer is exactly as tall as the bar. When no bar is
 * mounted the spacer falls back to the dock clearance alone.
 */
export const mobileStickyActionBarSpacerClassName =
  "pb-[var(--mobile-sticky-action-bar-height,var(--mobile-bottom-clearance))] md:pb-0";

const HEIGHT_VAR = "--mobile-sticky-action-bar-height";

// Bars can briefly overlap during a route transition; only the last one to
// unmount clears the shared token.
let mountedBars = 0;

/**
 * Mobile-only fixed bottom action bar. Extracted verbatim from the cart page's
 * sticky checkout bar so checkout / PDP reuse the same dock clearance + safe-area.
 *
 * `--mobile-bottom-clearance` already includes `--safe-bottom`, so the bar's
 * bottom padding must not add the safe-area inset a second time.
 */
export function MobileStickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  // On iOS, keep it on the screen's bottom edge once a keyboard has been and gone;
  // and keep the analytics notice and chat bubble above it, not over its buttons.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const unpin = pinToScreenBottom(el);
    const unpublish = publishMobileBottomBarHeight(el);
    return () => {
      unpin();
      unpublish();
    };
  }, []);

  // Layout effect: publish before first paint so the spacer never lags the bar.
  useLayoutEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    mountedBars += 1;
    const publish = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) root.style.setProperty(HEIGHT_VAR, `${Math.round(height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      mountedBars -= 1;
      if (mountedBars === 0) root.style.removeProperty(HEIGHT_VAR);
    };
  }, []);

  return (
    <div
      ref={barRef}
      className={cn(
        "fixed inset-x-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden",
        screenBottomPinClassName,
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-7xl px-4 py-3 pb-[var(--mobile-bottom-clearance)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
