"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type DebouncedCallback<Args extends unknown[]> = ((...args: Args) => void) & {
  /** Drop any pending trailing invocation. */
  cancel: () => void;
  /** Run any pending trailing invocation immediately. */
  flush: () => void;
  /** True while a trailing invocation is scheduled. */
  isPending: () => boolean;
};

/**
 * Trailing-edge debounce for a callback.
 *
 * The returned function keeps a stable identity for the lifetime of the
 * component (safe to use as an effect dependency or a memoised prop) while
 * always invoking the latest `callback`. Any pending invocation is cancelled
 * when the component unmounts.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): DebouncedCallback<Args> {
  const callbackRef = useRef(callback);
  const delayRef = useRef(delay);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    delayRef.current = delay;
  }, [delay]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const args = pendingArgsRef.current;
    pendingArgsRef.current = null;
    callbackRef.current(...((args ?? []) as Args));
  }, []);

  useEffect(() => cancel, [cancel]);

  return useMemo(() => {
    const debounced = ((...args: Args) => {
      pendingArgsRef.current = args;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingArgsRef.current;
        pendingArgsRef.current = null;
        callbackRef.current(...((pending ?? []) as Args));
      }, delayRef.current);
    }) as DebouncedCallback<Args>;
    debounced.cancel = cancel;
    debounced.flush = flush;
    debounced.isPending = () => timerRef.current !== null;
    return debounced;
  }, [cancel, flush]);
}

export default useDebouncedCallback;
