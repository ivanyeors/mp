import * as React from "react";

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
