"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageView, ChatSummary, ChatView } from "@/lib/support/chat";

/**
 * The website chat's state on the page (app/api/support/chat).
 *
 * The open chat's id and token live in sessionStorage: a reload keeps the
 * chat, closing the tab loses it — which is all a visitor without an account
 * gets. A signed-in customer's chats come back from the server instead.
 */

const STORAGE_KEY = "mp.supportChat";
const POLL_VISIBLE_MS = 3_000;
const POLL_HIDDEN_MS = 15_000;
const TOKEN_HEADER = "x-chat-token";

export type Me =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "signed-in"; email: string; name: string | null; chats: ChatSummary[] };

export type PendingMessage = ChatMessageView & { pending?: boolean; failed?: boolean };

export type ActiveChat = {
  chat: ChatView;
  /** Null for a signed-in customer's chat opened from their list: the session opens it. */
  token: string | null;
  messages: PendingMessage[];
  /** False when the last message didn't reach the staff Telegram group. */
  delivered: boolean;
};

type Stored = { id: string; token: string };

function readStored(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    return parsed?.id && parsed.token ? { id: parsed.id, token: parsed.token } : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null): void {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the chat still works until the page goes.
  }
}

async function call<T>(url: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { [TOKEN_HEADER]: token } : {}),
      ...headers,
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(json?.error || "Something went wrong. Please try again.");
  return json as T;
}

