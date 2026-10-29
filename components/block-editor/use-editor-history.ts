"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, type RefObject } from "react";

/**
 * Undo and Redo over any value (PRD-campaign-email-editor slice 04): the
 * whole email, a block list, a form. Every change is a step, at least
 * {@link HISTORY_LIMIT} of them are kept, and a burst of typing in one field
 * is one step, so ⌘Z takes back a sentence, not a letter. A drag, a paste, a
 * Clear all or an AI result is one step of its own.
 */

/** How many steps Undo can go back. */
export const HISTORY_LIMIT = 100;
/** Typing that pauses for less than this stays one step. */
export const BURST_MS = 1000;

interface Step<T> {
  value: T;
  /** This step's number: never reused, so a page can tell whether the present is still a step it made. */
  n: number;
}

export interface HistoryState<T> {
  past: Step<T>[];
  present: Step<T>;
  future: Step<T>[];
  /** The burst the present step belongs to, while typing goes on. */
  burst: string | null;
  at: number;
  next: number;
  limit: number;
}

export type HistoryAction<T> =
  | { type: "set"; next: T | ((prev: T) => T); burst?: string; now: number; burstMs: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

export function initialHistory<T>(value: T, limit = HISTORY_LIMIT): HistoryState<T> {
  return { past: [], present: { value, n: 0 }, future: [], burst: null, at: 0, next: 1, limit };
}

/** Pure — the history after one action. */
export function historyReducer<T>(s: HistoryState<T>, a: HistoryAction<T>): HistoryState<T> {
  switch (a.type) {
    case "set": {
      const value = typeof a.next === "function" ? (a.next as (prev: T) => T)(s.present.value) : a.next;
      if (Object.is(value, s.present.value)) return s;
      // The same field, still being typed in: the same step, with nothing to redo.
      if (a.burst && a.burst === s.burst && a.now - s.at < a.burstMs) {
        return { ...s, present: { ...s.present, value }, future: [], at: a.now };
      }
      return {
        ...s,
        past: [...s.past, s.present].slice(-s.limit),
        present: { value, n: s.next },
        future: [],
        burst: a.burst ?? null,
        at: a.now,
        next: s.next + 1,
      };
    }
    case "undo": {
      const prev = s.past.at(-1);
      if (!prev) return s;
      return { ...s, past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future], burst: null };
    }
    case "redo": {
      const [next, ...rest] = s.future;
      if (!next) return s;
      return { ...s, past: [...s.past, s.present].slice(-s.limit), present: next, future: rest, burst: null };
    }
    case "reset":
      return { ...initialHistory(a.value, s.limit), next: s.next };
  }
}

export interface EditorHistory<T> {
  value: T;
  /** One change: its own step, or with `burst`, the same step as the change before it in that burst. */
  set: (next: T | ((prev: T) => T), opts?: { burst?: string }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The present step's number: a change, an Undo and a Redo each move it. */
  step: number;
  /** Starts over from `value`, with nothing to undo or redo. */
  reset: (value: T) => void;
}

export function useEditorHistory<T>(
  initial: T | (() => T),
  { limit = HISTORY_LIMIT, burstMs = BURST_MS }: { limit?: number; burstMs?: number } = {},
): EditorHistory<T> {
  const [state, dispatch] = useReducer(historyReducer<T>, undefined, () =>
    initialHistory(typeof initial === "function" ? (initial as () => T)() : initial, limit),
  );
  const set = useCallback<EditorHistory<T>["set"]>(
    (next, opts) => dispatch({ type: "set", next, burst: opts?.burst, now: Date.now(), burstMs }),
    [burstMs],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
  return useMemo(
    () => ({
      value: state.present.value,
      set,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      step: state.present.n,
      reset,
    }),
    [state, set, undo, redo, reset],
  );
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Pure — what a key press asks of the history: ⌘Z and ⇧⌘Z (Ctrl on Windows, where Ctrl+Y redoes too). */
export function historyKey(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">, mac = isMac()): "undo" | "redo" | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !mac && !e.shiftKey) return "redo";
  return null;
}

/**
 * ⌘Z and ⇧⌘Z for a history, anywhere inside `within` or with nothing
 * focused. The browser's own undo in a field is replaced, so there is one
 * history, not one per field; a field inside `[data-own-undo]` (one that is
 * not part of what the history holds) keeps the browser's. Off while
 * `enabled` is false.
 */
export function useHistoryKeys(
  history: Pick<EditorHistory<unknown>, "undo" | "redo">,
  { enabled = true, within }: { enabled?: boolean; within?: RefObject<HTMLElement | null> } = {},
) {
  const latest = useRef(history);
  useEffect(() => {
    latest.current = history;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const action = historyKey(e);
      if (!action) return;
      const target = e.target instanceof Node ? e.target : null;
      const root = within?.current;
      if (root && target && target !== document.body && !root.contains(target)) return;
      if (target instanceof Element && target.closest("[data-own-undo]")) return;
      e.preventDefault();
      if (action === "undo") latest.current.undo();
      else latest.current.redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, within]);
}

/**
 * Pure — the burst a field's change belongs to: the field itself while it is
 * typed in, none for a paste or a drop, which is a step of its own.
 */
export function typingBurst(e: { nativeEvent: Event }, field: string): string | undefined {
  const kind = (e.nativeEvent as InputEvent).inputType ?? "";
  return kind.startsWith("insertFromPaste") || kind === "insertFromDrop" ? undefined : field;
}
