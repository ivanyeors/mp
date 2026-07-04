"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  orderNumber: string;
  canRequest: boolean;
  requestStatus: "requested" | "approved" | "rejected" | null;
};

export function OrderRefundActions({ orderNumber, canRequest, requestStatus }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (requestStatus === "requested") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
        <p className="font-medium">Refund request pending</p>
        <p className="mt-1 text-muted-foreground">
          Return the product in person. We will process your refund after staff confirm the return.
        </p>
      </div>
    );
  }

  if (requestStatus === "approved") {
    return (
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Refund approved</p>
        <p className="mt-1 text-muted-foreground">Your refund is being processed.</p>
      </div>
    );
  }

  if (requestStatus === "rejected") {
    return (
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Refund request declined</p>
        <p className="mt-1 text-muted-foreground">
          Contact support if you need help with this order.
        </p>
      </div>
    );
  }

  if (!canRequest) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/orders/${encodeURIComponent(orderNumber)}/refund-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() || undefined }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Request a refund</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Refunds require an in-person return. Submit a request after you have returned the product.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="refund-note">Note (optional)</Label>
        <Textarea
          id="refund-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Brief reason for the return"
          rows={2}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="outline" size="sm" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Request refund
      </Button>
    </div>
  );
}
