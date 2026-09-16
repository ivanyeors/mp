"use client";

import { placedChargeLines, priceComposedBuild } from "@/lib/pricing/composed-price";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { RetroGrid } from "@/components/ui/shadcn-io/retro-grid";
import { DotPattern } from "@/components/ui/shadcn-io/dot-pattern";
import { Particles } from "@/components/ui/particles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AGE_GROUP_OPTIONS,
  BED_FIRMNESS_OPTIONS,
  BLOOD_PRESSURE_OPTIONS,
  GENDER_OPTIONS,
  SingleSelectOptionRows,
} from "@/components/configurator/single-select-option-rows";
import {
  ConfiguratorExitDialog,
  ConfiguratorMobileCloseBar,
  configuratorCardPadClassName,
  configuratorMobileCloseClearanceClassName,
  configuratorOuterPadClassName,
  configuratorPreviewPadClassName,
} from "@/components/configurator/configurator-mobile-chrome";
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
  Info,
} from "lucide-react";
import Link from "next/link";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { PageFaqAccordion } from "@/components/page-faq/page-faq-accordion";
import type { PageFaqSectionItem } from "@/components/page-faq/page-faq-section";
import {
  CustomizationStepComponents,
  type RecommendationResponseData,
} from "@/components/shop/customization-steps";
import { RecommendationReveal } from "@/components/rules-engine/recommendation-reveal";
import { UpsellCard } from "@/components/rules-engine/upsell-card";
import { TierSuggestion } from "@/components/rules-engine/tier-suggestion";
import {
  assertPreStripeRouteResolved,
  carryOverAnswers,
  incompleteEngineInputs,
  isFlowRoutePending,
  missingStepsAfterCarryOver,
  parseRecommendationRecord,
  plainLanguageWhy,
  shouldRevealRecommendation,
  stampAcceptedTargetRecord,
  wizardToEngineInputs,
  withJourneyOnAccept,
  withJourneyOnDecline,
  type RecommendationRecord,
  type RuleFlow,
} from "@/lib/rules-engine";
import { previewMixMode } from "@/lib/rules-engine/preview-xray";
import { overlayFrame } from "@/lib/product-builder/overlays";
import {
  SavedAddressSelect,
  useSavedShippingPrefill,
  type HoldShippingAddress,
} from "@/components/shop/saved-address-select";
import {
  configPathFor,
  newResponseId,
  sessionKeyFor,
  stepOrderFor,
  tokenKeyFor,
  variantFromPathname,
  type MpConfigVariant,
} from "@/lib/mp-config/flow-variant";

const FLOW_UI_LABEL: Record<RuleFlow, string> = {
  "basic-mpillow": "Basic Mpillow",
  "premium-mpillow": "Premium Mpillow",
  mbolster: "Mbolster",
};
import {
  HOLD_CANCELLED_NOTICE,
  clearHoldCancelDraft,
  isHoldCancelledQuery,
  readHoldCancelDraft,
  shouldRestorePreview,
  stripHoldCancelledFromSearch,
  writeHoldCancelDraft,
  type HoldCancelSurface,
} from "@/lib/configurator/hold-cancel-restore";
import {
  buildFieldErrorMap,
  hybridCtaEnabled,
  isNonEmptyString,
  pruneFieldErrors,
  type FieldCheck,
} from "@/lib/configurator/step-validation";
import {
  displayMeasurement,
  normalizeMeasurementDraft,
  type MeasurementUnit,
} from "@/lib/configurator/measurement-draft";
import {
  PAIN_AREA_OPTIONS,
  painAreasAnswered,
  togglePainArea,
} from "@/lib/configurator/pain-areas";
import {
  PreviewContactFields,
  previewContactFieldChecks,
} from "@/components/configurator/preview-contact-fields";
import {
  AddonOptionButton,
  SelectedAddonPreviews,
  type AddonOption,
} from "@/components/configurator/addon-cards";
import { CoBrandBanner } from "@/components/configurator/co-brand-banner";
import { ConfigImageUpload } from "@/components/configurator/config-image-upload";
import {
  holdCtaLabel,
  isPreOrder,
  preferenceStockFor,
  preOrderWaitingCopy,
} from "@/lib/configurator/pre-order-trigger";
import {
  recheckSelectionsForSize,
  sessionTemplateId,
  type LoadedTemplate,
  type SizeTier,
} from "@/lib/configurator/staff-assist";
import { StaffAssistPanel, type FillingItem } from "@/components/configurator/staff-assist-panel";
import { XrayPillow } from "@/components/spatial/xray-pillow";
import { fillingDescriptor } from "@/lib/spatial-fillings/filling-groups";
import { SILHOUETTE_PATH } from "@/components/spatial/xray-assets";
import {
  flattenToPackList,
  pillowPlacementsToRows,
  rowsToPillowPlacements,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings/core";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { ResumeFinish } from "@/lib/results/resume-finish";
import type { StaffEditResult } from "@/lib/results/staff-edit";

type MeasureKey = "shoulderLength" | "neckToBack" | "headToBack" | "neckLength";

const EMPTY_MEASURE_DRAFTS: Record<MeasureKey, string> = {
  shoulderLength: "",
  neckToBack: "",
  headToBack: "",
  neckLength: "",
};

/** Prefer BOM default, else first in-stock option, else first row. */
function pickDefaultComponent(
  options: { item_id: number; base_quantity: number; stock_available: number }[],
): number | null {
  if (options.length === 0) return null;
  const fromBom = options.find((c) => c.base_quantity > 0);
  if (fromBom) return fromBom.item_id;
  const inStock = options.find((c) => c.stock_available > 0);
  return (inStock ?? options[0]).item_id;
}

/** Stable no-op setters: the account prefill is skipped on Staff devices (see its call). */
const KEEP_EMAIL: Dispatch<SetStateAction<string>> = () => {};
const KEEP_ADDRESS: Dispatch<SetStateAction<HoldShippingAddress>> = () => {};

// Silhouette lives in the x-ray asset pipeline (ADR 0009: one asset pipeline).
const PILLOW_PATH = SILHOUETTE_PATH;

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

type MpConfigInfo = {
  h1: string;
  lede: string;
  faqTitle: string | null;
  faqItems: PageFaqSectionItem[];
};

const FAQ_VIEW_ALL: Record<Locale, string> = {
  "en-US": "View all FAQs",
  "zh-CN": "查看全部常见问题",
};

/**
 * Result access token storage (CONTEXT.md). Module scope, not hooks: it never
 * affects render, localStorage is the source of truth, and keeping it out of
 * dependency arrays leaves the surrounding callbacks memoizable. Every access is
 * try/caught because private mode throws on read as well as write.
 */
function readToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeToken(key: string, token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(key, token);
    else window.localStorage.removeItem(key);
  } catch {
    // private mode — the caller falls back to the legacy draft path
  }
}

