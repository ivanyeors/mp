"use client";

import { useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { SupportChatState } from "./support-chat-engine";

/**
 * The website chat's foothold in the root layout (app/layout.tsx), so a chat
 * started on /support follows the visitor from page to page.
 *
 * Every page pays for this file only. The chat itself (its state, polling and
 * floating window) is the engine, loaded the first time it's wanted: when
 * /support's chat mounts, or on any page when this tab already has a chat.
 * It publishes its state here, where /support's chat reads it.
 */

/** sessionStorage: the open chat's id and token (use-support-chat.ts). */
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

/** Loads the engine; /support's chat calls it when it mounts. */
export function enableSupportChat() {
  if (enabled) return;
  enabled = true;
  emit();
}

/** Opens the chat window, loading the engine first when it isn't running yet. */
export function openSupportChat() {
  if (state) return state.setView("open");
  openOnLoad = true;
  enableSupportChat();
}

/** Whether the engine should open its window once it has loaded; reading clears nothing. */
export function shouldOpenOnLoad() {
  return openOnLoad;
}

export function clearOpenOnLoad() {
  openOnLoad = false;
}

/** The engine's state, published on each of its renders. */
export function publishSupportChat(next: SupportChatState | null) {
  state = next;
  emit();
}

/** The chat's state, or null until the engine has loaded. */
export function useSupportChatState(): SupportChatState | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

const SupportChatEngine = dynamic(() => import("./support-chat-engine"), { ssr: false });

export function SupportChatRoot() {
  const on = useSyncExternalStore(subscribe, () => enabled, () => false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY)) enableSupportChat();
    } catch {
      // Blocked storage: there's no chat to bring back.
    }
  }, []);
  return on ? <SupportChatEngine /> : null;
}
