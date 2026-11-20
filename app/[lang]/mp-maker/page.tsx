"use client";

import { useCallback, Suspense } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
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
import { useIsMobile } from "@/hooks/use-mobile";

import { BuilderProvider, useBuilder, type ProductType } from "./components/BuilderProvider";
import { ProductVisual } from "./components/ProductVisual";
import { StepIndicator } from "./components/StepIndicator";
import { BottomBar } from "./components/BottomBar";
import { StepPreferences } from "./components/StepPreferences";
import { StepRecommendation } from "./components/StepRecommendation";
import { StepComponents } from "./components/StepComponents";
import { StepSummary, buildCustomizeApplyPayload, canApplyRecommendation, getCartProductInfo } from "./components/StepSummary";
import { ConfigLoader } from "./components/ConfigLoader";

import { useCart } from "@/lib/shop/cart-context";
import { CartButton } from "@/components/shop/cart-button";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getApiErrorMessage } from "@/lib/utils";
import {
  computeFillingLines,
  computeComponentLines,
} from "@/components/shop/customization-steps";


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
  const builder = useBuilder();
  const isMobile = useIsMobile();

  return (
    <div className="min-h-dvh bg-background">
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

          <CartButton className="size-8" iconClassName="size-4" />
        </div>
      </header>

      {/* Split-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] min-h-[calc(100dvh-56px)]">
        {/* ─── LEFT PANEL: Product Visual + Background Effects ─── */}
        <div className="relative lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)] max-h-[40vh] lg:max-h-none overflow-hidden">
          {/* Background effects: desktop only — mobile skips the WebGL/canvas work (#64). */}
          {!isMobile && (
            <>
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
            </>
          )}

          {/* Product visual on top */}
          <div className="relative z-10 flex items-center justify-center h-full">
            <ProductVisual />
          </div>
        </div>

        {/* ─── RIGHT PANEL: Customization ─── */}
        <div className="flex flex-col bg-background min-h-0 lg:h-[calc(100vh-56px)] lg:border-l">
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