export function MpConfigClient({
  info,
  staffAssist = false,
  canViewResults = false,
  partner = null,
  assistCode = null,
  resumeFinish = null,
  staffEdit = null,
}: {
  info: MpConfigInfo;
  /** Staff assist mode (slice 04): true only for Staff sessions (admin_users / bootstrap). */
  staffAssist?: boolean;
  /** Admin Panel `results` permission. Gates the completion dialog's link into
   * /settings/results, which redirects everyone else to Sign in. */
  canViewResults?: boolean;
  /**
   * Partner-assisted co-brand context (#78). Non-null → assisted run: co-brand
   * finish panel, no filling-template / add-on / upsell surfaces, assist-priority
   * attribution. null → guest/staff flow renders PIXEL-IDENTICAL (AC5).
   */
  partner?: {
    code: string;
    name: string;
    logoUrl: string | null;
    description: string | null;
  } | null;
  /**
   * Assist link code, already resolved server-side to an active Staff member.
   * Orthogonal to `staffAssist`: a customer holding a link has no admin_users
   * row, so it grants NO assist chrome and NO x-ray editor — it is echoed back
   * on save so the server can re-resolve it and stamp the Draft Result.
   * Changes nothing about what renders.
   */
  assistCode?: string | null;
  /**
   * An assigned Assisted customisation reopened from its finish link (ADR 0017).
   * Opens straight on the preview with the Staff-composed fillings read-only;
   * the customer picks cover, case, add-ons and shipping, then pays. Never
   * autosaves a Draft and never submits a hold.
   */
  resumeFinish?: ResumeFinish | null;
  /**
   * A live Result reopened by Staff for re-configuration
   * (`lib/results/staff-edit.ts`). Opens on the preview with the existing
   * build loaded — size×tier, cover/case, add-ons, shipping and the filling
   * mix — and saves back onto that Result instead of submitting a new hold.
   * Never autosaves a Draft, and never creates an Authorization hold.
   */
  staffEdit?: StaffEditResult | null;
}) {
  // Everything assist-specific gates on this; false ⇒ zero render change (AC5).
  const partnerAssisted = Boolean(partner);
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const variant: MpConfigVariant = variantFromPathname(pathname);
  const isBasic = variant === "basic";
  const holdSurface: HoldCancelSurface = isBasic ? "mp-basic" : "mp-full";
  const sessionStorageKey = sessionKeyFor(variant);
  // Result access token (CONTEXT.md). Not React state — it never affects render,
  // localStorage is the source of truth, and every access is try/caught because
  // private mode throws on both read and write.
  const tokenStorageKey = tokenKeyFor(variant);
  const configPath = configPathFor(variant);
  const to = (href: string) => withLocale(href, locale);

  const isMobile = useIsMobile();
  // Both reopened modes start on the preview: there is already a build to look
  // at, so the questionnaire would only be in the way.
  const [currentStep, setCurrentStep] = useState<Step>(
    resumeFinish || staffEdit ? "preview" : "welcome",
  );
  const [restoringHoldCancel, setRestoringHoldCancel] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gridSpeed, setGridSpeed] = useState<"slow" | "fast" | "reverse">("slow");
  // Single unit selector for the whole flow (default: inches)
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("in");
  const [measurementDrafts, setMeasurementDrafts] =
    useState<Record<MeasureKey, string>>(EMPTY_MEASURE_DRAFTS);
  const [measurementData, setMeasurementData] = useState<MeasurementData>(() => ({
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
    // The submitted answers, so the recommendation fetch below has real inputs.
    ...(resumeFinish?.measurements as Partial<MeasurementData> | undefined),
    ...(staffEdit?.measurements as Partial<MeasurementData> | undefined),
  }));

  /**
   * An Assist link resolved server-side. Governs the preview's call to action and
   * nothing else — it is NOT a Staff session and must never gate staff chrome.
   */
  const assisted = Boolean(assistCode);
  /** Staff re-configuring an existing Result — never a new Draft, never a hold. */
  const staffEditing = Boolean(staffEdit);
  const [responseId, setResponseId] = useState<string | null>(staffEdit?.id ?? null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestion, setSuggestion] = useState<MpConfigSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const lastSavedRef = useRef<string>("");
  const transitionTimeoutRef = useRef<number | null>(null);
  const gridResetTimeoutRef = useRef<number | null>(null);

  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completedResponseId, setCompletedResponseId] = useState<string | null>(null);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  // --- Online purchase path (cover/case prefs, add-ons, hold) — no fillings/protector ---
  const [shopRecommendation, setShopRecommendation] = useState<RecommendationResponseData | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  // A reopened Result brings its own picks; only a fresh session defaults them
  // from the recommendation.
  const [selectedCover, setSelectedCover] = useState<number | null>(
    staffEdit?.preferences.find((p) => p.category === "cover")?.item_id ?? null,
  );
  const [selectedCase, setSelectedCase] = useState<number | null>(
    staffEdit?.preferences.find((p) => p.category === "case")?.item_id ?? null,
  );
  const [selectedAddons, setSelectedAddons] = useState<Set<number>>(
    () => new Set(staffEdit?.addonItemIds ?? []),
  );
  const [addons, setAddons] = useState<AddonOption[]>([]);

  // --- Staff assist mode (slice 04) — top-level so the mix survives step navigation ---
  const [assistPlacements, setAssistPlacements] = useState<PillowPlacement[]>(() =>
    staffEdit ? rowsToPillowPlacements(staffEdit.placements) : [],
  );
  // Seeded with the Result's own template + mix, so an untouched re-configure
  // keeps `filling_template_id` and only a real edit clears it (ADR 0008).
  const [assistLoadedTemplate, setAssistLoadedTemplate] = useState<LoadedTemplate | null>(() =>
    staffEdit && staffEdit.fillingTemplateId != null
      ? {
          id: staffEdit.fillingTemplateId,
          placements: rowsToPillowPlacements(staffEdit.placements),
        }
      : null,
  );
  // Filling items surfaced from the assist panel; the x-ray resolves shapes/colors by subtype.
  // Seeded from the Result so the x-ray labels and prices the placed pieces on
  // first paint, before the assist catalog fetch lands.
  const [assistItems, setAssistItems] = useState<FillingItem[]>(staffEdit?.items ?? []);
  const assistItemSubtypes = useMemo(
    () => new Map(assistItems.map((i) => [i.id, fillingDescriptor(i)])),
    [assistItems],
  );
  // Item size → pouch render scale (bigger fillings draw bigger in the x-ray).
  const assistItemSizes = useMemo(
    () => new Map(assistItems.map((i) => [i.id, i.size])),
    [assistItems],
  );
  // Product Builder color overrides (slice 11) → CSS vars on the x-ray container;
  // cleared overrides simply vanish and var(x, default) falls back to code defaults.
  const [assistColorOverrides, setAssistColorOverrides] = useState<ColorOverrideRow[]>([]);
  // RE slice 07: guests read the same filling_color_overrides table via the shop
  // response; staff panel overrides win once loaded.
  const shopColorOverrides = shopRecommendation?.color_overrides;
  const xrayColorVars = useMemo(
    () =>
      xrayColorVarStyle(
        assistColorOverrides.length ? assistColorOverrides : shopColorOverrides ?? [],
      ),
    [assistColorOverrides, shopColorOverrides],
  );
  // Kept only while the mix exactly matches the loaded template; slice 05's snapshot reads this.
  const sessionFillingTemplateId = useMemo(
    () => sessionTemplateId(assistLoadedTemplate, assistPlacements),
    [assistLoadedTemplate, assistPlacements],
  );
  const [holdEmail, setHoldEmail] = useState(resumeFinish?.email ?? staffEdit?.email ?? "");
  const [holdPhone, setHoldPhone] = useState(resumeFinish?.phone ?? staffEdit?.phone ?? "");
  const [discoverySource, setDiscoverySource] = useState(
    resumeFinish?.discoverySource ?? staffEdit?.discoverySource ?? "",
  );
  const [discoverySourceOther, setDiscoverySourceOther] = useState(
    resumeFinish?.discoverySourceOther ?? staffEdit?.discoverySourceOther ?? "",
  );
  const [referralCode, setReferralCode] = useState("");
  const [holdNotes, setHoldNotes] = useState("");
  const [holdAddress, setHoldAddress] = useState<HoldShippingAddress>(() => ({
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "SG",
    // The Result's stored address, when it has one. An Assisted customisation
    // has none yet, and then Staff are filling it in for the first time.
    ...((staffEdit?.shippingAddress ?? {}) as Partial<HoldShippingAddress>),
  }));
  const {
    signedIn: shippingSignedIn,
    savedAddresses,
    selectedAddressId,
    handleSelectAddress,
  } = useSavedShippingPrefill(
    // An Assist link is filled in on a Staff member's signed-in device, and so
    // is a Staff assist session: the signed-in account is not the buyer, and
    // prefilling it put the Staff email on the customer's build.
    assisted || staffAssist ? KEEP_EMAIL : setHoldEmail,
    assisted || staffAssist ? KEEP_ADDRESS : setHoldAddress,
  );
  const [shippingMethods, setShippingMethods] = useState<
    { id: string; slug: string; base_rate: number; free_above: number | null; content: Record<string, { name?: string }> }[]
  >([]);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Basic → Premium accept: collect only missing neck steps, then re-eval Premium. */
  const [upsoldToPremium, setUpsoldToPremium] = useState(false);
  const [postUpsellSteps, setPostUpsellSteps] = useState<Step[] | null>(null);
  const [routeAltPrice, setRouteAltPrice] = useState<number | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const entryJourneyRef = useRef<RecommendationRecord | null>(null);

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

  const stepOrder = (postUpsellSteps ?? stepOrderFor(variant)) as Step[];
  const showNeckSteps = !isBasic || upsoldToPremium;
  const soldAsPremium = upsoldToPremium || !isBasic;
  const flowRouteBlocksHold = useMemo(() => {
    const r = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    return Boolean(r && isFlowRoutePending(r));
  }, [shopRecommendation?.recommendation_record]);

  const patchRecommendationRecord = useCallback((next: RecommendationRecord) => {
    setShopRecommendation((prev) =>
      prev ? { ...prev, recommendation_record: next } : prev,
    );
  }, []);

  // Bolster → Mpillow handoff (sessionStorage from mbolster Upsell Upgrade).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("mp_flow_route_handoff");
      if (!raw) return;
      window.sessionStorage.removeItem("mp_flow_route_handoff");
      const handoff = JSON.parse(raw) as {
        journey?: RecommendationRecord;
        targetFlow?: RuleFlow;
        missingSteps?: Step[];
      };
      if (!handoff.journey?.flowRoute) return;
      entryJourneyRef.current = handoff.journey;
      const missing = (handoff.missingSteps ?? []) as Step[];
      if (handoff.targetFlow === "premium-mpillow") setUpsoldToPremium(true);
      if (missing.length > 0) {
        setPostUpsellSteps([...missing, "preview"]);
        setCurrentStep(missing[0]!);
      }
    } catch {
      // ponytail: ignore corrupt handoff
    }
  }, []);

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

  const nameFields = useMemo((): FieldCheck[] => [
    {
      key: "name",
      touched: isNonEmptyString(measurementData.name),
      valid: isNonEmptyString(measurementData.name),
      message: "Enter your name",
    },
    {
      key: "gender",
      touched: isNonEmptyString(measurementData.gender),
      valid: isNonEmptyString(measurementData.gender),
      message: "Select a gender",
    },
    {
      key: "ageGroup",
      touched: isNonEmptyString(measurementData.ageGroup),
      valid: isNonEmptyString(measurementData.ageGroup),
      message: "Select an age group",
    },
  ], [measurementData.name, measurementData.gender, measurementData.ageGroup]);

  const measureField = (key: MeasureKey): FieldCheck[] => [
    {
      key,
      touched: measurementDrafts[key].trim() !== "",
      valid: normalizeMeasurementDraft(measurementUnit, measurementDrafts[key]) !== null,
      message: "Enter a valid measurement",
    },
  ];

  const setMeasureDraft = (key: MeasureKey, value: string) => {
    setMeasurementDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const commitMeasureDraft = (key: MeasureKey) => {
    const cm = normalizeMeasurementDraft(measurementUnit, measurementDrafts[key]);
    if (cm === null) return;
    updateMeasurement(key, cm);
    setMeasureDraft(key, displayMeasurement(measurementUnit, cm));
  };

  const changeMeasurementUnit = (next: MeasurementUnit) => {
    const nextDrafts = { ...measurementDrafts };
    const nextData = { ...measurementData };
    for (const key of Object.keys(EMPTY_MEASURE_DRAFTS) as MeasureKey[]) {
      const cm =
        normalizeMeasurementDraft(measurementUnit, measurementDrafts[key]) ??
        measurementData[key];
      nextData[key] = cm;
      nextDrafts[key] = displayMeasurement(next, cm);
    }
    setMeasurementData(nextData);
    setMeasurementDrafts(nextDrafts);
    setMeasurementUnit(next);
  };

  const customizeFields = useMemo((): FieldCheck[] => [
    {
      key: "bloodPressureLevel",
      touched: isNonEmptyString(measurementData.bloodPressureLevel),
      valid: isNonEmptyString(measurementData.bloodPressureLevel),
      message: "Select blood pressure",
    },
    {
      key: "earDiscomfortSideSleep",
      touched: isNonEmptyString(measurementData.earDiscomfortSideSleep),
      valid: isNonEmptyString(measurementData.earDiscomfortSideSleep),
      message: "Select yes or no",
    },
    {
      key: "bedFirmness",
      touched: isNonEmptyString(measurementData.bedFirmness),
      valid: isNonEmptyString(measurementData.bedFirmness),
      message: "Select bed firmness",
    },
    {
      key: "acidReflux",
      touched: isNonEmptyString(measurementData.acidReflux),
      valid: isNonEmptyString(measurementData.acidReflux),
      message: "Select yes or no",
    },
    {
      key: "sleepPainAreas",
      touched: painAreasAnswered(measurementData.sleepPainAreas),
      valid: painAreasAnswered(measurementData.sleepPainAreas),
      message: "Select pain areas or None",
    },
    {
      key: "sleepPositionType",
      touched: measurementData.sleepPositionType.length > 0,
      valid: measurementData.sleepPositionType.length > 0,
      message: "Select at least one sleep position",
    },
    {
      key: "usesBolster",
      touched: isNonEmptyString(measurementData.usesBolster),
      valid: isNonEmptyString(measurementData.usesBolster),
      message: "Select yes or no",
    },
  ], [
    measurementData.bloodPressureLevel,
    measurementData.earDiscomfortSideSleep,
    measurementData.bedFirmness,
    measurementData.acidReflux,
    measurementData.sleepPainAreas,
    measurementData.sleepPositionType,
    measurementData.usesBolster,
  ]);

  const holdFields = useMemo((): FieldCheck[] => [
    {
      key: "cover",
      touched: selectedCover != null,
      valid: selectedCover != null,
      message: "Choose a cover",
    },
    {
      key: "case",
      touched: selectedCase != null,
      valid: selectedCase != null,
      message: "Choose a case",
    },
    ...previewContactFieldChecks({
      email: holdEmail,
      phone: holdPhone,
      discoverySource,
      discoverySourceOther,
      notes: holdNotes,
      referralCode,
    }),
    {
      key: "recipient",
      touched: isNonEmptyString(holdAddress.recipient),
      valid: isNonEmptyString(holdAddress.recipient),
      message: "Recipient is required",
    },
    {
      key: "line1",
      touched: isNonEmptyString(holdAddress.line1),
      valid: isNonEmptyString(holdAddress.line1),
      message: "Address is required",
    },
    {
      key: "city",
      touched: isNonEmptyString(holdAddress.city),
      valid: isNonEmptyString(holdAddress.city),
      message: "City is required",
    },
    {
      key: "postal_code",
      touched: isNonEmptyString(holdAddress.postal_code),
      valid: isNonEmptyString(holdAddress.postal_code),
      message: "Postal code is required",
    },
    {
      key: "shipping",
      touched: isNonEmptyString(selectedShippingId),
      valid: isNonEmptyString(selectedShippingId),
      message: "Choose a shipping method",
    },
  ], [
    selectedCover,
    selectedCase,
    holdEmail,
    holdPhone,
    discoverySource,
    discoverySourceOther,
    holdNotes,
    holdAddress.recipient,
    holdAddress.line1,
    holdAddress.city,
    holdAddress.postal_code,
    selectedShippingId,
  ]);

  const activeFields = useMemo((): FieldCheck[] => {
    switch (currentStep) {
      case "name":
        return nameFields;
      case "shoulder-length":
        return measureField("shoulderLength");
      case "neck-to-back":
        return measureField("neckToBack");
      case "head-to-back":
        return measureField("headToBack");
      case "neck-length":
        return measureField("neckLength");
      case "customize":
        return customizeFields;
      case "preview":
        return holdFields;
      default:
        return [];
    }
  }, [currentStep, nameFields, customizeFields, holdFields, measurementData, measurementDrafts, measurementUnit]);

  useEffect(() => {
    setFieldErrors({});
  }, [currentStep]);

  useEffect(() => {
    setFieldErrors((prev) => pruneFieldErrors(prev, activeFields));
  }, [activeFields]);

  const tryAdvance = (fields: FieldCheck[], onOk: () => void | Promise<void>) => {
    const errors = buildFieldErrorMap(fields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    void onOk();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Re-configuring a Result: the Customisation session IS that Result, so any
    // Reference photo lands on it. Touching this device's own draft id here
    // would both hijack the session and risk autosaving a customer's answers
    // onto an unrelated row.
    if (staffEdit) return;
    let id = window.localStorage.getItem(sessionStorageKey);
    if (!id) {
      id = newResponseId();
      window.localStorage.setItem(sessionStorageKey, id);
      writeToken(tokenStorageKey, null);
    }
    setResponseId(id);

    // If the saved id is already "released" in the DB, start a fresh session id.
    // This prevents new measurements from overwriting a released result and appearing directly in the Released tab.
    (async () => {
      const rotate = () => {
        const newId = newResponseId();
        window.localStorage.setItem(sessionStorageKey, newId);
        writeToken(tokenStorageKey, null);
        setResponseId(newId);
        lastSavedRef.current = "";
        setSaveStatus("idle");
      };
      try {
        const token = readToken(tokenStorageKey);
        const qs = token ? `?token=${encodeURIComponent(token)}` : "";
        const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(id!)}${qs}`, { method: "GET", cache: "no-store" });
        // Refused: this id is no longer ours. It happens when this device lost the
        // token (or never stored one) for a `held` Result, and the stored id then
        // points at a Result every later write would be refused for (one this
        // device does own reads fine and rotates below on `is_final`). Rotating
        // here is what keeps a customer who cancelled at Stripe able to save
        // again; treating a refusal
        // as "keep the id" strands them on a save indicator stuck at "error".
        if (res.status === 401 || res.status === 403) {
          rotate();
          return;
        }
        const payload = await res.json().catch(() => null);
        if (!res.ok) return; // If it doesn't exist yet (or can't be read), keep the id for draft saving.
        const isFinal = Boolean(payload?.response?.is_final);
        if (!isFinal) return;
        rotate();
      } catch {
        // Best-effort only; never block the UI.
      }
    })();
  }, [sessionStorageKey, tokenStorageKey, staffEdit]);

  // Stripe hold cancel → restore preview + selections (and light notice).
  useEffect(() => {
    if (typeof window === "undefined") return;
    // A reopened Result is not a cancelled hold; restoring this device's draft
    // over it would replace the customer's build with someone else's session.
    if (staffEdit) return;
    const holdCancelled = isHoldCancelledQuery(window.location.search);
    const draft = readHoldCancelDraft(window.localStorage, holdSurface);
    if (!shouldRestorePreview({ holdCancelled, draftStep: draft?.step })) {
      if (holdCancelled) {
        toast.message(HOLD_CANCELLED_NOTICE.title, {
          description: HOLD_CANCELLED_NOTICE.description,
        });
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${stripHoldCancelledFromSearch(window.location.search)}`,
        );
      }
      return;
    }

    if (draft?.measurementData) {
      const partial = draft.measurementData as Partial<MeasurementData>;
      setMeasurementData((prev) => ({ ...prev, ...partial }));
      setMeasurementDrafts((prev) => {
        const unit = (draft.measurementUnit as MeasurementUnit | undefined) ?? measurementUnit;
        const next = { ...prev };
        for (const key of Object.keys(EMPTY_MEASURE_DRAFTS) as MeasureKey[]) {
          if (partial[key] != null) {
            next[key] = displayMeasurement(unit, String(partial[key]));
          }
        }
        return next;
      });
    }
    if (draft?.measurementUnit) setMeasurementUnit(draft.measurementUnit);
    if (draft?.responseId) {
      window.localStorage.setItem(sessionStorageKey, draft.responseId);
      setResponseId(draft.responseId);
    }
    if (draft?.selections) {
      setSelectedCover(draft.selections.selectedCover);
      setSelectedCase(draft.selections.selectedCase);
      setSelectedAddons(new Set(draft.selections.selectedAddons));
      setSelectedShippingId(draft.selections.selectedShippingId);
      if (draft.selections.holdEmail) setHoldEmail(draft.selections.holdEmail);
      if (draft.selections.holdPhone) setHoldPhone(draft.selections.holdPhone);
      if (draft.selections.discoverySource) setDiscoverySource(draft.selections.discoverySource);
      if (draft.selections.discoverySourceOther) {
        setDiscoverySourceOther(draft.selections.discoverySourceOther);
      }
      if (draft.selections.notes) setHoldNotes(draft.selections.notes);
      setHoldAddress(draft.selections.holdAddress);
    }
    setCurrentStep("preview");
    setRestoringHoldCancel(true);

    if (holdCancelled) {
      toast.message(HOLD_CANCELLED_NOTICE.title, {
        description: HOLD_CANCELLED_NOTICE.description,
      });
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${stripHoldCancelledFromSearch(window.location.search)}`,
      );
    }
    // ponytail: mount-only restore; holdSurface/sessionStorageKey stable per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist preview + hold-prep so cancel URL can restore.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentStep !== "preview") return;
    // Not a hold session: nothing to restore after a Stripe cancel.
    if (resumeFinish || staffEdit) return;
    writeHoldCancelDraft(window.localStorage, {
      v: 1,
      surface: holdSurface,
      step: "preview",
      responseId,
      measurementUnit,
      measurementData: measurementData as unknown as Record<string, unknown>,
      selections: {
        selectedCover,
        selectedCase,
        selectedAddons: [...selectedAddons],
        selectedShippingId,
        holdEmail,
        holdPhone,
        discoverySource,
        discoverySourceOther,
        notes: holdNotes,
        holdAddress,
      },
    });
  }, [
    currentStep,
    holdSurface,
    responseId,
    measurementUnit,
    measurementData,
    selectedCover,
    selectedCase,
    selectedAddons,
    selectedShippingId,
    holdEmail,
    holdPhone,
    discoverySource,
    discoverySourceOther,
    holdNotes,
    holdAddress,
    resumeFinish,
    staffEdit,
  ]);

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
    setMeasurementDrafts(EMPTY_MEASURE_DRAFTS);
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
    setAssistPlacements([]);
    setAssistLoadedTemplate(null);
    // Keep holdEmail/holdAddress — signed-in shoppers stay prefilled.
    setHoldSubmitting(false);
  };

  const ensureResponseId = () => {
    if (responseId) return responseId;
    if (typeof window === "undefined") return null;
    const newId = newResponseId();
    window.localStorage.setItem(sessionStorageKey, newId);
    writeToken(tokenStorageKey, null);
    setResponseId(newId);
    return newId;
  };

  const startNewMeasurement = () => {
    if (typeof window !== "undefined") {
      const newId = newResponseId();
      window.localStorage.setItem(sessionStorageKey, newId);
      writeToken(tokenStorageKey, null);
      clearHoldCancelDraft(window.localStorage, holdSurface);
      setResponseId(newId);
    } else {
      setResponseId(null);
    }
    resetMeasurementState();
  };

  const exitToStart = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(sessionStorageKey);
      writeToken(tokenStorageKey, null);
      clearHoldCancelDraft(window.localStorage, holdSurface);
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

  /** Mobile → centered Dialog; desktop → toast (unchanged). */
  const requestExit = () => {
    // A finish link has no session to clear — leaving returns to its status page.
    if (resumeStatusPath) {
      window.location.href = resumeStatusPath;
      return;
    }
    if (isMobile) setExitDialogOpen(true);
    else confirmExit();
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

  const upsertToDb = useCallback(async (
    opts?: { isFinal?: boolean },
  ): Promise<{ id: string; telegramStatus?: "sent" | "skipped" | "failed" } | null> => {
    // A reopened finish holds someone's submitted answers. Autosaving them into
    // this device's own Draft session would copy them onto an unrelated row.
    // A Staff re-configuration writes through `/reconfigure` on save instead:
    // the responses route refuses a non-null status anyway, and a silent
    // autosave of a live Result is not something a Save button should imply.
    if (!responseId || resumeFinish || staffEdit) return null;
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
          ...(readToken(tokenStorageKey) ? { token: readToken(tokenStorageKey) } : {}),
          ...(typeof opts?.isFinal === "boolean" ? { isFinal: opts.isFinal } : {}),
          // The CODE, never a staff id: the server re-resolves it and stamps
          // the row on create only (app/api/mp-config/responses/route.ts).
          ...(assistCode ? { assistCode } : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save");
      // Minted on create only; later saves echo nothing back.
      if (typeof payload?.accessToken === "string") writeToken(tokenStorageKey, payload.accessToken);
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
  }, [
    responseId,
    hasAnyInput,
    measurementData,
    tokenStorageKey,
    assistCode,
    resumeFinish,
    staffEdit,
  ]);

  const loadSuggestion = async () => {
    if (!responseId) return;
    setSuggestionLoading(true);
    try {
      const token = readToken(tokenStorageKey);
      const qs = token ? `?token=${encodeURIComponent(token)}` : "";
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(responseId)}${qs}`, {
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
  }, [responseId, hasAnyInput, measurementData, upsertToDb]);

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

      // The photo route refuses an unknown responseId, so make sure the Draft
      // Result exists (and our token with it) before writing to it. Idempotent —
      // it early-returns when nothing changed since the last save.
      await upsertToDb();

      const res = await fetch("/api/mp-config/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, view, dataUrl, token: readToken(tokenStorageKey) }),
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

  // Fetch shop recommendation from customize API (full mp-config path)
  const fetchShopRecommendation = useCallback(async (opts?: {
    preserveSelections?: boolean;
    /** Price and offer the size×tier Staff assigned (finish link, ADR 0017). */
    assigned?: { size: string; tier: string };
  }): Promise<RecommendationResponseData | null> => {
    const missing = incompleteEngineInputs(
      "premium-mpillow",
      wizardToEngineInputs(measurementData),
    );
    if (missing.length > 0) {
      toast.error("Complete all required answers before continuing");
      return null;
    }

    const shoulderCm = Number(measurementData.shoulderLength);
    const neckToBackCm = Number(measurementData.neckToBack);
    const headToBackCm = Number(measurementData.headToBack);
    const neckLengthCm = Number(measurementData.neckLength);

    setShopLoading(true);
    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "ballpark",
          measurement_preferences: {
            measurements: {
              shoulder_length_cm: shoulderCm,
              neck_to_back_cm: neckToBackCm,
              head_to_back_cm: headToBackCm,
              neck_length_cm: neckLengthCm,
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
          ...(opts?.assigned ? { assigned: opts.assigned } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(err.error, `Failed to get recommendation (${res.status})`));
      }

      const data: RecommendationResponseData = await res.json();
      setShopRecommendation(data);

      if (!opts?.preserveSelections) {
        setSelectedCover(pickDefaultComponent(data.components.covers));
        setSelectedCase(pickDefaultComponent(data.components.cases));
      }
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get shop recommendation");
      return null;
    } finally {
      setShopLoading(false);
    }
  }, [measurementData]);

  const fetchBasicRecommendation = useCallback(async (opts?: { preserveSelections?: boolean }): Promise<RecommendationResponseData | null> => {
    const missing = incompleteEngineInputs(
      "basic-mpillow",
      wizardToEngineInputs(measurementData),
    );
    if (missing.length > 0) {
      toast.error("Complete all required answers before continuing");
      return null;
    }

    setShopLoading(true);
    try {
      const res = await fetch("/api/mp-basic/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(measurementData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(err.error, `Failed to get recommendation (${res.status})`));
      }

      const data: RecommendationResponseData = await res.json();
      setShopRecommendation(data);
      if (!opts?.preserveSelections) {
        setSelectedCover(pickDefaultComponent(data.components.covers));
        setSelectedCase(pickDefaultComponent(data.components.cases));
      }
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get basic recommendation");
      return null;
    } finally {
      setShopLoading(false);
    }
  }, [measurementData]);

  const fetchRecommendation = isBasic ? fetchBasicRecommendation : fetchShopRecommendation;

  /**
   * Staff assist: confirmed size×tier change. Updates the product context as if
   * the recommendation had that size×tier, clears the mix and loads the new
   * size's Default Filling Template, then rechecks cover/case/add-on
   * eligibility (wrong size → clear + note; stock 0 → keep, existing
   * OOS/Pre-order signals apply).
   */
  const applyAssistSizeTier = async (next: SizeTier) => {
    const res = await fetch(
      `/api/mp-config/assist/context?size=${encodeURIComponent(next.size)}&tier=${encodeURIComponent(next.tier)}`,
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.pillow_product) {
      toast.error(getApiErrorMessage(data?.error, "Failed to switch size"));
      return;
    }

    setShopRecommendation((prev) => ({
      ...(prev ?? {
        ok: true,
        recommendation: {
          recommended_size: next.size,
          recommended_kind: next.tier,
          filling_lines: [],
          summary: "",
          explanation: "",
        },
        templates: [],
        available_fillings: [],
      }),
      pillow_product: data.pillow_product,
      variant: data.variant,
      // Costings for the NEW size×tier. Carrying the old ones forward is what
      // made the ballpark quote a different pillow than the one on screen.
      pricing: data.pricing ?? null,
      components: data.components,
      composed_buildable: data.composed_buildable,
    }));

    const tplPlacements = rowsToPillowPlacements(
      (data.default_template?.placements ?? []) as PillowPlacementRow[],
    );
    setAssistPlacements(tplPlacements);
    setAssistLoadedTemplate(
      data.default_template ? { id: data.default_template.id, placements: tplPlacements } : null,
    );

    const newAddons: AddonOption[] = await fetch(
      `/api/results/addons?productType=pillow&size=${encodeURIComponent(next.size)}`,
    )
      .then((r) => r.json())
      .then((d: { addons?: AddonOption[] }) => d.addons ?? [])
      .catch(() => []);

    const named = (id: number | null, options: { item_id: number; name: string }[]) =>
      id == null
        ? null
        : { itemId: id, name: options.find((o) => o.item_id === id)?.name ?? `Item #${id}` };
    const result = recheckSelectionsForSize({
      cover: named(selectedCover, shopRecommendation?.components.covers ?? []),
      caseSel: named(selectedCase, shopRecommendation?.components.cases ?? []),
      addons: [...selectedAddons].map((id) => ({
        itemId: id,
        name: addons.find((a) => a.item_id === id)?.name ?? `Item #${id}`,
      })),
      offeredCovers: data.components.covers,
      offeredCases: data.components.cases,
      offeredAddonIds: newAddons.map((a) => a.item_id),
    });
    setSelectedCover(result.coverId);
    setSelectedCase(result.caseId);
    setSelectedAddons(new Set(result.addonIds));
    setAddons(newAddons);
    if (result.clearedNames.length > 0) {
      toast.message(`Not offered for Size ${next.size}`, {
        description: `Cleared: ${result.clearedNames.join(", ")}`,
      });
    }
  };

  // After hold-cancel restore, re-fetch recommendation without clobbering cover/case.
  useEffect(() => {
    if (!restoringHoldCancel || currentStep !== "preview") return;
    let cancelled = false;
    (async () => {
      if (isBasic) {
        await fetchBasicRecommendation({ preserveSelections: true });
      } else {
        await Promise.all([
          loadSuggestion(),
          fetchShopRecommendation({ preserveSelections: true }),
        ]);
      }
      if (!cancelled) setRestoringHoldCancel(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoringHoldCancel, currentStep]);

  /**
   * Product context for a size×tier without going through the engine. A Result
   * measured through the Basic flow, or in store before a question existed,
   * can lack inputs `fetchShopRecommendation` insists on — and Staff opening it
   * to swap a cover are not going to re-answer the questionnaire to get there.
   * Options and Costings come from the assist route instead; the mix and the
   * Result's own picks are left exactly as they are.
   */
  const loadStaffEditContext = useCallback(async (size: string, tier: string) => {
    const res = await fetch(
      `/api/mp-config/assist/context?size=${encodeURIComponent(size)}&tier=${encodeURIComponent(tier)}`,
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.pillow_product) {
      toast.error(getApiErrorMessage(data?.error, "Could not load this build's options"));
      return;
    }
    setShopRecommendation({
      ok: true,
      recommendation: {
        recommended_size: size,
        recommended_kind: tier,
        filling_lines: [],
        summary: "",
        explanation: "",
      },
      templates: [],
      available_fillings: [],
      pillow_product: data.pillow_product,
      variant: data.variant,
      pricing: data.pricing ?? null,
      components: data.components,
      composed_buildable: data.composed_buildable,
    } as RecommendationResponseData);
  }, []);

  // A reopened Result (finish link or Staff re-configuration): load the
  // ASSIGNED size's cover/case options and pricing, once.
  useEffect(() => {
    const reopened = resumeFinish ?? staffEdit;
    if (!reopened) return;
    const missing = incompleteEngineInputs(
      "premium-mpillow",
      wizardToEngineInputs(measurementData),
    );
    if (staffEdit && missing.length > 0) {
      void loadStaffEditContext(staffEdit.size, staffEdit.tier);
      return;
    }
    void fetchShopRecommendation({
      assigned: { size: reopened.size, tier: reopened.tier },
      // A re-configuration keeps the Result's own cover and case: defaulting
      // them would quietly undo the customer's choice on a save that only meant
      // to change the fillings. A finish link has no picks yet, so it takes the
      // recommendation's defaults as before.
      preserveSelections: Boolean(staffEdit),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; the answers never change here
  }, []);

  // Load size-scoped add-ons + shipping when entering purchase preview.
  useEffect(() => {
    if (currentStep !== "preview") return;
    const size =
      shopRecommendation?.pillow_product?.size ??
      suggestion?.recommended?.size ??
      suggestion?.product?.size ??
      "";
    // Assisted runs offer no add-ons (AC3) — skip the fetch entirely.
    if (!partnerAssisted) {
      const qs = new URLSearchParams({ productType: "pillow" });
      if (size) qs.set("size", size);
      fetch(`/api/results/addons?${qs.toString()}`)
        .then((r) => r.json())
        .then((d: { addons?: AddonOption[] }) => {
          const list = d.addons ?? [];
          setAddons(list);
          setSelectedAddons((prev) => {
            const valid = new Set(list.map((a) => a.item_id));
            return new Set([...prev].filter((id) => valid.has(id)));
          });
        })
        .catch(() => setAddons([]));
    }

    const country = holdAddress.country || "SG";
    fetch(`/api/shop/shipping?country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then(async (d: { rows?: typeof shippingMethods }) => {
        let methods = d.rows ?? [];
        // Fallback: methods may predate SG country tags (seeded as MY).
        if (methods.length === 0) {
          const all = await fetch("/api/shop/shipping").then((r) => r.json());
          methods = all.rows ?? [];
        }
        setShippingMethods(methods);
        setSelectedShippingId((prev) => {
          if (methods.some((m) => m.id === prev)) return prev;
          // Re-configuring: keep the method the Result already carries. The
          // column stores a slug and the picker keys off the id, so the match
          // happens here rather than in the server payload.
          const stored = staffEdit?.shippingMethodSlug
            ? methods.find((m) => m.slug === staffEdit.shippingMethodSlug)
            : undefined;
          return stored?.id ?? methods[0]?.id ?? "";
        });
      })
      .catch(() => setShippingMethods([]));
  }, [
    currentStep,
    shopRecommendation?.pillow_product?.size,
    suggestion?.recommended?.size,
    suggestion?.product?.size,
    holdAddress.country,
    staffEdit,
  ]);

  // Fetch alt-tier price while a Flow route awaits Upgrade / Keep.
  useEffect(() => {
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    if (!record?.flowRoute || !isFlowRoutePending(record)) {
      setRouteAltPrice(null);
      return;
    }
    const size = shopRecommendation?.pillow_product?.size;
    if (!size) return;
    const tier =
      record.flowRoute.targetFlow === "basic-mpillow" ? "basic" : "premium";
    let cancelled = false;
    fetch(
      `/api/mp-config/assist/context?size=${encodeURIComponent(size)}&tier=${tier}`,
    )
      .then((r) => r.json())
      .then((d: { variant?: { price?: number } | null }) => {
        if (!cancelled) setRouteAltPrice(d.variant?.price ?? null);
      })
      .catch(() => {
        if (!cancelled) setRouteAltPrice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    shopRecommendation?.recommendation_record,
    shopRecommendation?.pillow_product?.size,
  ]);

  const handleKeepFlowRoute = useCallback(() => {
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    if (!record?.flowRoute) return;
    setRouteBusy(true);
    patchRecommendationRecord(withJourneyOnDecline(record));
    setRouteBusy(false);
  }, [shopRecommendation?.recommendation_record, patchRecommendationRecord]);

  const handleUpgradeFlowRoute = useCallback(async () => {
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    if (!record?.flowRoute) return;
    const target = record.flowRoute.targetFlow;
    if (target !== "premium-mpillow" && target !== "basic-mpillow") return;

    setRouteBusy(true);
    try {
      const fromFlow: RuleFlow = isBasic ? "basic-mpillow" : "premium-mpillow";
      const carried = carryOverAnswers(fromFlow, target, wizardToEngineInputs(measurementData));
      const missing = missingStepsAfterCarryOver(fromFlow, target, carried) as Step[];
      const accepted = withJourneyOnAccept(record, target);
      entryJourneyRef.current = accepted;
      patchRecommendationRecord(accepted);

      if (target === "premium-mpillow" && isBasic) {
        setUpsoldToPremium(true);
        setPostUpsellSteps([...missing, "preview"]);
        if (missing.length > 0) {
          setCurrentStep(missing[0] as Step);
        } else {
          const rec = await fetchShopRecommendation({ preserveSelections: true });
          if (rec?.recommendation_record && entryJourneyRef.current) {
            const stamped = stampAcceptedTargetRecord(
              entryJourneyRef.current,
              parseRecommendationRecord(rec.recommendation_record) ??
                (rec.recommendation_record as RecommendationRecord),
            );
            patchRecommendationRecord(stamped);
          }
        }
      }
    } finally {
      setRouteBusy(false);
    }
  }, [
    shopRecommendation?.recommendation_record,
    isBasic,
    measurementData,
    patchRecommendationRecord,
    fetchShopRecommendation,
  ]);

  const finishPostUpsellNeck = useCallback(async () => {
    const rec = await fetchShopRecommendation({ preserveSelections: false });
    if (rec?.recommendation_record && entryJourneyRef.current) {
      const stamped = stampAcceptedTargetRecord(
        entryJourneyRef.current,
        parseRecommendationRecord(rec.recommendation_record) ??
          (rec.recommendation_record as RecommendationRecord),
      );
      patchRecommendationRecord(stamped);
    }
    setCurrentStep("preview");
  }, [fetchShopRecommendation, patchRecommendationRecord]);

  /** Where a re-configuration returns to — the Result it came from. */
  const staffEditResultPath = staffEdit ? to(`/settings/results/${staffEdit.id}`) : null;

  /** Where a finish link returns to — its status page — instead of the questionnaire. */
  const resumeStatusPath = resumeFinish
    ? to(
        `/results/${resumeFinish.id}${
          resumeFinish.token ? `?token=${encodeURIComponent(resumeFinish.token)}` : ""
        }`,
      )
    : null;

  const contactValues = {
    email: holdEmail,
    phone: holdPhone,
    discoverySource,
    discoverySourceOther,
    notes: holdNotes,
    referralCode,
  };

  /**
   * Assisted customisation: sent to the build team straight from the
   * questionnaire (ADR 0017). No cover, case or shipping yet — the customer picks
   * those after Staff assign the fillings. The deferred hold is authorised by
   * the stored row's `source`, never by this flag.
   */
  const handleSendToBuildTeam = () =>
    tryAdvance([...customizeFields, ...previewContactFieldChecks(contactValues)], async () => {
      setHoldSubmitting(true);
      try {
        const saved = await upsertToDb();
        if (!saved) throw new Error("Could not save your answers. Please try again.");
        const rec = await fetchRecommendation();
        if (!rec) {
          setHoldSubmitting(false);
          return;
        }
        const size = rec.pillow_product?.size;
        const tier = soldAsPremium
          ? "premium"
          : isBasic
            ? "basic"
            : (rec.pillow_product?.kind as "basic" | "premium" | undefined);
        // Staff choose size and tier at assignment, so an unresolved Flow route
        // is kept as-is rather than asked of the customer here.
        const parsedRecord = parseRecommendationRecord(rec.recommendation_record ?? null);
        const record =
          parsedRecord && isFlowRoutePending(parsedRecord)
            ? withJourneyOnDecline(parsedRecord)
            : parsedRecord;
        const res = await fetch("/api/results/hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            responseId: responseId ?? undefined,
            // Proves this device owns the Draft Result it is submitting.
            token: readToken(tokenStorageKey),
            deferred: true,
            email: holdEmail.trim(),
            phone: holdPhone.trim(),
            discoverySource,
            discoverySourceOther:
              discoverySource === "other" ? discoverySourceOther.trim() : undefined,
            referralCode: referralCode.trim() || undefined,
            measurements: {
              ...measurementData,
              ...(holdNotes.trim() ? { notes: holdNotes.trim() } : {}),
            },
            suggestedSize: size,
            suggestedTier: tier,
            cancelPath: configPath,
            ...(record ? { recommendationRecord: record } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(getApiErrorMessage(data.error, "Could not send to our build team"));
        }
        // Shared in-store device: the next customer must not inherit this session.
        try {
          window.localStorage.removeItem(sessionStorageKey);
          clearHoldCancelDraft(window.localStorage, holdSurface);
        } catch {
          // private mode — nothing was stored
        }
        writeToken(tokenStorageKey, null);
        // Staff on the device go straight to the Result to confirm the fillings.
        // A customer on their own phone waits on the status page.
        const staffDest = canViewResults ? to(`/settings/results/${data.resultId}#assignment`) : null;
        window.location.href = staffDest ?? ((data.checkoutUrl ?? data.statusUrl) as string);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not send to our build team");
        setHoldSubmitting(false);
      }
    });

  /** Finish link: save cover/case/add-ons/shipping, then pay through the existing accept. */
  const handleFinishAndPay = async () => {
    if (!resumeFinish) return;
    const contactKeys = new Set(["email", "phone", "discoverySource", "discoverySourceOther"]);
    const errors = buildFieldErrorMap(holdFields.filter((f) => !contactKeys.has(f.key)));
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    const { id, token } = resumeFinish;
    const statusPath = resumeStatusPath!;
    setHoldSubmitting(true);
    try {
      const finish = await fetch(`/api/results/${id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
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
      const finishData = await finish.json().catch(() => ({}));
      // Already finished (an earlier attempt, another tab): the status page has
      // the stored price and its own Pay button.
      if (finish.status === 409) {
        window.location.href = statusPath;
        return;
      }
      if (!finish.ok) {
        throw new Error(getApiErrorMessage(finishData.error, "Could not save your finish"));
      }
      const accept = await fetch(`/api/results/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token } : {}),
      });
      const acceptData = await accept.json().catch(() => ({}));
      window.location.href =
        accept.ok && acceptData.checkoutUrl ? (acceptData.checkoutUrl as string) : statusPath;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your finish");
      setHoldSubmitting(false);
    }
  };

  /**
   * Staff re-configuration: write the edited build back onto the Result.
   *
   * No hold, no Checkout, no new Draft — the Result keeps its status, its
   * Authorization hold and its customer link, and the server reprices it so
   * `final_amount` describes what was just composed. Staff land back on the
   * Result detail page, where "Request payment" re-sends the priced email.
   */
  const handleStaffEditSave = async () => {
    if (!staffEdit) return;
    const size = shopRecommendation?.pillow_product?.size ?? staffEdit.size;
    const tier =
      (shopRecommendation?.pillow_product?.kind as "basic" | "premium" | undefined) ??
      staffEdit.tier;
    // Cover and case only. The rest of `holdFields` guards a hold submit; an
    // Assisted customisation being re-configured legitimately has no address
    // yet, and flagging it would block an edit that never touches shipping.
    const coverCaseErrors = buildFieldErrorMap(
      holdFields.filter((f) => f.key === "cover" || f.key === "case"),
    );
    if (Object.keys(coverCaseErrors).length > 0 || selectedCover == null || selectedCase == null) {
      setFieldErrors(coverCaseErrors);
      toast.error("Choose a cover and a case");
      return;
    }
    // Shipping travels only when it is complete. An Assisted customisation has
    // none yet and the customer supplies it at their finish — half an address
    // would fail the server's schema and block an otherwise valid edit.
    const addressComplete = Boolean(
      holdAddress.line1.trim() && holdAddress.city.trim() && holdAddress.postal_code.trim(),
    );
    const shipping =
      selectedShippingId && addressComplete
        ? {
            shippingMethodId: selectedShippingId,
            shippingAddress: {
              ...holdAddress,
              recipient: holdAddress.recipient || measurementData.name,
            },
          }
        : {};

    setHoldSubmitting(true);
    try {
      const res = await fetch(`/api/results/${staffEdit.id}/reconfigure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedSize: size,
          assignedTier: tier,
          measurements: measurementData,
          preferenceLines: [
            { item_id: selectedCover, quantity: 1, category: "cover" },
            { item_id: selectedCase, quantity: 1, category: "case" },
          ],
          addonLines: [...selectedAddons].map((item_id) => ({ item_id, quantity: 1 })),
          placements: pillowPlacementsToRows(assistPlacements),
          // Re-verified server-side against the template's current placements.
          fillingTemplateId: sessionFillingTemplateId,
          ...shipping,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data.error, "Could not save this configuration"));
      }
      window.location.href = staffEditResultPath!;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this configuration");
      setHoldSubmitting(false);
    }
  };

  const handleAuthorizeHold = useCallback(async () => {
    const size =
      shopRecommendation?.pillow_product?.size ??
      suggestion?.recommended?.size ??
      suggestion?.product?.size;
    const tier = soldAsPremium
      ? ("premium" as const)
      : isBasic
        ? ("basic" as const)
        : ((shopRecommendation?.pillow_product?.kind as "basic" | "premium" | undefined) ??
          suggestion?.recommended?.kind ??
          suggestion?.product?.kind);

    if (!size || !tier) {
      toast.error("Missing size or tier suggestion");
      return;
    }

    const journeyRecord = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    const routeGate = assertPreStripeRouteResolved(
      journeyRecord ?? { flowRoute: null },
    );
    if (!routeGate.ok) {
      toast.error(routeGate.reason);
      return;
    }

    const errors = buildFieldErrorMap(holdFields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
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
          // Re-submitting an existing Result needs its access token (ownership).
          token: readToken(tokenStorageKey),
          // Assisted customisation: no card. The server honours this only if the
          // row it already stored is `source = 'staff_assisted'`, so the flag is
          // a request, not a grant.
          ...(assisted ? { deferred: true } : {}),
          email: holdEmail.trim(),
          phone: holdPhone.trim(),
          discoverySource,
          discoverySourceOther:
            discoverySource === "other" ? discoverySourceOther.trim() : undefined,
          referralCode: referralCode.trim() || undefined,
          // Assist priority (#78): server re-resolves this code → partner id.
          ...(partner ? { partnerAssistCode: partner.code } : {}),
          measurements: {
            ...measurementData,
            ...(holdNotes.trim() ? { notes: holdNotes.trim() } : {}),
          },
          suggestedSize: size,
          suggestedTier: tier,
          preferenceLines: [
            { item_id: selectedCover!, quantity: 1, category: "cover" },
            { item_id: selectedCase!, quantity: 1, category: "case" },
          ],
          addonLines: [...selectedAddons].map((item_id) => ({ item_id, quantity: 1 })),
          // Staff assist snapshot (slice 05): session mix + still-matching template claim.
          ...(staffAssist && assistPlacements.length > 0
            ? {
                assistFilling: {
                  placements: pillowPlacementsToRows(assistPlacements),
                  templateId: sessionFillingTemplateId,
                },
              }
            : {}),
          shippingMethodId: selectedShippingId,
          shippingAddress: {
            ...holdAddress,
            recipient: holdAddress.recipient || measurementData.name,
          },
          cancelPath: configPath,
          ...(journeyRecord
            ? { recommendationRecord: journeyRecord }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data.error, "Failed to start authorization"));
      }
      // Follow whatever the server returned rather than what this client asked
      // for. No Checkout comes back for an Assisted submit, and none comes back
      // when an admin has switched authorization holds off — in both cases the
      // customer goes straight to the status page to wait for Staff.
      const next = data.checkoutUrl ?? data.statusUrl;
      if (!next) throw new Error("Missing checkout URL");
      window.location.href = next as string;
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
    holdPhone,
    discoverySource,
    discoverySourceOther,
    referralCode,
    holdNotes,
    holdAddress,
    selectedShippingId,
    selectedAddons,
    responseId,
    measurementData,
    upsertToDb,
    isBasic,
    soldAsPremium,
    configPath,
    holdFields,
    staffAssist,
    assistPlacements,
    sessionFillingTemplateId,
    partner,
    tokenStorageKey,
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

  const completionDialog = (
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
          {canViewResults ? (
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
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Guest x-ray inputs derive only from the recommendation response; memoised
  // so the spatial geometry memo downstream keeps stable inputs across
  // unrelated re-renders (hover, dive, form edits).
  const guestPreview = useMemo(() => {
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    const tpl = shopRecommendation?.templates?.find(
      (t) => String(t.id) === String(record?.templateId),
    );
    const guestFillings = shopRecommendation?.available_fillings ?? [];
    return {
      tpl,
      // A finish link shows what Staff actually built, not the engine's template.
      guestPlacements: resumeFinish
        ? rowsToPillowPlacements(resumeFinish.placements)
        : rowsToPillowPlacements(tpl?.placements ?? []),
      // A finish link also brings its placed Items: a neck support is not in the
      // shop's filling list, and would otherwise render unlabelled and grey.
      guestItemSubtypes: new Map([
        ...guestFillings.map((f) => [f.item_id, fillingDescriptor(f) || null] as const),
        ...(resumeFinish?.items ?? []).map((i) => [i.id, fillingDescriptor(i) || null] as const),
      ]),
      guestItemSizes: new Map([
        ...guestFillings.map((f) => [f.item_id, f.size ?? null] as const),
        ...(resumeFinish?.items ?? []).map((i) => [i.id, i.size] as const),
      ]),
    };
  }, [shopRecommendation, resumeFinish]);

  // Hold preview uses mp-maker split layout (cover/case card pickers, no fillings/protector).
  if (currentStep === "preview") {
    const size =
      shopRecommendation?.pillow_product?.size ??
      suggestion?.recommended?.size ??
      suggestion?.product?.size;
    const tier =
      shopRecommendation?.pillow_product?.kind ??
      suggestion?.recommended?.kind ??
      suggestion?.product?.kind;
    // RE slice 07: one derivation shared by the x-ray mount and the reveal below.
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    const routePending = Boolean(record && isFlowRoutePending(record));
    const revealNow = shouldRevealRecommendation({
      requiredInputsComplete: Boolean(shopRecommendation && size),
      flowRouteUnresolved: routePending,
    });
    const { tpl, guestPlacements, guestItemSubtypes, guestItemSizes } = guestPreview;
    // Spatial template + reveal gate → read-only x-ray; legacy-flat keeps the text mix.
    // Assisted runs show SIZE ONLY — no filling x-ray (AC3).
    const guestXray = !partnerAssisted && revealNow && previewMixMode(guestPlacements) === "xray";
    const xrayVisible = staffAssist || guestXray;
    const currency = shopRecommendation?.variant?.currency ?? "SGD";
    const addonTotal = addons
      .filter((a) => selectedAddons.has(a.item_id))
      .reduce((s, a) => s + a.msrp, 0);
    // The number shown here is the number POST /api/results/hold will authorise —
    // same function, same Costings inputs. It used to show the shelf price while the
    // server charged shelf + cover + case, a 113 gap on a premium XS.
    const pricingInputs = shopRecommendation?.pricing ?? null;
    // Placed neck supports are charged on top (the server adds the same lines).
    const [placed, placedItems] = staffAssist
      ? [assistPlacements, assistItems]
      : resumeFinish
        ? [guestPlacements, resumeFinish.items]
        : [[], []];
    const placedCharges = placedChargeLines(
      flattenToPackList(placed),
      new Map(placedItems.map((i) => [i.id, i])),
      new Map(placedItems.flatMap((i) => (i.msrp == null ? [] : [[i.id, Number(i.msrp)] as const]))),
    );
    const quote = pricingInputs
      ? priceComposedBuild({
          msrpByFamily: pricingInputs.msrp_by_family,
          defaultCover: pricingInputs.default_cover,
          defaultCase: pricingInputs.default_case,
          caseOptions: pricingInputs.case_options,
          chosenCover:
            selectedCover == null
              ? null
              : (pricingInputs.cover_options.find((c) => c.item_id === selectedCover) ?? {
                  item_id: selectedCover,
                  msrp: null,
                }),
          chosenCase:
            selectedCase == null
              ? null
              : (pricingInputs.case_options.find((c) => c.item_id === selectedCase) ?? {
                  item_id: selectedCase,
                  msrp: null,
                }),
          addonLines: placedCharges,
        })
      : null;
    // A refused quote must NOT fall back to the shelf price. That is how the preview
    // came to show 170 while the server authorised 245: the fallback looked like a
    // price, so nothing stopped the shopper submitting. If this build cannot be
    // priced the CTA is blocked and the amount is withheld.
    const quoteBlocked = pricingInputs != null && quote?.ok !== true;
    const basePrice = quote?.ok ? quote.subtotal : (shopRecommendation?.variant?.price ?? 0);
    const coverStock = preferenceStockFor(
      selectedCover,
      shopRecommendation?.components.covers ?? [],
    );
    const caseStock = preferenceStockFor(
      selectedCase,
      shopRecommendation?.components.cases ?? [],
    );
    // Product Builder overlay (slice 10): case wins over cover; unmapped → plain silhouette.
    const selectedOverlay =
      (shopRecommendation?.components.cases ?? []).find((c) => c.item_id === selectedCase)
        ?.overlay ??
      (shopRecommendation?.components.covers ?? []).find((c) => c.item_id === selectedCover)
        ?.overlay ??
      null;
    const preferenceStocks = [coverStock, caseStock].filter(
      (s): s is number => s !== null,
    );
    // ponytail: no rec yet → not Pre-order (CTA already disabled until rec loads)
    const preOrder = shopRecommendation
      ? isPreOrder({
          preferenceStocks,
          composedBuildable: shopRecommendation.composed_buildable ?? 0,
        }).isPreOrder
      : false;
    const holdCta = holdSubmitting
      ? staffEdit
        ? "Saving…"
        : "Redirecting…"
      : staffEdit
        ? "Save configuration"
        : resumeFinish
          ? "Continue to payment"
          : holdCtaLabel(preOrder, assisted);
    const returnPath = staffEditResultPath ?? resumeStatusPath;
    const backFromPreview = returnPath
      ? () => {
          window.location.href = returnPath;
        }
      : goToPreviousStep;
    // One primary action for the preview, whichever mode opened it.
    const onPreviewContinue = () =>
      void (staffEdit
        ? handleStaffEditSave()
        : resumeFinish
          ? handleFinishAndPay()
          : handleAuthorizeHold());
    // A pending Upgrade/Keep route is a question for the shopper. Staff pick the
    // tier outright in the assist panel, so it must not freeze their save.
    const continueBlocked =
      holdSubmitting ||
      shopLoading ||
      !shopRecommendation ||
      quoteBlocked ||
      (!staffEditing && flowRouteBlocksHold);
    const waitingCopy = preOrder ? preOrderWaitingCopy(locale) : null;

    return (
      <>
        {completionDialog}
        <ConfiguratorExitDialog
          open={exitDialogOpen}
          onOpenChange={setExitDialogOpen}
          description="This will clear your saved session and return to the start."
          onConfirmExit={exitToStart}
        />
        <div className="relative min-h-dvh min-w-0 max-w-full overflow-x-hidden bg-background">
          {/* ponytail: remount beacon so step changes fire section_view without SPA path change */}
          <div
            key={currentStep}
            id={currentStep}
            data-section={currentStep}
            data-step={currentStep}
            className="pointer-events-none absolute left-0 top-0 z-30 h-4 w-full"
            aria-hidden
          />
          <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 max-md:px-3">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={backFromPreview}
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="text-sm font-semibold">{isBasic ? "Your Basic Mpillow" : "Your Custom Mpillow"}</h1>
              {isMobile ? (
                <div className="size-8" aria-hidden />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={requestExit}
                  aria-label="Exit"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </header>

          <div className="grid min-h-[calc(100dvh-56px)] grid-cols-1 lg:grid-cols-[1fr_460px]">
            {/* Left: product visual (mp-maker style) */}
            {/* Below lg the stage flows at its natural height: a fixed 40vh cap
                with overflow-hidden clipped the pillow's top and cut the staff
                toolbox (Size / Tier / Filling Template) clean off on phones, so
                fillings could not be configured on mobile at all. */}
            <div className="relative lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)] lg:overflow-hidden">
              {!isMobile && (
                <>
                  <Particles
                    className="absolute inset-0 z-[1]"
                    quantity={100}
                    ease={80}
                    staticity={50}
                    color="#ffffff"
                    size={0.8}
                  />
                  <DotPattern
                    dotSize={3}
                    gap={32}
                    baseColor="#3992C3"
                    activeColor="#3992C3"
                    proximity={80}
                    shockRadius={250}
                    className="absolute inset-0 z-[2] opacity-60"
                  />
                </>
              )}
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 p-4 max-md:px-3 md:gap-6">
                <div
                  // ponytail: below lg the stage takes the full column width (capped at
                  // 500px) so the x-ray cells and dive chips are big enough to tap;
                  // +30% stage only from lg up.
                  className="relative w-full max-w-[500px] lg:w-[min(97.5vmin,650px)] lg:max-w-none"
                  // xrayColorVars: Product Builder color overrides reach the x-ray here (slice 11)
                  style={{ aspectRatio: "664 / 374", ...xrayColorVars }}
                >
                  <svg
                    className={cn(
                      "absolute inset-0 pointer-events-none",
                      // x-ray art direction: shell desaturates so fillings read inside
                      xrayVisible && "opacity-80 saturate-50",
                    )}
                    viewBox="0 0 664 374"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <path d={PILLOW_PATH} fill="white" />
                    {selectedOverlay && (
                      <>
                        <defs>
                          <clipPath id="mp-config-overlay-clip">
                            <path d={PILLOW_PATH} />
                          </clipPath>
                        </defs>
                        <image
                          href={selectedOverlay.url}
                          clipPath="url(#mp-config-overlay-clip)"
                          preserveAspectRatio="xMidYMid slice"
                          {...overlayFrame(selectedOverlay.fit)}
                        />
                      </>
                    )}
                    <path
                      d={PILLOW_PATH}
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  {xrayVisible && (
                    <XrayPillow
                      placements={staffAssist ? assistPlacements : guestPlacements}
                      itemSubtypes={staffAssist ? assistItemSubtypes : guestItemSubtypes}
                      itemSizes={staffAssist ? assistItemSizes : guestItemSizes}
                      // read-only for guests: no items / no change handler → no edit affordances
                      items={staffAssist ? assistItems : undefined}
                      onPlacementsChange={staffAssist ? setAssistPlacements : undefined}
                      className="absolute inset-0"
                    />
                  )}
                  {(shopLoading || suggestionLoading) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="size-12 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    </div>
                  )}
                </div>
                {(() => {
                  const sleepPos = measurementData.sleepPositionType[0];
                  const why = record
                    ? plainLanguageWhy(record, { sleep_position: sleepPos })
                    : shopRecommendation?.recommendation?.explanation ?? "";
                  // x-ray already shows the mix → suppress the text summary here
                  // (template name + specialists line stay in the reveal).
                  const mixLines = guestXray
                    ? []
                    : (tpl?.lines ?? []).map((l) => {
                        const filling = shopRecommendation?.available_fillings?.find(
                          (f) => f.item_id === l.item_id,
                        );
                        return {
                          label: filling?.name ?? l.subtype ?? `Item ${l.item_id}`,
                          qty: l.quantity,
                        };
                      });
                  const soldTierLabel = soldAsPremium ? "premium" : tier;
                  const showTierAdvice =
                    record?.tierSuggestion &&
                    record.tierSuggestion !== (record.soldTier ?? soldTierLabel);
                  return (
                    <>
                      {soldTierLabel ? (
                        <Badge variant="outline" className="text-xs capitalize text-white">
                          {soldTierLabel} tier
                        </Badge>
                      ) : null}
                      {showTierAdvice && record?.tierSuggestion ? (
                        <TierSuggestion tier={record.tierSuggestion} />
                      ) : null}
                      {routePending && record?.flowRoute && !partnerAssisted ? (
                        <UpsellCard
                          reason={record.flowRoute.reason}
                          fromLabel={FLOW_UI_LABEL[record.flow]}
                          toLabel={FLOW_UI_LABEL[record.flowRoute.targetFlow]}
                          fromPrice={basePrice}
                          toPrice={routeAltPrice}
                          currency={currency}
                          onUpgrade={() => void handleUpgradeFlowRoute()}
                          onKeep={handleKeepFlowRoute}
                          busy={routeBusy}
                        />
                      ) : null}
                      <RecommendationReveal
                        reveal={revealNow}
                        sizeLabel={size ? `Size ${size}` : ""}
                        why={why}
                        // Assisted: SIZE ONLY — drop the Filling Template surface (AC3).
                        templateName={partnerAssisted ? null : tpl?.name ?? null}
                        mixLines={partnerAssisted ? [] : mixLines}
                      />
                    </>
                  );
                })()}
                <SelectedAddonPreviews addons={addons} selectedIds={selectedAddons} />
                {staffAssist && size && tier ? (
                  <StaffAssistPanel
                    current={{
                      size: size as SizeTier["size"],
                      tier: tier as SizeTier["tier"],
                    }}
                    placements={assistPlacements}
                    onPlacementsChange={setAssistPlacements}
                    loadedTemplate={assistLoadedTemplate}
                    onLoadTemplate={setAssistLoadedTemplate}
                    sessionFillingTemplateId={sessionFillingTemplateId}
                    onApplySizeTier={applyAssistSizeTier}
                    onItemsChange={setAssistItems}
                    onColorOverridesChange={setAssistColorOverrides}
                  />
                ) : !shopRecommendation ? (
                  <p className="max-w-xs text-center text-xs text-white/80">
                    Fillings and protector are chosen by our team after review.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Right: customization panel */}
            <div className="flex min-h-0 flex-col bg-background lg:h-[calc(100vh-56px)] lg:border-l">
              <div className={cn("flex-1 space-y-8 overflow-y-auto", configuratorPreviewPadClassName)}>
                {partner ? <CoBrandBanner partner={partner} /> : null}
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {staffEdit ? "Edit configuration" : "Customize finish"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {staffEdit
                      ? "Change size, tier, fillings, cover, case, add-ons or shipping for this Result. Saving reprices the build — send the customer the new quote with Request payment."
                      : resumeFinish
                        ? "Our team has built your fillings. Choose cover and case, optional add-ons and shipping, then pay to confirm your order."
                        : "Choose cover and case, optional add-ons, then authorize payment. You are not charged until you accept the final build."}
                  </p>
                  {staffEdit ? (
                    <p className="text-xs text-muted-foreground">
                      Result {staffEdit.id.slice(0, 8)} · {staffEdit.status}
                      {staffEdit.authorizedAmount != null
                        ? ` · authorized ${staffEdit.currency} ${staffEdit.authorizedAmount.toFixed(2)}`
                        : " · no card hold"}
                    </p>
                  ) : null}
                </div>

                {shopRecommendation ? (
                  <div className="space-y-2">
                    {(fieldErrors.cover || fieldErrors.case) && (
                      <p className="text-sm text-destructive">
                        {[fieldErrors.cover, fieldErrors.case].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <CustomizationStepComponents
                      components={shopRecommendation.components}
                      selectedCover={selectedCover}
                      onSelectCover={setSelectedCover}
                      selectedCase={selectedCase}
                      onSelectCase={setSelectedCase}
                      componentQtyOverrides={new Map()}
                      onQtyChange={() => {}}
                      currency={currency}
                      basePrice={basePrice}
                      addonPrice={addonTotal}
                      onBack={backFromPreview}
                      onContinue={onPreviewContinue}
                      preferencesOnly
                      hideNav
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {shopLoading
                        ? "Loading options…"
                        : "No recommendation yet. Go back and generate results."}
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => void fetchRecommendation()}>
                      Retry
                    </Button>
                  </div>
                )}

                {addons.length > 0 && !partnerAssisted && (
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">
                      Add-ons for your Mpillow (optional)
                    </Label>
                    <div className="space-y-2">
                      {addons.map((a) => (
                        <AddonOptionButton
                          key={a.item_id}
                          addon={a}
                          selected={selectedAddons.has(a.item_id)}
                          onToggle={() => {
                            setSelectedAddons((prev) => {
                              const next = new Set(prev);
                              if (next.has(a.item_id)) next.delete(a.item_id);
                              else next.add(a.item_id);
                              return next;
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {staffAssist ? (
                  <ConfigImageUpload
                    sessionId={responseId}
                    ensureSessionId={ensureResponseId}
                  />
                ) : null}

                {/* A finish link already has contact from the questionnaire submit,
                    and a re-configuration edits the build, not who it belongs to —
                    contact and Discovery source stay on the Result detail page. */}
                {!resumeFinish && !staffEdit && (
                <PreviewContactFields
                    locale={locale}
                    fieldErrors={fieldErrors}
                    values={contactValues}
                    onChange={(patch) => {
                      if (patch.email !== undefined) setHoldEmail(patch.email);
                      if (patch.phone !== undefined) setHoldPhone(patch.phone);
                      if (patch.discoverySource !== undefined) {
                        setDiscoverySource(patch.discoverySource);
                      }
                      if (patch.discoverySourceOther !== undefined) {
                        setDiscoverySourceOther(patch.discoverySourceOther);
                      }
                      if (patch.notes !== undefined) setHoldNotes(patch.notes);
                      if (patch.referralCode !== undefined) {
                        setReferralCode(patch.referralCode);
                      }
                    }}
                  />
                )}

                <div className="space-y-3">
                  <Label className="text-base font-semibold">Shipping</Label>
                  <SavedAddressSelect
                    // Hidden where the account prefill is off: those are the
                    // Staff member's own addresses, not the customer's.
                    signedIn={shippingSignedIn && !(assisted || staffAssist)}
                    addresses={savedAddresses}
                    value={selectedAddressId}
                    onValueChange={handleSelectAddress}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="hold-recipient">Recipient</Label>
                    <Input
                      id="hold-recipient"
                      value={holdAddress.recipient}
                      onChange={(e) =>
                        setHoldAddress((a) => ({ ...a, recipient: e.target.value }))
                      }
                      placeholder={measurementData.name || "Name"}
                      aria-invalid={!!fieldErrors.recipient}
                    />
                    {fieldErrors.recipient ? (
                      <p className="text-sm text-destructive">{fieldErrors.recipient}</p>
                    ) : null}
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
                      aria-invalid={!!fieldErrors.line1}
                    />
                    {fieldErrors.line1 ? (
                      <p className="text-sm text-destructive">{fieldErrors.line1}</p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hold-city">City</Label>
                      <Input
                        id="hold-city"
                        value={holdAddress.city}
                        onChange={(e) =>
                          setHoldAddress((a) => ({ ...a, city: e.target.value }))
                        }
                        aria-invalid={!!fieldErrors.city}
                      />
                      {fieldErrors.city ? (
                        <p className="text-sm text-destructive">{fieldErrors.city}</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hold-postal">Postal code</Label>
                      <Input
                        id="hold-postal"
                        value={holdAddress.postal_code}
                        onChange={(e) =>
                          setHoldAddress((a) => ({ ...a, postal_code: e.target.value }))
                        }
                        aria-invalid={!!fieldErrors.postal_code}
                      />
                      {fieldErrors.postal_code ? (
                        <p className="text-sm text-destructive">{fieldErrors.postal_code}</p>
                      ) : null}
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
                          const label =
                            m.content?.["en-US"]?.name ?? m.slug;
                          const selected = selectedShippingId === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSelectedShippingId(m.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 ${
                                selected
                                  ? "border-primary bg-primary/5"
                                  : fieldErrors.shipping
                                    ? "border-destructive"
                                    : "border-border"
                              }`}
                            >
                              <span className="min-w-0 flex-1 break-words text-sm font-medium">{label}</span>
                              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                                SGD {Number(m.base_rate).toFixed(2)}
                                {selected && (
                                  <Check className="ml-2 inline size-4 text-primary" />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {fieldErrors.shipping ? (
                      <p className="text-sm text-destructive">{fieldErrors.shipping}</p>
                    ) : null}
                  </div>
                </div>

                {/*
                  Not rendered for an Assisted customisation: "Send to our build
                  team" already IS the no-purchase submit there, and this control
                  would write a second, conflicting one. The data hazard it used
                  to carry is fixed at the source in
                  shouldCreateInstoreReviewOnly() — see lib/results/instore-finalize.
                  Nor for a finish link: that Result is already submitted and assigned.
                */}
                {!assisted && !resumeFinish && (
                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const contactErrors = buildFieldErrorMap(
                        previewContactFieldChecks({
                          email: holdEmail,
                          phone: holdPhone,
                          discoverySource,
                          discoverySourceOther,
                          notes: holdNotes,
                          referralCode,
                        }),
                      );
                      if (Object.keys(contactErrors).length > 0) {
                        setFieldErrors((prev) => ({ ...prev, ...contactErrors }));
                        return;
                      }
                      if (!responseId) return;
                      setSaveStatus("saving");
                      try {
                        const res = await fetch("/api/mp-config/responses", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            id: responseId,
                            data: {
                              ...measurementData,
                              notes: holdNotes.trim(),
                            },
                            token: readToken(tokenStorageKey),
                            persistContact: true,
                            email: holdEmail.trim(),
                            phone: holdPhone.trim(),
                            discoverySource,
                            discoverySourceOther:
                              discoverySource === "other"
                                ? discoverySourceOther.trim()
                                : undefined,
                          }),
                        });
                        const payload = await res.json().catch(() => null);
                        if (!res.ok) {
                          throw new Error(
                            getApiErrorMessage(payload?.error, "Save failed"),
                          );
                        }
                        setSaveStatus("saved");
                        toast.success("Saved to cloud");
                        setCompletedResponseId((payload?.id ?? responseId) as string);
                        setCompletionDialogOpen(true);
                      } catch (err) {
                        setSaveStatus("error");
                        toast.error(
                          err instanceof Error ? err.message : "Save failed",
                        );
                      }
                    }}
                    disabled={!responseId}
                    className="text-muted-foreground"
                  >
                    Save without purchasing
                  </Button>
                </div>
                )}
              </div>

              {waitingCopy ? (
                <div className="border-t bg-muted/30 px-5 py-4 text-sm">
                  <p className="font-medium">{waitingCopy.title}</p>
                  <p className="mt-1 text-muted-foreground">{waitingCopy.body}</p>
                </div>
              ) : null}

              <div
                className={cn(
                  "border-t bg-background px-5 py-4",
                  configuratorMobileCloseClearanceClassName,
                )}
              >
                <div className="mb-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Ballpark (before shipping/tax)</span>
                  <span className="font-medium tabular-nums">
                    {quoteBlocked
                      ? "Not available"
                      : `${currency} ${(basePrice + addonTotal).toFixed(2)}`}
                  </span>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={backFromPreview} className="flex-1">
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>
                  <Button
                    className="flex-[2]"
                    size="lg"
                    onClick={onPreviewContinue}
                    disabled={continueBlocked}
                  >
                    {holdCta}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        {isMobile && <ConfiguratorMobileCloseBar onClose={requestExit} />}
      </>
    );
  }

  return (
    <div className="relative min-h-dvh w-full min-w-0 max-w-full overflow-x-hidden bg-background">
      {/* ponytail: remount beacon so step changes fire section_view without SPA path change */}
      <div
        key={currentStep}
        id={currentStep}
        data-section={currentStep}
        data-step={currentStep}
        className="pointer-events-none absolute left-0 top-0 z-30 h-4 w-full"
        aria-hidden
      />
      {completionDialog}
      <ConfiguratorExitDialog
        open={exitDialogOpen}
        onOpenChange={setExitDialogOpen}
        description="This will clear your saved session and return to the start."
        onConfirmExit={exitToStart}
      />
      {/* Animated bg: welcome always; post-welcome desktop only */}
      {(!isMobile || currentStep === "welcome") && (
        <>
          <RetroGrid className="z-0" opacity={0.3} speed={gridSpeed} />
          <Particles
            className="absolute inset-0 z-0"
            quantity={100}
            ease={80}
            staticity={50}
            color="#ffffff"
            size={0.8}
          />
        </>
      )}

      {currentStep !== "welcome" && !isMobile && (
        <div
          className="absolute right-4 z-20"
          style={{ top: "calc(1rem + var(--safe-top))" }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={requestExit}
            aria-label="Exit configuration"
            title="Exit"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {currentStep !== "welcome" && isMobile && (
        <ConfiguratorMobileCloseBar onClose={requestExit} />
      )}

      {/* Content Container */}
      <div
        className={cn(
          "relative z-10 flex min-h-dvh items-center justify-center",
          configuratorOuterPadClassName,
          currentStep !== "welcome" && configuratorMobileCloseClearanceClassName,
        )}
      >        <div
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
                  Customise{" "}
                  <span className="text-primary">{isBasic ? "Basic Mpillow" : "Mpillow"}</span>
                </h1>
                <p className="text-xl text-muted-foreground">
                  {isBasic
                    ? "A quick fit for Basic Mpillow — one measurement, then checkout"
                    : "Let's create your perfect pillow, customized just for you"}
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
            <Card className={cn("relative bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-3 h-8 w-8 text-muted-foreground"
                    aria-label="About customisation"
                  >
                    <Info className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent
                  hideClose
                  className="max-h-[85vh] max-w-2xl overflow-y-auto"
                >
                  <DialogHeader className="text-left sm:text-left">
                    <DialogTitle className="text-2xl leading-tight">{info.h1}</DialogTitle>
                    <DialogDescription className="text-base leading-relaxed">
                      {info.lede}
                    </DialogDescription>
                  </DialogHeader>
                  {info.faqItems.length > 0 && (
                    <div className="space-y-4 border-t pt-4">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <h3 className="text-xl font-semibold tracking-tight">
                          {info.faqTitle ?? "FAQs"}
                        </h3>
                        <Link
                          href={to("/faq")}
                          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                        >
                          {FAQ_VIEW_ALL[locale]}
                        </Link>
                      </div>
                      <PageFaqAccordion items={info.faqItems} locale={locale} />
                    </div>
                  )}
                  <div className="flex justify-end">
                    <DialogClose asChild>
                      <OverlayDismissButton variant="inline" />
                    </DialogClose>
                  </div>
                </DialogContent>
              </Dialog>

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
                      {isBasic
                        ? "We'll guide you through 1 simple measurement"
                        : "We'll guide you through 4 simple measurements"}
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
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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
                    aria-invalid={!!fieldErrors.name}
                  />
                  {fieldErrors.name ? (
                    <p className="text-sm text-destructive">{fieldErrors.name}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Gender</div>
                  <SingleSelectOptionRows
                    options={GENDER_OPTIONS}
                    value={measurementData.gender}
                    onChange={(v) => updateMeasurement("gender", v)}
                    invalid={!!fieldErrors.gender}
                    error={fieldErrors.gender}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Age group</div>
                  <SingleSelectOptionRows
                    options={AGE_GROUP_OPTIONS}
                    value={measurementData.ageGroup}
                    onChange={(v) => updateMeasurement("ageGroup", v)}
                    invalid={!!fieldErrors.ageGroup}
                    error={fieldErrors.ageGroup}
                  />
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => tryAdvance(nameFields, goToNextStep)}
                    disabled={!hybridCtaEnabled(nameFields)}
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
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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
                    inputMode="decimal"
                    placeholder="Enter measurement"
                    value={measurementDrafts.shoulderLength}
                    onChange={(e) => setMeasureDraft("shoulderLength", e.target.value)}
                    onBlur={() => commitMeasureDraft("shoulderLength")}
                    className="text-lg h-12"
                    autoFocus
                    aria-invalid={!!fieldErrors.shoulderLength}
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => changeMeasurementUnit(v as MeasurementUnit)}
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
                {fieldErrors.shoulderLength ? (
                  <p className="text-sm text-destructive">{fieldErrors.shoulderLength}</p>
                ) : null}
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
                    onClick={() =>
                      tryAdvance(measureField("shoulderLength"), () => {
                        commitMeasureDraft("shoulderLength");
                        goToNextStep();
                      })
                    }
                    disabled={!hybridCtaEnabled(measureField("shoulderLength"))}
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
          {showNeckSteps && currentStep === "neck-to-back" && (
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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
                    inputMode="decimal"
                    placeholder="Enter measurement"
                    value={measurementDrafts.neckToBack}
                    onChange={(e) => setMeasureDraft("neckToBack", e.target.value)}
                    onBlur={() => commitMeasureDraft("neckToBack")}
                    className="text-lg h-12"
                    autoFocus
                    aria-invalid={!!fieldErrors.neckToBack}
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => changeMeasurementUnit(v as MeasurementUnit)}
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
                {fieldErrors.neckToBack ? (
                  <p className="text-sm text-destructive">{fieldErrors.neckToBack}</p>
                ) : null}
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
                    onClick={() =>
                      tryAdvance(measureField("neckToBack"), () => {
                        commitMeasureDraft("neckToBack");
                        goToNextStep();
                      })
                    }
                    disabled={!hybridCtaEnabled(measureField("neckToBack"))}
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
          {showNeckSteps && currentStep === "head-to-back" && (
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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
                    inputMode="decimal"
                    placeholder="Enter measurement"
                    value={measurementDrafts.headToBack}
                    onChange={(e) => setMeasureDraft("headToBack", e.target.value)}
                    onBlur={() => commitMeasureDraft("headToBack")}
                    className="text-lg h-12"
                    autoFocus
                    aria-invalid={!!fieldErrors.headToBack}
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => changeMeasurementUnit(v as MeasurementUnit)}
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
                {fieldErrors.headToBack ? (
                  <p className="text-sm text-destructive">{fieldErrors.headToBack}</p>
                ) : null}
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
                    onClick={() =>
                      tryAdvance(measureField("headToBack"), () => {
                        commitMeasureDraft("headToBack");
                        goToNextStep();
                      })
                    }
                    disabled={!hybridCtaEnabled(measureField("headToBack"))}
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
          {showNeckSteps && currentStep === "neck-length" && (
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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
                    inputMode="decimal"
                    placeholder="Enter measurement"
                    value={measurementDrafts.neckLength}
                    onChange={(e) => setMeasureDraft("neckLength", e.target.value)}
                    onBlur={() => commitMeasureDraft("neckLength")}
                    className="text-lg h-12"
                    autoFocus
                    aria-invalid={!!fieldErrors.neckLength}
                  />
                  <Tabs
                    value={measurementUnit}
                    onValueChange={(v) => changeMeasurementUnit(v as MeasurementUnit)}
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
                {fieldErrors.neckLength ? (
                  <p className="text-sm text-destructive">{fieldErrors.neckLength}</p>
                ) : null}
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
                    onClick={() =>
                      tryAdvance(measureField("neckLength"), () => {
                        commitMeasureDraft("neckLength");
                        if (upsoldToPremium) {
                          void finishPostUpsellNeck();
                          return;
                        }
                        goToNextStep();
                      })
                    }
                    disabled={!hybridCtaEnabled(measureField("neckLength"))}
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
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
              <div className="text-center space-y-2">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
                <h2 className="text-3xl font-bold">Great job, {measurementData.name}!</h2>
                <p className="text-muted-foreground">
                  {isBasic
                    ? "Almost there — confirm your fit and finish your Basic Mpillow"
                    : "All measurements collected. Ready to see your custom pillow?"}
                </p>
              </div>

              <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Your Measurements:</h3>
                <div className={`grid gap-3 ${isBasic ? "grid-cols-1" : "grid-cols-2"}`}>
                  <div>
                    <p className="text-sm text-muted-foreground">Shoulder Length</p>
                    <p className="text-lg font-medium">
                      {displayMeasurement(measurementUnit, measurementData.shoulderLength)} {measurementUnit}
                    </p>
                  </div>
                  {!isBasic && (
                    <>
                      <div>
                        <p className="text-sm text-muted-foreground">Neck to Back</p>
                        <p className="text-lg font-medium">
                          {displayMeasurement(measurementUnit, measurementData.neckToBack)} {measurementUnit}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Head to Back</p>
                        <p className="text-lg font-medium">
                          {displayMeasurement(measurementUnit, measurementData.headToBack)} {measurementUnit}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Neck Length</p>
                        <p className="text-lg font-medium">
                          {displayMeasurement(measurementUnit, measurementData.neckLength)} {measurementUnit}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg">A few more questions</h4>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Blood Pressure levels</h3>
                    <SingleSelectOptionRows
                      options={BLOOD_PRESSURE_OPTIONS}
                      value={measurementData.bloodPressureLevel}
                      onChange={(v) => updateMeasurement("bloodPressureLevel", v)}
                      invalid={!!fieldErrors.bloodPressureLevel}
                      error={fieldErrors.bloodPressureLevel}
                    />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Ear discomfort during side sleep?</h3>
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
                    {fieldErrors.earDiscomfortSideSleep ? (
                      <p className="text-sm text-destructive">{fieldErrors.earDiscomfortSideSleep}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Bed firmness</h3>
                    <SingleSelectOptionRows
                      options={BED_FIRMNESS_OPTIONS}
                      value={measurementData.bedFirmness}
                      onChange={(v) => updateMeasurement("bedFirmness", v)}
                      invalid={!!fieldErrors.bedFirmness}
                      error={fieldErrors.bedFirmness}
                    />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Acid Reflux?</h3>
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
                    {fieldErrors.acidReflux ? (
                      <p className="text-sm text-destructive">{fieldErrors.acidReflux}</p>
                    ) : null}
                  </div>

                  {/* Sleep pain areas (multi-select; None exclusive) */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">I experience one of the following during/after sleep</h3>
                    <div className="flex flex-wrap gap-2">
                      {PAIN_AREA_OPTIONS.map((opt) => {
                        const isSelected = measurementData.sleepPainAreas.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setMeasurementData((prev) => ({
                                ...prev,
                                sleepPainAreas: togglePainArea(prev.sleepPainAreas, opt.value),
                              }));
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all max-md:min-h-11 max-md:px-4 ${
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
                    {fieldErrors.sleepPainAreas ? (
                      <p className="text-sm text-destructive">{fieldErrors.sleepPainAreas}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Select all that apply, or None</p>
                    )}
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
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all max-md:min-h-11 max-md:px-4 ${
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
                    {fieldErrors.sleepPositionType ? (
                      <p className="text-sm text-destructive">{fieldErrors.sleepPositionType}</p>
                    ) : null}
                  </div>

                  {/* Uses bolster */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Do you use bolsters to sleep?</h3>
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
                    {fieldErrors.usesBolster ? (
                      <p className="text-sm text-destructive">{fieldErrors.usesBolster}</p>
                    ) : null}
                  </div>
                </div>
              </div>

                  <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center gap-1">
                  <h4 className="font-semibold text-lg">Photos <span className="text-sm font-normal text-muted-foreground">(optional)</span></h4>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="Photo best practices"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      hideClose
                      className="max-h-[85vh] max-w-2xl overflow-y-auto"
                    >
                      <DialogHeader className="text-left sm:text-left">
                        <DialogTitle>Photo tips</DialogTitle>
                        <DialogDescription>
                          Follow these examples for clear front and side view photos.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold">Front view</div>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            Wear a fitted shirt; stand straight so both shoulders are clearly visible.
                          </p>
                          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                            <Image
                              src="/shoulderlength_800x.webp"
                              alt="Front view photo example"
                              fill
                              className="object-cover"
                              sizes="(min-width: 640px) 50vw, 100vw"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-semibold">Side view</div>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            Stand straight against a wall or door frame; capture a clear side profile of head and neck.
                          </p>
                          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                            <Image
                              src="/NeckDepth_800x.webp"
                              alt="Side view photo example"
                              fill
                              className="object-cover"
                              sizes="(min-width: 640px) 50vw, 100vw"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <DialogClose asChild>
                          <OverlayDismissButton variant="inline" />
                        </DialogClose>
                      </div>
                    </DialogContent>
                  </Dialog>
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

              {/*
                Assisted customisation (ADR 0017): the questionnaire IS the submit.
                Contact is taken here so the build team can send the finished
                fillings back; cover, case and shipping come after that.
              */}
              {assisted && (
                <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-lg">Your contact details</h4>
                  <p className="text-sm text-muted-foreground">
                    Our build team will send your finished fillings here. You choose your cover,
                    case and shipping after that — nothing is charged now.
                  </p>
                  <PreviewContactFields
                    locale={locale}
                    fieldErrors={fieldErrors}
                    values={contactValues}
                    onChange={(patch) => {
                      if (patch.email !== undefined) setHoldEmail(patch.email);
                      if (patch.phone !== undefined) setHoldPhone(patch.phone);
                      if (patch.discoverySource !== undefined) {
                        setDiscoverySource(patch.discoverySource);
                      }
                      if (patch.discoverySourceOther !== undefined) {
                        setDiscoverySourceOther(patch.discoverySourceOther);
                      }
                      if (patch.notes !== undefined) setHoldNotes(patch.notes);
                      if (patch.referralCode !== undefined) {
                        setReferralCode(patch.referralCode);
                      }
                    }}
                  />
                </div>
              )}

              <div className="pt-4">
                <div className="flex justify-between gap-3">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() =>
                      assisted
                        ? handleSendToBuildTeam()
                        : tryAdvance(customizeFields, async () => {
                            await upsertToDb();
                            if (isBasic) {
                              const rec = shopRecommendation ?? (await fetchBasicRecommendation());
                              if (!rec) return;
                            } else {
                              await Promise.all([loadSuggestion(), fetchShopRecommendation()]);
                            }
                            goToNextStep();
                          })
                    }
                    disabled={
                      !hybridCtaEnabled(customizeFields) ||
                      photoUploading.front ||
                      photoUploading.side ||
                      shopLoading ||
                      holdSubmitting
                    }
                    size="lg"
                    // The assisted label is long: on phones it wraps inside the
                    // button instead of pushing it off the right edge.
                    className={cn(
                      "group",
                      assisted &&
                        "max-md:h-auto max-md:min-w-0 max-md:shrink max-md:whitespace-normal max-md:py-2 max-md:text-left",
                    )}
                  >
                    <Sparkles className={cn("mr-2 h-5 w-5", assisted && "max-md:hidden")} />
                    {holdSubmitting
                      ? "Sending…"
                      : assisted
                        ? holdCtaLabel(false, assisted)
                        : isBasic ? "Continue" : "Customise"}
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

        </div>
      </div>
    </div>
  );
}
