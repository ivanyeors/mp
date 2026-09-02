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

  // Fallback: use shared safe-area tokens from the root stylesheet.
  const rootStyles = window.getComputedStyle(document.documentElement);
  const topClearance = safeParsePx(rootStyles.getPropertyValue("--mobile-top-clearance"));
  if (topClearance > 0) return { top: topClearance, left };

  // Final fallback: respect any top padding applied to body (e.g. legacy PWA handling).
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
  // Mirrors `shouldRender` so the request subscription can read it without being
  // a dependency (it used to re-subscribe on every toggle of the bar).
  const shouldRenderRef = React.useRef(false);
  const offsetsFrameRef = React.useRef<number | null>(null);

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

  /** Measure now — used on the show transition, where position must land in the same commit. */
  const refreshOffsetsNow = React.useCallback(() => {
    if (offsetsFrameRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(offsetsFrameRef.current);
      offsetsFrameRef.current = null;
    }
    setOffsets(computeOffsets());
  }, []);

  /**
   * computeOffsets does two querySelector lookups plus getBoundingClientRect /
   * getComputedStyle reads, and its triggers arrive in bursts — mount, pathname,
   * resize and two ResizeObservers can all fire in the same frame. Coalesce them
   * onto one animation frame so the burst measures once.
   */
  const scheduleRefreshOffsets = React.useCallback(() => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setOffsets(computeOffsets());
      return;
    }
    if (offsetsFrameRef.current != null) return;
    offsetsFrameRef.current = window.requestAnimationFrame(() => {
      offsetsFrameRef.current = null;
      setOffsets(computeOffsets());
    });
  }, []);

  React.useEffect(() => {
    scheduleRefreshOffsets();
  }, [pathname, scheduleRefreshOffsets]);

  React.useEffect(
    () => () => {
      if (offsetsFrameRef.current != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(offsetsFrameRef.current);
        offsetsFrameRef.current = null;
      }
    },
    [],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    scheduleRefreshOffsets();

    const onResize = () => scheduleRefreshOffsets();
    window.addEventListener("resize", onResize, { passive: true });

    const observers: Array<ResizeObserver> = [];
    if (typeof ResizeObserver !== "undefined") {
      const gapEl = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement | null;
      const insetHeaderEl = document.querySelector('[data-slot="sidebar-inset"] > header') as HTMLElement | null;

      if (gapEl) {
        const ro = new ResizeObserver(() => scheduleRefreshOffsets());
        ro.observe(gapEl);
        observers.push(ro);
      }

      if (insetHeaderEl) {
        const ro = new ResizeObserver(() => scheduleRefreshOffsets());
        ro.observe(insetHeaderEl);
        observers.push(ro);
      }
    }

    return () => {
      window.removeEventListener("resize", onResize);
      for (const ro of observers) ro.disconnect();
    };
  }, [pathname, scheduleRefreshOffsets]);

  // Subscribe ONCE for the component's life. `shouldRender` lives in a ref here,
  // so toggling the bar no longer tears down and re-creates the subscription
  // (which also re-emitted the current count on every toggle).
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

        if (shouldRenderRef.current) return;
        if (showTimerRef.current != null) return;

        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          if (latestCountRef.current <= 0) return;

          shownAtRef.current = Date.now();
          shouldRenderRef.current = true;
          setShouldRender(true);
          refreshOffsetsNow();
        }, showDelayMs);

        return;
      }

      // count === 0: hide, but enforce min visible time and avoid flicker.
      if (showTimerRef.current != null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }

      if (!shouldRenderRef.current) return;

      const shownAt = shownAtRef.current ?? Date.now();
      const elapsed = Date.now() - shownAt;
      const remaining = Math.max(0, minVisibleMs - elapsed);

      if (hideTimerRef.current != null) return;
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        shownAtRef.current = null;
        shouldRenderRef.current = false;
        setShouldRender(false);
      }, remaining);
    });

    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [clearTimers, refreshOffsetsNow]);

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

