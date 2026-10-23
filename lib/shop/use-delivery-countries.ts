"use client";

import { useEffect, useState } from "react";
import { countryName } from "@/lib/shipping/countries";

export interface DeliveryCountryOption {
  code: string;
  label: string;
}

// One request per page load, shared by every picker on the page.
let pending: Promise<string[]> | null = null;

function loadDeliveryCountries(): Promise<string[]> {
  pending ??= fetch("/api/shop/shipping/countries")
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { countries?: string[] } | null) => json?.countries ?? [])
    .catch(() => [])
    .then((codes) => {
      // A failed read is retried by the next picker that mounts.
      if (codes.length === 0) pending = null;
      return codes;
    });
  return pending;
}

/**
 * The countries the store delivers to, for a country picker. `current` is always
 * included, so a saved address in a country no method covers still shows (and the
 * page says there is no shipping option for it) rather than an empty select.
 */
export function useDeliveryCountries(current: string): DeliveryCountryOption[] {
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadDeliveryCountries().then((list) => !cancelled && setCodes(list));
    return () => {
      cancelled = true;
    };
  }, []);
  const all = current && !codes.includes(current) ? [current, ...codes] : codes;
  return all.map((code) => ({ code, label: countryName(code) }));
}
