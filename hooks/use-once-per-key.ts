"use client";

import { useEffect, useEffectEvent, useRef } from "react";

export function useOncePerKey(key: string | null, run: (key: string) => void) {
  const lastKeyRun = useRef<string | null>(null);
  const runLatest = useEffectEvent(run);

  useEffect(() => {
    if (key === null || lastKeyRun.current === key) return;
    lastKeyRun.current = key;
    runLatest(key);
  }, [key]);
}
