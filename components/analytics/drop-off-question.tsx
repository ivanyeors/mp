"use client";

import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { readJourneyIds } from "@/components/analytics/journey-tracker";
import { openSupportChat } from "@/components/support/support-chat-root";
import {
  DROP_OFF_REASON_LABEL,
  DROP_OFF_TEXT_MAX,
  IDLE_MS,
  TEXT_REASONS,
  dropOffStepForPath,
  isEngaged,
  isExitIntent,
  isStaffEdit,
  mayAsk,
  shuffledReasons,
  type DropOffReason,
  type SiteDropOffStep,
} from "@/lib/analytics/drop-off/reasons";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

const ASKED_KEY = "mp_dropoff_asked_at";

let askedThisLoad = false;

function readAskedAt(): string | null {
  try {
    return localStorage.getItem(ASKED_KEY);
  } catch {
    return null;
  }
}

function writeAskedAt(iso: string) {
  try {
    localStorage.setItem(ASKED_KEY, iso);
  } catch {}
}

function fieldHasFocus(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

type Asked = { step: SiteDropOffStep; path: string };

function sendAnswer(asked: Asked, reason: DropOffReason, text: string | null) {
  const body = JSON.stringify({ step: asked.step, reason, text, path: asked.path, ...readJourneyIds() });
  void fetch("/api/analytics/drop-off-reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

type Phase = { kind: "ask" } | { kind: "text"; reason: DropOffReason } | { kind: "thanks"; reason: DropOffReason };

export function DropOffQuestion() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = (href: string) => withLocale(href, locale);
  const step = dropOffStepForPath(pathname);

  const [asked, setAsked] = useState<Asked | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const [order, setOrder] = useState<DropOffReason[]>([]);
  const [text, setText] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const cardRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<{ asked: Asked; reason: DropOffReason } | null>(null);
  const open = asked !== null;

  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (asked) {
      setAsked(null);
      setAnnouncement("");
    }
  }

  useEffect(() => {
    const flush = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      sendAnswer(pending.asked, pending.reason, null);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [pathname]);

  useEffect(() => {
    if (!step || open || askedThisLoad || isStaffEdit(window.location.search)) return;
    if (!mayAsk(readAskedAt(), new Date())) return;
    const enteredAt = Date.now();
    let started = false;
    let lastActivity = enteredAt;
    const onStart = () => {
      started = true;
      lastActivity = Date.now();
    };
    const onActivity = () => {
      lastActivity = Date.now();
    };
    const ready = () =>
      !askedThisLoad &&
      isEngaged({ enteredAt, interactions: started ? 1 : 0, now: Date.now() }) &&
      !fieldHasFocus() &&
      mayAsk(readAskedAt(), new Date());
    const ask = () => {
      askedThisLoad = true;
      writeAskedAt(new Date().toISOString());
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setAsked({ step, path: window.location.pathname });
      setOrder(shuffledReasons(step));
      setPhase({ kind: "ask" });
      setText("");
      setAnnouncement("A short question appeared at the bottom of the page: What stopped you today?");
    };
    const onMouseOut = (e: MouseEvent) => {
      if (isExitIntent(e) && ready()) ask();
    };
    const idle = window.setInterval(() => {
      if (Date.now() - lastActivity >= IDLE_MS && ready()) ask();
    }, 5_000);
    const startEvents = ["pointerdown", "keydown"] as const;
    const activityEvents = ["pointermove", "input", "scroll"] as const;
    for (const e of startEvents) document.addEventListener(e, onStart, { passive: true, capture: true });
    for (const e of activityEvents) document.addEventListener(e, onActivity, { passive: true, capture: true });
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      window.clearInterval(idle);
      for (const e of startEvents) document.removeEventListener(e, onStart, { capture: true });
      for (const e of activityEvents) document.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, [step, open]);

  useEffect(() => {
    if (phase.kind === "text") textRef.current?.focus();
    if (phase.kind === "thanks") thanksRef.current?.focus();
  }, [phase.kind]);

  const close = () => {
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      sendAnswer(pending.asked, pending.reason, null);
    }
    const focusInCard = cardRef.current?.contains(document.activeElement) ?? false;
    setAsked(null);
    setAnnouncement("");
    if (focusInCard) {
      const back = returnFocusRef.current;
      if (back?.isConnected && back !== document.body) back.focus();
      else (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  const choose = (reason: DropOffReason) => {
    if (!asked) return;
    if (TEXT_REASONS.includes(reason)) {
      pendingRef.current = { asked, reason };
      setPhase({ kind: "text", reason });
      return;
    }
    sendAnswer(asked, reason, null);
    setPhase({ kind: "thanks", reason });
  };
  const sendText = (reason: DropOffReason) => {
    if (!asked) return;
    pendingRef.current = null;
    sendAnswer(asked, reason, text.trim() || null);
    setPhase({ kind: "thanks", reason });
  };

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {open && step ? (
        <section
          ref={cardRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="drop-off-question-title"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className={cn(
            "fixed inset-x-3 z-50 flex flex-col rounded-2xl border bg-background shadow-lg",
            "bottom-[calc(0.75rem+var(--app-dock-clearance))] max-h-[calc(100dvh_-_1.5rem_-_var(--app-dock-clearance))]",
            "md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px] md:max-h-[calc(100dvh_-_3rem)]",
          )}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="overflow-y-auto overscroll-contain p-4">
            {phase.kind === "ask" && (
              <>
                <h2 id="drop-off-question-title" className="pr-8 text-base font-semibold">
                  What stopped you today?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  One tap helps us improve. We don&apos;t ask for your name or email.
                </p>
                <div className="mt-3 grid gap-2">
                  {order.map((reason) => (
                    <Button
                      key={reason}
                      type="button"
                      variant="outline"
                      className="h-auto min-h-10 justify-start whitespace-normal py-2 text-left"
                      onClick={() => choose(reason)}
                    >
                      {DROP_OFF_REASON_LABEL[reason]}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {phase.kind === "text" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendText(phase.reason);
                }}
              >
                <h2 id="drop-off-question-title" className="pr-8 text-base font-semibold">
                  {phase.reason === "not_working" ? "What happened?" : "Tell us more"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Optional. Please leave out personal details.</p>
                <label htmlFor="drop-off-text" className="sr-only">
                  {phase.reason === "not_working" ? "What happened?" : "Tell us more"}
                </label>
                <Textarea
                  ref={textRef}
                  id="drop-off-text"
                  className="mt-3"
                  rows={3}
                  maxLength={DROP_OFF_TEXT_MAX}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="mt-3 flex justify-end">
                  <Button type="submit">Send</Button>
                </div>
              </form>
            )}

            {phase.kind === "thanks" && (
              <DropOffHelp reason={phase.reason} to={to} headingRef={thanksRef} onDone={close} />
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}

function DropOffHelp({
  reason,
  to,
  headingRef,
  onDone,
}: {
  reason: DropOffReason;
  to: (href: string) => string;
  headingRef: Ref<HTMLHeadingElement>;
  onDone: () => void;
}) {
  const chat = (
    <Button
      type="button"
      onClick={() => {
        openSupportChat();
        onDone();
      }}
    >
      Chat with us
    </Button>
  );
  const fitting = (label: string) => (
    <Button asChild variant={reason === "size_or_feel" ? "outline" : "default"}>
      <Link href={to("/appointments?type=customisation")} onClick={onDone}>
        {label}
      </Link>
    </Button>
  );

  const copy: Record<DropOffReason, { title: string; body?: string; actions?: ReactNode }> = {
    size_or_feel: {
      title: "Thanks. We can help you choose.",
      body: "Ask us about size and firmness, or come in for a fitting.",
      actions: (
        <>
          {chat}
          {fitting("Book a fitting")}
        </>
      ),
    },
    try_in_person: {
      title: "Thanks. Come and try one.",
      body: "Book a time at one of our studios and we'll fit it with you.",
      actions: fitting("See our studios and book"),
    },
    delivery: {
      title: "Thanks for telling us.",
      body: "Here's how delivery and returns work.",
      actions: (
        <Button asChild>
          <Link href={to("/shipping-refund-policies")} onClick={onDone}>
            Delivery and returns
          </Link>
        </Button>
      ),
    },
    price: {
      title: "Thanks, that helps us.",
      body: "Questions about what's included? We're happy to explain.",
      actions: chat,
    },
    not_working: {
      title: "Thanks, we'll look into it.",
      body: "If you'd like help finishing now, we're here.",
      actions: chat,
    },
    just_looking: { title: "Thanks, take your time." },
    changed_mind: { title: "Thanks for telling us." },
    other: { title: "Thanks for telling us." },
  };
  const c = copy[reason];

  return (
    <div>
      <h2 ref={headingRef} id="drop-off-question-title" tabIndex={-1} className="pr-8 text-base font-semibold outline-none">
        {c.title}
      </h2>
      {c.body ? <p className="mt-1 text-sm text-muted-foreground">{c.body}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.actions}
        {c.actions ? null : (
          <Button type="button" variant="outline" onClick={onDone}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}
