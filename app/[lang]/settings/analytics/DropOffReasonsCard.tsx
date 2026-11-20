"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DROP_OFF_REASON_AREA,
  DROP_OFF_REASON_LABEL,
  DROP_OFF_STEP_LABEL,
  DROP_OFF_STEPS,
} from "@/lib/analytics/drop-off/reasons";
import type { DropOffSummary } from "@/lib/analytics/drop-off/store";
import { getDropOffReasons } from "./drop-off-actions";

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

const n = (v: number) => v.toLocaleString("en-SG");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const shortDate = (iso: string, withYear = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

export function DropOffReasonsCard({ initial }: { initial?: DropOffSummary }) {
  const [days, setDays] = useState<number>(initial?.days ?? 30);
  const [data, setData] = useState<DropOffSummary | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial && days === initial.days) return;
    let cancelled = false;
    getDropOffReasons(days).then(
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
  const weekMax = Math.max(1, ...(data?.weeks.map((w) => w.count) ?? [0]));
  const withYear = Boolean(data && data.weeks[0]?.weekStart.slice(0, 4) !== data.weeks.at(-1)?.weekStart.slice(0, 4));
  const weekLabel = (w: { weekStart: string; partial: boolean }) =>
    `Week of ${shortDate(w.weekStart, withYear)}${w.partial ? " (part week)" : ""}`;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Why people leave</CardTitle>
          <CardDescription>
            What visitors tell us stopped them, on the configurators and at checkout, and why shoppers declined a
            quote. Self-reported; nobody is asked for a name or email.
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
        ) : loading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : data.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No answers yet. The question appears on the configurators and at checkout once a visitor has started and
            moves to leave, and on the decline step of a quote.
          </p>
        ) : (
          <>
            {data.capped ? (
              <p className="text-xs text-muted-foreground">
                Counting the newest {n(data.capped)} answers in this window; older ones are left out.
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Answers</dt>
                <dd className="text-2xl font-semibold tabular-nums">{n(data.total)}</dd>
              </div>
              {DROP_OFF_STEPS.map((step) => (
                <div key={step} className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{DROP_OFF_STEP_LABEL[step]}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{n(data.byStep[step])}</dd>
                </div>
              ))}
            </dl>

            <section aria-labelledby="drop-off-reasons-heading" className="space-y-3">
              <h3 id="drop-off-reasons-heading" className="text-sm font-medium">
                Reasons, most given first
              </h3>
              <ul className="space-y-3">
                {data.byReason.map((r) => {
                  const steps = DROP_OFF_STEPS.filter((s) => r.byStep[s] > 0)
                    .map((s) => `${DROP_OFF_STEP_LABEL[s]} ${n(r.byStep[s])}`)
                    .join(" · ");
                  return (
                    <li key={r.reason} title={`${DROP_OFF_REASON_LABEL[r.reason]}: ${n(r.count)} (${steps})`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{DROP_OFF_REASON_LABEL[r.reason]}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {n(r.count)} · {pct(r.count, data.total)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-muted" aria-hidden>
                        <div
                          className="h-2 rounded-full bg-chart-2"
                          style={{ width: `${Math.max(2, (r.count / top) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {steps} · Points to: {DROP_OFF_REASON_AREA[r.reason]}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="drop-off-weeks-heading" className="space-y-2">
              <h3 id="drop-off-weeks-heading" className="text-sm font-medium">
                Answers per week
              </h3>
              <div className="flex h-24 items-end gap-[2px]" aria-hidden>
                {data.weeks.map((w) => (
                  <div
                    key={w.weekStart}
                    title={`${weekLabel(w)}: ${n(w.count)}`}
                    className="flex h-full min-w-0 flex-1 items-end"
                  >
                    <div
                      className={cn("w-full rounded-t-[4px]", w.partial ? "bg-chart-2/40" : "bg-chart-2")}
                      style={{ height: w.count ? `${Math.max(4, (w.count / weekMax) * 100)}%` : "0" }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
                <span>{shortDate(data.weeks[0]!.weekStart, withYear)}</span>
                <span>{shortDate(data.weeks.at(-1)!.weekStart, withYear)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Weeks start on Monday. Paler bars are part weeks: the start of the window and this week so far.
              </p>
              <table className="sr-only">
                <caption>Answers per week</caption>
                <tbody>
                  {data.weeks.map((w) => (
                    <tr key={w.weekStart}>
                      <th scope="row">{weekLabel(w)}</th>
                      <td>{w.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {data.latestText.length > 0 && (
              <section aria-labelledby="drop-off-text-heading" className="space-y-2">
                <h3 id="drop-off-text-heading" className="text-sm font-medium">
                  In their words
                </h3>
                <ul className="divide-y rounded-lg border">
                  {data.latestText.map((t, i) => (
                    <li key={`${t.at}-${i}`} className="space-y-0.5 px-3 py-2 text-sm">
                      <p className="break-words">{t.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {DROP_OFF_REASON_LABEL[t.reason]} · {DROP_OFF_STEP_LABEL[t.step]} ·{" "}
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
