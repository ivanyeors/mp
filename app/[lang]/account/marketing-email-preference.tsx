"use client";

import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MARKETING_EMAIL_LABEL, type MarketingEmailState } from "@/lib/marketing-consent/state";
import { setMyMarketingEmail } from "./actions";

/**
 * The Profile's "Email me news and offers" toggle (PRD-shopify-customer-migration
 * slice 07): the customer's own Marketing consent. On is `subscribed`; off is
 * `unsubscribed`. A Customer nobody has asked (`not_subscribed`) sees it off.
 * Every change is recorded with source `account`.
 */
export function MarketingEmailPreference({ state: initialState }: { state: MarketingEmailState }) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (subscribed: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setMyMarketingEmail({ subscribed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.state);
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
    </section>
  );
}
