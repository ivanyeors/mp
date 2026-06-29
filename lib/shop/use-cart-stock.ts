"use client";

import { useEffect, useState } from "react";

/**
 * Fetch live availability (variant_stock) for a set of variant ids. Returns a
 * map of variantId -> stock_available. Re-fetches whenever the set of ids
 * changes. Used by the cart to cap quantities and surface shortages; checkout
 * server validation stays the final authority.
 */
export function useCartStock(variantIds: string[]): {
  stock: Record<string, number>;
  loading: boolean;
} {
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // Stable, order-independent key so re-renders with the same ids don't refetch.
  const key = [...new Set(variantIds)].sort().join(",");

  useEffect(() => {
    if (!key) {
      setStock({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/shop/stock?ids=${encodeURIComponent(key)}`)
      .then((res) => res.json())
      .then((data: { stock?: Record<string, number> }) => {
        if (!cancelled) setStock(data?.stock ?? {});
      })
      .catch(() => {
        if (!cancelled) setStock({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { stock, loading };
}
