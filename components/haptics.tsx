"use client";

import { useEffect } from "react";

const HAPTIC_SELECTOR = 'button:not([disabled]),a[href],[role="button"],[data-haptic]';

export function shouldVibrate(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target.closest(HAPTIC_SELECTOR) : null;
  return !!el && !el.closest("[data-no-haptic]");
}

export function Haptics() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (shouldVibrate(e.target)) navigator.vibrate?.(8);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
