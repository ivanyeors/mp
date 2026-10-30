"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Save stays explicit (PRD-campaign-email-editor decision 4), so the editor
 * guards what is not saved yet: ⌘S (Ctrl+S) saves; leaving with unsaved
 * changes asks first, for the browser's own navigation and for links inside
 * the app; and the unsaved value is kept in this browser while it changes, so
 * a tab that crashed or was closed offers it back next time.
 *
 * The copy in the browser is a convenience, never the record: it can be
 * missing or unreadable (a private window, cleared site data), and every
 * read and write is guarded, so the page works the same without it.
 */

/** What leaving asks, for the links inside the app (the browser words its own). */
export const LEAVE_UNSAVED = "Leave this page? The changes you haven't saved will be lost.";

/** How long typing pauses before the browser's copy is updated. */
const KEEP_AFTER_MS = 500;

interface Kept {
  v: 1;
  /** When it was kept: an ISO time. */
  at: string;
  /** The saved version it was edited from: offered back only onto that version. */
  base: string;
  value: unknown;
}

function readKept(key: string): Kept | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const kept = JSON.parse(raw) as Partial<Kept>;
    return kept?.v === 1 && typeof kept.at === "string" && typeof kept.base === "string" ? (kept as Kept) : null;
  } catch {
    return null;
  }
}

function writeKept(key: string, kept: Kept | null) {
  try {
    if (kept) window.localStorage.setItem(key, JSON.stringify(kept));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage full or blocked: the page works without its copy.
  }
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A click on a link that would take the browser to another page of this site. */
function leavingLink(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return null;
  const to = new URL(a.href, window.location.href);
  if (to.origin !== window.location.origin) return null;
  return to.pathname === window.location.pathname && to.search === window.location.search ? null : a;
}

export interface UnsavedGuardOptions<T> {
  /** Something has changed since the last save. */
  dirty: boolean;
  /** What ⌘S does; leave it out where nothing can be saved. */
  onSave?: () => void;
  /** Keep the unsaved value in this browser, to offer back after a crash. */
  keep?: {
    /** One per thing edited: `campaign:<id>`. */
    key: string;
    value: T;
    /** The saved version being edited, such as its updated-at time. */
    base: string;
    /** The kept value read back, or null when it no longer fits. */
    parse: (raw: unknown) => T | null;
  };
  message?: string;
}

export interface UnsavedGuard<T> {
  /** Unsaved changes this browser kept from an earlier visit, until restored, discarded or a Save moves the version on. */
  recovered: { value: T; at: string } | null;
  /** Hands the recovered value over and stops offering it. */
  restore: () => T | null;
  discard: () => void;
  /** Asks before leaving with unsaved changes: true when it may go. For a navigation the page starts itself. */
  confirmLeave: () => boolean;
}

export function useUnsavedGuard<T>({ dirty, onSave, keep, message = LEAVE_UNSAVED }: UnsavedGuardOptions<T>): UnsavedGuard<T> {
  const latest = useRef({ dirty, onSave, message });
  useEffect(() => {
    latest.current = { dirty, onSave, message };
  });

  // ⌘S, and Ctrl+S on Windows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey || e.shiftKey || e.key.toLowerCase() !== "s" || !latest.current.onSave) return;
      e.preventDefault();
      latest.current.onSave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Leaving: the browser asks on its own; a link inside the app asks here.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!leavingLink(e) || window.confirm(latest.current.message)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  // What an earlier visit kept, read once.
  const key = keep?.key ?? null;
  const base = keep?.base ?? null;
  const parse = keep?.parse;
  const [recovered, setRecovered] = useState<{ value: T; at: string; key: string; base: string } | null>(null);
  // An offer stands only on the version it was kept from: once a Save moves that on, it is gone.
  const offer = recovered && recovered.key === key && recovered.base === base ? recovered : null;
  const read = useRef<string | null>(null);
  // The copy on offer stays where it is until something changes, so a second crash still finds it.
  const holding = useRef<{ key: string; base: string } | null>(null);
  useEffect(() => {
    if (!key || base === null || !parse || read.current === key) return;
    read.current = key;
    const kept = readKept(key);
    const value = kept && kept.base === base ? parse(kept.value) : null;
    if (value === null) return;
    holding.current = { key, base };
    // Read in the browser only, once the server's markup has hydrated.
    const offered = { value, at: kept!.at, key, base };
    queueMicrotask(() => setRecovered(offered));
  }, [key, base, parse]);

  // While there are unsaved changes, keep them; once saved, nothing to keep.
  const value = keep?.value;
  useEffect(() => {
    if (!key || base === null) return;
    const held = holding.current;
    // The first change after the offer, or a Save: from here on, this visit's edits are what is kept.
    if (held && (dirty || held.key !== key || held.base !== base)) holding.current = null;
    else if (held) return;
    if (!dirty) {
      writeKept(key, null);
      return;
    }
    const timer = setTimeout(() => writeKept(key, { v: 1, at: new Date().toISOString(), base, value }), KEEP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [key, base, dirty, value, recovered]);

  const restore = useCallback(() => {
    holding.current = null;
    setRecovered(null);
    return offer?.value ?? null;
  }, [offer]);
  const discard = useCallback(() => {
    if (offer && holding.current) writeKept(offer.key, null);
    holding.current = null;
    setRecovered(null);
  }, [offer]);
  const confirmLeave = useCallback(() => !latest.current.dirty || window.confirm(latest.current.message), []);

  return { recovered: offer ? { value: offer.value, at: offer.at } : null, restore, discard, confirmLeave };
}
