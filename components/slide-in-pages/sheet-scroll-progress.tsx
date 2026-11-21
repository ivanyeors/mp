"use client";

import * as React from "react";

import { Progress } from "@/components/ui/progress";

function percentScrolled(viewport: HTMLElement) {
  const max = viewport.scrollHeight - viewport.clientHeight;
  const pct = max > 0 ? (viewport.scrollTop / max) * 100 : 0;
  return Math.max(0, Math.min(100, pct));
}

const notScrolled = () => 0;

export function SheetScrollProgress({ viewport, className }: { viewport: HTMLElement | null; className?: string }) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (!viewport) return () => {};
      let raf = 0;
      const onScroll = () => {
        if (raf) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          onChange();
        });
      };
      viewport.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onChange);
      return () => {
        if (raf) window.cancelAnimationFrame(raf);
        viewport.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onChange);
      };
    },
    [viewport],
  );
  const progress = React.useSyncExternalStore(
    subscribe,
    () => (viewport ? percentScrolled(viewport) : 0),
    notScrolled,
  );
  return <Progress value={progress} className={className} />;
}
