"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageView, ChatSummary, ChatView } from "@/lib/support/chat";

/**
 * The website chat's state on the page (app/api/support/chat).
 *
 * The open chat's id and token live in sessionStorage: a reload keeps the
 * chat, closing the tab loses it — which is all a visitor without an account
 * gets. A signed-in customer's chats come back from the server instead.
 *
 * A visitor without an account checks their email with a 6-digit code before
 * the first message goes out; the message waits in the chat meanwhile. The
 * chat that code started then vouches for the email (VERIFIED_KEY), so a new
 * chat in the same tab needs no second code.
 */

const STORAGE_KEY = "mp.supportChat";
const VERIFIED_KEY = "mp.supportChatVerified";
const POLL_VISIBLE_MS = 3_000;
const POLL_HIDDEN_MS = 15_000;
const TOKEN_HEADER = "x-chat-token";

export type Me =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "signed-in"; email: string; name: string | null; chats: ChatSummary[] };

/** `held`: the first message, not sent until the visitor's email is checked. */
export type PendingMessage = ChatMessageView & { pending?: boolean; failed?: boolean; held?: boolean };

export type ActiveChat = {
  chat: ChatView;
  /** Null for a signed-in customer's chat opened from their list: the session opens it. */
  token: string | null;
  messages: PendingMessage[];
  /** False when the last message didn't reach the staff Telegram group. */
  delivered: boolean;
  /** The chat isn't started yet: its first message waits for the email code. */
  awaitingCode?: boolean;
  /** The visitor signed in (or made an account) to start this chat, just now. */
  signedInHere?: boolean;
};

/** The email this tab proved with a code, and the chat that proves it. */
export type Verified = { email: string; name: string | null; chatId: string; token: string };

type Stored = { id: string; token: string };

function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Private mode or blocked storage: the chat still works until the page goes.
  }
}

function readStored(): Stored | null {
  const parsed = readJson<Stored>(STORAGE_KEY);
  return parsed?.id && parsed.token ? { id: parsed.id, token: parsed.token } : null;
}

const writeStored = (value: Stored | null) => writeJson(STORAGE_KEY, value);

function readVerified(): Verified | null {
  const v = readJson<Verified>(VERIFIED_KEY);
  return v?.email && v.chatId && v.token ? { email: v.email, name: v.name ?? null, chatId: v.chatId, token: v.token } : null;
}

/** A request the server refused, with what it said (`codeError`, `needsCode`). */
export class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly data: { codeError?: "wrong" | "expired" | "too_many_tries"; needsCode?: boolean },
  ) {
    super(message);
  }
}

type Started = { chat: ChatView; token: string; messages: ChatMessageView[]; delivered: boolean };

function placeholderChat(signedIn: boolean, createdAt: string): ChatView {
  return { id: "", ref: "", status: "open", name: null, email: "", hasAccount: signedIn, createdAt, endedAt: null };
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
  if (!res.ok) {
    throw new ChatRequestError(json?.error || "Something went wrong. Please try again.", (json ?? {}) as ChatRequestError["data"]);
  }
  return json as T;
}

