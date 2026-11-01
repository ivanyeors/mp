"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  UNSUBSCRIBE_QUESTION,
  UNSUBSCRIBE_QUESTION_HINT,
  UNSUBSCRIBE_REASON_LABEL,
  UNSUBSCRIBE_TEXT_MAX,
  type UnsubscribeReason,
} from "@/lib/marketing-consent/unsubscribe-reasons";

export type UnsubscribeAnswerResult = { ok: true } | { ok: false; error: string };

/**
 * *Mind telling us why?* (PRD-crm-retention-loop slice 11): asked once someone
 * is unsubscribed, on the unsubscribe page and in their account. One tap is
 * the answer; *Other* asks for an optional line first. Optional throughout:
 * the unsubscribe has already taken effect, and nothing here changes it. No
 * answer offers a discount or asks them to stay.
 *
 * `order` comes from the caller (`unsubscribeAskOrder`), so a page rendered on
 * the server and the browser agree on it. `send` records the answer: the
 * unsubscribe page's signed link, or the signed-in account.
 */
export function UnsubscribeReasonQuestion({
  order,
  send,
  className,
}: {
  order: readonly UnsubscribeReason[];
  send: (answer: { reason: UnsubscribeReason; text?: string }) => Promise<UnsubscribeAnswerResult>;
  className?: string;
}) {
  const [phase, setPhase] = useState<"ask" | "text" | "sending" | "thanks">("ask");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const thanksRef = useRef<HTMLParagraphElement>(null);

  const answer = async (reason: UnsubscribeReason, typed?: string) => {
    setError(null);
    setPhase("sending");
    const result = await send({ reason, ...(typed?.trim() ? { text: typed.trim() } : {}) }).catch(
      (): UnsubscribeAnswerResult => ({ ok: false, error: "Could not send that. Please try again." }),
    );
    if (!result.ok) {
      setError(result.error);
      setPhase(reason === "other" ? "text" : "ask");
      return;
    }
    setPhase("thanks");
    requestAnimationFrame(() => thanksRef.current?.focus());
  };

  if (phase === "thanks") {
    return (
      <p ref={thanksRef} tabIndex={-1} role="status" className={cn(className, "text-sm text-muted-foreground outline-none")}>
        Thank you for telling us.
      </p>
    );
  }

  return (
    // Its own sizes: public pages force every h2 to 24px (globals.css), which would make
    // this optional question louder than the page's own heading.
    <section aria-labelledby="unsubscribe-reason-title" data-typography-scope="app" className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h2 id="unsubscribe-reason-title" className="text-base font-semibold">
          {UNSUBSCRIBE_QUESTION}
        </h2>
        <p className="text-sm text-muted-foreground">{UNSUBSCRIBE_QUESTION_HINT}</p>
      </div>
      {phase === "text" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void answer("other", text);
          }}
          className="space-y-3"
        >
          <label htmlFor="unsubscribe-reason-text" className="text-sm font-medium">
            Tell us more <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="unsubscribe-reason-text"
            rows={3}
            maxLength={UNSUBSCRIBE_TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPhase("ask")}>
              Back
            </Button>
            <Button type="submit">Send</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          {order.map((reason) => (
            <Button
              key={reason}
              type="button"
              variant="outline"
              disabled={phase === "sending"}
              className="h-auto min-h-11 justify-start whitespace-normal py-2 text-left"
              onClick={() => (reason === "other" ? setPhase("text") : void answer(reason))}
            >
              {UNSUBSCRIBE_REASON_LABEL[reason]}
            </Button>
          ))}
        </div>
      )}
      {phase === "sending" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Sending…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** The unsubscribe page's way to send: the same signed link the unsubscribe used. */
export function UnsubscribeLinkReasonQuestion({
  order,
  u,
  t,
  s,
}: {
  order: readonly UnsubscribeReason[];
  u: string;
  t: string;
  s: string | null;
}) {
  return (
    <UnsubscribeReasonQuestion
      order={order}
      className="space-y-3 border-t pt-6"
      send={async (answer) => {
        const res = await fetch("/api/email/unsubscribe/reason", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ u, t, s, ...answer }),
        });
        if (res.ok) return { ok: true };
        // Already unsubscribed again, or resubscribed since: nothing to answer, nothing wrong.
        if (res.status === 409) return { ok: true };
        return { ok: false, error: "Could not send that. Please try again." };
      }}
    />
  );
}
