"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ChevronRight, History, Loader2, Lock, MailCheck, MoreHorizontal, Plus, X } from "lucide-react";
import { authCallbackUrl } from "@/lib/site-url";
import { authErrorMessage } from "@/lib/auth/error-message";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ChatSummary, ChatView } from "@/lib/support/chat";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  AssistantNote,
  BrandAvatar,
  ChatCard,
  ChatInput,
  CodeInput,
  Composer,
  GradientButton,
  MessageBubble,
  NAVY_GLOW,
  NAVY_GRADIENT,
  QuietButton,
} from "./support-chat-parts";
import { ChatRequestError, useSupportChat, type ActiveChat, type Me, type Verified } from "./use-support-chat";

/**
 * The "Get in touch" chat on /support. It starts as a composer on the brand
 * gradient; the first message turns it into a chat with the mpillow team,
 * whose replies come from the staff Telegram group (lib/support/chat.ts).
 *
 * Before a visitor without an account sends their first message, the chat
 * checks their email with a 6-digit code; the message waits, unsent, in the
 * chat meanwhile. That checked address then gets the chat by email when
 * they're done, with no second code. In the same step they can choose an
 * account instead (Supabase's own sign-in code), which keeps this chat and
 * every later one. Without an account the chat lasts as long as the tab.
 */

const MESSAGE_MAX = 2000;

const SUGGESTIONS = [
  "Which pillow size fits me?",
  "Book or change a fitting",
  "Where's my order?",
  "My pillow needs adjusting",
] as const;

const DATE = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" });

