"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { usePathname } from "next/navigation";

type ResultPublic = {
  id: string;
  status: string | null;
  product_type: string | null;
  suggested_size: string | null;
  suggested_tier: string | null;
  assigned_size: string | null;
  assigned_tier: string | null;
  preference_lines: unknown;
  addon_lines: unknown;
  shipping_method: string | null;
  authorized_amount: number | null;
  final_amount: number | null;
  currency: string | null;
  payment_intent_id: string | null;
};

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  held: {
    title: "Pending review",
    body: "An operator is reviewing your measurements and preferences. You will be able to accept or decline once the final build is ready.",
  },
  assigned: {
    title: "Ready for your decision",
    body: "Your final build is ready. Accept or decline from this page when available.",
  },
  accepted: {
    title: "Accepted",
    body: "Payment capture is in progress and your order will move to production.",
  },
  declined: {
    title: "Declined",
    body: "The authorization hold was released. Start a new customisation when you are ready.",
  },
  expired: {
    title: "Expired",
    body: "This review window expired and the hold was released. Please start customisation again.",
  },
  captured: {
    title: "In production",
    body: "Payment was captured and your order is being made.",
  },
};

export default function ResultStatusPage() {
  const params = useParams<{ id: string; lang?: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const id = params.id;
  const token = searchParams.get("token");
  const sessionId = searchParams.get("session_id");

  const [result, setResult] = useState<ResultPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (token) qs.set("token", token);
        if (sessionId) qs.set("session_id", sessionId);
        const res = await fetch(`/api/results/${id}?${qs.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setResult(data.result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token, sessionId]);

  const status = result?.status ?? "held";
  const copy = STATUS_COPY[status] ?? STATUS_COPY.held;
  const size = result?.assigned_size ?? result?.suggested_size;
  const tier = result?.assigned_tier ?? result?.suggested_tier;
  const amount = result?.final_amount ?? result?.authorized_amount;
  const currency = result?.currency ?? "SGD";

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <Card className="space-y-4 p-6">
        <div>
          <p className="text-sm text-muted-foreground">Result status</p>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Size</span>
              <span className="font-medium">{size ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tier</span>
              <span className="font-medium capitalize">{tier ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                {status === "held" ? "Authorized (not charged)" : "Amount"}
              </span>
              <span className="font-medium tabular-nums">
                {amount != null ? `${currency} ${Number(amount).toFixed(2)}` : "—"}
              </span>
            </div>
            {status === "held" && (
              <p className="pt-2 text-xs text-muted-foreground">
                Accept will be available after an operator assigns your final build.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild variant="outline">
            <Link href={withLocale("/mp-config", locale)}>New customisation</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={withLocale("/account/results", locale)}>My results</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
