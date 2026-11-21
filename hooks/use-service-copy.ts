"use client";

import * as React from "react";

import { DEFAULT_SERVICE_COPY_VALUES, type ServiceCopyValues } from "@/lib/pricing/service-copy";

let pending: Promise<ServiceCopyValues | null> | null = null;

function fetchOnce(): Promise<ServiceCopyValues | null> {
  pending ??= fetch("/api/service-fees")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.ok ? (d.copy as ServiceCopyValues) : null))
    .catch(() => null);
  return pending;
}

export function useServiceCopy(): ServiceCopyValues {
  const [values, setValues] = React.useState<ServiceCopyValues>(DEFAULT_SERVICE_COPY_VALUES);
  React.useEffect(() => {
    let alive = true;
    void fetchOnce().then((v) => {
      if (alive && v) setValues(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return values;
}
