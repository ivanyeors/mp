"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowUp, ChevronRight, History, Loader2, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import type { ChatSummary } from "@/lib/support/chat";
import { LOGO_SRC } from "@/lib/brand-logo";
import { cn } from "@/lib/utils";
import type { ActiveChat, PendingMessage } from "./use-support-chat";

/**
 * The website chat's building blocks: bubbles, the assistant cards (the
 * email check before the first message), the code boxes and the composer. Brand palette: the navy to
 * blue of the dock and the spotlight cards (#001736 → #2B69BC), with the
 * progress bar's bright blue (#1298ff → #a5d8ff) for the customer's side.
 */

export const NAVY_GRADIENT = "linear-gradient(160deg, #001736 0%, #06275a 45%, #18478f 78%, #2B69BC 100%)";
export const NAVY_GLOW = "inset 1px 1px 1.8px 0px rgba(194, 220, 255, 0.5), inset -4px 13px 28.4px 0px rgba(102, 167, 255, 0.5)";
const CUSTOMER_GRADIENT = "linear-gradient(135deg, #1298ff 0%, #1f74e0 55%, #2B69BC 100%)";
const SEND_GRADIENT = "linear-gradient(135deg, #a5d8ff 0%, #1298ff 55%, #1f5fc0 100%)";

const TIME = new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" });
export const DATE = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" });

export function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

/** One line on where the chat stands, under "mpillow team". */
export function chatStatusLine(active: ActiveChat): string {
  if (active.awaitingCode) return "Check your email to send this";
  if (!active.chat.id) return "Starting your chat…";
  if (active.chat.status === "ended") return `Chat #${active.chat.ref} · ended`;
  const last = active.messages.at(-1);
  if (last?.sender === "staff") return `${last.staffName?.trim() || "The team"} replied · Chat #${active.chat.ref}`;
  return `Sent · we usually reply within a few hours`;
}

/** Two slow, blurred blue lights behind the glass. */
export function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <div className="mp-chat-aurora-a absolute -left-24 -top-28 size-80 rounded-full bg-[#1298ff]/35 blur-3xl" />
      <div className="mp-chat-aurora-b absolute -bottom-32 -right-16 size-96 rounded-full bg-[#66a7ff]/25 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#a5d8ff]/60 to-transparent" />
    </div>
  );
}

/**
 * The mpillow mark on a white disc, with an optional "here" dot. The disc is
 * white because the logo is the brand's dark blue everywhere on the site; on
 * the navy chat it would not show otherwise.
 */
export function BrandAvatar({ size = 40, live = false }: { size?: number; live?: boolean }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-white/40 bg-white"
      style={{ width: size, height: size, boxShadow: "0 0 0 3px rgba(165, 216, 255, 0.18)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a 40px mark, not worth next/image's loader */}
      <img src={LOGO_SRC} alt="" className="h-[68%] w-[68%] object-contain" />
      {live ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#001736]">
          <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] motion-safe:animate-pulse" />
        </span>
      ) : null}
    </span>
  );
}

function AssistantAvatar() {
  return (
    <span
      className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white"
      style={{ backgroundImage: NAVY_GRADIENT, boxShadow: NAVY_GLOW }}
      aria-hidden="true"
    >
      <Sparkles className="size-4 text-[#a5d8ff]" />
    </span>
  );
}

