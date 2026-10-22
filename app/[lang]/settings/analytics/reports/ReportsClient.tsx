"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Mail, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  CHANNEL_LABELS,
  KIND_LABELS,
  customerPurchasesCsv,
  type CustomerPurchasesReport,
  type PurchaseTotals,
} from "@/lib/finance-reports/customer-purchases";
import { monthPeriod, periodLabel, periodSlug, previousMonth, sgtDate, type ReportPeriod } from "@/lib/finance-reports/period";
import { formatAdminDateTimeMY } from "@/lib/format/admin-date";
import { formatCurrency } from "@/lib/i18n/currencies";
import { emailCustomerPurchasesReport, generateCustomerPurchasesReport } from "./actions";

type Member = { email: string; role: string };
type RecentSend = {
  at: string;
  by: string | null;
  period: { from: string; to: string } | null;
  sent: string[];
  failed: string[];
};

/** Rows drawn on the page; the CSV always has them all. */
const PREVIEW_ROWS = 200;
const MAX_RECIPIENTS = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signedMoney(n: number, currency: string): string {
  return n < 0 ? `−${formatCurrency(Math.abs(n), currency)}` : formatCurrency(n, currency);
}

function thisMonth(): ReportPeriod {
  const [y, m] = sgtDate(new Date().toISOString()).split("-").map(Number);
  return monthPeriod(y, m);
}

