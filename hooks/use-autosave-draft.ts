"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { clearDraft, DRAFT_EVENT, listDrafts, readDraft, writeDraft } from "@/lib/editor-drafts";

export const AUTOSAVE_DELAY_MS = 400;

export function useAutosaveDraft<T>(key: string | null, data: T, dirty: boolean) {
  const [written, setWritten] = useState<{ key: string; at: number } | null>(null);
  const savedAt = dirty && written && written.key === key ? written.at : null;
  const pending = useRef<{ key: string; data: T } | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef<{ key: string | null; data: T }>({ key, data });
  const settled = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { key, data };
  });

  const stopTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(() => {
    stopTimer();
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    const at = writeDraft(p.key, p.data);
    if (at !== null) setWritten({ key: p.key, at });
  }, [stopTimer]);

  useEffect(() => {
    if (pending.current && pending.current.key !== key) flush();
    if (key === null) return;
    if (!dirty) {
      stopTimer();
      pending.current = null;
      settled.current = null;
      clearDraft(key);
      return;
    }
    if (settled.current !== null && settled.current === JSON.stringify(data)) return;
    settled.current = null;
    pending.current = { key, data };
    stopTimer();
    timer.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
  }, [key, data, dirty, flush, stopTimer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flush]);

  const discard = useCallback(() => {
    stopTimer();
    pending.current = null;
    const { key: k, data: d } = latest.current;
    settled.current = JSON.stringify(d);
    if (k !== null) clearDraft(k);
    setWritten(null);
  }, [stopTimer]);

  return { savedAt, discard };
}

function subscribeDrafts(onChange: () => void) {
  window.addEventListener(DRAFT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DRAFT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDraftSavedAt(key: string | null): number | null {
  const read = useCallback(() => (key === null ? null : (readDraft(key)?.savedAt ?? null)), [key]);
  return useSyncExternalStore(subscribeDrafts, read, () => null);
}

export function useDraftKeys(scope: string): ReadonlySet<string> {
  const read = useCallback(() => listDrafts(scope).map((d) => d.key).join("\n"), [scope]);
  const joined = useSyncExternalStore(subscribeDrafts, read, () => "");
  return useMemo(() => new Set(joined ? joined.split("\n") : []), [joined]);
}
