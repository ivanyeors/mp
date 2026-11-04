"use client";

import { useCallback, type RefCallback } from "react";

/**
 * Keeping fixed bottom bars on the bottom of the screen on iOS.
 *
 * iOS lays out `position: fixed` against the layout viewport, and slides that
 * viewport along only as far as it must to keep the visual viewport (what the
 * keyboard leaves visible) inside it. With the keyboard up, the visual viewport
 * is a keyboard shorter, so a `bottom: 0` bar first scrolls with the page, then
 * pins a keyboard's height above the bottom of the screen.
 *
 * Since iOS 26 (WebKit bug 297779; seen again in the iOS 27 beta) it stays that
 * way after the keyboard has gone down: `visualViewport.offsetTop` no longer
 * returns to 0 and `visualViewport.height` stays keyboard-short. The bar then
 * floats in the middle of an empty screen as the page scrolls.
 *
 * `visualViewport.offsetTop` is exactly how far the screen's top sits below the
 * layout viewport's, so moving a bar down by it puts the bar back on the
 * screen's bottom edge — under a keyboard that is really up, where a bottom bar
 * belongs while typing. Everywhere else it is 0 and nothing moves.
 */

/** Custom property a pinned element's `bottom` subtracts. Set on that element only. */
export const SCREEN_PIN_OFFSET_VAR = "--screen-pin-offset";

/** `bottom: 0`, kept on the screen's bottom edge by useScreenBottomPin. */
export const screenBottomPinClassName = "bottom-[calc(var(--screen-pin-offset,0px)*-1)]";

/** How far, in CSS px, a fixed bottom bar must move down to sit on the screen's bottom edge. */
export function screenPinOffset(
  viewport: Pick<VisualViewport, "offsetTop" | "scale"> | null | undefined,
): number {
  if (!viewport) return 0;
  // Pinch-zoomed in: the page is larger than the screen, and the bar belongs to the page.
  if (Math.abs(viewport.scale - 1) > 0.01) return 0;
  return Math.max(0, Math.round(viewport.offsetTop));
}

// Input types iOS shows no keyboard (or picker) for.
const NO_KEYBOARD_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * Whether the focused element is one the on-screen keyboard (or a picker) is up
 * for. With nothing like that focused, a keyboard-short visual viewport is the
 * iOS bug above, not a keyboard.
 */
export function opensKeyboard(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    return !NO_KEYBOARD_INPUT_TYPES.has(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Keeps a `position: fixed` bottom bar on the screen's bottom edge on iOS (see
 * above). Publishes the offset as `--screen-pin-offset` on the element; give the
 * element `screenBottomPinClassName` (or subtract the variable from its own
 * `bottom`) to use it. Returns the cleanup.
 */
export function pinToScreenBottom(el: HTMLElement): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  let applied = 0;
  const apply = () => {
    const next = screenPinOffset(viewport);
    if (next === applied) return;
    applied = next;
    if (next > 0) el.style.setProperty(SCREEN_PIN_OFFSET_VAR, `${next}px`);
    else el.style.removeProperty(SCREEN_PIN_OFFSET_VAR);
  };
  apply();
  viewport.addEventListener("resize", apply);
  viewport.addEventListener("scroll", apply);
  // WebKit does not always report the visual viewport moving inside the layout
  // viewport as a visualViewport scroll; the page's own scroll catches it.
  window.addEventListener("scroll", apply, { passive: true });
  return () => {
    viewport.removeEventListener("resize", apply);
    viewport.removeEventListener("scroll", apply);
    window.removeEventListener("scroll", apply);
    el.style.removeProperty(SCREEN_PIN_OFFSET_VAR);
  };
}

/**
 * pinToScreenBottom as a ref: `<div ref={useScreenBottomPin()} className={…screenBottomPinClassName}>`.
 * A callback ref, so a bar that renders only some of the time is pinned whenever it is there.
 */
export function useScreenBottomPin<T extends HTMLElement = HTMLDivElement>(): RefCallback<T> {
  return useCallback((el: T | null) => (el ? pinToScreenBottom(el) : undefined), []);
}
