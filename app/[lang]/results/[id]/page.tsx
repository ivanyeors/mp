"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, usePathname, useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoginForm } from "@/components/auth/login-form";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type BuildSummary = {
  fillingTemplateName: string | null;
  fillingSummary: string[];
  preferences: string[];
  addons: string[];
  pricing: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
  } | null;
};

type ResultPublic = {
  id: string;
  status: string | null;
  product_type: string | null;
  suggested_size: string | null;
  suggested_tier: string | null;
  suggested_length: string | null;
  assigned_size: string | null;
  assigned_tier: string | null;
  assigned_length: string | null;
  preference_lines: unknown;
  addon_lines: unknown;
  shipping_method: string | null;
  authorized_amount: number | null;
  final_amount: number | null;
  currency: string | null;
  payment_intent_id: string | null;
  customer_email: string | null;
  build: BuildSummary | null;
};

type ResultListRow = {
  id: string;
  status: string | null;
  suggested_size: string | null;
  suggested_tier: string | null;
  assigned_size: string | null;
  assigned_tier: string | null;
  authorized_amount: number | null;
  final_amount: number | null;
  currency: string | null;
  access_token: string | null;
  created_at: string;
};

const JOURNEY_STEPS = [
  { id: "submitted", label: "Submitted" },
  { id: "review", label: "Operator review" },
  { id: "decide", label: "Your decision" },
  { id: "production", label: "In production" },
] as const;

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  held: {
    title: "Pending review",
    body: "We’re reviewing your measurements. You’ll be able to accept or decline the final build soon.",
  },
  assigned: {
    title: "Ready for your decision",
    body: "Your final build is ready to accept or decline.",
  },
  accepted: {
    title: "Accepted",
    body: "Payment is being captured and production will start.",
  },
  declined: {
    title: "Declined",
    body: "Your hold was released. Start a new customisation anytime.",
  },
  expired: {
    title: "Expired",
    body: "This review window expired and the hold was released.",
  },
  captured: {
    title: "In production",
    body: "Payment captured — we’re making your pillow.",
  },
};

function journeyIndex(status: string): number {
  switch (status) {
    case "held":
      return 1;
    case "assigned":
      return 2;
    case "accepted":
    case "captured":
      return 3;
    case "declined":
    case "expired":
      return 1;
    default:
      return 0;
  }
}

function statusTitle(status: string | null): string {
  if (!status) return "Unknown";
  return STATUS_COPY[status]?.title ?? status;
}

