import * as React from "react";

/**
 * The content-box width of an element, kept current with a ResizeObserver.
 *
 * For layouts that follow the space a component is given rather than the
 * viewport (a card beside a collapsible sidebar), when the component itself
 * must also know the answer — which a CSS container query cannot tell it.
 * Returns 0 until the element mounts, so the first render is the narrow one.
 */
export function useElementWidth<T extends HTMLElement>(): [React.RefCallback<T>, number] {
  const [width, setWidth] = React.useState(0);
  const observer = React.useRef<ResizeObserver | null>(null);

  const ref = React.useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.current.observe(el);
  }, []);

  React.useEffect(() => () => observer.current?.disconnect(), []);

  return [ref, width];
}
