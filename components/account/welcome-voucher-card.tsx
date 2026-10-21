"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WelcomeVoucherCardData } from "@/lib/customer-migration/welcome-voucher";

/**
 * The Welcome-back voucher card (PRD-shopify-customer-migration slice 06), on
 * the welcome page and the Profile while the voucher is unused and unexpired.
 * The voucher is bound to this account (ADR 0029 (g)), so the card says so:
 * a forwarded code is refused at checkout.
 */
export function WelcomeVoucherCard({
  voucher,
  shopHref,
}: {
  voucher: WelcomeVoucherCardData;
  shopHref: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(voucher.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (permissions, an old browser): the code is on screen.
    }
  };

  return (
    <section
      aria-labelledby="welcome-voucher-title"
      className="space-y-4 rounded-lg border p-5 sm:p-6"
      data-section="welcome-voucher"
    >
      <div className="flex items-start gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h2 id="welcome-voucher-title" className="font-medium leading-snug">
            Your welcome-back voucher: {voucher.worth}
          </h2>
          <p className="text-sm text-muted-foreground">
            {voucher.minimum ? `On a shop order of ${voucher.minimum} or more` : "On a shop order"}
            {voucher.expiresOn ? `, until ${voucher.expiresOn}.` : "."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 font-mono text-base font-medium tracking-wide">
          {voucher.code}
        </code>
        <Button type="button" variant="outline" onClick={() => void copy()} aria-label="Copy voucher code">
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        It works once, while you&apos;re signed in to this account and checking out with its email. It
        can&apos;t be passed on, and it applies to shop orders, not to custom builds.
      </p>

      <Button asChild className="w-full sm:w-auto">
        <Link href={shopHref}>Shop now</Link>
      </Button>
    </section>
  );
}
