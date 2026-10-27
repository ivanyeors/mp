"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHECKOUT_CODE_MAX_LENGTH, type CheckoutCodeStatus } from "@/lib/checkout-code/shared";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  status: CheckoutCodeStatus;
  /** Money as the surrounding page writes it. */
  formatAmount: (amount: number) => string;
  /** Status text size: the shop form uses `text-xs`, the configurator `text-sm`. */
  textClassName?: string;
};

/**
 * The one optional code at checkout (ADR 0033): a partner's referral code or a
 * discount code. Either kind says it is active once accepted; a discount, or a
 * partner's code that carries one (ADR 0034), also says what it takes off, and
 * the page's total moves with it.
 */
export function CheckoutCodeField({
  id,
  value,
  onChange,
  status,
  formatAmount,
  textClassName = "text-xs",
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        Discount or referral code{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter a code"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={CHECKOUT_CODE_MAX_LENGTH}
        aria-describedby={`${id}-status`}
        aria-invalid={status.state === "invalid" || undefined}
      />
      <div id={`${id}-status`} aria-live="polite" className={textClassName}>
        <CheckoutCodeStatusText status={status} formatAmount={formatAmount} />
      </div>
    </div>
  );
}

function CheckoutCodeStatusText({
  status,
  formatAmount,
}: Pick<Props, "status" | "formatAmount">) {
  switch (status.state) {
    case "idle":
      return null;
    case "checking":
      return (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Checking code…
        </p>
      );
    case "referral":
      return (
        <Active>
          Referral code active{status.partnerName ? ` — referred by ${status.partnerName}` : ""}
          {status.discount > 0 ? `, ${formatAmount(status.discount)} off` : ""}
        </Active>
      );
    case "discount":
      return (
        <Active>
          Discount code active
          {status.freeShipping
            ? " — free shipping"
            : status.discount == null
              ? " — it comes off your build's price"
              : status.discount > 0
                ? ` — ${formatAmount(status.discount)} off`
                : ""}
        </Active>
      );
    case "invalid":
      return (
        <p className="text-destructive">
          {status.reason || "This code can't be used on this order"}. You can still continue without it.
        </p>
      );
    case "unknown":
      return <p className="text-muted-foreground">Code not recognised — you can still continue.</p>;
    case "error":
      return <p className="text-muted-foreground">{status.message}</p>;
  }
}

function Active({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
