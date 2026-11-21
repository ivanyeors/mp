"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n/routing";
import { isMarketingRoute } from "@/lib/routing/is-marketing-route";
import { clearOpenOnLoad, publishSupportChat, shouldOpenOnLoad } from "./support-chat-root";
import SupportChatWindow from "./support-chat-window";
import { useSupportChat } from "./use-support-chat";

export type ChatView = "open" | "minimised" | "closed";

export type SupportChatState = {
  chat: ReturnType<typeof useSupportChat>;
  view: ChatView;
  setView: (view: ChatView) => void;
  draft: string;
  setDraft: (text: string) => void;
  unread: number;
};

export default function SupportChatEngine() {
  const chat = useSupportChat();
  const [view, setView] = useState<ChatView>("closed");
  const [draft, setDraft] = useState("");
  const pathname = usePathname() ?? "/";

  const [settled, setSettled] = useState(false);
  if (!settled && !chat.restoring) {
    setSettled(true);
    if (shouldOpenOnLoad()) setView("open");
    else if (chat.active) setView(new URLSearchParams(window.location.search).has("chat") ? "open" : "minimised");
  }
  useEffect(() => {
    if (settled) clearOpenOnLoad();
  }, [settled]);

  const chatId = chat.active?.chat.id ?? "";
  const staffReplies = chat.active?.messages.filter((m) => m.sender === "staff").length ?? 0;
  const [seen, setSeen] = useState({ chatId: "", count: 0 });
  if (seen.chatId !== chatId || (view === "open" && seen.count !== staffReplies)) {
    setSeen({ chatId, count: staffReplies });
  }
  const unread = seen.chatId === chatId ? Math.max(0, staffReplies - seen.count) : 0;
  if (view === "closed" && unread > 0) setView("minimised");

  const state: SupportChatState = { chat, view, setView, draft, setDraft, unread };
  useLayoutEffect(() => publishSupportChat(state));

  if (!isMarketingRoute(stripLocale(pathname))) return null;
  return <SupportChatWindow state={state} />;
}
