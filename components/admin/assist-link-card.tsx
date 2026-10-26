"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrSvg } from "@/components/ui/qr-svg";
import { getClientPublicOrigin } from "@/lib/site-url";

/**
 * The Staff member's own Assist link — copy it once, reuse it with every
 * customer. Modelled on components/partner/referral-share-card.tsx.
 *
 * The code is minted on demand rather than on page load: most Staff never send
 * a link, and a live credential printed on the Results page for anyone glancing
 * at the screen is a liability. One click is the whole lazy-generation story.
 */
export function AssistLinkCard() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // getClientPublicOrigin, never window.location: a link copied from a preview
  // deployment must not send a customer to a preview deployment.
  const link = code ? `${getClientPublicOrigin()}/mp-config?assist=${code}` : "";

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mp-config/assist-link", { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || typeof payload?.code !== "string") {
        throw new Error(payload?.error ?? "Could not create your assist link");
      }
      setCode(payload.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your assist link");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link stays selectable in the input */
    }
  };

  if (!code) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label className="text-base font-semibold">Your assist link</Label>
          <p className="text-sm text-muted-foreground">
            One link, reusable with every customer. What they submit lands here badged
            Assisted, and they never enter card details.
          </p>
          {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
        </div>
        <Button type="button" variant="secondary" onClick={() => void reveal()} disabled={busy}>
          {busy ? "Working…" : "Show my link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="assist-link" className="text-base font-semibold">
          Your assist link
        </Label>
        <div className="flex gap-2">
          <Input
            id="assist-link"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="text-sm"
          />
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Send it to anyone. Their submission arrives in this queue badged Assisted, with
          no card taken — you price it when you save the assignment.
        </p>
      </div>

      <div className="flex flex-col items-center gap-1 self-center sm:self-start">
        <div className="rounded-md bg-white p-2">
          <QrSvg text={link} px={120} label="Assist link QR code" />
        </div>
        <p className="text-xs text-muted-foreground">Scan to open</p>
      </div>
    </div>
  );
}
