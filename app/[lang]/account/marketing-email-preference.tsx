"use client";

import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MARKETING_EMAIL_LABEL, type MarketingEmailState } from "@/lib/marketing-consent/state";
import { unsubscribeAskOrder, type UnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons";
import { UnsubscribeReasonQuestion } from "@/components/marketing/unsubscribe-reason-question";
import { answerMyUnsubscribeReason, setMyMarketingEmail } from "./actions";

export function MarketingEmailPreference({ state: initialState }: { state: MarketingEmailState }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState<UnsubscribeReason[] | null>(null);

  const toggle = (subscribed: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setMyMarketingEmail({ subscribed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.state);
      setAsking(result.state === "unsubscribed" && !subscribed ? unsubscribeAskOrder() : null);
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Marketing</h2>
      <div className="flex items-start justify-between gap-4 rounded-lg border p-5 sm:p-6">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="marketing-email" className="font-medium">
            {MARKETING_EMAIL_LABEL}
          </Label>
          <p className="text-sm text-muted-foreground">
            New products and offers from Mpillow, by email. You can turn this off here at any time,
            or with the unsubscribe link in any of these emails. Order and appointment emails are not
            affected.
          </p>
        </div>
        <Switch
          id="marketing-email"
          checked={state === "subscribed"}
          disabled={pending}
          onCheckedChange={toggle}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {asking && state === "unsubscribed" ? (
        <UnsubscribeReasonQuestion order={asking} send={answerMyUnsubscribeReason} className="rounded-lg border p-5 sm:p-6" />
      ) : null}
    </section>
  );
}
