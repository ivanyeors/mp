"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UNSUBSCRIBE_REASON_AREA, UNSUBSCRIBE_REASON_LABEL } from "@/lib/marketing-consent/unsubscribe-reasons";
import type { UnsubscribeSummary } from "@/lib/marketing-consent/unsubscribe-reasons-server";
import { getUnsubscribeReasons } from "./unsubscribe-reasons-actions";

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

const n = (v: number) => v.toLocaleString("en-SG");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/**
 * *Why people unsubscribe* (PRD-crm-retention-loop slice 11): every unsubscribe
 * in the window, how it happened, and what people told us when asked after.
 * Beside *Why people leave*. One hue for magnitude; every number is written
 * out too. Typed answers are for Staff only, as this page is.
 */
export function UnsubscribeReasonsCard({ initial }: { initial?: UnsubscribeSummary }) {
  const [days, setDays] = useState<number>(initial?.days ?? 30);
  const [data, setData] = useState<UnsubscribeSummary | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial && days === initial.days) return;
    let cancelled = false;
    getUnsubscribeReasons(days).then(
      (summary) => {
        if (cancelled) return;
        setData(summary);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the answers");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [days, initial]);

  const loading = !error && (!data || data.days !== days);
  const top = data?.byReason[0]?.count ?? 0;
  const u = data?.unsubscribes;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Why people unsubscribe</CardTitle>
          <CardDescription>
            Asked after someone unsubscribes, on the unsubscribe page and in their account, and recorded by Staff when a
            customer asks us to stop. Optional; never asked of a spam report.
          </CardDescription>
        </div>
        <Tabs
          value={String(days)}
          onValueChange={(v) => {
            setDays(Number(v));
            setError(null);
          }}
        >
          <TabsList>
            {WINDOWS.map((w) => (
              <TabsTrigger key={w.days} value={String(w.days)}>
                {w.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : loading || !data || !u ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : u.total === 0 && data.answers === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody unsubscribed in this window.</p>
        ) : (
          <>
            {data.capped ? (
              <p className="text-xs text-muted-foreground">
                Counting the newest {n(data.capped)} in this window; older ones are left out.
              </p>
            ) : null}
            <dl className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Unsubscribed</dt>
                <dd className="text-2xl font-semibold tabular-nums">{n(u.total)}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Told us why</dt>
                <dd className="text-2xl font-semibold tabular-nums">{n(data.answers)}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Marked as spam</dt>
                <dd className="text-2xl font-semibold tabular-nums">{n(u.complaint)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {n(u.link)} by the unsubscribe link, {n(u.account)} in their account, {n(u.support)} through Staff
              {u.other ? `, ${n(u.other)} from an import` : ""}. Nobody is asked after a spam report, or after a
              one-click unsubscribe from Gmail or Yahoo, which never opens our page.
            </p>

            {data.byReason.length ? (
              <section aria-labelledby="unsubscribe-reasons-heading" className="space-y-3">
                <h3 id="unsubscribe-reasons-heading" className="text-sm font-medium">
                  Reasons, most given first
                </h3>
                <ul className="space-y-3">
                  {data.byReason.map((r) => (
                    <li key={r.reason} title={`${UNSUBSCRIBE_REASON_LABEL[r.reason]}: ${n(r.count)}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{UNSUBSCRIBE_REASON_LABEL[r.reason]}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {n(r.count)} · {pct(r.count, data.answers)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-muted" aria-hidden>
                        <div className="h-2 rounded-full bg-chart-2" style={{ width: `${Math.max(2, (r.count / top) * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Points to: {UNSUBSCRIBE_REASON_AREA[r.reason]}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">Nobody has answered yet in this window.</p>
            )}

            {data.latestText.length > 0 && (
              <section aria-labelledby="unsubscribe-text-heading" className="space-y-2">
                <h3 id="unsubscribe-text-heading" className="text-sm font-medium">
                  In their words
                </h3>
                <ul className="divide-y rounded-lg border">
                  {data.latestText.map((t, i) => (
                    <li key={`${t.at}-${i}`} className="space-y-0.5 px-3 py-2 text-sm">
                      <p className="break-words">{t.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.at).toLocaleDateString("en-SG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "Asia/Singapore",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
