"use client";

import { useEffect, useEffectEvent, useRef } from "react";

export function useOncePerKey(key: string | null, run: (key: string) => void) {
  const keysRun = useRef<Set<string> | null>(null);
  const runLatest = useEffectEvent(run);

  useEffect(() => {
    if (key === null) return;
    const seen = (keysRun.current ??= new Set());
    if (seen.has(key)) return;
    seen.add(key);
    runLatest(key);
  }, [key]);
}
