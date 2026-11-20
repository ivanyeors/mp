"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { CustomerPreferences } from "@/lib/types/customization";
import type { RecommendationResponseData } from "@/components/shop/customization-steps";

export type ProductType = "pillow" | "bolster";
export type BuilderStep = "preferences" | "recommendation" | "components" | "summary";

const STEPS: BuilderStep[] = ["preferences", "recommendation", "components", "summary"];

export interface BolsterPreferences {
  height_cm: number;
  sleep_position: "side" | "stomach" | "other";
}

export interface BuilderState {
  productType: ProductType;
  step: BuilderStep;
  stepIndex: number;

  configId: string | null;
  configLoaded: boolean;

  pillowPreferences: CustomerPreferences | null;
  bolsterPreferences: BolsterPreferences | null;

  recommendation: RecommendationResponseData | null;
  isLoadingRecommendation: boolean;

  selectedTemplateId: number | null;
  selectedCover: number | null;
  selectedCase: number | null;
  componentQtyOverrides: Map<number, number>;

  selectedUpsells: Set<number>;

  isApplying: boolean;
}

export interface BuilderActions {
  setProductType: (type: ProductType) => void;
  goToStep: (step: BuilderStep) => void;
  goNext: () => void;
  goBack: () => void;

  setConfigId: (id: string | null) => void;
  setConfigLoaded: (loaded: boolean) => void;

  setPillowPreferences: (prefs: CustomerPreferences) => void;
  setBolsterPreferences: (prefs: BolsterPreferences) => void;

  setRecommendation: (data: RecommendationResponseData | null) => void;
  setIsLoadingRecommendation: (loading: boolean) => void;

  setSelectedTemplateId: (id: number | null) => void;
  setSelectedCover: (id: number | null) => void;
  setSelectedCase: (id: number | null) => void;
  setComponentQtyOverride: (itemId: number, qty: number) => void;

  toggleUpsell: (itemId: number) => void;
  setIsApplying: (applying: boolean) => void;

  reset: () => void;
}

const BuilderContext = createContext<(BuilderState & BuilderActions) | null>(null);

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used within BuilderProvider");
  return ctx;
}

interface BuilderProviderProps {
  children: ReactNode;
  initialProductType?: ProductType;
  initialConfigId?: string | null;
}

export function BuilderProvider({
  children,
  initialProductType = "pillow",
  initialConfigId = null,
}: BuilderProviderProps) {
  const [productType, setProductType] = useState<ProductType>(initialProductType);
  const [step, setStep] = useState<BuilderStep>(initialConfigId ? "recommendation" : "preferences");
  const [configId, setConfigId] = useState<string | null>(initialConfigId);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [pillowPreferences, setPillowPreferences] = useState<CustomerPreferences | null>(null);
  const [bolsterPreferences, setBolsterPreferences] = useState<BolsterPreferences | null>(null);

  const [recommendation, setRecommendation] = useState<RecommendationResponseData | null>(null);
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedCover, setSelectedCover] = useState<number | null>(null);
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [componentQtyOverrides, setComponentQtyOverrides] = useState<Map<number, number>>(new Map());

  const [selectedUpsells, setSelectedUpsells] = useState<Set<number>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  const goToStep = useCallback((s: BuilderStep) => setStep(s), []);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }, [step]);

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }, [step]);

  const setComponentQtyOverride = useCallback((itemId: number, qty: number) => {
    setComponentQtyOverrides((prev) => {
      const next = new Map(prev);
      next.set(itemId, qty);
      return next;
    });
  }, []);

  const toggleUpsell = useCallback((itemId: number) => {
    setSelectedUpsells((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setStep("preferences");
    setConfigId(null);
    setConfigLoaded(false);
    setPillowPreferences(null);
    setBolsterPreferences(null);
    setRecommendation(null);
    setIsLoadingRecommendation(false);
    setSelectedTemplateId(null);
    setSelectedCover(null);
    setSelectedCase(null);
    setComponentQtyOverrides(new Map());
    setSelectedUpsells(new Set());
    setIsApplying(false);
  }, []);

  const value = useMemo(
    () => ({
      productType,
      step,
      stepIndex,
      configId,
      configLoaded,
      pillowPreferences,
      bolsterPreferences,
      recommendation,
      isLoadingRecommendation,
      selectedTemplateId,
      selectedCover,
      selectedCase,
      componentQtyOverrides,
      selectedUpsells,
      isApplying,
      setProductType,
      goToStep,
      goNext,
      goBack,
      setConfigId,
      setConfigLoaded,
      setPillowPreferences,
      setBolsterPreferences,
      setRecommendation,
      setIsLoadingRecommendation,
      setSelectedTemplateId,
      setSelectedCover,
      setSelectedCase,
      setComponentQtyOverride,
      toggleUpsell,
      setIsApplying,
      reset,
    }),
    [
      productType,
      step,
      stepIndex,
      configId,
      configLoaded,
      pillowPreferences,
      bolsterPreferences,
      recommendation,
      isLoadingRecommendation,
      selectedTemplateId,
      selectedCover,
      selectedCase,
      componentQtyOverrides,
      selectedUpsells,
      isApplying,
      goToStep,
      goNext,
      goBack,
      setComponentQtyOverride,
      toggleUpsell,
      reset,
    ]
  );

  return (
    <BuilderContext.Provider value={value}>
      {children}
    </BuilderContext.Provider>
  );
}
