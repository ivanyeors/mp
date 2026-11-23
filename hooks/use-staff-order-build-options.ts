"use client";

import { useEffect, useState } from "react";

import type { StaffOrderBuildOptions } from "@/lib/staff-orders/builds";

type Loaded = { variantId: string; options: StaffOrderBuildOptions | null; error: string | null };

export type StaffOrderBuildOptionsState = {
  options: StaffOrderBuildOptions | null;
  error: string | null;
  loading: boolean;
};

export function useStaffOrderBuildOptions(variantId: string | null): StaffOrderBuildOptionsState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!variantId) return;
    let cancelled = false;
    (async () => {
      let answer: Loaded = { variantId, options: null, error: "Could not load the Filling Templates." };
      try {
        const res = await fetch(`/api/staff-orders/build-options?variant_id=${encodeURIComponent(variantId)}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        answer =
          res.ok && json?.ok
            ? { variantId, options: json as StaffOrderBuildOptions, error: null }
            : { variantId, options: null, error: typeof json?.error === "string" ? json.error : answer.error };
      } catch {}
      if (!cancelled) setLoaded(answer);
    })();
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  const current = loaded && loaded.variantId === variantId ? loaded : null;
  return { options: current?.options ?? null, error: current?.error ?? null, loading: Boolean(variantId) && !current };
}
