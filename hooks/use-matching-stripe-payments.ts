"use client";

import { useEffect, useState } from "react";

import type { StripePaymentOption } from "@/lib/staff-orders/shared";

type Loaded = { amount: number; payments: StripePaymentOption[]; error: string | null };

export type MatchingStripePayments = { payments: StripePaymentOption[]; error: string | null; loading: boolean };

export function useMatchingStripePayments(amount: number | null, orderId?: string): MatchingStripePayments {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const wanted = amount != null && amount > 0 ? amount : null;

  useEffect(() => {
    if (wanted == null) return;
    let cancelled = false;
    (async () => {
      let answer: Loaded = { amount: wanted, payments: [], error: "Stripe's payments could not be read." };
      try {
        const params = new URLSearchParams({ amount: wanted.toFixed(2), ...(orderId ? { order_id: orderId } : {}) });
        const res = await fetch(`/api/staff-orders/stripe-payments?${params.toString()}`);
        const json = await res.json().catch(() => null);
        answer =
          res.ok && json?.ok
            ? { amount: wanted, payments: (json.payments ?? []) as StripePaymentOption[], error: null }
            : { amount: wanted, payments: [], error: typeof json?.error === "string" ? json.error : answer.error };
      } catch {}
      if (!cancelled) setLoaded(answer);
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, orderId]);

  const current = loaded && loaded.amount === wanted ? loaded : null;
  return { payments: current?.payments ?? [], error: current?.error ?? null, loading: wanted != null && !current };
}
