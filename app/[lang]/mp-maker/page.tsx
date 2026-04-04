"use client";

import { useEffect, useCallback, Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { BuilderProvider, useBuilder, type ProductType } from "./components/BuilderProvider";
import { BuilderSidebar } from "./components/BuilderSidebar";
import { StepPreferences } from "./components/StepPreferences";
import { StepRecommendation } from "./components/StepRecommendation";
import { StepComponents } from "./components/StepComponents";
import { StepSummary } from "./components/StepSummary";

import { useCart } from "@/lib/shop/cart-context";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// ─── Config Warm Start Handler ──────────────────────────────

function ConfigLoader() {
  const builder = useBuilder();
  const searchParams = useSearchParams();
  const configId = searchParams.get("config");

  const loadConfig = useCallback(async (id: string) => {
    builder.setConfigId(id);
    builder.setIsLoadingRecommendation(true);
    builder.goToStep("recommendation");

    try {
      // Fetch the mp-config response
      const responseRes = await fetch(`/api/mp-config/responses/${id}`);
      const responseData = await responseRes.json();

      if (!responseData.ok || !responseData.response) {
        toast.error("Could not load your measurement data");
        builder.goToStep("preferences");
        return;
      }

      const data = responseData.response.data;

      // Build measurement preferences from the response
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

      // Call customize API with measurements
      const customizeRes = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurement_preferences: measurementPreferences }),
      });
      const customizeData = await customizeRes.json();

      if (!customizeData.ok) {
        toast.error(customizeData.error ?? "Failed to get recommendation");
        builder.goToStep("preferences");
        return;
      }

      builder.setRecommendation(customizeData);

      // Pre-select default cover/case
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
          <p className="text-muted-foreground">Loading your personalized recommendation...</p>
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

// ─── Main Content ────────────────────────────────────────────

function MakerContent() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const { itemCount, toggleCart } = useCart();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex h-14 items-center justify-between px-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={withLocale("/", locale)}>
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>

          <h1 className="text-sm font-semibold">MP Maker</h1>

          <Button variant="ghost" size="sm" className="relative" onClick={() => toggleCart(true)}>
            <ShoppingCart className="size-4" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10">
        <BuilderSidebar />
        <SidebarInset className="p-0">
          <div className="max-w-2xl mx-auto px-4 py-8">
            <Suspense>
              <ConfigLoader />
            </Suspense>
            <BuilderSteps />
          </div>
        </SidebarInset>
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
    <SidebarProvider>
      <BuilderProvider initialProductType={initialProductType} initialConfigId={initialConfigId}>
        <MakerContent />
      </BuilderProvider>
    </SidebarProvider>
  );
}
