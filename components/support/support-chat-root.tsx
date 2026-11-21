"use client";

import { useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { SupportChatState } from "./support-chat-engine";

export const STORAGE_KEY = "mp.supportChat";

let enabled = false;
let openOnLoad = false;
let state: SupportChatState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function enableSupportChat() {
  if (enabled) return;
  enabled = true;
  emit();
}

export function openSupportChat() {
  if (state) return state.setView("open");
  openOnLoad = true;
  enableSupportChat();
}

export function shouldOpenOnLoad() {
  return openOnLoad;
}

export function clearOpenOnLoad() {
  openOnLoad = false;
}

export function publishSupportChat(next: SupportChatState | null) {
  state = next;
  emit();
}

export function useSupportChatState(): SupportChatState | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

const SupportChatEngine = dynamic(() => import("./support-chat-engine"), { ssr: false });

export function SupportChatRoot() {
  const on = useSyncExternalStore(subscribe, () => enabled, () => false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY)) enableSupportChat();
    } catch {}
  }, []);
  return on ? <SupportChatEngine /> : null;
}
