"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ChevronDown, History, MailCheck, Minus, MoreHorizontal, Phone, Plus, X } from "lucide-react";
import { SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import { authCallbackUrl } from "@/lib/site-url";
import { authErrorMessage } from "@/lib/auth/error-message";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ChatView as ChatRecord } from "@/lib/support/chat";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { opensKeyboard, useScreenBottomPin } from "@/hooks/use-screen-bottom-pin";
import { Launcher, MESSAGE_MAX } from "./support-chat-launcher";
import {
  AssistantNote,
  Aurora,
  BrandAvatar,
  ChatCard,
  ChatInput,
  chatStatusLine,
  CodeInput,
  Composer,
  DATE,
  GradientButton,
  HistoryPanel,
  MessageBubble,
  NAVY_GLOW,
  NAVY_GRADIENT,
  QuietButton,
} from "./support-chat-parts";
import type { SupportChatState } from "./support-chat-engine";
import { ChatRequestError, type ActiveChat, type Me } from "./use-support-chat";

const PHONE_QUERY = "(max-width: 767.98px)";

function subscribePhone(onChange: () => void) {
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function usePhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

const EASE = [0.22, 1, 0.36, 1] as const;

export default function SupportChatWindow({ state }: { state: SupportChatState }) {
  const { chat, view, setView, draft, setDraft, unread } = state;
  const reduceMotion = useReducedMotion();
  const phone = usePhone();
  const [showHistory, setShowHistory] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const pinBubble = useScreenBottomPin();
  const focusBubble = useRef(false);
  const open = view === "open";

  useEffect(() => {
    const el = panelRef.current;
    const vv = window.visualViewport;
    if (!open || !phone || !el) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const fit = () => {
      if (!vv) return;
      const height = opensKeyboard(document.activeElement) ? vv.height : window.innerHeight;
      el.style.height = `${height}px`;
      el.style.top = `${vv.offsetTop}px`;
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    document.addEventListener("focusin", fit);
    document.addEventListener("focusout", fit);
    return () => {
      root.style.overflow = overflow;
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      document.removeEventListener("focusin", fit);
      document.removeEventListener("focusout", fit);
      el.style.height = "";
      el.style.top = "";
    };
  }, [open, phone]);

  const minimise = () => {
    setShowHistory(false);
    focusBubble.current = true;
    setView("minimised");
  };

  const close = () => {
    setShowHistory(false);
    const active = chat.active;
    if (active?.awaitingCode) setDraft(chat.cancelHeld());
    else if (active?.chat.status === "ended") chat.startNew();
    setView("closed");
  };

  const windowActions = (
    <>
      <HeaderButton label="Minimise chat" onClick={minimise}>
        <Minus className="size-4 max-md:hidden" aria-hidden="true" />
        <ChevronDown className="size-5 md:hidden" aria-hidden="true" />
      </HeaderButton>
      <HeaderButton label="Close chat" onClick={close}>
        <X className="size-4" aria-hidden="true" />
      </HeaderButton>
    </>
  );

  const offscreen = phone ? { y: "100%" } : { opacity: 0, x: 48 };

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          key="window"
          ref={panelRef}
          aria-label="Your chat with the mpillow team"
          data-typography-scope="app"
          initial={reduceMotion ? false : offscreen}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={reduceMotion ? undefined : offscreen}
          transition={{ duration: 0.4, ease: EASE }}
          onKeyDown={(e) => {
            if (e.key !== "Escape" || !e.currentTarget.contains(e.target as Node)) return;
            if (showHistory) setShowHistory(false);
            else minimise();
          }}
          className="fixed inset-x-0 top-0 z-50 isolate flex h-[100dvh] flex-col overflow-hidden text-white md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:h-auto md:w-[420px] md:rounded-[28px] md:shadow-[0_28px_80px_-24px_rgba(0,23,54,0.6)]"
          style={{ backgroundImage: NAVY_GRADIENT }}
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: NAVY_GLOW }} />
          <Aurora />

          <AnimatePresence mode="wait" initial={false}>
            {chat.active ? (
              <motion.div
                key="session"
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="relative flex min-h-0 flex-1 flex-col"
              >
                <Session
                  me={chat.me}
                  active={chat.active}
                  controller={chat}
                  draft={draft}
                  setDraft={setDraft}
                  autoFocus={!phone}
                  onShowHistory={() => setShowHistory(true)}
                  actions={windowActions}
                />
              </motion.div>
            ) : (
              <motion.div
                key="launcher"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain max-md:pt-[var(--safe-top)] max-md:pb-[var(--safe-bottom)]"
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
                  autoFocus={!phone}
                  actions={windowActions}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showHistory && chat.me.status === "signed-in" ? (
              <HistoryPanel
                safeArea
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
      ) : null}

      {view === "minimised" ? (
        <motion.div
          key="bubble"
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.85 }}
          transition={{ duration: 0.3, ease: EASE }}
          ref={pinBubble}
          className="fixed right-4 z-50 md:right-6"
          style={{
            bottom:
              "calc(max(var(--safe-bottom), var(--app-dock-clearance), var(--mobile-bottom-bar-height, 0px)) + var(--analytics-notice-clearance, 0px) + 1rem - var(--screen-pin-offset, 0px))",
          }}
        >
          <ChatBubble
            active={chat.active}
            unread={unread}
            onOpen={() => setView("open")}
            buttonRef={(el) => {
              if (el && focusBubble.current) {
                focusBubble.current = false;
                el.focus({ preventScroll: true });
              }
            }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function HeaderButton({ label, className, ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-50 max-md:size-11",
        className,
      )}
    />
  );
}

function ChatBubble({
  active,
  unread,
  onOpen,
  buttonRef,
}: {
  active: ActiveChat | null;
  unread: number;
  onOpen: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const line = active ? chatStatusLine(active) : "Ask us anything";
  const replies = unread === 1 ? "1 new reply" : `${unread} new replies`;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onOpen}
      aria-label={unread > 0 ? `Open your chat with the mpillow team, ${replies}` : "Open your chat with the mpillow team"}
      className="group relative flex items-center gap-3 rounded-full p-1.5 text-left text-white transition-transform hover:-translate-y-0.5 active:scale-[0.97] lg:pr-5"
      style={{ backgroundImage: NAVY_GRADIENT, boxShadow: `${NAVY_GLOW}, 0 18px 40px -16px rgba(0,23,54,0.7)` }}
    >
      <BrandAvatar size={48} live={!active || active.chat.status === "open"} />
      <span className="hidden min-w-0 lg:block">
        <span className="block text-sm font-semibold">mpillow team</span>
        <span className="block max-w-52 truncate text-xs text-[#bcd8ff]">{line}</span>
      </span>
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1298ff] px-1 text-[11px] font-semibold ring-2 ring-white dark:ring-[#001736]">
          {unread}
        </span>
      ) : null}
    </button>
  );
}

