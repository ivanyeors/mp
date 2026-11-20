export const MOBILE_BOTTOM_BAR_HEIGHT_VAR = "--mobile-bottom-bar-height";

let publishers = 0;

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