function ResultStatusPage() {
  const params = useParams<{ id: string; lang?: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const id = params.id;
  const token = searchParams.get("token");
  const sessionId = searchParams.get("session_id");

  const [result, setResult] = useState<ResultPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [myResults, setMyResults] = useState<ResultListRow[]>([]);

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

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(Boolean(data.user));
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setMyResults([]);
      return;
    }
    let cancelled = false;
    fetch("/api/results")
      .then((r) => r.json())
      .then((d: { rows?: ResultListRow[] }) => {
        if (!cancelled) setMyResults(d.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setMyResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const status = result?.status ?? "held";
  const copy = STATUS_COPY[status] ?? STATUS_COPY.held;
  const size = result?.assigned_size ?? result?.suggested_size;
  const tier = result?.assigned_tier ?? result?.suggested_tier;
  const amount = result?.final_amount ?? result?.authorized_amount;
  const currency = result?.currency ?? "SGD";
  const build = result?.build;
  const showFinalBuild = status === "assigned" || status === "accepted" || status === "captured";
  const activeStep = journeyIndex(status);
  const progressValue = ((activeStep + 1) / JOURNEY_STEPS.length) * 100;
  const isTerminalFail = status === "declined" || status === "expired";
  const showTable = signedIn && myResults.length > 1;

  const statusReturnPath = useMemo(() => {
    const qs = new URLSearchParams();
    if (token) qs.set("token", token);
    const q = qs.toString();
    return withLocale(`/results/${id}${q ? `?${q}` : ""}`, locale);
  }, [id, token, locale]);

  const journey = (
    <div className="space-y-3">
      <Progress value={isTerminalFail ? 25 : progressValue} className="h-2" />
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {JOURNEY_STEPS.map((step, index) => {
          const done = !isTerminalFail && index < activeStep;
          const current = !isTerminalFail && index === activeStep;
          return (
            <li
              key={step.id}
              className={cn(
                "rounded-lg border px-2 py-2 text-center text-xs",
                current && "border-primary bg-primary/5 font-medium text-primary",
                done &&
                  "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
                !done && !current && "text-muted-foreground",
              )}
            >
              <div className="mx-auto mb-1 flex size-5 items-center justify-center rounded-full border text-[10px]">
                {done ? <Check className="size-3" /> : index + 1}
              </div>
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );

  const details = result ? (
    <div className="space-y-2 rounded-lg border p-4 text-sm">
      {result.product_type === "bolster" ? (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Length</span>
          <span className="font-medium">
            {result.assigned_length ?? result.suggested_length ?? "—"}
          </span>
        </div>
      ) : (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Size</span>
            <span className="font-medium">{size ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Tier</span>
            <span className="font-medium capitalize">{tier ?? "—"}</span>
          </div>
        </>
      )}

      {showFinalBuild && build && (
        <>
          <div className="pt-2">
            <div className="text-muted-foreground">Fillings</div>
            <ul className="mt-1 list-disc pl-4">
              {(build.fillingSummary.length
                ? build.fillingSummary
                : [build.fillingTemplateName ?? "—"]
              ).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-muted-foreground">Preferences</div>
            <ul className="mt-1 list-disc pl-4">
              {(build.preferences.length ? build.preferences : ["—"]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-muted-foreground">Add-ons</div>
            <ul className="mt-1 list-disc pl-4">
              {(build.addons.length ? build.addons : ["—"]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {build.pricing && (
            <div className="space-y-1 border-t pt-2">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {currency} {build.pricing.subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Shipping</span>
                <span className="tabular-nums">
                  {currency} {build.pricing.shipping.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">
                  {currency} {build.pricing.tax.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between gap-4 font-medium">
                <span>Total</span>
                <span className="tabular-nums">
                  {currency} {build.pricing.total.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {!showFinalBuild && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Authorized (not charged)</span>
          <span className="font-medium tabular-nums">
            {amount != null ? `${currency} ${Number(amount).toFixed(2)}` : "—"}
          </span>
        </div>
      )}

      {status === "assigned" && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button disabled variant="default" size="sm">
            Accept
          </Button>
          <Button disabled variant="outline" size="sm">
            Decline
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Accept and Decline open in the next release.
          </p>
        </div>
      )}
    </div>
  ) : null;

  const resultsTable = showTable ? (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-medium">My results</h2>
        <p className="text-xs text-muted-foreground">Select a result to view status.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Build</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {myResults.map((row) => {
            const rowSize = row.assigned_size ?? row.suggested_size;
            const rowTier = row.assigned_tier ?? row.suggested_tier;
            const selected = row.id === id;
            return (
              <TableRow
                key={row.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "cursor-pointer",
                  selected && "bg-primary/5 hover:bg-primary/10",
                )}
                onClick={() => router.push(withLocale(`/results/${row.id}`, locale))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(withLocale(`/results/${row.id}`, locale));
                  }
                }}
              >
                <TableCell className="font-medium capitalize">
                  {rowSize ?? "—"} · {rowTier ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {statusTitle(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  ) : null;

  // Wait for auth so we don't flash the guest layout inside the account shell.
  if (!authReady) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Signed-in: settings-style content (shell provides chrome).
  if (signedIn) {
    return (
      <div className={cn("space-y-6", showTable ? "max-w-5xl" : "max-w-3xl")}>
        {showTable ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            {resultsTable}
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
              </div>
              {journey}
              {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {details}
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
            </div>
            {journey}
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {details}
          </>
        )}
      </div>
    );
  }

  // Guest: standalone status page (token link).
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-5 sm:gap-6">
        <Card className="space-y-5 p-5 sm:p-6">
          <div>
            <p className="text-sm text-muted-foreground">Result status</p>
            <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{copy.body}</p>
          </div>
          {journey}
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {details}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Sign up / sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save this result to your account so you can check status anytime.
              {result?.customer_email ? (
                <>
                  {" "}
                  We’ll use{" "}
                  <span className="font-medium text-foreground">{result.customer_email}</span>.
                </>
              ) : null}
            </p>
          </div>
          <LoginForm
            nextPath={statusReturnPath}
            initialEmail={result?.customer_email ?? ""}
            submitLabel="Email me a sign-in link"
          />
        </Card>
      </div>
    </div>
  );
}

export default function ResultStatusPageRoute() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <ResultStatusPage />
    </Suspense>
  );
}
