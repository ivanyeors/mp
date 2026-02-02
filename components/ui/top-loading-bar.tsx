"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { subscribeActiveApiRequests } from "@/lib/request-progress";

type Offsets = {
  top: number;
  left: number;
};

function safeParsePx(value: string | null | undefined): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

function computeOffsets(): Offsets {
  if (typeof window === "undefined") return { top: 0, left: 0 };

  // Align with sidebar layouts (desktop): the gap element reserves the sidebar width.
  const gapEl = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement | null;
  const left = gapEl ? gapEl.getBoundingClientRect().width : 0;

  // Align just under the settings/header area when present (matches your `top=56px` measurement).
  const insetHeaderEl = document.querySelector('[data-slot="sidebar-inset"] > header') as HTMLElement | null;
  if (insetHeaderEl) {
    const rect = insetHeaderEl.getBoundingClientRect();
    return { top: rect.bottom, left };
  }

  // Fallback: respect any top padding applied to body (e.g. PWA safe-area handling).
  const bodyTopPad = safeParsePx(window.getComputedStyle(document.body).paddingTop);
  return { top: bodyTopPad, left };
}

export function TopLoadingBar() {
  const pathname = usePathname();

  const [offsets, setOffsets] = React.useState<Offsets>({ top: 0, left: 0 });
  const [shouldRender, setShouldRender] = React.useState(false);

  const showDelayMs = 150;
  const minVisibleMs = 250;

  const showTimerRef = React.useRef<number | null>(null);
  const hideTimerRef = React.useRef<number | null>(null);
  const shownAtRef = React.useRef<number | null>(null);
  const latestCountRef = React.useRef(0);

  const clearTimers = React.useCallback(() => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const refreshOffsets = React.useCallback(() => {
    setOffsets(computeOffsets());
  }, []);

  React.useEffect(() => {
    refreshOffsets();
  }, [pathname, refreshOffsets]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    refreshOffsets();

    const onResize = () => refreshOffsets();
    window.addEventListener("resize", onResize, { passive: true });

    const observers: Array<ResizeObserver> = [];
    if (typeof ResizeObserver !== "undefined") {
      const gapEl = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement | null;
      const insetHeaderEl = document.querySelector('[data-slot="sidebar-inset"] > header') as HTMLElement | null;

      if (gapEl) {
        const ro = new ResizeObserver(() => refreshOffsets());
        ro.observe(gapEl);
        observers.push(ro);
      }

      if (insetHeaderEl) {
        const ro = new ResizeObserver(() => refreshOffsets());
        ro.observe(insetHeaderEl);
        observers.push(ro);
      }
    }

    return () => {
      window.removeEventListener("resize", onResize);
      for (const ro of observers) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const unsubscribe = subscribeActiveApiRequests((count) => {
      latestCountRef.current = count;

      if (count > 0) {
        // Cancel any pending hide; schedule show with a small delay.
        if (hideTimerRef.current != null) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }

        if (shouldRender) return;
        if (showTimerRef.current != null) return;

        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          if (latestCountRef.current <= 0) return;

          shownAtRef.current = Date.now();
          setShouldRender(true);
          refreshOffsets();
        }, showDelayMs);

        return;
      }

      // count === 0: hide, but enforce min visible time and avoid flicker.
      if (showTimerRef.current != null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }

      if (!shouldRender) return;

      const shownAt = shownAtRef.current ?? Date.now();
      const elapsed = Date.now() - shownAt;
      const remaining = Math.max(0, minVisibleMs - elapsed);

      if (hideTimerRef.current != null) return;
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        shownAtRef.current = null;
        setShouldRender(false);
      }, remaining);
    });

    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [clearTimers, refreshOffsets, shouldRender]);

  if (!shouldRender) return null;

  return (
    <div
      aria-hidden="true"
      className="mp-top-loading-container"
      style={{
        position: "fixed",
        top: offsets.top,
        left: offsets.left,
        right: 0,
        zIndex: 60,
      }}
    >
      <div className="mp-top-loading-bar" />
    </div>
  );
}

