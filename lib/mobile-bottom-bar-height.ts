/**
 * The height of the phone's bottom action bar — a configurator step's Back /
 * Continue, the cart's and product page's Add to cart / Checkout — published on
 * <html> while one is on screen, so the floating chrome that shares the bottom
 * of the screen (the analytics notice, the minimised chat bubble) sits above it
 * instead of over its buttons. Unset when no bar is showing, so `var(…, 0px)`.
 */
export const MOBILE_BOTTOM_BAR_HEIGHT_VAR = "--mobile-bottom-bar-height";

// Bars can briefly overlap during a route transition; only the last one to go
// clears the token.
let publishers = 0;

/** Publish `el`'s rendered height (0 while hidden, e.g. `md:hidden`, clears it). Returns the cleanup. */
export function publishMobileBottomBarHeight(el: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const root = document.documentElement;
  publishers += 1;
  const publish = () => {
    const height = Math.round(el.getBoundingClientRect().height);
    if (height > 0) root.style.setProperty(MOBILE_BOTTOM_BAR_HEIGHT_VAR, `${height}px`);
    else root.style.removeProperty(MOBILE_BOTTOM_BAR_HEIGHT_VAR);
  };
  publish();
  const observer = new ResizeObserver(publish);
  observer.observe(el);
  return () => {
    observer.disconnect();
    publishers -= 1;
    if (publishers === 0) root.style.removeProperty(MOBILE_BOTTOM_BAR_HEIGHT_VAR);
  };
}
