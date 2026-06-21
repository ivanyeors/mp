"use client";

import { useEffect, useCallback, useState, Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { X, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Particles } from "@/components/ui/particles";
import { DotPattern } from "@/components/ui/shadcn-io/dot-pattern";

import { BuilderProvider, useBuilder, type ProductType } from "./components/BuilderProvider";
import { ProductVisual } from "./components/ProductVisual";
import { StepIndicator } from "./components/StepIndicator";
import { BottomBar } from "./components/BottomBar";
import { StepPreferences } from "./components/StepPreferences";
import { StepRecommendation } from "./components/StepRecommendation";
import { StepComponents } from "./components/StepComponents";
import { StepSummary, buildCustomizeApplyPayload, canApplyRecommendation, getCartProductInfo } from "./components/StepSummary";

import { useCart } from "@/lib/shop/cart-context";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getApiErrorMessage } from "@/lib/utils";
import {
  computeFillingLines,
  computeComponentLines,
} from "@/components/shop/customization-steps";

// ─── Config Warm Start Handler ──────────────────────────────

function ConfigLoader() {
  const builder = useBuilder();
  const searchParams = useSearchParams();
  const configId = searchParams.get("config");
  const heightParam = searchParams.get("height");
  const positionParam = searchParams.get("position");

  // Handle direct bolster params from mbolster-config redirect
  const loadBolsterDirect = useCallback(async (height: number, position: string) => {
    builder.setIsLoadingRecommendation(true);
    builder.goToStep("recommendation");
    builder.setBolsterPreferences({ height_cm: height, sleep_position: position as "side" | "stomach" | "other" });

    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bolster_preferences: { height_cm: height, sleep_position: position } }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to get recommendation"));
        builder.goToStep("preferences");
        return;
      }
      builder.setRecommendation(data);
      const defaultCover = data.components?.covers?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      const defaultCase = data.components?.cases?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      if (defaultCover) builder.setSelectedCover(defaultCover.item_id);
      if (defaultCase) builder.setSelectedCase(defaultCase.item_id);
      builder.setConfigLoaded(true);
    } catch {
      toast.error("Something went wrong");
      builder.goToStep("preferences");
    } finally {
      builder.setIsLoadingRecommendation(false);
    }
  }, [builder]);

  useEffect(() => {
    if (heightParam && positionParam && !builder.configLoaded && !builder.isLoadingRecommendation) {
      const h = parseInt(heightParam, 10);
      if (h >= 80 && h <= 250) {
        loadBolsterDirect(h, positionParam);
      }
    }
  }, [heightParam, positionParam, builder.configLoaded, builder.isLoadingRecommendation, loadBolsterDirect]);

  const loadConfig = useCallback(async (id: string) => {
    builder.setConfigId(id);
    builder.setIsLoadingRecommendation(true);
    builder.goToStep("recommendation");

    try {
      const responseRes = await fetch(`/api/mp-config/responses/${id}`);
      const responseData = await responseRes.json();

      if (!responseData.ok || !responseData.response) {
        toast.error("Could not load your measurement data");
        builder.goToStep("preferences");
        return;
      }

      const data = responseData.response.data;

      const measurementPreferences = {
        measurements: {
          shoulder_length_cm: parseFloat(data.shoulderLength) || 0,
          neck_to_back_cm: parseFloat(data.neckToBack) || 0,
          head_to_back_cm: parseFloat(data.headToBack) || 0,
          neck_length_cm: parseFloat(data.neckLength) || 0,
        },
        demographics: {
          gender: data.gender ?? "",
          age_group: data.ageGroup ?? "",
        },
        health: {
          blood_pressure: data.bloodPressureLevel ?? "",
          ear_discomfort_side_sleep: data.earDiscomfortSideSleep === "yes",
          bed_firmness: data.bedFirmness ?? "",
          acid_reflux: data.acidReflux === "yes",
          sleep_pain_areas: data.sleepPainAreas ?? [],
          sleep_position_type: data.sleepPositionType ?? [],
          uses_bolster: data.usesBolster === "yes",
        },
      };

      const customizeRes = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurement_preferences: measurementPreferences }),
      });
      const customizeData = await customizeRes.json();

      if (!customizeData.ok) {
        toast.error(getApiErrorMessage(customizeData.error, "Failed to get recommendation"));
        builder.goToStep("preferences");
        return;
      }

      builder.setRecommendation(customizeData);

      const defaultCover = customizeData.components?.covers?.find(
        (c: { base_quantity: number }) => c.base_quantity > 0
      );
      const defaultCase = customizeData.components?.cases?.find(
        (c: { base_quantity: number }) => c.base_quantity > 0
      );
      if (defaultCover) builder.setSelectedCover(defaultCover.item_id);
      if (defaultCase) builder.setSelectedCase(defaultCase.item_id);

      builder.setConfigLoaded(true);
    } catch {
      toast.error("Something went wrong loading your data");
      builder.goToStep("preferences");
    } finally {
      builder.setIsLoadingRecommendation(false);
    }
  }, [builder]);

  useEffect(() => {
    if (configId && !builder.configLoaded && !builder.isLoadingRecommendation) {
      loadConfig(configId);
    }
  }, [configId, builder.configLoaded, builder.isLoadingRecommendation, loadConfig]);

  return null;
}

// ─── Step Renderer ───────────────────────────────────────────

