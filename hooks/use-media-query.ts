import * as React from "react";

/**
 * Subscribe to a media query.
 *
 * `useIsMobile` is hardcoded to the 768px breakpoint; surfaces that need a different
 * one (the Page Builder's three-pane shell needs 1024, to match its `lg:` grid) use
 * this instead of inventing a second constant.
 *
 * `false` on the server and while hydrating, so the two agree; a component that
 * mounts later (after a client navigation) gets the screen's value on its first
 * render.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
