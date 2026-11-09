"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { clearDraft, DRAFT_EVENT, listDrafts, readDraft, writeDraft } from "@/lib/editor-drafts";

/** How long after the last change a draft is written: a drag's many steps make one write, not one each. */
export const AUTOSAVE_DELAY_MS = 400;

/**
 * Keep an editor's unsaved state as a draft (`lib/editor-drafts.ts`) while
 * `dirty`: written AUTOSAVE_DELAY_MS after the last change, and at once when
 * the page is hidden or left (Back, a closed tab, a closed app) or the editor
 * unmounts (its dialog closed). Back to what is saved (`dirty` false), the
 * draft is removed.
 *
 * `key` null pauses it: nothing is open yet, or a draft is waiting to be
 * restored and must not be overwritten by the saved state shown meanwhile.
 * Changing `key` first keeps what was pending for the old one.
 *
 * `data` should keep its identity between renders that change nothing
 * (memoise it), so a re-render does not restart the wait.
 */
export function useAutosaveDraft<T>(key: string | null, data: T, dirty: boolean) {
  // When the draft under `key` was last written; shown only while there is one to show.
  const [written, setWritten] = useState<{ key: string; at: number } | null>(null);
  const savedAt = dirty && written && written.key === key ? written.at : null;
  const pending = useRef<{ key: string; data: T } | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef<{ key: string | null; data: T }>({ key, data });
  // The state just saved or discarded, as JSON: it is not kept again until it changes.
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

  // Leaving (Back, a closed tab or app, a phone switching apps) or unmounting keeps the last change at once.
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

  /**
   * Drop the draft now (after a save, or Discard): nothing pending is written,
   * and the state on screen is not kept again until it changes.
   */
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

/** Kept drafts change in this tab (DRAFT_EVENT) or another (`storage`). */
function subscribeDrafts(onChange: () => void) {
  window.addEventListener(DRAFT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DRAFT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** When the draft under `key` was kept, or null: live, for a "Resume" line outside the editor. */
export function useDraftSavedAt(key: string | null): number | null {
  const read = useCallback(() => (key === null ? null : (readDraft(key)?.savedAt ?? null)), [key]);
  return useSyncExternalStore(subscribeDrafts, read, () => null);
}

/** The keys (after `scope`) of the drafts kept under `scope`: live, so a list can mark what has one. */
export function useDraftKeys(scope: string): ReadonlySet<string> {
  const read = useCallback(() => listDrafts(scope).map((d) => d.key).join("\n"), [scope]);
  const joined = useSyncExternalStore(subscribeDrafts, read, () => "");
  return useMemo(() => new Set(joined ? joined.split("\n") : []), [joined]);
}
