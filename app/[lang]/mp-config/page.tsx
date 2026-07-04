"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/utils";
import { RetroGrid } from "@/components/ui/shadcn-io/retro-grid";
import { Particles } from "@/components/ui/particles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  User,
  Sparkles,
  CheckCircle,
  Camera,
  X,
  Check,
} from "lucide-react";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { type RecommendationResponseData } from "@/components/shop/customization-steps";

type Step =
  | "welcome"
  | "what-to-expect"
  | "name"
  | "shoulder-length"
  | "neck-to-back"
  | "head-to-back"
  | "neck-length"
  | "customize"
  | "preview";

interface MeasurementData {
  name: string;
  gender: string;
  ageGroup: string;
  bloodPressureLevel: string;
  earDiscomfortSideSleep: "yes" | "no" | "";
  bedFirmness: string;
  acidReflux: "yes" | "no" | "";
  shoulderLength: string;
  neckToBack: string;
  headToBack: string;
  neckLength: string;
  sleepPainAreas: string[];
  sleepPositionType: string[];
  usesBolster: "yes" | "no" | "";
}

type SuggestedBomLine = {
  quantity: number | string;
  item: { id: number; category: string; name: string; size: string | null; subtype: string | null } | null;
};

type MpConfigSuggestion = {
  recommended: { size: "XS" | "S" | "M" | "L" | "XL"; kind: "basic" | "premium" };
  product: { id: number; size: "XS" | "S" | "M" | "L" | "XL"; kind: "basic" | "premium" } | null;
  bom: SuggestedBomLine[];
  reasons: string[];
};

const sessionStorageKey = "mp_config_response_id";

