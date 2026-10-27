"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  mayAsk,
  shuffledReasons,
  type DropOffReason,
  type SiteDropOffStep,
} from "@/lib/analytics/drop-off/reasons";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

const ASKED_KEY = "mp_dropoff_asked_at";

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
  } catch {
    // Private mode: they may be asked again on a later visit, which is fine.
  }
}

/** A field they are typing in: never interrupt that. */
function fieldHasFocus(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function sendAnswer(step: SiteDropOffStep, reason: DropOffReason, text: string | null) {
  const body = JSON.stringify({ step, reason, text, path: window.location.pathname, ...readJourneyIds() });
  void fetch("/api/analytics/drop-off-reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

type Phase = { kind: "ask" } | { kind: "text"; reason: DropOffReason } | { kind: "thanks"; reason: DropOffReason };

/**
 * *What stopped you today?* (PRD-crm-retention-loop slice 10): one closed
 * question on the configurators and checkout, asked as a visitor moves to
 * leave, and help on the spot for the answer they give.
 *
 * Only once they have started (20 seconds and one interaction), then when the
 * pointer leaves through the top of the window or after a minute with no
 * interaction; never while a field has focus; once per browser per 30 days,
 * counted from when it is shown, so closing it counts. Never on other pages
 * and never in the Admin Panel (`dropOffStepForPath`). It takes no focus and
 * blocks nothing. Answers are anonymous, tied only to the journey tracker's
 * Visit.
 */
export function DropOffQuestion() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = (href: string) => withLocale(href, locale);
  const step = dropOffStepForPath(pathname);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const [order, setOrder] = useState<DropOffReason[]>([]);
  const [text, setText] = useState("");
  const [askedStep, setAskedStep] = useState<SiteDropOffStep | null>(null);

  useEffect(() => {
    if (!step || open || !mayAsk(readAskedAt(), new Date())) return;
    const enteredAt = Date.now();
    let interactions = 0;
    let lastInteraction = enteredAt;
    const onInteract = () => {
      interactions += 1;
      lastInteraction = Date.now();
    };
    const ready = () =>
      isEngaged({ enteredAt, interactions, now: Date.now() }) && !fieldHasFocus() && mayAsk(readAskedAt(), new Date());
    const ask = () => {
      writeAskedAt(new Date().toISOString());
      setAskedStep(step);
      setOrder(shuffledReasons(step));
      setPhase({ kind: "ask" });
      setText("");
      setOpen(true);
    };
    const onMouseOut = (e: MouseEvent) => {
      if (isExitIntent(e) && ready()) ask();
    };
    const idle = window.setInterval(() => {
      if (Date.now() - lastInteraction >= IDLE_MS && ready()) ask();
    }, 5_000);
    const events = ["pointerdown", "keydown", "input", "scroll"] as const;
    for (const e of events) document.addEventListener(e, onInteract, { passive: true, capture: true });
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      window.clearInterval(idle);
      for (const e of events) document.removeEventListener(e, onInteract, { capture: true });
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, [step, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !step || !askedStep) return null;
  const asked = askedStep;

  const choose = (reason: DropOffReason) => {
    if (TEXT_REASONS.includes(reason)) return setPhase({ kind: "text", reason });
    sendAnswer(asked, reason, null);
    setPhase({ kind: "thanks", reason });
  };
  const sendText = (reason: DropOffReason) => {
    sendAnswer(asked, reason, text.trim() || null);
    setPhase({ kind: "thanks", reason });
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="drop-off-question-title"
      className={cn(
        "fixed inset-x-3 z-50 rounded-2xl border bg-background p-4 shadow-lg",
        "bottom-[calc(0.75rem+var(--app-dock-clearance))] md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px]",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>

      {phase.kind === "ask" && (
        <>
          <h2 id="drop-off-question-title" className="pr-8 text-base font-semibold">
            What stopped you today?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">One tap helps us make it better. It&apos;s anonymous.</p>
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
        <DropOffHelp reason={phase.reason} to={to} onDone={() => setOpen(false)} />
      )}
    </section>
  );
}

/** Help on the spot for an answer. Never a discount. */
function DropOffHelp({ reason, to, onDone }: { reason: DropOffReason; to: (href: string) => string; onDone: () => void }) {
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
      <h2 id="drop-off-question-title" className="pr-8 text-base font-semibold">
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
