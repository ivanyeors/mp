"use client";

import { useEffect, useState } from "react";

export function useCartStock(variantIds: string[]): {
  stock: Record<string, number>;
  loading: boolean;
} {
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

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
