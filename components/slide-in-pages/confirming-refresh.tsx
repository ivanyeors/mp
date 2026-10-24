"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server page every few seconds while a payment's webhook is
 * still on its way, then gives up and shows `slowMessage`. Never claims a
 * booking the server has not written.
 */
export function ConfirmingRefresh({
  slowMessage,
  intervalMs = 3000,
  attempts = 7,
}: {
  slowMessage: string;
  intervalMs?: number;
  attempts?: number;
}) {
  const router = useRouter();
  const [tries, setTries] = React.useState(0);

  React.useEffect(() => {
    if (tries >= attempts) return;
    const id = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, intervalMs);
    return () => clearTimeout(id);
  }, [tries, attempts, intervalMs, router]);

  return tries >= attempts ? <p className="text-sm text-muted-foreground">{slowMessage}</p> : null;
}
