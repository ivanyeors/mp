"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n/routing";
import { isMarketingRoute } from "@/lib/routing/is-marketing-route";
import { clearOpenOnLoad, publishSupportChat, shouldOpenOnLoad } from "./support-chat-root";
import SupportChatWindow from "./support-chat-window";
import { useSupportChat } from "./use-support-chat";

/**
 * The website chat, running above the pages once it's wanted
 * (support-chat-root.tsx), so a chat started on /support carries on while the
 * visitor browses: its window floats over every landing page.
 *
 * The window is "open" (a side panel on desktop, the whole screen on a
 * phone), "minimised" (a bubble in the corner) or "closed". Closing only
 * hides it: a reply from the team brings the bubble back.
 */

export type ChatView = "open" | "minimised" | "closed";

export type SupportChatState = {
  chat: ReturnType<typeof useSupportChat>;
  view: ChatView;
  setView: (view: ChatView) => void;
  /** The message being written, shared by /support's launcher and the window. */
  draft: string;
  setDraft: (text: string) => void;
  /** Team replies that came in while the window wasn't open. */
  unread: number;
};

export default function SupportChatEngine() {
  const chat = useSupportChat();
  const [view, setView] = useState<ChatView>("closed");
  const [draft, setDraft] = useState("");
  const pathname = usePathname() ?? "/";

  // A chat restored on load comes back as the bubble; the transcript email's link or the dock opens it.
  const [settled, setSettled] = useState(false);
  if (!settled && !chat.restoring) {
    setSettled(true);
    if (shouldOpenOnLoad()) setView("open");
    else if (chat.active) setView(new URLSearchParams(window.location.search).has("chat") ? "open" : "minimised");
  }
  useEffect(() => {
    if (settled) clearOpenOnLoad();
  }, [settled]);

  // Replies count as read while the window is open; a newly loaded chat starts with none unread.
  const chatId = chat.active?.chat.id ?? "";
  const staffReplies = chat.active?.messages.filter((m) => m.sender === "staff").length ?? 0;
  const [seen, setSeen] = useState({ chatId: "", count: 0 });
  if (seen.chatId !== chatId || (view === "open" && seen.count !== staffReplies)) {
    setSeen({ chatId, count: staffReplies });
  }
  const unread = seen.chatId === chatId ? Math.max(0, staffReplies - seen.count) : 0;
  if (view === "closed" && unread > 0) setView("minimised");

  const state: SupportChatState = { chat, view, setView, draft, setDraft, unread };
  // On every render: /support's chat reads it from the root.
  useLayoutEffect(() => publishSupportChat(state));

  // The window floats over the landing pages only, not the account or the configurators.
  if (!isMarketingRoute(stripLocale(pathname))) return null;
  return <SupportChatWindow state={state} />;
}