export function useSupportChat() {
  const [me, setMe] = useState<Me>({ status: "loading" });
  const [active, setActive] = useState<ActiveChat | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<ActiveChat | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const loadMe = useCallback(async (): Promise<Me> => {
    try {
      const res = await call<{ signedIn: boolean; email?: string; name?: string | null; chats?: ChatSummary[] }>(
        "/api/support/chat",
      );
      const next: Me = res.signedIn
        ? { status: "signed-in", email: res.email ?? "", name: res.name ?? null, chats: res.chats ?? [] }
        : { status: "anon" };
      setMe(next);
      return next;
    } catch {
      const next: Me = { status: "anon" };
      setMe(next);
      return next;
    }
  }, []);

  const fetchChat = useCallback(async (id: string, token: string | null) => {
    const res = await call<{ chat: ChatView; messages: ChatMessageView[] }>(`/api/support/chat/${id}`, { token });
    return { chat: res.chat, token, messages: res.messages, delivered: true } satisfies ActiveChat;
  }, []);

  // First load: who is this, and is there a chat to restore (this tab's, or the one a link names)?
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [who] = await Promise.all([loadMe()]);
      const stored = readStored();
      // A transcript email's "Open your chat" link names the chat.
      const wanted = new URLSearchParams(window.location.search).get("chat");
      try {
        if (stored && (!wanted || wanted === stored.id)) {
          const restored = await fetchChat(stored.id, stored.token);
          if (!cancelled) setActive(restored);
        } else if (wanted && who.status === "signed-in") {
          const opened = await fetchChat(wanted, null);
          if (!cancelled) setActive(opened);
        }
      } catch {
        if (stored) writeStored(null);
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only
  }, []);

  // Poll the open chat for staff replies; slower when the tab is in the background.
  const chatId = active?.chat.id ?? null;
  const chatOpen = active?.chat.status === "open";
  useEffect(() => {
    if (!chatId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      const current = activeRef.current;
      if (!current || current.chat.id !== chatId) return;
      const settled = current.messages.filter((m) => !m.pending && !m.failed).length;
      try {
        const res = await call<{ chat: ChatView; messages?: ChatMessageView[]; unchanged?: boolean }>(
          `/api/support/chat/${chatId}?have=${settled}`,
          { token: current.token },
        );
        setActive((prev) => {
          if (!prev || prev.chat.id !== chatId) return prev;
          if (res.unchanged || !res.messages) return { ...prev, chat: res.chat };
          const local = prev.messages.filter((m) => m.pending || m.failed);
          return { ...prev, chat: res.chat, messages: [...res.messages, ...local] };
        });
      } catch {
        // A missed poll is retried on the next tick.
      }
      if (!stopped) {
        timer = setTimeout(tick, document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
      }
    };
    timer = setTimeout(tick, POLL_VISIBLE_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [chatId]);

  // Leaving the page: the server emails the transcript unless the page comes straight back.
  useEffect(() => {
    if (!chatId || !chatOpen) return;
    const onLeave = () => {
      const current = activeRef.current;
      if (!current || current.chat.status !== "open") return;
      const body = new Blob([JSON.stringify({ token: current.token })], { type: "application/json" });
      navigator.sendBeacon?.(`/api/support/chat/${current.chat.id}/leave`, body);
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [chatId, chatOpen]);

  const send = useCallback(
    async (text: string, extra: { name?: string; company?: string } = {}): Promise<boolean> => {
      const body = text.trim();
      if (!body) return false;
      setError(null);
      const tempId = `local-${Date.now()}`;
      const optimistic: PendingMessage = {
        id: tempId,
        sender: "customer",
        body,
        staffName: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      const current = activeRef.current;
      if (!current) {
        // The first message starts the chat; show it while the chat is created.
        setActive({
          chat: {
            id: "",
            ref: "",
            status: "open",
            name: null,
            email: null,
            hasAccount: me.status === "signed-in",
            createdAt: optimistic.createdAt,
            endedAt: null,
          },
          token: null,
          messages: [optimistic],
          delivered: true,
        });
        try {
          const res = await call<{ chat: ChatView; token: string; messages: ChatMessageView[]; delivered: boolean }>(
            "/api/support/chat",
            { method: "POST", body: JSON.stringify({ message: body, ...extra }) },
          );
          writeStored({ id: res.chat.id, token: res.token });
          setActive({ chat: res.chat, token: res.token, messages: res.messages, delivered: res.delivered });
          if (me.status === "signed-in") void loadMe();
          return true;
        } catch (e) {
          setActive(null);
          setError(e instanceof Error ? e.message : "We couldn't start the chat.");
          return false;
        }
      }

      setActive((prev) => (prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev));
      try {
        const res = await call<{ chat: ChatView; message: ChatMessageView; delivered: boolean }>(
          `/api/support/chat/${current.chat.id}/messages`,
          { method: "POST", token: current.token, body: JSON.stringify({ message: body }) },
        );
        setActive((prev) =>
          prev
            ? {
                ...prev,
                chat: res.chat,
                delivered: res.delivered,
                messages: prev.messages.map((m) => (m.id === tempId ? res.message : m)),
              }
            : prev,
        );
        return true;
      } catch (e) {
        setActive((prev) =>
          prev
            ? { ...prev, messages: prev.messages.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)) }
            : prev,
        );
        setError(e instanceof Error ? e.message : "We couldn't send that.");
        return false;
      }
    },
    [me.status, loadMe],
  );

  const retry = useCallback(
    async (messageId: string) => {
      const failed = activeRef.current?.messages.find((m) => m.id === messageId);
      if (!failed) return;
      setActive((prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) } : prev));
      await send(failed.body);
    },
    [send],
  );

  const saveEmail = useCallback(async (email: string, name?: string) => {
    const current = activeRef.current;
    if (!current) return;
    const res = await call<{ chat: ChatView }>(`/api/support/chat/${current.chat.id}`, {
      method: "PATCH",
      token: current.token,
      body: JSON.stringify({ email, ...(name?.trim() ? { name } : {}) }),
    });
    setActive((prev) => (prev ? { ...prev, chat: res.chat } : prev));
  }, []);

  const end = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return { emailed: false };
    const res = await call<{ chat: ChatView; emailed: boolean }>(`/api/support/chat/${current.chat.id}/end`, {
      method: "POST",
      token: current.token,
    });
    setActive((prev) => (prev ? { ...prev, chat: res.chat } : prev));
    if (me.status === "signed-in") void loadMe();
    return { emailed: res.emailed };
  }, [me.status, loadMe]);

  /** After signing in from the chat: move the chat into the account, then reload the account's chats. */
  const claim = useCallback(async () => {
    const current = activeRef.current;
    if (current?.token) {
      const res = await call<{ chat: ChatView }>(`/api/support/chat/${current.chat.id}/claim`, {
        method: "POST",
        token: current.token,
      });
      setActive((prev) => (prev ? { ...prev, chat: res.chat } : prev));
    }
    await loadMe();
  }, [loadMe]);

  const startNew = useCallback(() => {
    writeStored(null);
    setActive(null);
    setError(null);
  }, []);

  const openChat = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const stored = readStored();
        const opened = await fetchChat(id, stored?.id === id ? stored.token : null);
        setActive(opened);
      } catch (e) {
        setError(e instanceof Error ? e.message : "We couldn't open that chat.");
      }
    },
    [fetchChat],
  );

  return { me, active, restoring, error, setError, send, retry, saveEmail, end, claim, startNew, openChat };
}