function TotalsTiles({ totals }: { totals: PurchaseTotals }) {
  const tiles = [
    { label: `Sales (${totals.saleCount})`, value: formatCurrency(totals.sales, totals.currency) },
    { label: "GST in sales", value: formatCurrency(totals.tax, totals.currency) },
    { label: "Refunds & disputes", value: signedMoney(totals.refunds, totals.currency) },
    { label: "Net received", value: signedMoney(totals.net, totals.currency), strong: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">{t.label}</div>
          <div className={t.strong ? "text-lg font-semibold tabular-nums" : "text-lg tabular-nums"}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsClient({
  analyticsHref,
  initialPeriod,
  initialReport,
  initialError,
  canSend,
  members,
  initialRecent,
  selfEmail,
}: {
  analyticsHref: string;
  initialPeriod: ReportPeriod;
  initialReport: CustomerPurchasesReport | null;
  initialError: string | null;
  canSend: boolean;
  members: Member[];
  initialRecent: RecentSend[];
  selfEmail: string;
}) {
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [report, setReport] = useState<CustomerPurchasesReport | null>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<RecentSend[]>(initialRecent);

  const generate = useCallback(async (p: ReportPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateCustomerPurchasesReport(p);
      if (res.ok) setReport(res.report);
      else {
        setReport(null);
        setError(res.error);
      }
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Could not build the report");
    } finally {
      setLoading(false);
    }
  }, []);

  const shownPeriod = report?.period ?? null;
  // The report on screen is for the dates in the inputs; editing them asks for a regenerate.
  const stale = !!shownPeriod && (shownPeriod.from !== period.from || shownPeriod.to !== period.to);

  const choosePreset = (p: ReportPeriod) => {
    setPeriod(p);
    void generate(p);
  };

  const downloadCsv = () => {
    if (!report) return;
    const blob = new Blob([customerPurchasesCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-purchases-${periodSlug(report.period)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const memberEmails = useMemo(() => new Set(members.map((m) => m.email)), [members]);
  const others = picked.filter((e) => !memberEmails.has(e));

  const toggle = (email: string, on: boolean) =>
    setPicked((cur) => (on ? [...new Set([...cur, email])] : cur.filter((e) => e !== email)));

  const addTyped = () => {
    const entries = typed
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (entries.length === 0) return;
    const bad = entries.filter((e) => !EMAIL_RE.test(e));
    if (bad.length > 0) {
      toast.error(`Not an email address: ${bad.join(", ")}`);
      return;
    }
    setPicked((cur) => [...new Set([...cur, ...entries])]);
    setTyped("");
  };

  const send = async () => {
    if (!shownPeriod || picked.length === 0) return;
    setSending(true);
    try {
      const res = await emailCustomerPurchasesReport({
        from: shownPeriod.from,
        to: shownPeriod.to,
        recipients: picked,
        note,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.recent) setRecent(res.recent);
      if (res.failed.length === 0) {
        toast.success(`Sent to ${res.sent.length} ${res.sent.length === 1 ? "recipient" : "recipients"}`);
        setPicked([]);
        setNote("");
      } else {
        toast.error(
          `Sent to ${res.sent.length}; failed for ${res.failed.map((f) => f.email).join(", ")}: ${res.failed[0].error}`,
        );
        setPicked(res.failed.map((f) => f.email));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the report");
    } finally {
      setSending(false);
    }
  };

  const rows = report?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Link href={analyticsHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Analytics
        </Link>
        <div className="flex items-center gap-1.5">
          <h1>Reports</h1>
          <InfoTip label="About Reports">
            Reports for the accounts team to check against Stripe and bank statements. Build one for a period,
            download it as CSV, or email it to Members or anyone else.
          </InfoTip>
        </div>
      </div>

      <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>Customer purchases</CardTitle>
          <CardDescription>
            Every payment and refund in the period, one row each, in Singapore time. Sales are dated when the
            customer paid; refunds when the money went back. Covers Mpillow Orders (shop, customisations,
            re-adjustments) and the Shopify order mirror.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-4 sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="grid grid-cols-2 gap-3 md:flex md:gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-from">From</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={period.from}
                  max={period.to}
                  onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-to">To</Label>
                <Input
                  id="report-to"
                  type="date"
                  value={period.to}
                  min={period.from}
                  onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex">
              <Button variant="outline" onClick={() => choosePreset(previousMonth())} disabled={loading}>
                Last month
              </Button>
              <Button variant="outline" onClick={() => choosePreset(thisMonth())} disabled={loading}>
                This month
              </Button>
              <Button onClick={() => void generate(period)} disabled={loading} className="col-span-2 md:col-span-1">
                {loading ? "Building…" : "Build report"}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading && !report ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : report ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{periodLabel(report.period)}</span>
                  {stale && <Badge variant="secondary">Dates changed: build again</Badge>}
                </div>
                <Button variant="outline" onClick={downloadCsv} disabled={rows.length === 0}>
                  <Download className="size-4" aria-hidden /> Download CSV
                </Button>
              </div>

              {report.totals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales or refunds in this period.</p>
              ) : (
                report.totals.map((t) => <TotalsTiles key={t.currency} totals={t} />)
              )}

              {report.byChannel.shopify.length > 0 && report.byChannel.platform.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {(["platform", "shopify"] as const)
                    .flatMap((c) =>
                      report.byChannel[c].map(
                        (t) => `${CHANNEL_LABELS[c]}: ${t.saleCount} sales, net ${signedMoney(t.net, t.currency)}`,
                      ),
                    )
                    .join(" · ")}
                </p>
              )}

              {rows.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead className="hidden md:table-cell">Sale type</TableHead>
                        <TableHead className="hidden md:table-cell">Customer</TableHead>
                        <TableHead className="hidden lg:table-cell">Payment reference</TableHead>
                        <TableHead className="text-right">GST</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                        <TableRow key={`${r.at}-${r.reference}-${r.paymentReference}-${i}`}>
                          <TableCell className="whitespace-nowrap">{sgtDate(r.at)}</TableCell>
                          <TableCell>
                            {KIND_LABELS[r.kind]}
                            {r.channel === "shopify" && <span className="text-muted-foreground"> · Shopify</span>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{r.reference}</TableCell>
                          <TableCell className="hidden md:table-cell">{r.saleType}</TableCell>
                          <TableCell className="hidden md:table-cell">{r.customer || "—"}</TableCell>
                          <TableCell className="hidden font-mono text-xs lg:table-cell">{r.paymentReference || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.tax == null ? "—" : formatCurrency(r.tax, r.currency)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{signedMoney(r.amount, r.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {rows.length > PREVIEW_ROWS && (
                <p className="text-sm text-muted-foreground">
                  Showing the first {PREVIEW_ROWS} of {rows.length} rows. The CSV has every row.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Not included yet: card processing fees, Stripe payouts, and supplier bills (Vercel, Anthropic,
                Google Workspace). Built {formatAdminDateTimeMY(report.generatedAt)}.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>Email this report</CardTitle>
          <CardDescription>
            Each recipient gets their own email with the totals and the CSV attached. Replies come to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-4 sm:px-6">
          {!canSend ? (
            <p className="text-sm text-muted-foreground">
              Your role can view reports but not email them. An Owner or Admin can tick “Finance reports: send by
              email” for your role under Users &amp; permissions → Roles.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Members</Label>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active Members to pick from.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {members.map((m) => {
                      const id = `recipient-${m.email}`;
                      return (
                        <label key={m.email} htmlFor={id} className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
                          <Checkbox
                            id={id}
                            checked={picked.includes(m.email)}
                            onCheckedChange={(v) => toggle(m.email, v === true)}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {m.email}
                            {m.email === selfEmail && <span className="text-muted-foreground"> (you)</span>}
                          </span>
                          {m.role && <Badge variant="outline">{m.role}</Badge>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-other">Other people</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="report-other"
                    type="email"
                    inputMode="email"
                    placeholder="accounts@yourfirm.sg"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTyped();
                      }
                    }}
                  />
                  <Button variant="outline" onClick={addTyped} disabled={!typed.trim()}>
                    Add
                  </Button>
                </div>
                {others.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {others.map((e) => (
                      <Badge key={e} variant="secondary" className="gap-1 pr-1">
                        {e}
                        <button
                          type="button"
                          aria-label={`Remove ${e}`}
                          className="rounded-sm p-0.5 hover:bg-muted"
                          onClick={() => toggle(e, false)}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-note">Message (optional)</Label>
                <Textarea
                  id="report-note"
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. October numbers for the GST return."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                  {picked.length === 0
                    ? "Pick at least one recipient."
                    : `${picked.length} ${picked.length === 1 ? "recipient" : "recipients"}${
                        picked.length > MAX_RECIPIENTS ? ` (at most ${MAX_RECIPIENTS})` : ""
                      } · ${shownPeriod ? periodLabel(shownPeriod) : "no report built"}`}
                </p>
                <Button
                  onClick={() => void send()}
                  disabled={sending || loading || !report || stale || picked.length === 0 || picked.length > MAX_RECIPIENTS}
                >
                  <Mail className="size-4" aria-hidden /> {sending ? "Sending…" : "Send report"}
                </Button>
              </div>

              {recent.length > 0 && (
                <div className="space-y-2">
                  <Label>Recently sent</Label>
                  <ul className="divide-y rounded-md border text-sm">
                    {recent.map((s, i) => (
                      <li key={`${s.at}-${i}`} className="flex flex-col gap-0.5 px-3 py-2 md:flex-row md:items-center md:justify-between">
                        <span>
                          {s.period ? periodLabel(s.period) : "—"} → {s.sent.join(", ") || "nobody"}
                          {s.failed.length > 0 && (
                            <span className="text-destructive"> (failed: {s.failed.join(", ")})</span>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {formatAdminDateTimeMY(s.at)}
                          {s.by ? ` · ${s.by}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