type Controller = SupportChatState["chat"];

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
  autoFocus,
  onShowHistory,
  actions,
}: {
  me: Me;
  active: ActiveChat;
  controller: Controller;
  draft: string;
  setDraft: (text: string) => void;
  autoFocus: boolean;
  onShowHistory: () => void;
  actions: ReactNode;
}) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [ending, setEnding] = useState(false);
  const { chat } = active;
  const [ended, setEnded] = useState<{ chatId: string; emailed: boolean } | null>(null);
  const endedEmailed = ended?.chatId === chat.id ? ended.emailed : null;
  const signedIn = me.status === "signed-in";
  const creating = !chat.id;
  const open = chat.status === "open";
  const firstCustomer = active.messages.findIndex((m) => m.sender === "customer");

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
      <header className="relative flex items-center gap-2 px-4 pb-3 pt-4 max-md:pt-[calc(var(--safe-top)+0.75rem)] sm:px-5">
        <BrandAvatar size={40} live={open} />
        <div className="ml-1 min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">mpillow team</p>
          <p className="truncate text-xs text-[#bcd8ff]" aria-live="polite">
            {chatStatusLine(active)}
          </p>
        </div>
        {open ? (
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/20 max-md:min-h-11"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            Call us
          </a>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <HeaderButton label="Chat options" disabled={creating}>
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </HeaderButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {signedIn ? (
              <DropdownMenuItem onSelect={onShowHistory}>
                <History className="size-4" aria-hidden="true" /> Your chats
              </DropdownMenuItem>
            ) : null}
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
        {actions}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[22px] bg-[#f3f7ff] text-slate-900 dark:bg-[#030d22] dark:text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(18,152,255,0.12),transparent)]"
        />
        <div
          ref={threadRef}
          role="log"
          aria-label="Messages"
          className="relative flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5"
        >
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
                  transition={{ duration: 0.25, ease: EASE }}
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
              transition={{ duration: 0.3, delay: 0.15, ease: EASE }}
            >
              <EmailCheck controller={controller} onEdit={() => setDraft(controller.cancelHeld())} />
            </motion.div>
          ) : null}
        </div>

        <div className="relative border-t border-slate-200/70 bg-[#f3f7ff] p-2.5 max-md:pb-[calc(var(--safe-bottom)+0.625rem)] sm:p-3 dark:border-white/10 dark:bg-[#030d22]">
          {open ? (
            <>
              <Composer
                tone="light"
                placeholder={active.awaitingCode ? "Check your email first…" : "Write a message…"}
                maxLength={MESSAGE_MAX}
                draft={draft}
                onDraftChange={setDraft}
                disabled={creating}
                autoFocus={autoFocus && !active.awaitingCode}
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

function EndedFooter({ chat, emailed, onNew }: { chat: ChatRecord; emailed: boolean | null; onNew: () => void }) {
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
