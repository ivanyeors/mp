import * as React from "react";

/**
 * Subscribe to a media query.
 *
 * `useIsMobile` is hardcoded to the 768px breakpoint; surfaces that need a different
 * one (the Page Builder's three-pane shell needs 1024, to match its `lg:` grid) use
 * this instead of inventing a second constant.
 *
 * Returns `false` until mounted, so the server and first client render agree.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
