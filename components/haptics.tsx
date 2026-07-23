"use client";

import { useEffect } from "react";

// Interactive elements that should buzz on tap. `[data-haptic]` opts in a
// non-standard element; `[data-no-haptic]` on the element (or an ancestor)
// opts out.
const HAPTIC_SELECTOR = 'button:not([disabled]),a[href],[role="button"],[data-haptic]';

export function shouldVibrate(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target.closest(HAPTIC_SELECTOR) : null;
  return !!el && !el.closest("[data-no-haptic]");
}

/**
 * Global tap haptics via one delegated listener — covers every button/link/toggle
 * without per-component edits.
 *
 * navigator.vibrate is Android/Chrome only; iOS Safari has no Vibration API even
 * in a standalone home-screen PWA, so this is a deliberate silent no-op there.
 */
export function Haptics() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return; // no buzz on mouse / hybrid devices
      if (shouldVibrate(e.target)) navigator.vibrate?.(8);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
