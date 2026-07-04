"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Check, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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

type BlogCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string | null;
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

const WASH_CARE_TIPS = [
  "Remove the cover and case — wash them like normal laundry.",
  "Protector traps moisture; wash it about every 6 months.",
  "Fillings are modular and washable when removed from the shell.",
];

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
  const [signedIn, setSignedIn] = useState(false);
  const [posts, setPosts] = useState<BlogCard[]>([]);

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
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  useEffect(() => {
    fetch("/api/blogs?status=published")
      .then((r) => r.json())
      .then((d: { rows?: Array<Record<string, unknown>> }) => {
        const rows = d.rows ?? [];
        const cards: BlogCard[] = rows.slice(0, 3).map((row) => {
          const content = (row.content ?? {}) as Record<
            string,
            { title?: string; description?: string }
          >;
          const loc = content[locale] ?? content[DEFAULT_LOCALE] ?? Object.values(content)[0];
          return {
            id: String(row.id),
            slug: String(row.slug ?? ""),
            title: loc?.title ?? "Untitled",
            description: loc?.description ?? "",
            image_url: (row.image_url as string | null) ?? null,
          };
        });
        setPosts(cards);
      })
      .catch(() => setPosts([]));
  }, [locale]);

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

  const statusReturnPath = useMemo(() => {
    const qs = new URLSearchParams();
    if (token) qs.set("token", token);
    const q = qs.toString();
    return withLocale(`/results/${id}${q ? `?${q}` : ""}`, locale);
  }, [id, token, locale]);

  const createAccountHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (result?.customer_email) qs.set("email", result.customer_email);
    qs.set("next", statusReturnPath);
    return withLocale(`/account/login?${qs.toString()}`, locale);
  }, [result?.customer_email, statusReturnPath, locale]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:py-14">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* Primary status column */}
        <div className="space-y-6">
          <Card className="space-y-5 p-6">
            <div>
              <p className="text-sm text-muted-foreground">Result status</p>
              <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{copy.body}</p>
            </div>

            {/* Journey progress */}
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
                        done && "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
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

            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            {result && (
              <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
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
            )}

            {/* Create account — track status later */}
            {!signedIn && result?.customer_email && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <UserPlus className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-medium">Save this result to your account</p>
                    <p className="text-xs text-muted-foreground">
                      Create an account with{" "}
                      <span className="font-medium text-foreground">{result.customer_email}</span>{" "}
                      to check status anytime under My results.
                    </p>
                    <Button asChild size="sm">
                      <Link href={createAccountHref}>Create account</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={withLocale("/mp-config", locale)}>New customisation</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={withLocale("/account/results", locale)}>My results</Link>
              </Button>
            </div>
          </Card>
        </div>

        {/* Side content: wash care + blog */}
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="relative h-40 w-full bg-muted">
              <Image
                src="/wash-care.webp"
                alt="Wash care"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
            </div>
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Wash care</h2>
                <Badge variant="secondary" className="text-xs">
                  100% washable
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Modular parts make cleaning simple — keep your setup fresh without replacing the whole pillow.
              </p>
              <ul className="space-y-2 text-sm">
                {WASH_CARE_TIPS.map((tip) => (
                  <li key={tip} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">From the blog</h2>
              <Link
                href={withLocale("/blog", locale)}
                className="text-xs font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sleep tips and care guides will appear here when published.
              </p>
            ) : (
              <ul className="space-y-3">
                {posts.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={withLocale(`/blog/${post.slug}`, locale)}
                      className="group flex gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/40"
                    >
                      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                        {post.image_url ? (
                          <Image
                            src={post.image_url}
                            alt=""
                            fill
                            className="object-cover transition-transform group-hover:scale-105"
                            sizes="64px"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                          {post.title}
                        </p>
                        {post.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {post.description}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
