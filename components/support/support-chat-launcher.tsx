"use client";

import { useState, type ReactNode } from "react";
import { History, Lock } from "lucide-react";
import { BrandAvatar, Composer } from "./support-chat-parts";
import type { Me, Verified } from "./use-support-chat";

export const MESSAGE_MAX = 2000;

const SUGGESTIONS = [
  "Which pillow size fits me?",
  "Book or change a fitting",
  "Where's my order?",
  "My pillow needs adjusting",
] as const;

export function Launcher({
  me,
  verified,
  onForgetVerified,
  error,
  draft,
  setDraft,
  onSend,
  onShowHistory,
  autoFocus = false,
  actions,
}: {
  me: Me;
  verified: Verified | null;
  onForgetVerified: () => void;
  error: string | null;
  draft: string;
  setDraft: (text: string) => void;
  onSend: (text: string, company: string) => Promise<boolean>;
  onShowHistory: () => void;
  autoFocus?: boolean;
  actions?: ReactNode;
}) {
  const [company, setCompany] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  return (
    <div className="relative p-5 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandAvatar size={44} live />
          <div className="min-w-0">
            <p className="text-sm font-semibold">mpillow team</p>
            <p className="text-xs text-[#bcd8ff]">usually reply within a few hours</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {me.status === "signed-in" && me.chats.length > 0 ? (
            <button
              type="button"
              onClick={onShowHistory}
              aria-label="Past chats"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/15 max-md:min-h-11"
            >
              <History className="size-3.5" aria-hidden="true" />
              <span className={actions ? "sr-only" : undefined}>Past chats</span>
              <span className="rounded-full bg-[#1298ff] px-1.5 text-[10px] leading-4">{me.chats.length}</span>
            </button>
          ) : null}
          {actions}
        </div>
      </div>

      <h3 className="mt-8 bg-gradient-to-r from-white via-[#e2f1ff] to-[#a5d8ff] bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
        How can we help?
      </h3>
      <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-[#cfe3ff]">
        Ask about sizing, fittings, orders or adjustments. Your message goes straight to our team, and we
        reply right here.
      </p>

      <div className="mt-6">
        <Composer
          key={focusKey}
          tone="glass"
          placeholder="Type your question…"
          maxLength={MESSAGE_MAX}
          draft={draft}
          onDraftChange={setDraft}
          autoFocus={autoFocus || focusKey > 0}
          onSend={(text) => onSend(text, company)}
        />
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setDraft(`${s} `);
              setFocusKey((k) => k + 1);
            }}
            className="inline-flex h-9 items-center rounded-full border border-white/15 bg-white/[0.07] px-3.5 text-xs font-medium text-[#e2f1ff] backdrop-blur transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-[#a5d8ff]/50 hover:bg-white/[0.14] max-md:min-h-11"
          >
            {s}
          </button>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 border-t border-white/10 pt-4 text-xs leading-relaxed text-[#bcd8ff]">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {me.status === "signed-in" ? (
          <span>
            Signed in as <span className="font-medium text-white">{me.email}</span>. Your chats are saved to your
            account.
          </span>
        ) : verified ? (
          <span>
            Chatting as <span className="font-medium text-white">{verified.email}</span>. We&apos;ll email you a copy of
            each chat.{" "}
            <button
              type="button"
              onClick={onForgetVerified}
              className="font-medium text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
            >
              Use a different email
            </button>
          </span>
        ) : (
          <span>
            No account needed. Before your first message goes out, we&apos;ll email you a 6-digit code to check
            it&apos;s you, then send you a copy of the chat when you&apos;re done.
          </span>
        )}
      </p>
    </div>
  );
}
