"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AgreementContent } from "@/components/partner/agreement-content";
import { reacceptAgreement } from "@/app/[lang]/partner/apply/actions";

/**
 * Shown on hub entry when an approved partner's accepted agreement version is
 * stale (see `needsReaccept`). Accepting records the current version and reloads
 * the hub, which then renders the dashboard.
 */
export function ReacceptForm({ lang }: { lang: string }) {
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Updated Partner Agreement</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Our Partner Agreement has changed. Please review and accept the updated terms to continue
          to your Partner Hub.
        </p>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-4">
        <AgreementContent />
      </div>

      <label className="flex items-start gap-3 text-sm">
        <Checkbox
          checked={agreed}
          onCheckedChange={(c) => setAgreed(c === true)}
          aria-label="I agree to the updated terms"
          className="mt-0.5"
        />
        <span>I have read and agree to the updated terms.</span>
      </label>

      <Button
        disabled={!agreed || pending}
        className="w-full"
        onClick={() => startTransition(() => reacceptAgreement(lang))}
      >
        {pending ? "Saving…" : "Accept and continue"}
      </Button>
    </div>
  );
}
