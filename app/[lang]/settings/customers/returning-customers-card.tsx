import type React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MIN_RATE_BASE, dayLabel, returningHeadline, type Cohort, type ReturningSummary } from "@/lib/crm/returning-customers";

const n = (v: number) => v.toLocaleString("en-SG");
const cell = (count: number, rate: number | undefined) => (rate == null ? n(count) : `${n(count)} (${rate}%)`);

const SHOWN = 12;

function CohortRow({ c }: { c: Cohort }) {
  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="py-2 pr-3 text-left font-normal">
        {c.label}
      </th>
      <td className="py-2 pr-3 text-right tabular-nums">{n(c.firstBuyers)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{cell(c.cameBack, c.rate?.cameBack)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{cell(c.viaReadjustment, c.rate?.viaReadjustment)}</td>
      <td className="py-2 text-right tabular-nums">{cell(c.viaPurchase, c.rate?.viaPurchase)}</td>
    </tr>
  );
}

function GroupRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <th scope="rowgroup" colSpan={5} className="pb-1 pt-4 text-left text-xs font-medium text-muted-foreground">
        {children}
      </th>
    </tr>
  );
}

export function ReturningCustomersCard({ summary }: { summary: ReturningSummary }) {
  const newest = [...summary.cohorts].reverse();
  const closed = newest.filter((c) => !c.open).slice(0, SHOWN);
  const open = newest.filter((c) => c.open);
  const rows = [...closed, ...open];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Returning customers</CardTitle>
        <CardDescription>{returningHeadline(summary)}</CardDescription>
      </CardHeader>
      {rows.length ? (
        <CardContent className="space-y-2">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">Customers who came back within 12 months, by the month of their first purchase</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-normal">First bought</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Customers</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Came back</th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">Re-adjustment</th>
                  <th scope="col" className="py-2 text-right font-normal">Second purchase</th>
                </tr>
              </thead>
              {closed.length ? (
                <tbody>
                  <GroupRow>Had their full 12 months</GroupRow>
                  {closed.map((c) => (
                    <CohortRow key={c.month} c={c} />
                  ))}
                </tbody>
              ) : null}
              {open.length ? (
                <tbody>
                  <GroupRow>
                    Still open: counts so far, no rate yet
                    {open.at(-1) ? ` (the oldest, ${open.at(-1)!.label}, closes on ${dayLabel(open.at(-1)!.closesOn)})` : ""}
                  </GroupRow>
                  {open.map((c) => (
                    <CohortRow key={c.month} c={c} />
                  ))}
                </tbody>
              ) : null}
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Purchases on this site only; Shopify-era orders join once they are imported. A rate shows once a month has had
            its full 12 months and holds {MIN_RATE_BASE} or more customers. Someone who did both counts once in Came back.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
