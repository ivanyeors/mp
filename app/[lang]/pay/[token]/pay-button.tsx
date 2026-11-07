"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The Pay button of a Payment link (ADR 0048). Asks the server for a Stripe
 * Checkout for this order and goes there; the amount is the Order's, never
 * the page's. A payment that landed a moment ago re-renders the page, which
 * then shows it.
 */
export function PayButton({
  token,
  label,
  openingLabel,
  errorFallback,
}: {
  token: string;
  label: string;
  openingLabel: string;
  errorFallback: string;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${token}/checkout`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok && typeof json?.url === "string") {
        window.location.assign(json.url);
        return;
      }
      if (json?.state) {
        // Paid, expired or closed since the page was drawn: show it as it is now.
        router.refresh();
      }
      setError(typeof json?.error === "string" ? json.error : errorFallback);
    } catch {
      setError(errorFallback);
    }
    setOpening(false);
  };

  return (
    <div className="space-y-2">
      <Button type="button" size="lg" className="h-12 w-full text-base" onClick={() => void pay()} disabled={opening}>
        {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        {opening ? openingLabel : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
