"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartMessages } from "./cart-types";

interface CartCouponFieldProps {
  couponCode: string | null;
  applyCoupon: (code: string | null) => void;
  messages: CartMessages;
}

export function CartCouponField({ couponCode, applyCoupon, messages }: CartCouponFieldProps) {
  const [couponInput, setCouponInput] = useState(couponCode ?? "");
  const [couponApplied, setCouponApplied] = useState(false);

  useEffect(() => {
    setCouponInput(couponCode ?? "");
    setCouponApplied(Boolean(couponCode));
  }, [couponCode]);

  function handleApplyCoupon() {
    const trimmed = couponInput.trim();
    if (trimmed) {
      applyCoupon(trimmed);
      setCouponApplied(true);
    } else {
      applyCoupon(null);
      setCouponApplied(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          placeholder={messages.coupon}
          value={couponInput}
          onChange={(e) => {
            setCouponInput(e.target.value);
            setCouponApplied(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApplyCoupon();
          }}
          className="h-9 text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleApplyCoupon}
          className="shrink-0 h-9"
        >
          {messages.applyCoupon}
        </Button>
      </div>
      {couponApplied && couponCode && (
        <p className="text-xs text-green-600 dark:text-green-400">
          {messages.couponApplied(couponCode)}
        </p>
      )}
    </div>
  );
}
