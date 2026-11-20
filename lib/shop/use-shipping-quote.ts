"use client";

import { useEffect, useState } from "react";
import type { PackageType, ShippingQuoteOptionView, ShippingQuoteResponse } from "@/lib/shipping/types";
import { isPostalReady } from "@/lib/shipping/countries";

export interface ShippingQuoteRequest {
  items?: Array<{ variant_id: string; quantity: number }>;
  profile?: PackageType | PackageType[];
  country: string;
  postalCode: string;
  city?: string;
  state?: string;
}

export interface ShippingQuoteState {
  options: ShippingQuoteOptionView[];
  live: boolean;
  loading: boolean;
  error: string | null;
  ready: boolean;
}

const IDLE: ShippingQuoteState = { options: [], live: false, loading: false, error: null, ready: false };

export { isPostalReady };

export function useShippingQuote(request: ShippingQuoteRequest | null, debounceMs = 500): ShippingQuoteState {
  const key =
    request && isPostalReady(request.postalCode, request.country)
      ? JSON.stringify({
          items: request.items?.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
          profile: request.profile,
          destination: {
            country: request.country,
            postal_code: request.postalCode.trim(),
            city: request.city?.trim() || undefined,
            state: request.state?.trim() || undefined,
          },
        })
      : null;

  const [result, setResult] = useState<{
    key: string;
    options: ShippingQuoteOptionView[];
    live: boolean;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/shop/shipping/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as ShippingQuoteResponse | null;
        if (!res.ok || !json?.ok) {
          throw new Error(
            res.status === 429
              ? "Too many requests — please wait a moment."
              : "We couldn't get delivery options for this address.",
          );
        }
        setResult({ key, options: json.options, live: json.live, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        setResult({
          key,
          options: [],
          live: false,
          error: err instanceof Error ? err.message : "Something went wrong.",
        });
      }
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, debounceMs]);

  if (!key) return IDLE;
  const current = result?.key === key;
  return {
    options: result?.options ?? [],
    live: result?.live ?? false,
    loading: !current,
    error: current ? result!.error : null,
    ready: result != null,
  };
}

export interface DeliveryWindowLabels {
  sameDay: string;
  day: string;
  days: string;
  range: string;
}

const ENGLISH_WINDOW: DeliveryWindowLabels = {
  sameDay: "Same day",
  day: "{n} business day",
  days: "{n} business days",
  range: "{min}–{max} business days",
};

export function formatDeliveryWindow(
  min: number | null,
  max: number | null,
  labels: DeliveryWindowLabels = ENGLISH_WINDOW,
): string | null {
  if (min == null && max == null) return null;
  const lo = Math.max(0, min ?? max ?? 0);
  const hi = Math.max(lo, max ?? lo);
  if (hi === 0) return labels.sameDay;
  if (lo === hi) return (hi === 1 ? labels.day : labels.days).replace("{n}", String(hi));
  return labels.range.replace("{min}", String(lo)).replace("{max}", String(hi));
}
