"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { getApiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import {
  type RecommendationResponseData,
  CustomizationStepComponents,
} from "@/components/shop/customization-steps";

type Step = "welcome" | "height" | "sleep-position" | "recommendation" | "components" | "purchase";
type HeightUnit = "cm" | "m";
type SleepPosition = "side" | "stomach" | "other";
type BolsterLength = "short" | "medium" | "long";

type State = {
  step: Step;
  heightUnit: HeightUnit;
  heightCm: string;
  sleepPosition: SleepPosition | null;
};

const STORAGE_KEY = "mbolster_config_v3";

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toDisplayHeight(state: Pick<State, "heightUnit" | "heightCm">): string {
  const cm = toNumber(state.heightCm);
  if (cm === null) return "";
  if (state.heightUnit === "cm") return String(Math.round(cm));
  const meters = cm / 100;
  return String(Math.round(meters * 100) / 100);
}

function toCmValue(unit: HeightUnit, raw: string): string {
  const n = toNumber(raw);
  if (n === null) return raw.trim() ? raw : "";
  const cm = unit === "cm" ? n : n * 100;
  const clamped = clampNumber(cm, 80, 250);
  return String(Math.round(clamped * 10) / 10);
}

function labelForSleepPosition(v: SleepPosition): string {
  if (v === "side") return "Side sleeper";
  if (v === "stomach") return "Stomach sleeper";
  return "Other / mixed";
}

const STEP_ORDER: Step[] = [
  "welcome",
  "height",
  "sleep-position",
  "recommendation",
  "components",
  "purchase",
];

function stepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