export function useSupportChat() {
  const [me, setMe] = useState<Me>({ status: "loading" });
  const [active, setActive] = useState<ActiveChat | null>(null);
  const [verified, setVerifiedState] = useState<Verified | null>(null);
  // The launcher's honeypot, sent with the code request and the first message.
  const honeypotRef = useRef("");
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
      if (!cancelled) setVerifiedState(readVerified());
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

  const setVerified = useCallback((value: Verified | null) => {
    writeJson(VERIFIED_KEY, value);
    setVerifiedState(value);
  }, []);

  /** Starts the chat on the server and swaps it in for whatever the page showed meanwhile. */
  const startOnServer = useCallback(
    async (body: string, extra: Record<string, unknown>): Promise<Started> => {
      const res = await call<Started>("/api/support/chat", {
        method: "POST",
        body: JSON.stringify({ message: body, company: honeypotRef.current, ...extra }),
      });
      writeStored({ id: res.chat.id, token: res.token });
      return res;
    },
    [],
  );

  /** The first message waits in the chat while the visitor checks their email. */
  const holdForCode = useCallback((message: PendingMessage) => {
    setActive({
      chat: placeholderChat(false, message.createdAt),
      token: null,
      messages: [{ ...message, pending: false, held: true }],
      delivered: true,
      awaitingCode: true,
    });
  }, []);

  const send = useCallback(
    async (text: string, extra: { company?: string } = {}): Promise<boolean> => {
      const body = text.trim();
      if (!body) return false;
      setError(null);
      if (extra.company !== undefined) honeypotRef.current = extra.company;
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
      if (current?.awaitingCode) return false;
      if (!current) {
        const signedIn = me.status === "signed-in";
        if (!signedIn && !verified) {
          holdForCode(optimistic);
          return true;
        }
        // Signed in, or this tab already proved its email: start straight away.
        setActive({ chat: placeholderChat(signedIn, optimistic.createdAt), token: null, messages: [optimistic], delivered: true });
        try {
          const res = await startOnServer(
            body,
            signedIn || !verified ? {} : { after: { id: verified.chatId, token: verified.token } },
          );
          setActive({ chat: res.chat, token: res.token, messages: res.messages, delivered: res.delivered });
          if (signedIn) void loadMe();
          return true;
        } catch (e) {
          if (e instanceof ChatRequestError && e.data.needsCode) {
            // The chat that vouched for the email is gone: check the email again.
            setVerified(null);
            holdForCode(optimistic);
            return true;
          }
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
    [me.status, verified, loadMe, startOnServer, holdForCode, setVerified],
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

  /** Emails the visitor a code for their address (not a sign-in). */
  const requestCode = useCallback(async (email: string) => {
    return call<{ codeId: string; email: string }>("/api/support/chat/code", {
      method: "POST",
      body: JSON.stringify({ email, company: honeypotRef.current }),
    });
  }, []);

  /**
   * Sends the held first message with the visitor's way in: the code they
   * were emailed, or (`signedIn`) the session they just signed in with.
   * Throws a ChatRequestError for a wrong or expired code; the message stays held.
   */
  const startHeld = useCallback(
    async (how: { codeId: string; code: string; name?: string } | { signedIn: true; name?: string }) => {
      const held = activeRef.current;
      const message = held?.awaitingCode ? held.messages[0] : null;
      if (!message) return;
      const mark = (pending: boolean) =>
        setActive((prev) => (prev?.awaitingCode ? { ...prev, messages: [{ ...message, pending, held: !pending }] } : prev));
      mark(true);
      try {
        if ("signedIn" in how) {
          // The server has to see the new session, or it would ask for a code again.
          if ((await loadMe()).status !== "signed-in") {
            throw new Error("You're signed in, but this page can't tell yet. Refresh it and send your message again.");
          }
          const res = await startOnServer(message.body, { name: how.name });
          setActive({ chat: res.chat, token: res.token, messages: res.messages, delivered: res.delivered, signedInHere: true });
          void loadMe();
          return;
        }
        const res = await startOnServer(message.body, {
          name: how.name,
          verification: { codeId: how.codeId, code: how.code },
        });
        setVerified({ email: res.chat.email, name: res.chat.name, chatId: res.chat.id, token: res.token });
        setActive({ chat: res.chat, token: res.token, messages: res.messages, delivered: res.delivered });
      } catch (e) {
        mark(false);
        throw e;
      }
    },
    [startOnServer, loadMe, setVerified],
  );

  /** Back to the start, with the held message in the box again. */
  const cancelHeld = useCallback((): string => {
    const held = activeRef.current;
    setActive(null);
    setError(null);
    return held?.awaitingCode ? (held.messages[0]?.body ?? "") : "";
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

  return {
    me,
    active,
    verified,
    restoring,
    error,
    setError,
    send,
    retry,
    requestCode,
    startHeld,
    cancelHeld,
    forgetVerified: () => setVerified(null),
    end,
    startNew,
    openChat,
  };
}