export default function MpConfigPage() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = (href: string) => withLocale(href, locale);

  const isMobile = useIsMobile();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gridSpeed, setGridSpeed] = useState<"slow" | "fast" | "reverse">("slow");
  // Single unit selector for the whole flow (default: inches)
  const [measurementUnit, setMeasurementUnit] = useState<"cm" | "in">("in");
  const [measurementData, setMeasurementData] = useState<MeasurementData>({
    name: "",
    gender: "",
    ageGroup: "",
    bloodPressureLevel: "",
    earDiscomfortSideSleep: "",
    bedFirmness: "",
    acidReflux: "",
    shoulderLength: "",
    neckToBack: "",
    headToBack: "",
    neckLength: "",
    sleepPainAreas: [],
    sleepPositionType: [],
    usesBolster: "",
  });

  const [responseId, setResponseId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestion, setSuggestion] = useState<MpConfigSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const lastSavedRef = useRef<string>("");
  const transitionTimeoutRef = useRef<number | null>(null);
  const gridResetTimeoutRef = useRef<number | null>(null);

  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completedResponseId, setCompletedResponseId] = useState<string | null>(null);

  // --- Online purchase path (cover/case prefs, add-ons, hold) — no fillings/protector ---
  const [shopRecommendation, setShopRecommendation] = useState<RecommendationResponseData | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [selectedCover, setSelectedCover] = useState<number | null>(null);
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Set<number>>(new Set());
  const [addons, setAddons] = useState<{ item_id: number; name: string; msrp: number; currency: string }[]>([]);
  const [holdEmail, setHoldEmail] = useState("");
  const [holdAddress, setHoldAddress] = useState({
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "SG",
  });
  const [shippingMethods, setShippingMethods] = useState<
    { id: string; slug: string; base_rate: number; free_above: number | null; content: Record<string, { name?: string }> }[]
  >([]);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [holdSubmitting, setHoldSubmitting] = useState(false);

  type PhotoView = "front" | "side";
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const sideInputRef = useRef<HTMLInputElement | null>(null);
  const [photoDataUrls, setPhotoDataUrls] = useState<{ front: string | null; side: string | null }>({
    front: null,
    side: null,
  });
  const [photoUploading, setPhotoUploading] = useState<{ front: boolean; side: boolean }>({
    front: false,
    side: false,
  });

  const stepOrder: Step[] = [
    "welcome",
    "what-to-expect",
    "name",
    "shoulder-length",
    "neck-to-back",
    "head-to-back",
    "neck-length",
    "customize",
    "preview",
  ];

  const clearTransitionTimers = () => {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (gridResetTimeoutRef.current !== null) {
      window.clearTimeout(gridResetTimeoutRef.current);
      gridResetTimeoutRef.current = null;
    }
  };

  const goToNextStep = () => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      // Trigger fast grid animation
      clearTransitionTimers();
      setGridSpeed("fast");
      setIsTransitioning(true);
      
      transitionTimeoutRef.current = window.setTimeout(() => {
        setCurrentStep(stepOrder[currentIndex + 1]);
        setIsTransitioning(false);
        
        // Return to slow animation after transition
        gridResetTimeoutRef.current = window.setTimeout(() => {
          setGridSpeed("slow");
        }, 100);
      }, 300);
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      // Trigger reverse grid animation (moving backward)
      clearTransitionTimers();
      setGridSpeed("reverse");
      setIsTransitioning(true);
      
      transitionTimeoutRef.current = window.setTimeout(() => {
        setCurrentStep(stepOrder[currentIndex - 1]);
        setIsTransitioning(false);
        
        // Return to slow animation after transition
        gridResetTimeoutRef.current = window.setTimeout(() => {
          setGridSpeed("slow");
        }, 100);
      }, 300);
    }
  };

  const updateMeasurement = <K extends keyof MeasurementData>(
    field: K,
    value: MeasurementData[K],
  ) => {
    setMeasurementData((prev) => ({ ...prev, [field]: value }));
  };

  const toDisplayValue = (cmValue: string) => {
    if (measurementUnit === "cm") return cmValue;
    const cm = Number(cmValue);
    if (!cmValue) return "";
    if (!Number.isFinite(cm)) return cmValue;
    const inches = cm / 2.54;
    return String(Math.round(inches * 100) / 100);
  };

  const toCmValue = (raw: string) => {
    if (raw === "") return "";
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const cm = measurementUnit === "cm" ? n : n * 2.54;
    return String(Math.round(cm * 100) / 100);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id = window.localStorage.getItem(sessionStorageKey);
    if (!id) {
      id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      window.localStorage.setItem(sessionStorageKey, id);
    }
    setResponseId(id);

    // If the saved id is already "released" in the DB, start a fresh session id.
    // This prevents new measurements from overwriting a released result and appearing directly in the Released tab.
    (async () => {
      try {
        const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(id!)}`, { method: "GET", cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) return; // If it doesn't exist yet (or can't be read), keep the id for draft saving.
        const isFinal = Boolean(payload?.response?.is_final);
        if (!isFinal) return;

        const newId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        window.localStorage.setItem(sessionStorageKey, newId);
        setResponseId(newId);
        lastSavedRef.current = "";
        setSaveStatus("idle");
      } catch {
        // Best-effort only; never block the UI.
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const shouldHideDock = currentStep !== "welcome" || isTransitioning;
    document.body.classList.toggle("dock-hidden", shouldHideDock);
    return () => {
      document.body.classList.remove("dock-hidden");
    };
  }, [currentStep, isTransitioning]);

  useEffect(() => {
    return () => clearTransitionTimers();
  }, []);

  const resetMeasurementState = () => {
    clearTransitionTimers();
    lastSavedRef.current = "";
    setSaveStatus("idle");
    setSuggestion(null);
    setSuggestionLoading(false);
    setPhotoDataUrls({ front: null, side: null });
    setPhotoUploading({ front: false, side: false });
    setMeasurementData({
      name: "",
      gender: "",
      ageGroup: "",
      bloodPressureLevel: "",
      earDiscomfortSideSleep: "",
      bedFirmness: "",
      acidReflux: "",
      shoulderLength: "",
      neckToBack: "",
      headToBack: "",
      neckLength: "",
      sleepPainAreas: [],
      sleepPositionType: [],
      usesBolster: "",
    });
    setCurrentStep("welcome");
    setGridSpeed("slow");
    setIsTransitioning(false);
    setCompletionDialogOpen(false);
    setCompletedResponseId(null);
    // Reset purchase-path state
    setShopRecommendation(null);
    setShopLoading(false);
    setSelectedCover(null);
    setSelectedCase(null);
    setSelectedAddons(new Set());
    setHoldEmail("");
    setHoldSubmitting(false);
  };

  const ensureResponseId = () => {
    if (responseId) return responseId;
    if (typeof window === "undefined") return null;
    const newId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    window.localStorage.setItem(sessionStorageKey, newId);
    setResponseId(newId);
    return newId;
  };

  const startNewMeasurement = () => {
    if (typeof window !== "undefined") {
      const newId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      window.localStorage.setItem(sessionStorageKey, newId);
      setResponseId(newId);
    } else {
      setResponseId(null);
    }
    resetMeasurementState();
  };

  const exitToStart = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(sessionStorageKey);
    }
    setResponseId(null);
    resetMeasurementState();
  };

  const handleStart = () => {
    ensureResponseId();
    goToNextStep();
  };

  const confirmExit = () => {
    toast.message("Exit configuration?", {
      description: "This will clear your saved session and return to the start.",
      action: {
        label: "Exit",
        onClick: () => {
          exitToStart();
        },
      },
      cancel: "Stay",
      id: "mp-config-exit",
    });
  };

  const hasAnyInput = useMemo(() => {
    const d = measurementData;
    return (
      d.name.trim() ||
      d.gender.trim() ||
      d.ageGroup.trim() ||
      d.bloodPressureLevel.trim() ||
      d.earDiscomfortSideSleep !== "" ||
      d.bedFirmness.trim() ||
      d.acidReflux !== "" ||
      d.shoulderLength.trim() ||
      d.neckToBack.trim() ||
      d.headToBack.trim() ||
      d.neckLength.trim()
    );
  }, [measurementData]);

  const upsertToDb = async (
    opts?: { isFinal?: boolean },
  ): Promise<{ id: string; telegramStatus?: "sent" | "skipped" | "failed" } | null> => {
    if (!responseId) return null;
    if (!hasAnyInput) return { id: responseId };

    const snapshot = JSON.stringify({ responseId, measurementData, isFinal: opts?.isFinal ?? null });
    if (!opts?.isFinal && snapshot === lastSavedRef.current) return { id: responseId };

    setSaveStatus("saving");
    try {
      const res = await fetch("/api/mp-config/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: responseId,
          data: measurementData,
          ...(typeof opts?.isFinal === "boolean" ? { isFinal: opts.isFinal } : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save");
      lastSavedRef.current = snapshot;
      setSaveStatus("saved");
      return {
        id: (payload?.id ?? responseId) as string,
        telegramStatus: payload?.telegramStatus as "sent" | "skipped" | "failed" | undefined,
      };
    } catch {
      setSaveStatus("error");
      return null;
    }
  };

  const loadSuggestion = async () => {
    if (!responseId) return;
    setSuggestionLoading(true);
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(responseId)}`, {
        method: "GET",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load suggestion");
      setSuggestion(payload?.suggestion ?? null);
    } catch {
      setSuggestion(null);
    } finally {
      setSuggestionLoading(false);
    }
  };

  useEffect(() => {
    if (!responseId) return;
    if (!hasAnyInput) return;
    const t = window.setTimeout(() => {
      upsertToDb();
    }, 650);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId, hasAnyInput, measurementData]);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });

  const savePhoto = async (view: PhotoView, file: File) => {
    if (!responseId) {
      toast.error("Missing session id. Please refresh and try again.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image");
      return;
    }

    // Guardrail: keep uploads reasonable since we're storing a data URL temporarily.
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("Image too large. Please use a smaller photo (max 5MB).");
      return;
    }

    setPhotoUploading((p) => ({ ...p, [view]: true }));
    try {
      const dataUrl = await fileToDataUrl(file);
      setPhotoDataUrls((p) => ({ ...p, [view]: dataUrl }));

      const res = await fetch("/api/mp-config/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, view, dataUrl }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save photo");
      toast.success(view === "front" ? "Front view saved" : "Side view saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save photo");
    } finally {
      setPhotoUploading((p) => ({ ...p, [view]: false }));
    }
  };

  const currentStepIndex = stepOrder.indexOf(currentStep);
  const progressValue =
    currentStepIndex <= 0
      ? 0
      : Math.round((currentStepIndex / (stepOrder.length - 1)) * 100);

  const hasAnsweredAdditionalQuestions =
    measurementData.bloodPressureLevel.trim() !== "" &&
    measurementData.bedFirmness.trim() !== "" &&
    measurementData.earDiscomfortSideSleep !== "" &&
    measurementData.acidReflux !== "" &&
    measurementData.sleepPositionType.length > 0 &&
    measurementData.usesBolster !== "";

  // Fetch shop recommendation from customize API
  const fetchShopRecommendation = useCallback(async () => {
    setShopLoading(true);
    try {
      const shoulderCm = Number(measurementData.shoulderLength);
      const neckToBackCm = Number(measurementData.neckToBack);
      const headToBackCm = Number(measurementData.headToBack);
      const neckLengthCm = Number(measurementData.neckLength);

      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measurement_preferences: {
            measurements: {
              shoulder_length_cm: shoulderCm || 40,
              neck_to_back_cm: neckToBackCm || 8,
              head_to_back_cm: headToBackCm || 10,
              neck_length_cm: neckLengthCm || 10,
            },
            demographics: {
              gender: measurementData.gender,
              age_group: measurementData.ageGroup,
            },
            health: {
              blood_pressure: measurementData.bloodPressureLevel,
              ear_discomfort_side_sleep: measurementData.earDiscomfortSideSleep === "yes",
              bed_firmness: measurementData.bedFirmness,
              acid_reflux: measurementData.acidReflux === "yes",
              sleep_pain_areas: measurementData.sleepPainAreas,
              sleep_position_type: measurementData.sleepPositionType,
              uses_bolster: measurementData.usesBolster === "yes",
            },
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(err.error, `Failed to get recommendation (${res.status})`));
      }

      const data: RecommendationResponseData = await res.json();
      setShopRecommendation(data);

      // Pre-select default cover and case only (no fillings / protector).
      const defaultCover = data.components.covers.find((c) => c.base_quantity > 0);
      const defaultCase = data.components.cases.find((c) => c.base_quantity > 0);
      if (defaultCover) setSelectedCover(defaultCover.item_id);
      if (defaultCase) setSelectedCase(defaultCase.item_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get shop recommendation");
    } finally {
      setShopLoading(false);
    }
  }, [measurementData]);

  // Load accessory add-ons + shipping when entering purchase preview.
  useEffect(() => {
    if (currentStep !== "preview") return;
    fetch("/api/results/addons")
      .then((r) => r.json())
      .then((d: { addons?: { item_id: number; name: string; msrp: number; currency: string }[] }) =>
        setAddons(d.addons ?? []),
      )
      .catch(() => setAddons([]));
    fetch("/api/shop/shipping?country=SG")
      .then((r) => r.json())
      .then((d: { rows?: typeof shippingMethods }) => {
        const methods = d.rows ?? [];
        setShippingMethods(methods);
        if (methods[0]) setSelectedShippingId(methods[0].id);
      })
      .catch(() => setShippingMethods([]));
  }, [currentStep]);

  const handleAuthorizeHold = useCallback(async () => {
    const size =
      shopRecommendation?.pillow_product?.size ??
      suggestion?.recommended?.size ??
      suggestion?.product?.size;
    const tier =
      (shopRecommendation?.pillow_product?.kind as "basic" | "premium" | undefined) ??
      suggestion?.recommended?.kind ??
      suggestion?.product?.kind;

    if (!size || !tier) {
      toast.error("Missing size or tier suggestion");
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
    if (!holdAddress.recipient || !holdAddress.line1 || !holdAddress.city || !holdAddress.postal_code) {
      toast.error("Shipping address is incomplete");
      return;
    }
    if (!selectedShippingId) {
      toast.error("Choose a shipping method");
      return;
    }

    setHoldSubmitting(true);
    try {
      await upsertToDb();
      const res = await fetch("/api/results/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId: responseId ?? undefined,
          email: holdEmail.trim(),
          measurements: measurementData,
          suggestedSize: size,
          suggestedTier: tier,
          preferenceLines: [
            { item_id: selectedCover, quantity: 1, category: "cover" },
            { item_id: selectedCase, quantity: 1, category: "case" },
          ],
          addonLines: [...selectedAddons].map((item_id) => ({ item_id, quantity: 1 })),
          shippingMethodId: selectedShippingId,
          shippingAddress: {
            ...holdAddress,
            recipient: holdAddress.recipient || measurementData.name,
          },
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
    shopRecommendation,
    suggestion,
    selectedCover,
    selectedCase,
    holdEmail,
    holdAddress,
    selectedShippingId,
    selectedAddons,
    responseId,
    measurementData,
  ]);

  const saveLabel:
    | { text: string; className: string }
    | null =
    saveStatus === "saving"
      ? {
          text: "Saving…",
          className: "border-primary/20 bg-primary/10 text-primary",
        }
      : saveStatus === "saved"
        ? {
            text: "Saved",
            className:
              "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          }
        : saveStatus === "error"
          ? {
              text: "Save failed",
              className: "border-destructive/20 bg-destructive/10 text-destructive",
            }
          : null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <Dialog open={completionDialogOpen} onOpenChange={setCompletionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Measurement complete
            </DialogTitle>
            <DialogDescription>
              Your configuration has been saved. What would you like to do next?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="secondary"
              onClick={() => {
                setCompletionDialogOpen(false);
                setCompletedResponseId(null);
                startNewMeasurement();
              }}
            >
              New measurement
            </Button>
            <Button
              onClick={() => {
                const id = completedResponseId ?? responseId;
                if (!id) return;
                setCompletionDialogOpen(false);
                router.push(to(`/settings/results/${id}`));
              }}
            >
              Results page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Retro Grid Background */}
      <RetroGrid className="z-0" opacity={0.3} speed={gridSpeed} />

      {/* Interactive particles */}
      <Particles
        className="absolute inset-0 z-0"
        quantity={100}
        ease={80}
        staticity={50}
        color="#ffffff"
        size={0.8}
      />

      {currentStep !== "welcome" && (
        <div
          className="absolute right-4 z-20"
          style={{ top: "calc(1rem + var(--safe-top))" }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={confirmExit}
            aria-label="Exit configuration"
            title="Exit"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Content Container */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div
          className={`w-full max-w-2xl transition-all duration-300 ${
            isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
          }`}
        >
          {/* Progress Indicator */}
          {currentStep !== "welcome" && (
            <div className="mb-6 flex justify-center">
              <Progress
                value={progressValue}
                aria-label="Configuration progress"
                className="w-full max-w-2xl"
              />
            </div>
          )}

          {/* Welcome Step */}
          {currentStep === "welcome" && (
            <div className="flex flex-col items-center justify-center space-y-8 text-center">
              <div className="space-y-4">
                <Image
                  src="/mpillow_logo_2026.png"
                  alt="Mpillow Logo"
                  width={200}
                  height={200}
                  className="mx-auto mb-6"
                  priority
                />
                <h1 className="text-6xl font-bold tracking-tight">
                  Customise <span className="text-primary">Mpillow</span>
                </h1>
                <p className="text-xl text-muted-foreground">
                  Let&apos;s create your perfect pillow, customized just for you
                </p>
              </div>
              <Button size="lg" onClick={handleStart} className="group">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          )}

          {/* What to Expect Step */}
          {currentStep === "what-to-expect" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Sparkles className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">What to Expect</h2>
                <p className="text-muted-foreground">Here&apos;s how the process works</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold">Tell us about yourself</h3>
                    <p className="text-sm text-muted-foreground">Provide us helpful information for us to work with</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold">Take measurements</h3>
                    <p className="text-sm text-muted-foreground">
                      We&apos;ll guide you through 4 simple measurements
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold">See your results</h3>
                    <p className="text-sm text-muted-foreground">
                      Get your personalized pillow recommendation
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={goToNextStep}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Name Input Step */}
          {currentStep === "name" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <User className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">Tell us about yourself</h2>
                <p className="text-muted-foreground">Let&apos;s personalize your experience</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="mp-name" className="text-sm font-medium">
                    What&apos;s your name?
                  </label>
                  <Input
                    id="mp-name"
                    placeholder="Enter your name"
                    value={measurementData.name}
                    onChange={(e) => updateMeasurement("name", e.target.value)}
                    className="text-lg h-12"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Gender</div>
                  <Select
                    value={measurementData.gender}
                    onValueChange={(v) => updateMeasurement("gender", v)}
                  >
                    <SelectTrigger className="w-full justify-between text-lg h-12">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Age group</div>
                  <Select
                    value={measurementData.ageGroup}
                    onValueChange={(v) => updateMeasurement("ageGroup", v)}
                  >
                    <SelectTrigger className="w-full justify-between text-lg h-12">
                      <SelectValue placeholder="Select age group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under-18">Under 18</SelectItem>
                      <SelectItem value="18-24">18–24</SelectItem>
                      <SelectItem value="25-34">25–34</SelectItem>
                      <SelectItem value="35-44">35–44</SelectItem>
                      <SelectItem value="45-54">45–54</SelectItem>
                      <SelectItem value="55-64">55–64</SelectItem>
                      <SelectItem value="65-plus">65+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={
                      !measurementData.name.trim() ||
                      !measurementData.gender.trim() ||
                      !measurementData.ageGroup.trim()
                    }
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Shoulder Length Measurement */}
          {currentStep === "shoulder-length" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/shoulder-length.svg"
                  alt="Shoulder length measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Shoulder Length</h2>
                <p className="text-muted-foreground">
                  Measure from the left shoulder to the right shoulder
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    // Mobile: force number-pad keyboard (iOS is more consistent with text+inputMode).
                    type={isMobile ? "text" : "number"}
                    inputMode={isMobile ? "numeric" : undefined}
                    pattern={isMobile ? "[0-9]*" : undefined}
                    placeholder="Enter measurement"
                    value={
                      toDisplayValue(measurementData.shoulderLength)
                    }
                    onChange={(e) => {
                      updateMeasurement("shoulderLength", toCmValue(e.target.value));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => setMeasurementUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Start from the shoulder bone and measure to the other shoulder bone
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.shoulderLength}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Neck to Back Measurement */}
          {currentStep === "neck-to-back" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/neck-to-back.svg"
                  alt="Neck to back measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Neck to Back</h2>
                <p className="text-muted-foreground">
                  Measure from the c1 bone of your spine from the neck area to the back against the wall
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    // Mobile: force number-pad keyboard (iOS is more consistent with text+inputMode).
                    type={isMobile ? "text" : "number"}
                    inputMode={isMobile ? "numeric" : undefined}
                    pattern={isMobile ? "[0-9]*" : undefined}
                    placeholder="Enter measurement"
                    value={
                      toDisplayValue(measurementData.neckToBack)
                    }
                    onChange={(e) => {
                      updateMeasurement("neckToBack", toCmValue(e.target.value));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => setMeasurementUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Measure in your typical standing position
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.neckToBack}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Head to Back Measurement */}
          {currentStep === "head-to-back" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/head-to-back.svg"
                  alt="Head to back measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Head to Back</h2>
                <p className="text-muted-foreground">
                  Measure from the back of your head to your upper back against the wall 
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    // Mobile: force number-pad keyboard (iOS is more consistent with text+inputMode).
                    type={isMobile ? "text" : "number"}
                    inputMode={isMobile ? "numeric" : undefined}
                    pattern={isMobile ? "[0-9]*" : undefined}
                    placeholder="Enter measurement"
                    value={
                      toDisplayValue(measurementData.headToBack)
                    }
                    onChange={(e) => {
                      updateMeasurement("headToBack", toCmValue(e.target.value));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => setMeasurementUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Measure in your typical standing position
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.headToBack}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Neck Length Measurement */}
          {currentStep === "neck-length" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/neck-length.svg"
                  alt="Neck length measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Neck Length</h2>
                <p className="text-muted-foreground">
                  Measure vertically the length of your neck from c1 and stop at the top of the shoulders
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    // Mobile: force number-pad keyboard (iOS is more consistent with text+inputMode).
                    type={isMobile ? "text" : "number"}
                    inputMode={isMobile ? "numeric" : undefined}
                    pattern={isMobile ? "[0-9]*" : undefined}
                    placeholder="Enter measurement"
                    value={
                      toDisplayValue(measurementData.neckLength)
                    }
                    onChange={(e) => {
                      updateMeasurement("neckLength", toCmValue(e.target.value));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => setMeasurementUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Stop at the top of the shoulders, when seen on the side view
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.neckLength}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Customize Button Step */}
          {currentStep === "customize" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
                <h2 className="text-3xl font-bold">Great job, {measurementData.name}!</h2>
                <p className="text-muted-foreground">
                  All measurements collected. Ready to see your custom pillow?
                </p>
              </div>

              <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Your Measurements:</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Shoulder Length</p>
                    <p className="text-lg font-medium">
                      {toDisplayValue(measurementData.shoulderLength)} {measurementUnit}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Neck to Back</p>
                    <p className="text-lg font-medium">
                      {toDisplayValue(measurementData.neckToBack)} {measurementUnit}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Head to Back</p>
                    <p className="text-lg font-medium">
                      {toDisplayValue(measurementData.headToBack)} {measurementUnit}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Neck Length</p>
                    <p className="text-lg font-medium">
                      {toDisplayValue(measurementData.neckLength)} {measurementUnit}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg">A few more questions</h4>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Blood Pressure levels</h3>
                    <Select
                      value={measurementData.bloodPressureLevel}
                      onValueChange={(v) => updateMeasurement("bloodPressureLevel", v)}
                    >
                      <SelectTrigger className="w-full justify-between text-lg h-12">
                        <SelectValue placeholder="Select blood pressure level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="low-blood">Low Blood</SelectItem>
                        <SelectItem value="high-blood">High Blood</SelectItem>
                        <SelectItem value="unsure">Unsure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium">Ear discomfort during side sleep?</h3>
                    </div>
                    <Tabs
                      value={measurementData.earDiscomfortSideSleep}
                      onValueChange={(v) =>
                        updateMeasurement("earDiscomfortSideSleep", v as "yes" | "no")
                      }
                    >
                      <TabsList className="h-12">
                        <TabsTrigger value="yes" className="px-4">
                          Yes
                        </TabsTrigger>
                        <TabsTrigger value="no" className="px-4">
                          No
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Bed firmness</h3>
                    <Select
                      value={measurementData.bedFirmness}
                      onValueChange={(v) => updateMeasurement("bedFirmness", v)}
                    >
                      <SelectTrigger className="w-full justify-between text-lg h-12">
                        <SelectValue placeholder="Select bed firmness" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soft">Soft</SelectItem>
                        <SelectItem value="medium-soft">Medium Soft</SelectItem>
                        <SelectItem value="firm">Firm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium">Acid Reflux?</h3>
                    </div>
                    <Tabs
                      value={measurementData.acidReflux}
                      onValueChange={(v) => updateMeasurement("acidReflux", v as "yes" | "no")}
                    >
                      <TabsList className="h-12">
                        <TabsTrigger value="yes" className="px-4">
                          Yes
                        </TabsTrigger>
                        <TabsTrigger value="no" className="px-4">
                          No
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Sleep pain areas (multi-select) */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">I experience one of the following during/after sleep</h3>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "neck", label: "Neck pain" },
                        { value: "shoulder", label: "Shoulder pain" },
                        { value: "lower-back", label: "Lower Back pain" },
                        { value: "sleep-apnea", label: "Sleep Apnea" },
                        { value: "bad-sleep-quality", label: "Bad Sleep Quality" },
                      ].map((opt) => {
                        const isSelected = measurementData.sleepPainAreas.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setMeasurementData((prev) => ({
                                ...prev,
                                sleepPainAreas: isSelected
                                  ? prev.sleepPainAreas.filter((v) => v !== opt.value)
                                  : [...prev.sleepPainAreas, opt.value],
                              }));
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">Select all that apply (optional)</p>
                  </div>

                  {/* Sleep position type (multi-select) */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">I&apos;m a</h3>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "side-and-back", label: "Side & Back sleeper" },
                        { value: "side", label: "Side Sleeper" },
                        { value: "back", label: "Back Sleeper" },
                        { value: "stomach", label: "Stomach Sleeper" },
                      ].map((opt) => {
                        const isSelected = measurementData.sleepPositionType.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setMeasurementData((prev) => ({
                                ...prev,
                                sleepPositionType: isSelected
                                  ? prev.sleepPositionType.filter((v) => v !== opt.value)
                                  : [...prev.sleepPositionType, opt.value],
                              }));
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Uses bolster */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium">Do you use bolsters to sleep?</h3>
                    </div>
                    <Tabs
                      value={measurementData.usesBolster}
                      onValueChange={(v) => updateMeasurement("usesBolster", v as "yes" | "no")}
                    >
                      <TabsList className="h-12">
                        <TabsTrigger value="yes" className="px-4">
                          Yes
                        </TabsTrigger>
                        <TabsTrigger value="no" className="px-4">
                          No
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </div>

              <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-lg">Photos (optional)</h4>
                  <div className="text-xs text-muted-foreground">
                    Saved temporarily and attached to Telegram
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-background/60 p-3 space-y-3">
                    <div className="text-sm font-medium">Front view photo</div>

                    <div className="relative overflow-hidden rounded-md border bg-background/40 aspect-[4/3]">
                      {photoDataUrls.front ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoDataUrls.front}
                          alt="Front view"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          No photo yet
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => frontInputRef.current?.click()}
                        disabled={photoUploading.front}
                        className="w-full"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        {photoUploading.front ? "Saving…" : photoDataUrls.front ? "Retake" : "Take photo"}
                      </Button>
                      <input
                        ref={frontInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void savePhoto("front", f);
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border bg-background/60 p-3 space-y-3">
                    <div className="text-sm font-medium">Side view photo</div>

                    <div className="relative overflow-hidden rounded-md border bg-background/40 aspect-[4/3]">
                      {photoDataUrls.side ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoDataUrls.side}
                          alt="Side view"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          No photo yet
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => sideInputRef.current?.click()}
                        disabled={photoUploading.side}
                        className="w-full"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        {photoUploading.side ? "Saving…" : photoDataUrls.side ? "Retake" : "Take photo"}
                      </Button>
                      <input
                        ref={sideInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void savePhoto("side", f);
                          e.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={async () => {
                      await upsertToDb();
                      await Promise.all([loadSuggestion(), fetchShopRecommendation()]);
                      goToNextStep();
                    }}
                    disabled={!hasAnsweredAdditionalQuestions || photoUploading.front || photoUploading.side || shopLoading}
                    size="lg"
                    className="group"
                  >
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate Results
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Preview Step — online purchase: prefs + add-ons + address + auth hold */}
          {currentStep === "preview" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold">Your Custom Mpillow</h2>
                <p className="text-muted-foreground">
                  Review your ballpark size×tier, choose cover and case, then authorize payment.
                  You are not charged until you accept the final build.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium">Suggested size × tier</div>
                  <Button variant="secondary" size="sm" onClick={loadSuggestion} disabled={suggestionLoading}>
                    {suggestionLoading ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
                {(suggestionLoading || shopLoading) && (
                  <div className="text-sm text-muted-foreground">Generating suggestion…</div>
                )}
                {(suggestion || shopRecommendation) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Recommended tier</div>
                      <div className="text-lg font-semibold capitalize">
                        {shopRecommendation?.pillow_product?.kind ??
                          suggestion?.recommended?.kind ??
                          "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-background/60 p-3">
                      <div className="text-xs text-muted-foreground">Recommended size</div>
                      <div className="text-lg font-semibold">
                        {shopRecommendation?.pillow_product?.size ??
                          suggestion?.recommended?.size ??
                          "—"}
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Fillings and protector are chosen by our team after review — not by you.
                </p>
              </div>

              {/* Cover / case preferences only */}
              {shopRecommendation && (
                <div className="space-y-3 rounded-md border bg-background/40 p-4">
                  <h3 className="font-semibold">Cover and case</h3>
                  <div className="space-y-2">
                    <Label>Cover</Label>
                    <Select
                      value={selectedCover != null ? String(selectedCover) : ""}
                      onValueChange={(v) => setSelectedCover(Number(v))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select cover" />
                      </SelectTrigger>
                      <SelectContent>
                        {shopRecommendation.components.covers.map((c) => (
                          <SelectItem key={c.item_id} value={String(c.item_id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Case</Label>
                    <Select
                      value={selectedCase != null ? String(selectedCase) : ""}
                      onValueChange={(v) => setSelectedCase(Number(v))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select case" />
                      </SelectTrigger>
                      <SelectContent>
                        {shopRecommendation.components.cases.map((c) => (
                          <SelectItem key={c.item_id} value={String(c.item_id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Accessory add-ons */}
              {addons.length > 0 && (
                <div className="space-y-2 rounded-md border bg-background/40 p-4">
                  <h3 className="font-semibold">Add-ons (optional)</h3>
                  <div className="flex flex-wrap gap-2">
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
                          className={`rounded-full border-2 px-3 py-1.5 text-sm font-medium ${
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {a.name} · {a.currency} {a.msrp.toFixed(2)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contact + shipping */}
              <div className="space-y-3 rounded-md border bg-background/40 p-4">
                <h3 className="font-semibold">Shipping</h3>
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
                    placeholder={measurementData.name || "Name"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hold-line1">Address</Label>
                  <Input
                    id="hold-line1"
                    value={holdAddress.line1}
                    onChange={(e) =>
                      setHoldAddress((a) => ({ ...a, line1: e.target.value }))
                    }
                    placeholder="Street address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="hold-city">City</Label>
                    <Input
                      id="hold-city"
                      value={holdAddress.city}
                      onChange={(e) =>
                        setHoldAddress((a) => ({ ...a, city: e.target.value }))
                      }
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
                {shippingMethods.length > 0 && (
                  <div className="space-y-2">
                    <Label>Shipping method</Label>
                    <Select value={selectedShippingId} onValueChange={setSelectedShippingId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select shipping" />
                      </SelectTrigger>
                      <SelectContent>
                        {shippingMethods.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {(m.content?.["en-US"]?.name ?? m.content?.en?.name ?? m.slug) +
                              ` · SGD ${m.base_rate.toFixed(2)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="pt-4">
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => void handleAuthorizeHold()}
                    disabled={holdSubmitting || shopLoading}
                    className="group"
                  >
                    {holdSubmitting ? "Redirecting…" : "Authorize & submit for review"}
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
                <div className="mt-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const result = await upsertToDb();
                      if (!result?.id) {
                        toast.error("Save failed");
                        return;
                      }
                      toast.success("Saved to cloud");
                      setCompletedResponseId(result.id);
                      setCompletionDialogOpen(true);
                    }}
                    disabled={!responseId || !hasAnyInput}
                    className="text-muted-foreground"
                  >
                    Save without purchasing
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