export default function MbolsterConfigPage() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const mbolsterHref = withLocale("/mbolster", locale);

  const [state, setState] = React.useState<State>({
    step: "welcome",
    heightUnit: "m",
    heightCm: "",
    sleepPosition: null,
  });

  const [shopRecommendation, setShopRecommendation] =
    React.useState<RecommendationResponseData | null>(null);
  const [shopLoading, setShopLoading] = React.useState(false);
  const [selectedCover, setSelectedCover] = React.useState<number | null>(null);
  const [selectedCase, setSelectedCase] = React.useState<number | null>(null);
  const [selectedAddons, setSelectedAddons] = React.useState<Set<number>>(new Set());
  const [addons, setAddons] = React.useState<
    { item_id: number; name: string; msrp: number; currency: string }[]
  >([]);
  const [holdEmail, setHoldEmail] = React.useState("");
  const [holdAddress, setHoldAddress] = React.useState({
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "SG",
  });
  const [shippingMethods, setShippingMethods] = React.useState<
    {
      id: string;
      slug: string;
      base_rate: number;
      free_above: number | null;
      content: Record<string, { name?: string }>;
    }[]
  >([]);
  const [selectedShippingId, setSelectedShippingId] = React.useState("");
  const [holdSubmitting, setHoldSubmitting] = React.useState(false);

  const shopCurrency = shopRecommendation?.variant?.currency ?? "SGD";
  const shopBasePrice = shopRecommendation?.variant?.price ?? 0;
  const suggestedLength = (shopRecommendation?.bolster_variant ?? null) as BolsterLength | null;

  const addonTotal = React.useMemo(() => {
    let sum = 0;
    for (const a of addons) {
      if (selectedAddons.has(a.item_id)) sum += a.msrp;
    }
    return sum;
  }, [addons, selectedAddons]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<State> | null;
      if (!parsed) return;
      setState((prev) => ({
        ...prev,
        step: STEP_ORDER.includes(parsed.step as Step) ? (parsed.step as Step) : prev.step,
        heightUnit: (parsed.heightUnit as HeightUnit) ?? prev.heightUnit,
        heightCm: typeof parsed.heightCm === "string" ? parsed.heightCm : prev.heightCm,
        sleepPosition: (parsed.sleepPosition as SleepPosition) ?? prev.sleepPosition,
      }));
    } catch {
      // best-effort
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // best-effort
    }
  }, [state]);

  const heightNum = toNumber(state.heightCm);

  const progressValue = React.useMemo(() => {
    const idx = stepIndex(state.step);
    return idx <= 0 ? 0 : Math.round((idx / (STEP_ORDER.length - 1)) * 100);
  }, [state.step]);

  const goNext = () => {
    setState((s) => {
      const idx = STEP_ORDER.indexOf(s.step);
      const next = idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : s.step;
      return { ...s, step: next };
    });
  };

  const goBack = () => {
    setState((s) => {
      const idx = STEP_ORDER.indexOf(s.step);
      const prev = idx > 0 ? STEP_ORDER[idx - 1] : s.step;
      return { ...s, step: prev };
    });
  };

  const reset = () => {
    setState({
      step: "welcome",
      heightUnit: "m",
      heightCm: "",
      sleepPosition: null,
    });
    setShopRecommendation(null);
    setSelectedCover(null);
    setSelectedCase(null);
    setSelectedAddons(new Set());
    setAddons([]);
    setHoldEmail("");
    setHoldAddress({
      recipient: "",
      line1: "",
      line2: "",
      city: "",
      postal_code: "",
      country: "SG",
    });
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const fetchBolsterRecommendation = React.useCallback(async () => {
    if (!heightNum) return;
    setShopLoading(true);
    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bolster_preferences: {
            height_cm: heightNum,
            sleep_position: state.sleepPosition ?? "other",
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          getApiErrorMessage(err.error, `Failed to get recommendation (${res.status})`),
        );
      }

      const data: RecommendationResponseData = await res.json();
      setShopRecommendation(data);

      const defaultCover = data.components.covers.find((c) => c.base_quantity > 0);
      const defaultCase = data.components.cases.find((c) => c.base_quantity > 0);
      if (defaultCover) setSelectedCover(defaultCover.item_id);
      if (defaultCase) setSelectedCase(defaultCase.item_id);

      setState((s) => ({ ...s, step: "recommendation" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get recommendation");
    } finally {
      setShopLoading(false);
    }
  }, [heightNum, state.sleepPosition]);

  // Load add-ons + shipping on purchase step.
  React.useEffect(() => {
    if (state.step !== "purchase") return;

    fetch("/api/results/addons")
      .then((r) => r.json())
      .then((d: { addons?: typeof addons }) => {
        const list = d.addons ?? [];
        setAddons(list);
        setSelectedAddons((prev) => {
          const valid = new Set(list.map((a) => a.item_id));
          return new Set([...prev].filter((id) => valid.has(id)));
        });
      })
      .catch(() => setAddons([]));

    const country = holdAddress.country || "SG";
    fetch(`/api/shop/shipping?country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then(async (d: { rows?: typeof shippingMethods }) => {
        let methods = d.rows ?? [];
        if (methods.length === 0) {
          const all = await fetch("/api/shop/shipping").then((r) => r.json());
          methods = all.rows ?? [];
        }
        setShippingMethods(methods);
        setSelectedShippingId((prev) =>
          methods.some((m) => m.id === prev) ? prev : (methods[0]?.id ?? ""),
        );
      })
      .catch(() => setShippingMethods([]));
  }, [state.step, holdAddress.country]);

  const handleAuthorizeHold = React.useCallback(async () => {
    if (!suggestedLength) {
      toast.error("Missing length recommendation");
      return;
    }
    if (!selectedCover || !selectedCase) {
      toast.error("Choose a cover and case");
      return;
    }
    if (!holdEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    if (
      !holdAddress.recipient ||
      !holdAddress.line1 ||
      !holdAddress.city ||
      !holdAddress.postal_code
    ) {
      toast.error("Shipping address is incomplete");
      return;
    }
    if (!selectedShippingId) {
      toast.error("Choose a shipping method");
      return;
    }

    setHoldSubmitting(true);
    try {
      const res = await fetch("/api/results/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: holdEmail.trim(),
          productType: "bolster",
          suggestedLength,
          measurements: {
            height_cm: heightNum,
            sleep_position: state.sleepPosition,
          },
          preferenceLines: [
            { item_id: selectedCover, quantity: 1, category: "cover" },
            { item_id: selectedCase, quantity: 1, category: "case" },
          ],
          addonLines: [...selectedAddons].map((item_id) => ({ item_id, quantity: 1 })),
          shippingMethodId: selectedShippingId,
          shippingAddress: holdAddress,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data.error, "Failed to start authorization"));
      }
      if (!data.checkoutUrl) throw new Error("Missing checkout URL");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to authorize");
      setHoldSubmitting(false);
    }
  }, [
    suggestedLength,
    selectedCover,
    selectedCase,
    holdEmail,
    holdAddress,
    selectedShippingId,
    selectedAddons,
    heightNum,
    state.sleepPosition,
  ]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 md:px-6">
        {state.step !== "welcome" ? (
          <div className="mb-6">
            <Progress value={progressValue} aria-label="Mbolster customisation progress" />
          </div>
        ) : null}

        {state.step === "welcome" ? (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">Mbolster</div>
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                Customise your Mbolster
              </h1>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Answer a few quick questions, choose cover and case preferences, then authorize
                payment for operator review. You are not charged until you accept the final build.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={goNext}>
                Get started
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href={mbolsterHref}>Learn more</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {state.step === "height" ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-muted-foreground">Step 1</div>
              <h2 className="text-2xl font-semibold tracking-tight">Your height</h2>
              <p className="text-sm text-muted-foreground">
                We use height to recommend a Mbolster length.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Input
                  value={toDisplayHeight(state)}
                  onChange={(e) => {
                    const nextCm = toCmValue(state.heightUnit, e.target.value);
                    setState((s) => ({ ...s, heightCm: nextCm }));
                  }}
                  inputMode="decimal"
                  placeholder={state.heightUnit === "m" ? "e.g. 1.68" : "e.g. 168"}
                  className="h-12 text-lg"
                  autoFocus
                />
                <Tabs
                  value={state.heightUnit}
                  onValueChange={(v) =>
                    setState((s) => ({
                      ...s,
                      heightUnit: v as HeightUnit,
                      heightCm: toCmValue(v as HeightUnit, toDisplayHeight(s)),
                    }))
                  }
                >
                  <TabsList className="h-12">
                    <TabsTrigger value="m" className="px-4">
                      m
                    </TabsTrigger>
                    <TabsTrigger value="cm" className="px-4">
                      cm
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button onClick={goNext} disabled={!toNumber(state.heightCm)}>
                Continue
              </Button>
            </div>
          </Card>
        ) : null}

        {state.step === "sleep-position" ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-muted-foreground">Step 2</div>
              <h2 className="text-2xl font-semibold tracking-tight">Sleep position</h2>
              <p className="text-sm text-muted-foreground">This helps us tailor the guidance.</p>
            </div>

            <div className="grid gap-3">
              {(["side", "stomach", "other"] as const).map((v) => {
                const selected = state.sleepPosition === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, sleepPosition: v }))}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                      selected
                        ? "bg-primary/10 border-primary/30"
                        : "bg-background/50 hover:bg-muted/30",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {labelForSleepPosition(v)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {v === "side"
                        ? "Most common use-case for Mbolster."
                        : v === "stomach"
                          ? "Consider the duo face cover option."
                          : "We'll keep the recommendation flexible."}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button
                onClick={() => void fetchBolsterRecommendation()}
                disabled={!state.sleepPosition || !toNumber(state.heightCm) || shopLoading}
              >
                {shopLoading ? "Loading..." : "Get Recommendation"}
              </Button>
            </div>
          </Card>
        ) : null}

        {state.step === "recommendation" && shopRecommendation && suggestedLength ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-6 text-center">
              <Badge variant="secondary" className="text-xs">
                Recommended length
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight capitalize">{suggestedLength}</h2>
              <p className="text-sm text-muted-foreground">Mbolster</p>
              {shopBasePrice > 0 && (
                <p className="text-lg font-semibold text-primary">
                  {shopCurrency} {shopBasePrice.toFixed(2)}
                </p>
              )}
              <p className="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground text-left">
                {shopRecommendation.recommendation.explanation}
              </p>
              <p className="text-xs text-muted-foreground">
                Fillings are chosen by our team after review. You pick cover and case preferences
                next.
              </p>
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
                <Button onClick={goNext}>Continue</Button>
              </div>
            </div>
          </Card>
        ) : null}

        {state.step === "components" && shopRecommendation ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <CustomizationStepComponents
              components={shopRecommendation.components}
              selectedCover={selectedCover}
              onSelectCover={setSelectedCover}
              selectedCase={selectedCase}
              onSelectCase={setSelectedCase}
              componentQtyOverrides={new Map()}
              onQtyChange={() => {}}
              currency={shopCurrency}
              basePrice={shopBasePrice}
              addonPrice={0}
              onBack={goBack}
              onContinue={goNext}
              preferencesOnly
              continueLabel="Continue to shipping"
            />
          </Card>
        ) : null}

        {state.step === "purchase" && shopRecommendation && suggestedLength ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Authorize & submit</h2>
              <p className="text-sm text-muted-foreground">
                Optional add-ons and shipping. You are not charged until you accept the final build.
              </p>
              <p className="text-sm">
                Length: <span className="font-medium capitalize">{suggestedLength}</span>
              </p>
            </div>

            {addons.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Add-ons (optional)</Label>
                <div className="space-y-2">
                  {addons.map((a) => {
                    const on = selectedAddons.has(a.item_id);
                    return (
                      <button
                        key={a.item_id}
                        type="button"
                        onClick={() => {
                          setSelectedAddons((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.item_id)) next.delete(a.item_id);
                            else next.add(a.item_id);
                            return next;
                          });
                        }}
                        className={`flex w-full items-center justify-between rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 ${
                          on ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <span className="text-sm font-medium">{a.name}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {a.currency} {a.msrp.toFixed(2)}
                          {on && <Check className="ml-2 inline size-4 text-primary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-base font-semibold">Shipping</Label>
              <div className="space-y-2">
                <Label htmlFor="hold-email">Email</Label>
                <Input
                  id="hold-email"
                  type="email"
                  value={holdEmail}
                  onChange={(e) => setHoldEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hold-recipient">Recipient</Label>
                <Input
                  id="hold-recipient"
                  value={holdAddress.recipient}
                  onChange={(e) =>
                    setHoldAddress((a) => ({ ...a, recipient: e.target.value }))
                  }
                  placeholder="Name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hold-line1">Address</Label>
                <Input
                  id="hold-line1"
                  value={holdAddress.line1}
                  onChange={(e) => setHoldAddress((a) => ({ ...a, line1: e.target.value }))}
                  placeholder="Street address"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="hold-city">City</Label>
                  <Input
                    id="hold-city"
                    value={holdAddress.city}
                    onChange={(e) => setHoldAddress((a) => ({ ...a, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hold-postal">Postal code</Label>
                  <Input
                    id="hold-postal"
                    value={holdAddress.postal_code}
                    onChange={(e) =>
                      setHoldAddress((a) => ({ ...a, postal_code: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Shipping method</Label>
                {shippingMethods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No shipping methods available. Add active methods under Settings → Shipping.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {shippingMethods.map((m) => {
                      const label = m.content?.["en-US"]?.name ?? m.slug;
                      const selected = selectedShippingId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedShippingId(m.id)}
                          className={`flex w-full items-center justify-between rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 ${
                            selected ? "border-primary bg-primary/5" : "border-border"
                          }`}
                        >
                          <span className="text-sm font-medium">{label}</span>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            SGD {Number(m.base_rate).toFixed(2)}
                            {selected && <Check className="ml-2 inline size-4 text-primary" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Ballpark (before shipping/tax)</span>
              <span className="font-medium tabular-nums">
                {shopCurrency} {(shopBasePrice + addonTotal).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button
                size="lg"
                onClick={() => void handleAuthorizeHold()}
                disabled={holdSubmitting || !shopRecommendation}
              >
                {holdSubmitting ? "Redirecting…" : "Authorize & submit for review"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button variant="ghost" onClick={reset}>
                Start over
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
