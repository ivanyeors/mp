"use client";

import { useCallback, type RefCallback } from "react";

export const SCREEN_PIN_OFFSET_VAR = "--screen-pin-offset";

export const screenBottomPinClassName = "bottom-[calc(var(--screen-pin-offset,0px)*-1)]";

export function screenPinOffset(
  viewport: Pick<VisualViewport, "offsetTop" | "scale"> | null | undefined,
): number {
  if (!viewport) return 0;
  if (Math.abs(viewport.scale - 1) > 0.01) return 0;
  return Math.max(0, Math.round(viewport.offsetTop));
}

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
  window.addEventListener("scroll", apply, { passive: true });
  return () => {
    viewport.removeEventListener("resize", apply);
    viewport.removeEventListener("scroll", apply);
    window.removeEventListener("scroll", apply);
    el.style.removeProperty(SCREEN_PIN_OFFSET_VAR);
  };
}

export function useScreenBottomPin<T extends HTMLElement = HTMLDivElement>(): RefCallback<T> {
  return useCallback((el: T | null) => (el ? pinToScreenBottom(el) : undefined), []);
}