export function SupportChat() {
  const chat = useSupportChat();
  const reduceMotion = useReducedMotion();
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState("");
  const inSession = Boolean(chat.active);

  return (
    <motion.section
      layout={!reduceMotion}
      transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
      aria-label="Chat with the mpillow team"
      // An app surface: the marketing pages' forced paragraph size would unbalance the bubbles.
      data-typography-scope="app"
      className={cn(
        "relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_40px_90px_-40px_rgba(18,152,255,0.65)]",
        inSession && "flex h-[min(80svh,720px)] flex-col",
      )}
      style={{ backgroundImage: NAVY_GRADIENT }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: NAVY_GLOW }} />
      <Aurora />

      {chat.restoring ? (
        <div className="relative flex min-h-[340px] items-center justify-center" role="status">
          <Loader2 className="size-6 animate-spin text-[#a5d8ff]" aria-hidden="true" />
          <span className="sr-only">Loading the chat…</span>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {chat.active ? (
            <motion.div
              key="session"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex min-h-0 flex-1 flex-col"
            >
              <Session
                me={chat.me}
                active={chat.active}
                controller={chat}
                draft={draft}
                setDraft={setDraft}
                onShowHistory={() => setShowHistory(true)}
              />
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
                onSend={(text, company) => chat.send(text, { company })}
                onShowHistory={() => setShowHistory(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {showHistory && chat.me.status === "signed-in" ? (
          <HistoryPanel
            chats={chat.me.chats}
            activeId={chat.active?.chat.id ?? null}
            onClose={() => setShowHistory(false)}
            onOpen={async (id) => {
              await chat.openChat(id);
              setShowHistory(false);
            }}
            onNew={() => {
              chat.startNew();
              setShowHistory(false);
            }}
          />
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

/** Two slow, blurred blue lights behind the glass. */
function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <div className="mp-chat-aurora-a absolute -left-24 -top-28 size-80 rounded-full bg-[#1298ff]/35 blur-3xl" />
      <div className="mp-chat-aurora-b absolute -bottom-32 -right-16 size-96 rounded-full bg-[#66a7ff]/25 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#a5d8ff]/60 to-transparent" />
    </div>
  );
}

function Launcher({
  me,
  verified,
  onForgetVerified,
  error,
  draft,
  setDraft,
  onSend,
  onShowHistory,
}: {
  me: Me;
  verified: Verified | null;
  onForgetVerified: () => void;
  error: string | null;
  draft: string;
  setDraft: (text: string) => void;
  onSend: (text: string, company: string) => Promise<boolean>;
  onShowHistory: () => void;
}) {
  const [company, setCompany] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  return (
    <div className="relative p-5 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandAvatar size={44} live />
          <div>
            <p className="text-sm font-semibold">mpillow team</p>
            <p className="text-xs text-[#bcd8ff]">Real people · usually reply within a few hours</p>
          </div>
        </div>
        {me.status === "signed-in" && me.chats.length > 0 ? (
          <button
            type="button"
            onClick={onShowHistory}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/15 max-md:min-h-11"
          >
            <History className="size-3.5" aria-hidden="true" />
            Past chats
            <span className="rounded-full bg-[#1298ff] px-1.5 text-[10px] leading-4">{me.chats.length}</span>
          </button>
        ) : null}
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
          autoFocus={focusKey > 0}
          onSend={(text) => onSend(text, company)}
        />
        {/* Honeypot: hidden from people, filled by bots. */}
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

type Controller = ReturnType<typeof useSupportChat>;

function headerStatus(active: ActiveChat): string {
  if (active.awaitingCode) return "Check your email to send this";
  if (!active.chat.id) return "Starting your chat…";
  if (active.chat.status === "ended") return `Chat #${active.chat.ref} · ended`;
  const last = active.messages.at(-1);
  if (last?.sender === "staff") return `${last.staffName?.trim() || "The team"} replied · Chat #${active.chat.ref}`;
  return `Sent · we usually reply within a few hours`;
}

/** Where the chat goes once it's over, said once under the first message. */
function afterNote(active: ActiveChat): string {
  const { email, hasAccount } = active.chat;
  if (active.signedInHere) return "You're signed in, so this chat is saved to your account, and we'll email you a copy when you're done.";
  if (hasAccount) return `It's saved to your account, and we'll email a copy to ${email} when you're done.`;
  return `When you're done, we'll email this chat to ${email}, and any reply that arrives after you've left.`;
}

function Session({
  me,
  active,
  controller,
  draft,
  setDraft,
  onShowHistory,
}: {
  me: Me;
  active: ActiveChat;
  controller: Controller;
  draft: string;
  setDraft: (text: string) => void;
  onShowHistory: () => void;
}) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [ending, setEnding] = useState(false);
  const { chat } = active;
  // Whether this chat's transcript went when the customer ended it.
  const [ended, setEnded] = useState<{ chatId: string; emailed: boolean } | null>(null);
  const endedEmailed = ended?.chatId === chat.id ? ended.emailed : null;
  const signedIn = me.status === "signed-in";
  const creating = !chat.id;
  const open = chat.status === "open";
  const firstCustomer = active.messages.findIndex((m) => m.sender === "customer");

  // Keep the newest message (or card) in view.
  const tail = `${active.messages.length}:${active.awaitingCode}:${chat.id}:${chat.status}`;
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [tail]);

  const endChat = async () => {
    setEnding(true);
    try {
      const { emailed } = await controller.end();
      setEnded({ chatId: chat.id, emailed });
    } catch (e) {
      controller.setError(e instanceof Error ? e.message : "We couldn't end the chat.");
    } finally {
      setEnding(false);
    }
  };

  return (
    <>
      <header className="relative flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
        <BrandAvatar size={40} live={open} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">mpillow team</p>
          <p className="truncate text-xs text-[#bcd8ff]" aria-live="polite">
            {headerStatus(active)}
          </p>
        </div>
        {signedIn ? (
          <button
            type="button"
            onClick={onShowHistory}
            aria-label="Your chats"
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 max-md:size-11"
          >
            <History className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Chat options"
              disabled={creating}
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-50 max-md:size-11"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => controller.startNew()}>
              <Plus className="size-4" aria-hidden="true" /> Start a new chat
            </DropdownMenuItem>
            {open ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void endChat()} disabled={ending} variant="destructive">
                  <X className="size-4" aria-hidden="true" /> End chat
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative mx-1.5 mb-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-[#f3f7ff] text-slate-900 dark:bg-[#030d22] dark:text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(18,152,255,0.12),transparent)]"
        />
        <div ref={threadRef} role="log" aria-label="Messages" className="relative flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-5">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            {DATE.format(new Date(chat.createdAt))}
          </p>
          <AssistantNote>
            Hi there 👋 You&apos;re chatting with the mpillow team. Ask us anything — a real person replies here.
          </AssistantNote>

          <AnimatePresence initial={false}>
            {active.messages.map((m, i) => {
              const next = active.messages[i + 1];
              return (
                <motion.div
                  key={m.id}
                  layout="position"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  <MessageBubble message={m} showMeta={!next || next.sender !== m.sender} onRetry={controller.retry} />
                  {i === firstCustomer && !creating ? (
                    active.delivered || active.messages.length > 1 ? (
                      <AssistantNote>
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" /> Sent to our team
                        </span>
                        <br />
                        We usually reply within a few hours, right here in this chat. {afterNote(active)}
                      </AssistantNote>
                    ) : (
                      <AssistantNote>
                        Our team may not have got this yet. If it&apos;s urgent, message us on WhatsApp too.
                      </AssistantNote>
                    )
                  ) : null}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {active.awaitingCode ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              <EmailCheck controller={controller} onEdit={() => setDraft(controller.cancelHeld())} />
            </motion.div>
          ) : null}
        </div>

        <div className="relative border-t border-slate-200/70 bg-[#f3f7ff]/90 p-2.5 backdrop-blur sm:p-3 dark:border-white/10 dark:bg-[#030d22]/90">
          {open ? (
            <>
              <Composer
                tone="light"
                placeholder={active.awaitingCode ? "Check your email first…" : "Write a message…"}
                maxLength={MESSAGE_MAX}
                draft={draft}
                onDraftChange={setDraft}
                disabled={creating}
                autoFocus={!active.awaitingCode}
                onSend={(text) => controller.send(text)}
              />
              {controller.error ? <p className="mt-2 px-2 text-xs text-rose-600 dark:text-rose-300">{controller.error}</p> : null}
            </>
          ) : (
            <EndedFooter chat={chat} emailed={endedEmailed} onNew={controller.startNew} />
          )}
        </div>
      </div>
    </>
  );
}

function EndedFooter({ chat, emailed, onNew }: { chat: ChatView; emailed: boolean | null; onNew: () => void }) {
  const note = emailed
    ? `A copy is on its way to ${chat.email}.`
    : chat.hasAccount
      ? "It's saved to your account."
      : `We've emailed this chat to ${chat.email}.`;
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-2 text-center sm:flex-row sm:text-left">
      <p className="flex-1 text-sm text-slate-600 dark:text-slate-300">
        <span className="font-semibold text-[#0b2a55] dark:text-white">This chat has ended.</span> {note}
      </p>
      <GradientButton type="button" onClick={onNew}>
        <Plus className="size-4" aria-hidden="true" /> New chat
      </GradientButton>
    </div>
  );
}

const RESEND_AFTER_S = 30;

/**
 * The step before the first message goes out: an email and a 6-digit code.
 * Without an account it's our own code (./code), which checks the address and
 * nothing more. With "Save my chats" on it's Supabase's sign-in, the same as
 * the login page, which makes the account the first time.
 */
function EmailCheck({ controller, onEdit }: { controller: Controller; onEdit: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState(false);
  const [codeId, setCodeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const switchId = useId();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      if (account) {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: authCallbackUrl("/support#contact"),
            ...(name.trim() ? { data: { full_name: name.trim() } } : {}),
          },
        });
        if (error) throw new Error(authErrorMessage(error));
        setCodeId(null);
      } else {
        const res = await controller.requestCode(email.trim());
        setCodeId(res.codeId);
        setEmail(res.email);
      }
      setCode("");
      setStep("code");
      setResendIn(RESEND_AFTER_S);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      if (account) {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: value, type: "email" });
        if (error) throw new Error(authErrorMessage(error));
        await controller.startHeld({ signedIn: true, name: name.trim() || undefined });
      } else if (codeId) {
        await controller.startHeld({ codeId, code: value, name: name.trim() || undefined });
      }
    } catch (e) {
      setCode("");
      setError(e instanceof Error ? e.message : "We couldn't check that code.");
      if (e instanceof ChatRequestError && e.data.codeError && e.data.codeError !== "wrong") setResendIn(0);
      setBusy(false);
    }
  };

  if (step === "code") {
    return (
      <ChatCard icon={<MailCheck className="size-4" aria-hidden="true" />} title="Enter your code">
        <p>
          We sent a 6-digit code to <span className="font-medium text-[#0b2a55] dark:text-white">{email}</span>.
          {account ? " It signs you in to your mpillow account too." : " Enter it here and your message goes to our team."}
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(code);
          }}
        >
          <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} autoFocus />
          {error ? (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            <GradientButton type="submit" busy={busy} disabled={code.length !== 6}>
              Verify and send
            </GradientButton>
            <QuietButton onClick={() => void sendCode()} disabled={busy || resendIn > 0}>
              {resendIn > 0 ? `New code in ${resendIn}s` : "Send a new code"}
            </QuietButton>
            <QuietButton
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              disabled={busy}
            >
              Change email
            </QuietButton>
          </div>
        </form>
      </ChatCard>
    );
  }

  return (
    <ChatCard icon={<MailCheck className="size-4" aria-hidden="true" />} title="First, check your email">
      <p>
        Before this goes to our team, we&apos;ll email you a 6-digit code. That way our replies, and the copy of this
        chat we send when you&apos;re done, reach the right inbox.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <ChatInput label="Your name (optional)" placeholder="Name (optional)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <ChatInput
            label="Email"
            type="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sm:flex-[1.4]"
          />
        </div>
        <label
          htmlFor={switchId}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#cfe3ff] bg-[#f3f8ff] px-3.5 py-3 transition-colors hover:border-[#9ccaff] dark:border-white/10 dark:bg-white/[0.04]"
        >
          <Switch
            id={switchId}
            checked={account}
            onCheckedChange={setAccount}
            className={cn("mt-0.5", account ? "bg-[#1298ff]" : "bg-slate-300 dark:bg-white/20")}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[#0b2a55] dark:text-white">Save my chats to an account</span>
            <span className="block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Come back to this chat, and every one after it, any time. We&apos;ll make a free mpillow account with this
              email, or sign you in to yours. No password.
            </span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-1">
          <GradientButton type="submit" busy={busy}>
            Send code
          </GradientButton>
          <QuietButton onClick={onEdit} disabled={busy}>
            Edit message
          </QuietButton>
        </div>
      </form>
    </ChatCard>
  );
}

function HistoryPanel({
  chats,
  activeId,
  onClose,
  onOpen,
  onNew,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  onClose: () => void;
  onOpen: (id: string) => Promise<void>;
  onNew: () => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 z-20 flex flex-col bg-[#001736]/85 backdrop-blur-xl"
      role="dialog"
      aria-label="Your chats"
    >
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
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
      <div className="border-t border-white/10 p-3 sm:px-5">
        <GradientButton type="button" onClick={onNew} className="w-full">
          <Plus className="size-4" aria-hidden="true" /> Start a new chat
        </GradientButton>
      </div>
    </motion.div>
  );
}