function StaffAvatar({ name }: { name: string }) {
  return (
    <span
      className="mt-5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundImage: NAVY_GRADIENT, boxShadow: NAVY_GLOW }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A note from the chat itself (not a person): the greeting, confirmations, offers. */
export function AssistantNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <AssistantAvatar />
      <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-md border border-[#cfe3ff] bg-[#eaf3ff] px-4 py-3 text-sm leading-relaxed text-[#0b2a55] dark:border-white/10 dark:bg-[#0b2550]/60 dark:text-[#d7e9ff]">
        {children}
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  showMeta,
  onRetry,
}: {
  message: PendingMessage;
  /** The last bubble of a run from one side shows its time (and send state). */
  showMeta: boolean;
  onRetry?: (id: string) => void;
}) {
  if (message.sender === "staff") {
    const name = message.staffName?.trim() || "mpillow";
    return (
      <div className="flex items-start gap-2.5">
        <StaffAvatar name={name} />
        <div className="min-w-0 max-w-[80%]">
          <p className="mb-1 pl-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {name} <span className="text-slate-400 dark:text-slate-500">· mpillow team</span>
          </p>
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-slate-200/80 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-800 shadow-[0_6px_20px_-14px_rgba(0,23,54,0.45)] dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100">
            {message.body}
          </div>
          {showMeta ? <p className="mt-1 pl-1 text-[11px] text-slate-400">{timeOf(message.createdAt)}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-[0_10px_28px_-14px_rgba(18,152,255,0.9)] transition-opacity",
          (message.pending || message.held) && "opacity-70",
          message.failed && "opacity-60 ring-2 ring-rose-400/70",
        )}
        style={{ backgroundImage: CUSTOMER_GRADIENT, boxShadow: "inset 1px 1px 1.5px rgba(214,236,255,0.55)" }}
      >
        {message.body}
      </div>
      {message.failed ? (
        <button
          type="button"
          onClick={() => onRetry?.(message.id)}
          className="mt-1 inline-flex min-h-8 items-center gap-1 pr-1 text-xs font-medium text-rose-500 hover:text-rose-600 max-md:min-h-11"
        >
          <RotateCcw className="size-3" aria-hidden="true" /> Not sent · Try again
        </button>
      ) : showMeta ? (
        <p className="mt-1 pr-1 text-[11px] text-slate-400">
          {message.held ? "Not sent yet" : message.pending ? "Sending…" : `Sent ${timeOf(message.createdAt)}`}
        </p>
      ) : null}
    </div>
  );
}

/** A light-surface card inside the thread: the email check and its code. */
export function ChatCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <AssistantAvatar />
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl rounded-tl-md border border-[#cfe3ff] bg-white p-4 shadow-[0_12px_32px_-18px_rgba(18,152,255,0.55)] dark:border-white/10 dark:bg-[#071a3a]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-[#1298ff]/15 blur-2xl"
        />
        <p className="relative flex items-center gap-2 text-sm font-semibold text-[#0b2a55] dark:text-white">
          <span className="text-[#1f74e0] dark:text-[#7cc2ff]">{icon}</span>
          {title}
        </p>
        <div className="relative mt-1.5 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </div>
  );
}

export function GradientButton({
  children,
  busy,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-60 max-md:min-h-11",
        className,
      )}
      style={{ backgroundImage: CUSTOMER_GRADIENT, boxShadow: "inset 1px 1px 1.5px rgba(214,236,255,0.6), 0 8px 20px -10px rgba(18,152,255,0.9)" }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function QuietButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-full px-3 text-sm font-medium text-slate-500 transition-colors hover:text-[#0b2a55] max-md:min-h-11 dark:text-slate-400 dark:hover:text-white",
        className,
      )}
    />
  );
}

