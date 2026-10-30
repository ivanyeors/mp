"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useDisplayPrice } from "@/components/shop/price-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartMessages } from "./cart-types";

interface CartCouponFieldProps {
  couponCode: string | null;
  /** A discount or a partner's referral code (ADR 0033); null until checked. */
  couponKind: "discount" | "referral" | null;
  couponPartnerName: string | null;
  couponDiscount: number;
  couponFreeShipping: boolean;
  couponError: string | null;
  couponValidating: boolean;
  applyCoupon: (code: string | null) => Promise<void>;
  currency: string;
  messages: CartMessages;
}

export function CartCouponField({
  couponCode,
  couponKind,
  couponPartnerName,
  couponDiscount,
  couponFreeShipping,
  couponError,
  couponValidating,
  applyCoupon,
  currency,
  messages,
}: CartCouponFieldProps) {
  const [couponInput, setCouponInput] = useState(couponCode ?? "");
  const displayPrice = useDisplayPrice();

  useEffect(() => {
    setCouponInput(couponCode ?? "");
  }, [couponCode]);

  async function handleApplyCoupon() {
    const trimmed = couponInput.trim();
    if (trimmed) {
      await applyCoupon(trimmed);
    } else {
      await applyCoupon(null);
    }
  }

  const applied = Boolean(couponCode && !couponError);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          placeholder={messages.coupon}
          value={couponInput}
          onChange={(e) => setCouponInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleApplyCoupon();
          }}
          disabled={couponValidating}
          className="h-9 text-sm max-md:text-base"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleApplyCoupon()}
          disabled={couponValidating}
          className="shrink-0 h-9"
        >
          {couponValidating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            messages.applyCoupon
          )}
        </Button>
      </div>
      {couponError && (
        <p className="text-xs text-destructive">{couponError}</p>
      )}
      {applied && couponKind === "referral" && (
        <p className="text-xs text-green-600 dark:text-green-400">
          {messages.referralApplied(couponCode!)}
          {couponPartnerName && <> — {couponPartnerName}</>}
        </p>
      )}
      {applied && couponKind === "discount" && (
        <p className="text-xs text-green-600 dark:text-green-400">
          {messages.couponApplied(couponCode!)}
          {couponDiscount > 0 && (
            <> — {displayPrice(couponDiscount, currency)} off</>
          )}
          {couponFreeShipping && couponDiscount <= 0 && (
            <> — {messages.freeShippingQualified.toLowerCase()}</>
          )}
        </p>
      )}
    </div>
  );
}
