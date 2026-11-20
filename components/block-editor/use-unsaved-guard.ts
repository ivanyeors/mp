"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const LEAVE_UNSAVED = "Leave this page? The changes you haven't saved will be lost.";

const KEEP_AFTER_MS = 500;

interface Kept {
  v: 1;
  at: string;
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
  } catch {}
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function leavingLink(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return null;
  const to = new URL(a.href, window.location.href);
  if (to.origin !== window.location.origin) return null;
  return to.pathname === window.location.pathname && to.search === window.location.search ? null : a;
}

export interface UnsavedGuardOptions<T> {
  dirty: boolean;
  onSave?: () => void;
  keep?: {
    key: string;
    value: T;
    base: string;
    parse: (raw: unknown) => T | null;
  };
  message?: string;
}

export interface UnsavedGuard<T> {
  recovered: { value: T; at: string } | null;
  restore: () => T | null;
  discard: () => void;
  confirmLeave: () => boolean;
}

export function useUnsavedGuard<T>({ dirty, onSave, keep, message = LEAVE_UNSAVED }: UnsavedGuardOptions<T>): UnsavedGuard<T> {
  const latest = useRef({ dirty, onSave, message });
  useEffect(() => {
    latest.current = { dirty, onSave, message };
  });

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

  const key = keep?.key ?? null;
  const base = keep?.base ?? null;
  const parse = keep?.parse;
  const [recovered, setRecovered] = useState<{ value: T; at: string; key: string; base: string } | null>(null);
  const offer = recovered && recovered.key === key && recovered.base === base ? recovered : null;
  const read = useRef<string | null>(null);
  const holding = useRef<{ key: string; base: string } | null>(null);
  useEffect(() => {
    if (!key || base === null || !parse || read.current === key) return;
    read.current = key;
    const kept = readKept(key);
    const value = kept && kept.base === base ? parse(kept.value) : null;
    if (value === null) return;
    holding.current = { key, base };
    const offered = { value, at: kept!.at, key, base };
    queueMicrotask(() => setRecovered(offered));
  }, [key, base, parse]);

  const value = keep?.value;
  useEffect(() => {
    if (!key || base === null) return;
    const held = holding.current;
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
