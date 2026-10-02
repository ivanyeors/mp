"use client";

import { useEffect, useState } from "react";
import type { ShippingQuoteOptionView, ShippingQuoteResponse } from "@/lib/shipping/types";

export interface ShippingQuoteRequest {
  /** A cart; priced server-side from the variants. */
  items?: Array<{ variant_id: string; quantity: number }>;
  /** No cart: one unit boxed as this product type (the estimator). */
  profile?: "pillow" | "bolster" | "accessory";
  country: string;
  postalCode: string;
  city?: string;
  state?: string;
}

export interface ShippingQuoteState {
  options: ShippingQuoteOptionView[];
  /** False when live rates were wanted but unavailable; the options are then flat fallbacks. */
  live: boolean;
  loading: boolean;
  error: string | null;
  /** True once a quote has come back for the current request. */
  ready: boolean;
}

const IDLE: ShippingQuoteState = { options: [], live: false, loading: false, error: null, ready: false };

/** A postal code worth quoting: couriers price by it, and a partial one only misses the cache. */
export function isPostalReady(postal: string): boolean {
  return postal.replace(/\s+/g, "").length >= 3;
}

/**
 * Live shipping options for a cart or a product type to an address. Debounced
 * while the shopper types, and a newer request always wins over a slower older
 * one. Pass null to stay idle (e.g. until there is a postal code).
 */
export function useShippingQuote(request: ShippingQuoteRequest | null, debounceMs = 500): ShippingQuoteState {
  // The request as a stable string: the effect re-runs when its content changes,
  // not when the caller builds a new object with the same content.
  const key =
    request && isPostalReady(request.postalCode)
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

  // The latest answer and the request it answers. "Loading" is derived — the
  // current request has no answer yet — so nothing is set synchronously in the effect.
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
    // While a new request is in flight the previous answer stays on screen.
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

/** "2–4 business days", "1 business day", "Same day", or null when the courier gives no estimate. */
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