function BuilderSteps() {
  const builder = useBuilder();

  if (builder.isLoadingRecommendation && builder.step === "recommendation") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading your personalized recommendation...</p>
        </div>
      </div>
    );
  }

  switch (builder.step) {
    case "preferences":
      return <StepPreferences />;
    case "recommendation":
      return <StepRecommendation />;
    case "components":
      return <StepComponents />;
    case "summary":
      return <StepSummary />;
    default:
      return null;
  }
}

// ─── Add to Cart handler ─────────────────────────────────────

function AddToCartHandler({ children }: { children: (handleAddToCart: () => void) => React.ReactNode }) {
  const builder = useBuilder();
  const { addItem } = useCart();

  const handleAddToCart = useCallback(async () => {
    if (!canApplyRecommendation(builder.productType, builder.recommendation)) return;

    builder.setIsApplying(true);

    try {
      const fillingLines = computeFillingLines(builder.recommendation, builder.selectedTemplateId);
      const componentLines = computeComponentLines(
        builder.recommendation,
        builder.selectedCover,
        builder.selectedCase,
        builder.componentQtyOverrides
      );

      const applyRes = await fetch("/api/shop/customize?action=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildCustomizeApplyPayload({
            productType: builder.productType,
            recommendation: builder.recommendation,
            fillingLines,
            componentLines,
            selectedCover: builder.selectedCover,
            selectedCase: builder.selectedCase,
            selectedUpsells: builder.selectedUpsells,
            selectedTemplateId: builder.selectedTemplateId,
            llmMetadata: {
              source: builder.productType === "bolster" ? "mbolster-builder" : "pillow-builder",
              ...(builder.pillowPreferences ?? {}),
              ...(builder.bolsterPreferences ?? {}),
              config_id: builder.configId,
            },
          })
        ),
      });

      const applyData = await applyRes.json().catch(() => ({}));

      if (!applyRes.ok || !applyData.ok) {
        toast.error(getApiErrorMessage(applyData.error, "Failed to save configuration"));
        return;
      }

      const { productSlug, productTitle, variantTitle } = getCartProductInfo(
        builder.productType,
        builder.recommendation
      );

      addItem({
        variantId: builder.recommendation.variant!.id,
        productId: builder.recommendation.variant!.product_id,
        productSlug,
        productTitle,
        variantTitle,
        imageUrl: null,
        price: builder.recommendation.variant!.price,
        compareAtPrice: null,
        currency: builder.recommendation.variant!.currency,
        quantity: 1,
        customizationId: applyData.customization_id,
        customizationSummary: applyData.summary,
        addonPrice: applyData.total_addon_price,
      });

      toast.success("Added to cart!");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      builder.setIsApplying(false);
    }
  }, [builder, addItem]);

  return <>{children(handleAddToCart)}</>;
}

// ─── Main Content ────────────────────────────────────────────

function MakerContent() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const { itemCount, toggleCart } = useCart();
  const builder = useBuilder();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex h-14 items-center justify-between px-4 max-w-[1400px] mx-auto">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <X className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Leave MP Maker?</DialogTitle>
                <DialogDescription>
                  Your current configuration will not be saved. Are you sure you want to leave?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Stay</Button>
                </DialogClose>
                <Button variant="destructive" onClick={() => router.push(withLocale("/", locale))}>
                  Leave
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <h1 className="text-sm font-semibold">MP Maker</h1>

          <Button variant="ghost" size="icon" className="size-8 relative" onClick={() => toggleCart(true)}>
            <ShoppingCart className="size-4" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Split-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] min-h-[calc(100vh-56px)]">
        {/* ─── LEFT PANEL: Product Visual + Background Effects ─── */}
        <div className="relative lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)] max-h-[40vh] lg:max-h-none overflow-hidden">
          {/* Background layer 1: Particles */}
          <Particles
            className="absolute inset-0 z-[1]"
            quantity={100}
            ease={80}
            staticity={50}
            color="#ffffff"
            size={0.8}
          />

          {/* Background layer 3: DotPattern */}
          <DotPattern
            dotSize={3}
            gap={32}
            baseColor="#3992C3"
            activeColor="#3992C3"
            proximity={80}
            shockRadius={250}
            className="absolute inset-0 opacity-60 z-[2]"
          />

          {/* Product visual on top */}
          <div className="relative z-10 flex items-center justify-center h-full">
            <ProductVisual />
          </div>
        </div>

        {/* ─── RIGHT PANEL: Customization ─── */}
        <div className="flex flex-col border-l bg-background min-h-0 lg:h-[calc(100vh-56px)]">
          {/* Step indicator */}
          <div className="px-5 pt-5 pb-3 border-b">
            <StepIndicator />
          </div>

          {/* Scrollable step content */}
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <Suspense>
              <ConfigLoader />
            </Suspense>
            <AnimatePresence mode="wait">
              <motion.div
                key={builder.step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <BuilderSteps />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Sticky bottom bar */}
          <AddToCartHandler>
            {(handleAddToCart) => (
              <BottomBar onAddToCart={handleAddToCart} />
            )}
          </AddToCartHandler>
        </div>
      </div>
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────

export default function MpMakerPage() {
  return (
    <Suspense>
      <MpMakerPageInner />
    </Suspense>
  );
}

function MpMakerPageInner() {
  const searchParams = useSearchParams();
  const productParam = searchParams.get("product") as ProductType | null;
  const configParam = searchParams.get("config");

  const initialProductType: ProductType = productParam === "bolster" ? "bolster" : "pillow";
  const initialConfigId = configParam || null;

  return (
    <BuilderProvider initialProductType={initialProductType} initialConfigId={initialConfigId}>
      <MakerContent />
    </BuilderProvider>
  );
}
