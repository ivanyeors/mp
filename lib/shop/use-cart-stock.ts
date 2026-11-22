"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { CartItemClient } from "@/lib/types/ecommerce";

export function useCartStock(
  items: CartItemClient[],
  updateQuantity: (variantId: string, quantity: number, customizationId?: string) => void,
): {
  stock: Record<string, number>;
  loading: boolean;
} {
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const key = [...new Set(items.filter((i) => !i.customizationId).map((i) => i.variantId))].sort().join(",");

  const capToStock = useEffectEvent((arrived: Record<string, number>) => {
    for (const item of items) {
      const max = item.customizationId ? undefined : arrived[item.variantId];
      if (max != null && max > 0 && item.quantity > max) {
        updateQuantity(item.variantId, max, item.customizationId);
      }
    }
  });

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
        if (cancelled) return;
        const arrived = data?.stock ?? {};
        setStock(arrived);
        capToStock(arrived);
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
