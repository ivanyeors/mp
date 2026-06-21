"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { useCart } from "@/lib/shop/cart-context";
import {
  type RecommendationResponseData,
  HARDCODED_UPSELLS,
  computeFillingLines,
  computeComponentLines,
  computeAddonPrice,
  computeUpsellTotal,
  CustomizationStepRecommendation,
  CustomizationStepComponents,
  CustomizationStepSummary,
} from "@/components/shop/customization-steps";

type Step = "welcome" | "height" | "sleep-position" | "recommendation" | "components" | "summary-cart";
type HeightUnit = "cm" | "m";
type SleepPosition = "side" | "stomach" | "other";

type State = {
  step: Step;
  heightUnit: HeightUnit;
  heightCm: string;
  sleepPosition: SleepPosition | null;
};

const STORAGE_KEY = "mbolster_config_v2";

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

const STEP_ORDER: Step[] = ["welcome", "height", "sleep-position", "recommendation", "components", "summary-cart"];

function stepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

export default function MbolsterConfigPage() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const mbolsterHref = withLocale("/mbolster", locale);

  const { addItem } = useCart();

  const [state, setState] = React.useState<State>({
    step: "welcome",
    heightUnit: "m",
    heightCm: "",
    sleepPosition: null,
  });

  // Shop customization state
  const [shopRecommendation, setShopRecommendation] = React.useState<RecommendationResponseData | null>(null);
  const [shopLoading, setShopLoading] = React.useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<number | null>(null);
  const [selectedCover, setSelectedCover] = React.useState<number | null>(null);
  const [selectedCase, setSelectedCase] = React.useState<number | null>(null);
  const [componentQtyOverrides, setComponentQtyOverrides] = React.useState<Map<number, number>>(new Map());
  const [selectedUpsells, setSelectedUpsells] = React.useState<Set<number>>(new Set());

  const shopCurrency = shopRecommendation?.variant?.currency ?? "SGD";
  const shopBasePrice = shopRecommendation?.variant?.price ?? 0;

  const shopFillingLines = React.useMemo(
    () => computeFillingLines(shopRecommendation, selectedTemplateId),
    [shopRecommendation, selectedTemplateId]
  );
  const shopComponentLines = React.useMemo(
    () => computeComponentLines(shopRecommendation, selectedCover, selectedCase, componentQtyOverrides),
    [shopRecommendation, selectedCover, selectedCase, componentQtyOverrides]
  );
  const shopAddonPrice = React.useMemo(
    () => computeAddonPrice(shopRecommendation, shopComponentLines),
    [shopComponentLines, shopRecommendation]
  );
  const shopUpsellTotal = React.useMemo(
    () => computeUpsellTotal(selectedUpsells),
    [selectedUpsells]
  );
  const shopTotalPrice = shopBasePrice + shopAddonPrice + shopUpsellTotal;

  // Persist state to localStorage
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
    setSelectedTemplateId(null);
    setSelectedCover(null);
    setSelectedCase(null);
    setComponentQtyOverrides(new Map());
    setSelectedUpsells(new Set());
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
        throw new Error(getApiErrorMessage(err.error, `Failed to get recommendation (${res.status})`));
      }

      const data: RecommendationResponseData = await res.json();
      setShopRecommendation(data);
      setSelectedTemplateId(null);

      const defaultCover = data.components.covers.find((c) => c.base_quantity > 0);
      const defaultCase = data.components.cases.find((c) => c.base_quantity > 0);
      if (defaultCover) setSelectedCover(defaultCover.item_id);
      if (defaultCase) setSelectedCase(defaultCase.item_id);
      setComponentQtyOverrides(new Map());

      // Auto-advance to recommendation step
      setState((s) => ({ ...s, step: "recommendation" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get recommendation");
    } finally {
      setShopLoading(false);
    }
  }, [heightNum, state.sleepPosition]);

  const handleApplyAndAddToCart = React.useCallback(async () => {
    if (!shopRecommendation || !shopRecommendation.variant) {
      toast.error("No variant available");
      return;
    }

    setShopLoading(true);
    try {
      const coverComp = shopComponentLines.find((c) => c.category === "cover");
      const caseComp = shopComponentLines.find((c) => c.category === "case");
      const activeUpsells = HARDCODED_UPSELLS.filter((u) => selectedUpsells.has(u.item_id));

      const res = await fetch("/api/shop/customize?action=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: shopRecommendation.variant.id,
          pillow_product_id: shopRecommendation.pillow_product.id,
          filling_lines: shopFillingLines,
          cover_variant: coverComp?.name ?? undefined,
          case_variant: caseComp?.name ?? undefined,
          component_quantities: shopComponentLines,
          upsells: activeUpsells,
          bom_template_id: selectedTemplateId ?? undefined,
          llm_metadata: {
            source: "mbolster-config",
            height_cm: heightNum,
            sleep_position: state.sleepPosition,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(err.error, "Failed to apply customization"));
      }

      const data = await res.json();

      addItem({
        variantId: shopRecommendation.variant.id,
        productId: shopRecommendation.variant.product_id,
        productSlug: `mbolster-${shopRecommendation.pillow_product.size?.toLowerCase()}`,
        productTitle: `Mbolster Size ${shopRecommendation.pillow_product.size}`,
        variantTitle: `Size ${shopRecommendation.pillow_product.size}`,
        imageUrl: null,
        price: shopBasePrice,
        compareAtPrice: null,
        currency: shopCurrency,
        quantity: 1,
        customizationId: data.customization_id,
        customizationSummary: data.summary,
        addonPrice: data.total_addon_price,
      });

      toast.success("Added to cart!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to cart");
    } finally {
      setShopLoading(false);
    }
  }, [
    shopRecommendation, shopFillingLines, shopComponentLines, selectedTemplateId,
    selectedUpsells, heightNum, state.sleepPosition, shopBasePrice, shopCurrency, addItem,
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
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Customise your Mbolster</h1>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Answer a few quick questions to get a recommended size, customize your components, and add to cart.
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
                We use height to recommend a Mbolster size.
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
                  onValueChange={(v) => setState((s) => ({ ...s, heightUnit: v as HeightUnit, heightCm: toCmValue(v as HeightUnit, toDisplayHeight(s)) }))}
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
                      selected ? "bg-primary/10 border-primary/30" : "bg-background/50 hover:bg-muted/30",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold text-foreground">{labelForSleepPosition(v)}</div>
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
                onClick={() => {
                  const heightCm = toNumber(state.heightCm);
                  if (!heightCm || !state.sleepPosition) return;
                  router.push(
                    withLocale(
                      `/mp-maker?product=bolster&height=${Math.round(heightCm)}&position=${state.sleepPosition}`,
                      locale
                    )
                  );
                }}
                disabled={!state.sleepPosition || !toNumber(state.heightCm)}
              >
                Get Recommendation
              </Button>
            </div>
          </Card>
        ) : null}

        {state.step === "recommendation" && shopRecommendation ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <CustomizationStepRecommendation
              data={shopRecommendation}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              fillingLines={shopFillingLines}
              currency={shopCurrency}
              basePrice={shopBasePrice}
              onContinue={goNext}
              productLabel="Mbolster"
            />
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
              componentQtyOverrides={componentQtyOverrides}
              onQtyChange={(itemId, qty) => {
                setComponentQtyOverrides((prev) => {
                  const next = new Map(prev);
                  next.set(itemId, qty);
                  return next;
                });
              }}
              currency={shopCurrency}
              basePrice={shopBasePrice}
              addonPrice={shopAddonPrice}
              onBack={goBack}
              onContinue={goNext}
            />
          </Card>
        ) : null}

        {state.step === "summary-cart" && shopRecommendation ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <CustomizationStepSummary
              data={shopRecommendation}
              fillingLines={shopFillingLines}
              componentLines={shopComponentLines}
              selectedCover={selectedCover}
              selectedCase={selectedCase}
              basePrice={shopBasePrice}
              addonPrice={shopAddonPrice}
              upsellTotal={shopUpsellTotal}
              totalPrice={shopTotalPrice}
              currency={shopCurrency}
              selectedUpsells={selectedUpsells}
              onToggleUpsell={(itemId) => {
                setSelectedUpsells((prev) => {
                  const next = new Set(prev);
                  if (next.has(itemId)) next.delete(itemId);
                  else next.add(itemId);
                  return next;
                });
              }}
              isLoading={shopLoading}
              onBack={goBack}
              onAddToCart={handleApplyAndAddToCart}
              productLabel="Mbolster"
            />

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