export function ChatInput({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-base text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[#1298ff] focus:bg-white focus:shadow-[0_0_0_4px_rgba(18,152,255,0.15)] md:text-sm dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-white/10"
      />
    </div>
  );
}

/**
 * Six code boxes over one real input, so pasting, the phone's code suggestion
 * and autofill all work as in a plain field. Calls `onComplete` once all six
 * digits are in.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  length = 6,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <div className="relative w-full max-w-[19rem]">
      <input
        ref={ref}
        aria-label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, length);
          onChange(next);
          if (next.length === length && value.length !== length) onComplete?.(next);
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-text text-base opacity-0 disabled:cursor-not-allowed"
      />
      <div aria-hidden="true" className="flex gap-1.5 sm:gap-2">
        {Array.from({ length }, (_, i) => {
          const digit = value[i];
          const current = focused && (i === value.length || (i === length - 1 && value.length === length));
          return (
            <span
              key={i}
              className={cn(
                "flex h-12 min-w-0 max-w-11 flex-1 items-center justify-center rounded-xl border text-lg font-semibold tabular-nums transition-[border-color,box-shadow,background-color]",
                digit
                  ? "border-[#1298ff]/40 bg-[#eaf3ff] text-[#0b2a55] dark:border-[#7cc2ff]/30 dark:bg-[#0b2550]/70 dark:text-white"
                  : "border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/5",
                current && "border-[#1298ff] bg-white shadow-[0_0_0_4px_rgba(18,152,255,0.15)] dark:bg-white/10",
                disabled && "opacity-60",
              )}
            >
              {digit ?? (current ? <span className="h-5 w-px bg-[#1298ff] motion-safe:animate-pulse" /> : null)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The message box: grows with its text up to a few lines; Enter sends,
 * Shift+Enter starts a new line. `tone` picks the glass-on-navy look of the
 * launcher or the light look inside a chat.
 */
export function Composer({
  onSend,
  disabled,
  placeholder,
  tone,
  maxLength,
  autoFocus,
  draft,
  onDraftChange,
}: {
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder: string;
  tone: "glass" | "light";
  maxLength: number;
  autoFocus?: boolean;
  draft: string;
  onDraftChange: (text: string) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  useEffect(() => {
    const el = ref.current;
    if (!autoFocus || !el) return;
    el.focus({ preventScroll: true });
    // A suggestion fills the box: keep typing after it, not before.
    el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    onDraftChange("");
    const ok = await onSend(text);
    if (!ok) onDraftChange(text);
    setSending(false);
    ref.current?.focus({ preventScroll: true });
  };

  const glass = tone === "glass";
  const empty = !draft.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cn(
        "group relative flex items-end gap-2 rounded-[22px] p-2 pl-4 transition-[box-shadow,border-color]",
        glass
          ? "border border-white/20 bg-white/[0.08] backdrop-blur-md focus-within:border-[#a5d8ff]/70 focus-within:shadow-[0_0_0_4px_rgba(18,152,255,0.25),0_20px_50px_-20px_rgba(18,152,255,0.8)]"
          : "border border-slate-200 bg-white shadow-[0_8px_30px_-18px_rgba(0,23,54,0.35)] focus-within:border-[#1298ff]/60 focus-within:shadow-[0_0_0_4px_rgba(18,152,255,0.12),0_8px_30px_-18px_rgba(0,23,54,0.35)] dark:border-white/10 dark:bg-white/[0.06]",
      )}
    >
      <label htmlFor={id} className="sr-only">
        Your message
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={1}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        className={cn(
          "max-h-[140px] min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 outline-none md:text-[15px]",
          glass ? "text-white placeholder:text-[#bcd8ff]/70" : "text-slate-900 placeholder:text-slate-400 dark:text-white",
        )}
      />
      <button
        type="submit"
        aria-label="Send message"
        disabled={empty || sending || disabled}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-[transform,opacity,filter] hover:brightness-110 active:scale-95 disabled:opacity-40"
        style={{ backgroundImage: SEND_GRADIENT, boxShadow: "inset 1px 1px 1.8px rgba(255,255,255,0.6), 0 8px 22px -8px rgba(18,152,255,0.9)" }}
      >
        {sending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-5" aria-hidden="true" />}
      </button>
      {draft.length > maxLength - 200 ? (
        <span className={cn("absolute -top-6 right-3 text-[11px]", glass ? "text-[#bcd8ff]" : "text-slate-400")}>
          {draft.length}/{maxLength}
        </span>
      ) : null}
    </form>
  );
}

/**
 * A signed-in customer's chats, over whichever surface opened it. `safeArea`:
 * that surface fills a phone's screen, so keep clear of the notch and home bar.
 */
export function HistoryPanel({
  chats,
  activeId,
  onClose,
  onOpen,
  onNew,
  safeArea = false,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  onClose: () => void;
  onOpen: (id: string) => Promise<void>;
  onNew: () => void;
  safeArea?: boolean;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      // Its own radius: a backdrop blur ignores the parent's rounded clip and would square the corners.
      className="absolute inset-0 z-20 flex flex-col rounded-[inherit] bg-[#001736]/85 backdrop-blur-xl"
      role="dialog"
      aria-label="Your chats"
    >
      <div className={cn("flex items-center gap-3 px-5 pb-3 pt-5", safeArea && "max-md:pt-[calc(var(--safe-top)+1.25rem)]")}>
        <History className="size-5 text-[#a5d8ff]" aria-hidden="true" />
        <p className="flex-1 text-base font-semibold">Your chats</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/10 hover:bg-white/20 max-md:size-11"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3 sm:px-5">
        {chats.length === 0 ? <p className="px-2 py-6 text-sm text-[#bcd8ff]">No chats yet.</p> : null}
        {chats.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={async () => {
              setOpening(c.id);
              await onOpen(c.id);
              setOpening(null);
            }}
            className={cn(
              "group flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
              c.id === activeId ? "border-[#a5d8ff]/50 bg-white/15" : "border-white/10 bg-white/[0.06] hover:bg-white/[0.12]",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm text-white">{c.preview}</span>
              <span className="mt-1 flex items-center gap-2 text-[11px] text-[#bcd8ff]">
                #{c.ref} · {DATE.format(new Date(c.lastMessageAt))}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
                    c.status === "open" ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-[#cfe3ff]",
                  )}
                >
                  {c.status === "open" ? "Open" : "Ended"}
                </span>
              </span>
            </span>
            {opening === c.id ? (
              <Loader2 className="size-4 animate-spin text-[#a5d8ff]" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4 text-[#a5d8ff] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <div className={cn("border-t border-white/10 p-3 sm:px-5", safeArea && "max-md:pb-[calc(var(--safe-bottom)+0.75rem)]")}>
        <GradientButton type="button" onClick={onNew} className="w-full">
          <Plus className="size-4" aria-hidden="true" /> Start a new chat
        </GradientButton>
      </div>
    </motion.div>
  );
}
