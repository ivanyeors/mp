"use client";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/components/shop/price-display";

export type UpsellCardProps = {
  reason: string;
  fromLabel: string;
  toLabel: string;
  fromPrice: number | null;
  toPrice: number | null;
  currency?: string;
  expectation?: string | null;
  onUpgrade: () => void;
  onKeep: () => void;
  busy?: boolean;
};

const UPGRADE_LABEL = "Upgrade";
const KEEP_LABEL = "Keep";

function priceOrDash(amount: number | null, currency: string): string {
  return amount == null ? "—" : formatPrice(amount, currency);
}

export function UpsellCard({
  reason,
  fromLabel,
  toLabel,
  fromPrice,
  toPrice,
  currency = "SGD",
  expectation,
  onUpgrade,
  onKeep,
  busy = false,
}: UpsellCardProps) {
  return (
    <div className="max-w-sm space-y-3 rounded-lg border border-white/20 bg-black/25 px-4 py-3 text-center text-white backdrop-blur-sm">
      <p className="text-sm leading-snug text-white/95">{reason}</p>
      <div className="rounded-md border border-white/15 bg-black/20 px-3 py-2 text-xs text-white/90">
        <div className="flex items-center justify-center gap-2">
          <span className="text-left">
            <span className="block text-[11px] text-white/65">{fromLabel}</span>
            <span className="font-medium tabular-nums">
              {priceOrDash(fromPrice, currency)}
            </span>
          </span>
          <span aria-hidden className="text-white/50">
            →
          </span>
          <span className="text-left">
            <span className="block text-[11px] text-white/65">{toLabel}</span>
            <span className="font-medium tabular-nums">
              {priceOrDash(toPrice, currency)}
            </span>
          </span>
        </div>
      </div>
      {expectation ? (
        <p className="text-[11px] leading-snug text-white/70">{expectation}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={onUpgrade}
          className="min-w-[6.5rem]"
        >
          {UPGRADE_LABEL}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onKeep}
          className="min-w-[6.5rem] border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          {KEEP_LABEL}
        </Button>
      </div>
    </div>
  );
}

export { UPGRADE_LABEL, KEEP_LABEL };
