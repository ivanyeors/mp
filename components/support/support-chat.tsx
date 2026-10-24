"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Launcher } from "./support-chat-launcher";
import { Aurora, BrandAvatar, chatStatusLine, GradientButton, HistoryPanel, NAVY_GLOW, NAVY_GRADIENT } from "./support-chat-parts";
import type { ChatView, SupportChatState } from "./support-chat-engine";
import { enableSupportChat, useSupportChatState } from "./support-chat-root";
import type { ActiveChat } from "./use-support-chat";

/**
 * The "Get in touch" chat on /support. It starts as a composer on the brand
 * gradient; the first message opens the chat window (support-chat-window.tsx),
 * a side panel on desktop and the whole screen on a phone, which stays with
 * the visitor across the landing pages. The team's replies come from the
 * staff Telegram group (lib/support/chat.ts).
 *
 * While a chat is going, this card shows where it stands and opens the window
 * again. The chat itself runs above the pages (support-chat-root.tsx), which
 * this card starts.
 */
export function SupportChat() {
  const state = useSupportChatState();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    enableSupportChat();
  }, []);

  return (
    <motion.section
      layout={!reduceMotion}
      transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
      aria-label="Chat with the mpillow team"
      // An app surface: the marketing pages' forced paragraph size would unbalance the bubbles.
      data-typography-scope="app"
      className="relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_40px_90px_-40px_rgba(18,152,255,0.65)]"
      style={{ backgroundImage: NAVY_GRADIENT }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: NAVY_GLOW }} />
      <Aurora />

      {!state || state.chat.restoring ? (
        <div className="relative flex min-h-[340px] items-center justify-center" role="status">
          <Loader2 className="size-6 animate-spin text-[#a5d8ff]" aria-hidden="true" />
          <span className="sr-only">Loading the chat…</span>
        </div>
      ) : (
        <Ready state={state} />
      )}
    </motion.section>
  );
}

function Ready({ state }: { state: SupportChatState }) {
  const { chat, view, setView, draft, setDraft, unread } = state;
  const reduceMotion = useReducedMotion();
  const [showHistory, setShowHistory] = useState(false);
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {chat.active ? (
          <motion.div
            key="ongoing"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <Ongoing active={chat.active} unread={unread} view={view} onOpen={() => setView("open")} />
          </motion.div>
        ) : (
          <motion.div
            key="launcher"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <Launcher
              me={chat.me}
              verified={chat.verified}
              onForgetVerified={chat.forgetVerified}
              error={chat.error}
              draft={draft}
              setDraft={setDraft}
              onSend={(text, company) => {
                setView("open");
                return chat.send(text, { company });
              }}
              onShowHistory={() => setShowHistory(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && !chat.active && chat.me.status === "signed-in" ? (
          <HistoryPanel
            chats={chat.me.chats}
            activeId={null}
            onClose={() => setShowHistory(false)}
            onOpen={async (id) => {
              await chat.openChat(id);
              setShowHistory(false);
              setView("open");
            }}
            onNew={() => setShowHistory(false)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

const WHERE_IT_IS: Record<ChatView, string> = {
  open: "It's open beside the page.",
  minimised: "It's in the corner of every page you visit.",
  closed: "Closed for now. A reply from us brings it back.",
};

/** The chat that's going: where it stands, its last message, and the way back into it. */
function Ongoing({
  active,
  unread,
  view,
  onOpen,
}: {
  active: ActiveChat;
  unread: number;
  view: ChatView;
  onOpen: () => void;
}) {
  const last = active.messages.at(-1);
  const ended = active.chat.status === "ended";
  return (
    <div className="relative p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <BrandAvatar size={44} live={!ended} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">mpillow team</p>
          <p className="truncate text-xs text-[#bcd8ff]">{chatStatusLine(active)}</p>
        </div>
      </div>

      <h3 className="mt-6 text-xl font-semibold tracking-tight sm:text-2xl">
        {ended ? "Your chat has ended" : active.awaitingCode ? "Your message is waiting" : "Your chat is open"}
      </h3>
      {last ? (
        <p className="mt-3 line-clamp-2 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3 text-[15px] leading-relaxed text-[#e2f1ff] backdrop-blur">
          <span className="font-medium text-white">
            {last.sender === "staff" ? `${last.staffName?.trim() || "mpillow"}: ` : "You: "}
          </span>
          {last.body}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <GradientButton type="button" onClick={onOpen} className="relative">
          <MessageCircle className="size-4" aria-hidden="true" />
          {ended ? "View chat" : "Continue chat"}
          {unread > 0 ? (
            <span className="rounded-full bg-white px-1.5 text-[11px] leading-4 text-[#0b2a55]">
              {unread} new
            </span>
          ) : null}
        </GradientButton>
        {ended ? null : <p className={cn("text-xs text-[#bcd8ff]", view === "open" && "max-md:hidden")}>{WHERE_IT_IS[view]}</p>}
      </div>
    </div>
  );
}
