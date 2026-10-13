"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { trackGaEventOnce } from "@/lib/analytics/ga-events";

type BuildSummary = {
  fillingTemplateName: string | null;
  fillingSummary: string[];
  preferences: string[];
  addons: string[];
  pricing: {
    subtotal: number;
    /** Service fees inside the subtotal (ADR 0024). Absent from older responses. */
    services?: Array<{ label: string; amount: number }>;
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
  is_pre_order?: boolean | null;
  /** Assisted: fillings built, cover/case/shipping still to choose (ADR 0017). */
  needs_finish?: boolean;
  build: BuildSummary | null;
  referenceImages?: { id: string; hostedUrl: string }[];
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

/**
 * The same statuses, for a Result with no Authorization hold — an Assisted
 * customisation, or an in-store measurement. Nothing was authorized, so there is
 * no hold to mention and no "we'll capture your card" to promise: at `assigned`
 * the customer pays in full rather than accepting a charge already agreed.
 * Keyed on the missing `payment_intent_id`, never on `source` (ADR 0016).
 */
const NO_HOLD_COPY: Record<string, { title: string; body: string }> = {
  held: {
    title: "Measurements received",
    body: "Thanks — your measurements are with our team and we’re making your build now. We’ll email you when it’s ready, with the final price.",
  },
  assigned: {
    title: "Ready — payment due",
    body: "Your final build is ready. Review it below and pay to confirm your order. Nothing is charged until you do.",
  },
};

/** Assisted customisation, fillings built, finish not chosen yet (ADR 0017). */
const NEEDS_FINISH_COPY = {
  title: "Ready — choose your finish",
  body: "Our team has built your fillings. Choose your cover, case and shipping to see your final price. Nothing is charged until you pay.",
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
  const [acting, setActing] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const topupSessionId = searchParams.get("topup_session_id");

  const reloadResult = async () => {
    const qs = new URLSearchParams();
    if (token) qs.set("token", token);
    if (sessionId) qs.set("session_id", sessionId);
    const res = await fetch(`/api/results/${id}?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Failed to load");
    setResult(data.result);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reloadResult();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on identity params only
  }, [id, token, sessionId]);

  const accept = async (topupSession?: string | null) => {
    setActing(true);
    setActionMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/results/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(token ? { token } : {}),
          ...(topupSession ? { topupSessionId: topupSession } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Accept failed");
      if (data.needsTopUp && data.checkoutUrl) {
        window.location.href = data.checkoutUrl as string;
        return;
      }
      // GA4 purchase: the hold was captured into an Order (this path also runs
      // after a top-up Checkout returns). Once per order in this browser.
      const value = result?.final_amount ?? result?.authorized_amount;
      if (typeof value === "number") {
        const transactionId = data.orderNumber ? String(data.orderNumber) : `result-${id}`;
        trackGaEventOnce(`purchase:${transactionId}`, {
          name: "purchase",
          params: {
            transaction_id: transactionId,
            value,
            currency: result?.currency ?? "SGD",
            items: [
              {
                item_id: `result-${result?.product_type ?? "custom"}`,
                item_name: result?.product_type === "bolster" ? "Custom bolster" : "Custom pillow",
                price: value,
                quantity: 1,
              },
            ],
          },
        });
      }
      setActionMessage(
        data.orderNumber
          ? `Payment captured. Order ${data.orderNumber} is in production.`
          : "Payment captured. Your order is in production.",
      );
      await reloadResult();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setActing(false);
    }
  };

  const decline = async () => {
    setActing(true);
    setActionMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/results/${id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Decline failed");
      setDeclineOpen(false);
      setActionMessage("Hold released. Start a new customisation anytime.");
      await reloadResult();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decline failed");
    } finally {
      setActing(false);
    }
  };

  /**
   * Rebuild this build as a fresh, payable Result.
   *
   * Priced at today's Costings, so the total can differ from the one they were
   * originally quoted. `repriced=1` on the destination makes that change visible
   * on arrival instead of letting them discover it at the payment step.
   */
  const reorder = async () => {
    setActing(true);
    setActionMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/results/${id}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not rebuild this order");
      const qs = new URLSearchParams({ token: data.accessToken as string });
      if (data.priceChanged) qs.set("repriced", "1");
      router.push(
        withLocale(`/results/${encodeURIComponent(data.resultId as string)}?${qs}`, locale),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rebuild this order");
      setActing(false);
    }
  };

  const topupStarted = useRef(false);
  // Resume accept after top-up Checkout returns.
  useEffect(() => {
    if (!topupSessionId || loading || !result || result.status !== "assigned") return;
    if (topupStarted.current) return;
    topupStarted.current = true;
    void accept(topupSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when top-up session present
  }, [topupSessionId, loading, result?.status]);

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
  const hasPaymentHold = Boolean(result?.payment_intent_id);
  // `result` is null while loading, so the no-hold voice waits for the row —
  // otherwise every hold customer sees a flash of the wrong copy first.
  const needsFinish = status === "assigned" && Boolean(result?.needs_finish);
  const copy =
    (needsFinish ? NEEDS_FINISH_COPY : undefined) ??
    (result && !hasPaymentHold ? NO_HOLD_COPY[status] : undefined) ??
    STATUS_COPY[status] ??
    STATUS_COPY.held;
  const size = result?.assigned_size ?? result?.suggested_size;
  const tier = result?.assigned_tier ?? result?.suggested_tier;
  const amount = result?.final_amount ?? result?.authorized_amount;
  const currency = result?.currency ?? "SGD";
  const build = result?.build;
  const showFinalBuild = status === "assigned" || status === "accepted" || status === "captured";
  // A no-hold Result is decidable too: Accept creates a Balance payment Checkout
  // for the whole total instead of capturing a hold (ADR 0016). Gating this on a
  // hold is what used to strand an assigned build with no way to pay for it.
  const canDecide = status === "assigned";
  /** Arrived here from a reorder whose total differs from the original quote. */
  const repriced = searchParams.get("repriced") === "1";
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
    <div className="space-y-3" id="status-journey" data-section="status-journey">
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
    <div className="space-y-2 rounded-lg border p-4 text-sm" id="build-details" data-section="build-details">
      {result.is_pre_order ? (
        <div>
          <Badge variant="secondary">Pre-order</Badge>
        </div>
      ) : null}
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
          {/* Not chosen yet: the stored lines are empty and the price is a placeholder. */}
          {!needsFinish && (
            <>
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
            </>
          )}
          {build.pricing && !needsFinish && (
            <div className="space-y-1 border-t pt-2">
              {(build.pricing.services ?? []).map((s) => (
                <div key={s.label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="tabular-nums">
                    {currency} {s.amount.toFixed(2)}
                  </span>
                </div>
              ))}
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

      {canDecide && needsFinish && (
        <div className="flex flex-wrap gap-2 border-t pt-3" id="decide" data-section="decide">
          <Button asChild size="sm">
            <a
              href={withLocale(
                `/mp-config?result=${encodeURIComponent(id)}${token ? `&token=${encodeURIComponent(token)}` : ""}`,
                locale,
              )}
            >
              Choose your finish
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={acting}
            onClick={() => setDeclineOpen(true)}
          >
            Decline
          </Button>
        </div>
      )}

      {repriced && canDecide && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          Our prices have changed since your original quote, so this total is
          today&rsquo;s price for the same build.
        </p>
      )}
      {canDecide && !needsFinish && (
        <div className="flex flex-wrap gap-2 border-t pt-3" id="decide" data-section="decide">
          <Button
            variant="default"
            size="sm"
            disabled={acting}
            onClick={() => void accept()}
          >
            {acting
              ? "Working…"
              : hasPaymentHold
                ? "Accept"
                : amount != null
                  ? `Pay ${currency} ${Number(amount).toFixed(2)}`
                  : "Pay"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={acting}
            onClick={() => setDeclineOpen(true)}
          >
            Decline
          </Button>
          {result.authorized_amount != null &&
            result.final_amount != null &&
            Number(result.final_amount) > Number(result.authorized_amount) && (
              <p className="w-full text-xs text-muted-foreground">
                Final total exceeds your hold — Accept will ask you to approve a top-up
                before payment is captured.
              </p>
            )}
        </div>
      )}

      {(status === "declined" || status === "expired") && (
        <div className="space-y-2 border-t pt-3" id="reorder" data-section="reorder">
          <div className="flex flex-wrap gap-2">
            {/* The build is still on the row — offer it back before offering the
                questionnaire again. Until this existed, the only way back was to
                answer every question a second time. */}
            <Button size="sm" onClick={reorder} disabled={acting}>
              {acting ? "Rebuilding…" : "Reorder this build"}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={withLocale(
                result.product_type === "bolster" ? "/mbolster-config" : "/mp-config",
                locale,
              )}>
                Start from scratch
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Reordering makes a new order with exactly this configuration, priced
            at today&rsquo;s prices. Nothing is charged until you pay.
          </p>
        </div>
      )}

      {(status === "accepted" || status === "captured") && (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          After Accept you cannot cancel before delivery. Refunds require an in-person
          return and operator approval.
        </p>
      )}

      {actionMessage && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{actionMessage}</p>
      )}

      {result.referenceImages?.length ? (
        <div className="border-t pt-3">
          <div className="text-muted-foreground">Reference photos</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {result.referenceImages.map((img) => (
              // ponytail: native anchor opens full size, no lightbox lib
              <a key={img.id} href={img.hostedUrl} target="_blank" rel="noreferrer">
                <img
                  src={img.hostedUrl}
                  alt="Reference photo"
                  className="aspect-square w-full rounded-md border object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  const declineDialog = (
    <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this build?</DialogTitle>
          <DialogDescription>
            Your card authorization hold will be released and you will need to start
            customisation again. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={acting} onClick={() => setDeclineOpen(false)}>
            Keep reviewing
          </Button>
          <Button variant="destructive" disabled={acting} onClick={() => void decline()}>
            {acting ? "Releasing…" : "Release hold and decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const resultsTable = showTable ? (
    <div className="overflow-hidden rounded-lg border max-lg:order-last">
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
      <div className={cn("relative space-y-6", showTable ? "max-w-5xl" : "max-w-3xl")}>
        {/* ponytail: status as section so hold→accept drop-off is diagnosable */}
        <div
          key={status}
          id={`status-${status}`} data-section={`status-${status}`}
          data-step={status}
          className="pointer-events-none absolute left-0 top-0 h-4 w-full"
          aria-hidden
        />
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
        {declineDialog}
      </div>
    );
  }

  // Guest: standalone status page (token link).
  return (
    <div className="relative mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      {/* ponytail: status as section so hold→accept drop-off is diagnosable */}
      <div
        key={status}
        id={`status-${status}`} data-section={`status-${status}`}
        data-step={status}
        className="pointer-events-none absolute left-0 top-0 h-4 w-full"
        aria-hidden
      />
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

        <Card className="space-y-4 p-5 sm:p-6" id="sign-in" data-section="sign-in">
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
      {declineDialog}
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
