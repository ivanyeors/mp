"use client";

import { placedChargeLines, priceComposedBuild } from "@/lib/pricing/composed-price";
import { resultServiceLines, sumServiceLines, type ServiceLine } from "@/lib/pricing/service-lines";
import type { ServiceFees } from "@/lib/pricing/service-prices";

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
import { LOGO_SRC } from "@/lib/brand-logo";
import { shrinkPhoto } from "@/lib/images/shrink-photo";
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
import { useMediaQuery } from "@/hooks/use-media-query";
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
  ConfiguratorStepActions,
  configuratorCardPadClassName,
  configuratorMobileCloseClearanceClassName,
  configuratorOuterPadClassName,
  configuratorPreviewPadClassName,
  configuratorStickyHeaderClassName,
} from "@/components/configurator/configurator-mobile-chrome";
import { Progress } from "@/components/ui/progress";
import { WhoIsMeasuring, type MeasurerProfile } from "@/components/configurator/who-is-measuring";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  User,
  Cake,
  HeartPulse,
  Sparkles,
  CheckCircle,
  Camera,
  X,
  Check,
  Info,
  Gift,
  ShieldCheck,
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
import { PairedStepperBar } from "@/components/configurator/paired-stepper";
import { ReviewCard, ReviewNote } from "@/components/configurator/review-card";
import { bolsterPromises, pillowPromises, pointsPromise } from "@/lib/configurator/review-promises";
import { DEFAULT_READJUSTMENT_POLICY, type ReadjustmentPolicy } from "@/lib/pricing/service-prices";
import {
  bolsterSleepPosition,
  clearPairedHandoff,
  opensPairedDetails,
  PAIRED_MBOLSTER_PATH,
  pairedHoldBody,
  readPairedHandoff,
  reanchorPairedHandoff,
  runsPairedStepper,
  writePairedHandoff,
  type PairedChoice,
  type PairedHandoff,
} from "@/lib/configurator/paired-mbolster";
import { deriveSleepPosition } from "@/lib/shop/recommendation/rules";
import { UpsellCard } from "@/components/rules-engine/upsell-card";
import { TierSuggestion } from "@/components/rules-engine/tier-suggestion";
import {
  assertPreStripeRouteResolved,
  carryOverAnswers,
  HEAD_TO_BACK_MIN_CM,
  incompleteEngineInputs,
  isFlowRoutePending,
  missingStepsAfterCarryOver,
  parseRecommendationRecord,
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
  useSavedShippingPrefill,
  type HoldShippingAddress,
} from "@/components/shop/saved-address-select";
import {
  HOLD_SHIPPING_METHODS_PATH,
  HoldShippingFields,
  holdShippingAmount,
  holdShippingCheck,
  holdShippingName,
  HoldShippingTotalRow,
  isSelfCollectMethod,
  useHoldShippingQuote,
  type HoldShippingMethod,
} from "@/components/shop/hold-shipping-fields";
import { countryName, usesPostalCode } from "@/lib/shipping/countries";
import type { PackageType } from "@/lib/shipping/types";
import {
  configPathFor,
  newResponseId,
  sessionKeyFor,
  stepOrderFor,
  tokenKeyFor,
  variantFromPathname,
  type MpConfigVariant,
} from "@/lib/mp-config/flow-variant";
import { PILLOW_FOR_OPTIONS, nameForPillowFor, type PillowFor } from "@/lib/customer-pillow/pillow-for";

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
  firstQuestionEmailCheck,
  withFirstQuestion,
} from "@/lib/configurator/first-question-email";
import { Checkbox } from "@/components/ui/checkbox";
import { MARKETING_BOX_LABEL } from "@/lib/marketing-consent/state";
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
  type DiscoverySourceChoice,
} from "@/components/configurator/preview-contact-fields";
import {
  checkoutCodeDiscount,
  checkoutCodeDiscountLabel,
  checkoutCodeFreeShipping,
  checkoutCodeToSend,
  type CheckoutCodeContext,
  type CheckoutCodeStatus,
} from "@/lib/checkout-code/shared";
import { resultCouponPricing } from "@/lib/results/discount";

const NO_ORDER_CODE_CONTEXT: CheckoutCodeContext = { flow: "none" };
import {
  AddonOptionButton,
  AddonReviewNotice,
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
  mixAfterTierChange,
  recheckSelectionsForSize,
  sessionTemplateId,
  soldPillowTier,
  startingTemplateId,
  templateSuggestion,
  type LoadedTemplate,
  type SizeTier,
} from "@/lib/configurator/staff-assist";
import {
  asSizeTier,
  pillowAssistDraft,
  restorePillowAssist,
} from "@/lib/configurator/staff-assist-draft";
import {
  fetchPillowTemplate,
  StaffAssistPanel,
  type FillingItem,
} from "@/components/configurator/staff-assist-panel";
import { isInPillowAccessory, isNeckSupportItem } from "@/lib/spatial-fillings/filling-groups";
import { XrayPillow } from "@/components/spatial/xray-pillow";
import { confirmSaveWithOverCells } from "@/components/spatial/xray-fit-banner";
import { useCut, XrayCrossSection } from "@/components/spatial/xray-cross-section";
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import { XraySectionDock } from "@/components/spatial/xray-section-dock";
import { fitPillow } from "@/lib/spatial-fillings/fit";
import { fillingDescriptor } from "@/lib/spatial-fillings/filling-groups";
import { stageGeometry } from "@/components/spatial/xray-assets";
import { pillowDimensions } from "@/lib/spatial-fillings/dimensions";
import {
  registryFromPayload,
  resolveItemDims,
  type DimensionOverridesPayload,
} from "@/lib/spatial-fillings/dimension-overrides";
import { softBodyFromPayload } from "@/lib/spatial-fillings/soft-body-settings";
import {
  flattenToPackList,
  pillowPlacementsToRows,
  rowsToPillowPlacements,
  type PillowPlacement,
  type PillowPlacementRow,
  type Section,
} from "@/lib/spatial-fillings/core";
import { xrayColorVarStyle, type ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { ResumeFinish } from "@/lib/results/resume-finish";
import type { ResumeDraft } from "@/lib/results/resume-draft";
import { resumeStepFor, stripContinueDraftQuery } from "@/lib/configurator/continue-draft";
import { addonsForAnswers, keepOfferedAddons } from "@/lib/results/addons";
import type { StaffEditResult } from "@/lib/results/staff-edit";
import { trackGaEventThen } from "@/lib/analytics/ga-events";

type MeasureKey = "shoulderLength" | "neckToBack" | "headToBack" | "neckLength";

const EMPTY_MEASURE_DRAFTS: Record<MeasureKey, string> = {
  shoulderLength: "",
  neckToBack: "",
  headToBack: "",
  neckLength: "",
};

const MEASURE_MIN_CM: Partial<Record<MeasureKey, number>> = {
  headToBack: HEAD_TO_BACK_MIN_CM,
};

function pickDefaultComponent(
  options: { item_id: number; base_quantity: number; stock_available: number }[],
): number | null {
  if (options.length === 0) return null;
  const fromBom = options.find((c) => c.base_quantity > 0);
  if (fromBom) return fromBom.item_id;
  const inStock = options.find((c) => c.stock_available > 0);
  return (inStock ?? options[0]).item_id;
}

const KEEP_EMAIL: Dispatch<SetStateAction<string>> = () => {};
const KEEP_ADDRESS: Dispatch<SetStateAction<HoldShippingAddress>> = () => {};
const SHIPS_AS_MPILLOW: PackageType[] = ["pillow"];
const SHIPS_AS_PAIR: PackageType[] = ["pillow", "bolster"];

type PairedPhase = "customize" | "details" | "review";

const pillowPath = (size: string | null | undefined) =>
  stageGeometry(pillowDimensions(size).dims.size).silhouettePath;

const STAGE_BLOCK_CLASS = "w-full max-w-[500px] lg:w-[min(97.5vmin,650px)] lg:max-w-full";
const STAGE_PANEL_CLASS = "border-border/60 bg-background/70 shadow-xl backdrop-blur-xl";

type Step =
  | "welcome"
  | "what-to-expect"
  | "name"
  | "age"
  | "health"
  | "shoulder-length"
  | "neck-to-back"
  | "head-to-back"
  | "neck-length"
  | "photos"
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
  pillowFor?: PillowFor;
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
  } catch {}
}

type AssistContext = Pick<
  RecommendationResponseData,
  "pillow_product" | "variant" | "pricing" | "components" | "composed_buildable"
> & {
  default_template?: { id: number; name: string; placements: unknown[] } | null;
};

async function fetchAssistContext(
  next: SizeTier,
): Promise<{ ok: true; context: AssistContext } | { ok: false; error: unknown }> {
  const res = await fetch(
    `/api/mp-config/assist/context?size=${encodeURIComponent(next.size)}&tier=${encodeURIComponent(next.tier)}`,
  ).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok || !data?.pillow_product) return { ok: false, error: data?.error };
  return { ok: true, context: data as AssistContext };
}

function withAssistContext(
  prev: RecommendationResponseData | null,
  next: SizeTier,
  context: AssistContext,
): RecommendationResponseData {
  return {
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
    pillow_product: context.pillow_product,
    variant: context.variant,
    pricing: context.pricing ?? null,
    components: context.components,
    composed_buildable: context.composed_buildable,
  };
}

async function onStaffSizeTier(
  data: RecommendationResponseData,
  staff: SizeTier | undefined,
): Promise<RecommendationResponseData> {
  if (!staff) return data;
  if (data.pillow_product?.size === staff.size && data.pillow_product?.kind === staff.tier) return data;
  const loaded = await fetchAssistContext(staff);
  if (loaded.ok) return withAssistContext(data, staff, loaded.context);
  toast.error(`Could not reopen Size ${staff.size} — showing the recommended size`);
  return data;
}

export function MpConfigClient({
  info,
  staffAssist = false,
  canViewResults = false,
  partner = null,
  assistCode = null,
  resumeFinish = null,
  staffEdit = null,
  servicePrices = null,
  measuredByStaff: measuredByStaffProp = false,
  pickMeasurer = null,
  askEmailFirst = false,
  resumeDraft = null,
  pillowOwner = null,
  readjustmentPolicy = DEFAULT_READJUSTMENT_POLICY,
  pointsPerDollar = null,
  discoverySourceOptions,
}: {
  discoverySourceOptions: DiscoverySourceChoice[];
  readjustmentPolicy?: ReadjustmentPolicy;
  pointsPerDollar?: number | null;
  pillowOwner?: { name: string } | null;
  info: MpConfigInfo;
  askEmailFirst?: boolean;
  resumeDraft?: ResumeDraft | null;
  servicePrices?: ServiceFees | null;
  measuredByStaff?: boolean;
  pickMeasurer?: MeasurerProfile[] | null;
  staffAssist?: boolean;
  canViewResults?: boolean;
  partner?: {
    code: string;
    name: string;
    logoUrl: string | null;
    description: string | null;
  } | null;
  assistCode?: string | null;
  resumeFinish?: ResumeFinish | null;
  staffEdit?: StaffEditResult | null;
}) {
  const partnerAssisted = Boolean(partner);
  const [measurer, setMeasurer] = useState<string | null>(null);
  const measuredByStaff = measuredByStaffProp || measurer != null;
  const askMeasurer = pickMeasurer != null && pickMeasurer.length > 1;
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const variant: MpConfigVariant = variantFromPathname(pathname);
  const isBasic = variant === "basic";
  const holdSurface: HoldCancelSurface = isBasic ? "mp-basic" : "mp-full";
  const sessionStorageKey = sessionKeyFor(variant);
  const tokenStorageKey = tokenKeyFor(variant);
  const configPath = configPathFor(variant);
  const to = (href: string) => withLocale(href, locale);
  const studioMeasureFee =
    servicePrices &&
    !staffAssist &&
    !measuredByStaff &&
    !assistCode &&
    !partnerAssisted &&
    !resumeFinish &&
    !staffEdit
      ? servicePrices[isBasic ? "measurement_basic" : "measurement_premium"].msrp
      : null;
  const studioMeasureHref = to("/appointments?type=customisation");

  const isMobile = useIsMobile();
  const [mobileActionsSlot, setMobileActionsSlot] = useState<HTMLDivElement | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>(() =>
    resumeFinish || staffEdit
      ? "preview"
      : resumeDraft
        ?
          pillowOwner && !resumeDraft.answers.pillowFor
          ? "name"
          : resumeStepFor(variant, resumeDraft.answers)
        : "welcome",
  );
  const [restoringHoldCancel, setRestoringHoldCancel] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gridSpeed, setGridSpeed] = useState<"slow" | "fast" | "reverse">("slow");
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("in");
  const [measurementDrafts, setMeasurementDrafts] = useState<Record<MeasureKey, string>>(() => {
    const answers = resumeDraft?.answers;
    if (!answers) return EMPTY_MEASURE_DRAFTS;
    const drafts = { ...EMPTY_MEASURE_DRAFTS };
    for (const key of Object.keys(EMPTY_MEASURE_DRAFTS) as MeasureKey[]) {
      const cm = answers[key];
      if (cm) drafts[key] = displayMeasurement("in", cm);
    }
    return drafts;
  });
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
    ...resumeDraft?.answers,
    ...(resumeFinish?.measurements as Partial<MeasurementData> | undefined),
    ...(staffEdit?.measurements as Partial<MeasurementData> | undefined),
  }));

  const assisted = Boolean(assistCode);
  const staffEditing = Boolean(staffEdit);
  const [responseId, setResponseId] = useState<string | null>(
    staffEdit?.id ?? resumeDraft?.id ?? null,
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestion, setSuggestion] = useState<MpConfigSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const lastSavedRef = useRef<string>("");
  const transitionTimeoutRef = useRef<number | null>(null);
  const gridResetTimeoutRef = useRef<number | null>(null);

  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completedResponseId, setCompletedResponseId] = useState<string | null>(null);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  const [shopRecommendation, setShopRecommendation] = useState<RecommendationResponseData | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
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
  const [showCoverOnPillow, setShowCoverOnPillow] = useState(false);

  const [assistPlacements, setAssistPlacements] = useState<PillowPlacement[]>(() =>
    staffEdit ? rowsToPillowPlacements(staffEdit.placements) : [],
  );
  const [assistLoadedTemplate, setAssistLoadedTemplate] = useState<LoadedTemplate | null>(() =>
    staffEdit && staffEdit.fillingTemplateId != null
      ? {
          id: staffEdit.fillingTemplateId,
          placements: rowsToPillowPlacements(staffEdit.placements),
        }
      : null,
  );
  const [assistItems, setAssistItems] = useState<FillingItem[]>(staffEdit?.items ?? []);
  const assistItemSubtypes = useMemo(
    () => new Map(assistItems.map((i) => [i.id, fillingDescriptor(i)])),
    [assistItems],
  );
  const assistItemSizes = useMemo(
    () => new Map(assistItems.map((i) => [i.id, i.size])),
    [assistItems],
  );
  const [assistColorOverrides, setAssistColorOverrides] = useState<ColorOverrideRow[]>([]);
  const [assistDimensionOverrides, setAssistDimensionOverrides] = useState<DimensionOverridesPayload | null>(null);
  const shopDimensionOverrides = shopRecommendation?.dimension_overrides ?? null;
  const assistRegistry = useMemo(
    () => registryFromPayload(assistDimensionOverrides ?? shopDimensionOverrides),
    [assistDimensionOverrides, shopDimensionOverrides],
  );
  const assistItemDims = useMemo(() => resolveItemDims(assistItems, assistRegistry), [assistItems, assistRegistry]);
  const assistSoftBody = useMemo(
    () => softBodyFromPayload(assistDimensionOverrides ?? shopDimensionOverrides),
    [assistDimensionOverrides, shopDimensionOverrides],
  );
  const previewSize =
    shopRecommendation?.pillow_product?.size ?? suggestion?.recommended?.size ?? suggestion?.product?.size ?? null;
  const assistFit = useMemo(
    () =>
      fitPillow(assistPlacements, {
        size: previewSize,
        dims: assistItemDims,
        loftAllowance: assistRegistry.loftAllowance,
      }),
    [assistPlacements, previewSize, assistItemDims, assistRegistry.loftAllowance],
  );
  const { cut, setCut, onDiveChange } = useCut();
  const wideStage = useMediaQuery("(min-width: 1280px)");
  const [sideSlot, setSideSlot] = useState<HTMLElement | null>(null);
  const [inlineSlot, setInlineSlot] = useState<HTMLElement | null>(null);
  const [divedSection, setDivedSection] = useState<Section | null>(null);
  const onStageDive = useCallback(
    (section: Section | null) => {
      onDiveChange(section);
      setDivedSection(section);
    },
    [onDiveChange],
  );
  const shopColorOverrides = shopRecommendation?.color_overrides;
  const xrayColorVars = useMemo(
    () =>
      xrayColorVarStyle(
        assistColorOverrides.length ? assistColorOverrides : shopColorOverrides ?? [],
      ),
    [assistColorOverrides, shopColorOverrides],
  );
  const sessionFillingTemplateId = useMemo(
    () => sessionTemplateId(assistLoadedTemplate, assistPlacements),
    [assistLoadedTemplate, assistPlacements],
  );
  const engineSuggestion = useMemo(
    () =>
      templateSuggestion(
        parseRecommendationRecord(shopRecommendation?.recommendation_record ?? null),
      ),
    [shopRecommendation?.recommendation_record],
  );
  const suggestedTemplateId = engineSuggestion?.templateId ?? null;
  const suggestedSize = engineSuggestion?.size ?? null;
  const productSize = shopRecommendation?.pillow_product?.size ?? null;
  const restoredSizeTierRef = useRef<SizeTier | null>(null);
  const seededSuggestionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!staffAssist || staffEdit || resumeFinish || suggestedTemplateId == null) return;
    if (productSize !== suggestedSize) return;
    if (assistLoadedTemplate || assistPlacements.length > 0) return;
    if (seededSuggestionRef.current === suggestedTemplateId) return;
    seededSuggestionRef.current = suggestedTemplateId;
    let cancelled = false;
    fetchPillowTemplate(suggestedTemplateId)
      .then((loaded) => {
        if (cancelled) return;
        setAssistLoadedTemplate(loaded);
        setAssistPlacements(loaded.placements);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    staffAssist,
    staffEdit,
    resumeFinish,
    suggestedTemplateId,
    suggestedSize,
    productSize,
    assistLoadedTemplate,
    assistPlacements.length,
  ]);
  const [holdEmail, setHoldEmail] = useState(
    resumeFinish?.email ?? staffEdit?.email ?? resumeDraft?.email ?? "",
  );
  const [holdPhone, setHoldPhone] = useState(resumeFinish?.phone ?? staffEdit?.phone ?? "");
  const [discoverySource, setDiscoverySource] = useState(
    resumeFinish?.discoverySource ?? staffEdit?.discoverySource ?? "",
  );
  const [discoverySourceOther, setDiscoverySourceOther] = useState(
    resumeFinish?.discoverySourceOther ?? staffEdit?.discoverySourceOther ?? "",
  );
  const [checkoutCode, setCheckoutCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<CheckoutCodeStatus>({ state: "idle" });
  const [holdNotes, setHoldNotes] = useState("");
  const [marketingEmail, setMarketingEmail] = useState(true);
  const askedMarketingEmail = !resumeFinish && !staffEdit && marketingEmail;
  const emailFirst = askEmailFirst && !resumeFinish && !staffEdit;
  const [firstEmailSaved, setFirstEmailSaved] = useState(Boolean(resumeDraft));
  const [savingFirstEmail, setSavingFirstEmail] = useState(false);
  const [holdAddress, setHoldAddress] = useState<HoldShippingAddress>(() => ({
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "SG",
    ...((staffEdit?.shippingAddress ?? {}) as Partial<HoldShippingAddress>),
  }));
  const {
    signedIn: shippingSignedIn,
    savedAddresses,
    selectedAddressId,
    handleSelectAddress,
  } = useSavedShippingPrefill(
    assisted || staffAssist ? KEEP_EMAIL : setHoldEmail,
    assisted || staffAssist ? KEEP_ADDRESS : setHoldAddress,
  );
  const [shippingMethods, setShippingMethods] = useState<HoldShippingMethod[]>([]);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const selectedShipping = shippingMethods.find((m) => m.id === selectedShippingId);
  const selfCollect = isSelfCollectMethod(selectedShipping);
  const [pairedPhase, setPairedPhase] = useState<PairedPhase>("customize");
  const [pairedChoice, setPairedChoice] = useState<PairedChoice | null>(null);
  const [pairedRestored, setPairedRestored] = useState(false);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
  const [photoProblems, setPhotoProblems] = useState<{ front: string | null; side: string | null }>({
    front: null,
    side: null,
  });

  const stepOrder = (postUpsellSteps ?? stepOrderFor(variant)) as Step[];
  const showNeckSteps = !isBasic || upsoldToPremium;
  const soldAsPremium = upsoldToPremium || !isBasic;
  const soldTier = soldPillowTier({
    staffTier: staffAssist ? shopRecommendation?.pillow_product?.kind : null,
    premiumFlow: soldAsPremium,
  });
  const routeTarget = useMemo(
    () =>
      parseRecommendationRecord(shopRecommendation?.recommendation_record ?? null)?.flowRoute
        ?.targetFlow ?? null,
    [shopRecommendation?.recommendation_record],
  );
  const flowRouteBlocksHold = useMemo(() => {
    const r = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    return Boolean(r && isFlowRoutePending(r) && r.flowRoute?.targetFlow !== "mbolster");
  }, [shopRecommendation?.recommendation_record]);
  const pairedStepper = runsPairedStepper({
    routeTarget,
    assisted,
    partnerAssisted,
    reopened: Boolean(staffEdit || resumeFinish),
  });
  const pairedFlow = pairedStepper || (pairedRestored && !shopRecommendation);
  const { options: shippingOptions, selected: selectedShippingOption } = useHoldShippingQuote({
    methods: shippingMethods,
    address: holdAddress,
    parcelTypes: pairedFlow && pairedChoice?.bolster ? SHIPS_AS_PAIR : SHIPS_AS_MPILLOW,
    selectedId: selectedShippingId,
    onSelect: setSelectedShippingId,
  });
  const shippingStatus = selectedShippingOption?.status;
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const shownPairedPhaseRef = useRef(pairedPhase);
  useEffect(() => {
    if (shownPairedPhaseRef.current === pairedPhase) return;
    shownPairedPhaseRef.current = pairedPhase;
    previewPanelRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [pairedPhase]);

  const patchRecommendationRecord = useCallback((next: RecommendationRecord) => {
    setShopRecommendation((prev) =>
      prev ? { ...prev, recommendation_record: next } : prev,
    );
  }, []);

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
      const missing = withFirstQuestion(handoff.missingSteps ?? [], emailFirst) as Step[];
      if (handoff.targetFlow === "premium-mpillow") setUpsoldToPremium(true);
      if (missing.length > 0) {
        setPostUpsellSteps([...missing, "preview"]);
        setCurrentStep(missing[0]!);
      }
    } catch {
      // ponytail: ignore corrupt handoff
    }
  }, [emailFirst]);

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
      clearTransitionTimers();
      setGridSpeed("fast");
      setIsTransitioning(true);
      
      transitionTimeoutRef.current = window.setTimeout(() => {
        setCurrentStep(stepOrder[currentIndex + 1]);
        setIsTransitioning(false);
        
        gridResetTimeoutRef.current = window.setTimeout(() => {
          setGridSpeed("slow");
        }, 100);
      }, 300);
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      clearTransitionTimers();
      setGridSpeed("reverse");
      setIsTransitioning(true);
      
      transitionTimeoutRef.current = window.setTimeout(() => {
        setCurrentStep(stepOrder[currentIndex - 1]);
        setIsTransitioning(false);
        
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

  const askPillowFor = Boolean(pillowOwner) && !resumeFinish && !staffEdit;
  const forSomeoneElse = measurementData.pillowFor === "other";
  const choosePillowFor = (answer: PillowFor) =>
    setMeasurementData((prev) => ({
      ...prev,
      pillowFor: answer,
      name: nameForPillowFor(answer, prev.name, pillowOwner?.name ?? ""),
    }));

  const nameFields = useMemo((): FieldCheck[] => [
    ...(askPillowFor
      ? [
          {
            key: "pillowFor",
            touched: Boolean(measurementData.pillowFor),
            valid: Boolean(measurementData.pillowFor),
            message: "Choose who this pillow is for",
          },
        ]
      : []),
    {
      key: "name",
      touched: isNonEmptyString(measurementData.name),
      valid: isNonEmptyString(measurementData.name),
      message: forSomeoneElse ? "Enter their name" : "Enter your name",
    },
    ...(emailFirst ? [firstQuestionEmailCheck(holdEmail)] : []),
  ], [askPillowFor, measurementData.pillowFor, forSomeoneElse, measurementData.name, emailFirst, holdEmail]);

  const ageFields = useMemo((): FieldCheck[] => [
    {
      key: "ageGroup",
      touched: isNonEmptyString(measurementData.ageGroup),
      valid: isNonEmptyString(measurementData.ageGroup),
      message: "Select an age group",
    },
    {
      key: "gender",
      touched: isNonEmptyString(measurementData.gender),
      valid: isNonEmptyString(measurementData.gender),
      message: "Select a gender",
    },
  ], [measurementData.ageGroup, measurementData.gender]);

  const measureField = (key: MeasureKey): FieldCheck[] => [
    {
      key,
      touched: measurementDrafts[key].trim() !== "",
      valid:
        normalizeMeasurementDraft(measurementUnit, measurementDrafts[key], MEASURE_MIN_CM[key]) !==
        null,
      message: "Enter a valid measurement",
    },
  ];

  const setMeasureDraft = (key: MeasureKey, value: string) => {
    setMeasurementDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const commitMeasureDraft = (key: MeasureKey) => {
    const cm = normalizeMeasurementDraft(
      measurementUnit,
      measurementDrafts[key],
      MEASURE_MIN_CM[key],
    );
    if (cm === null) return;
    updateMeasurement(key, cm);
    setMeasureDraft(key, displayMeasurement(measurementUnit, cm));
  };

  const changeMeasurementUnit = (next: MeasurementUnit) => {
    const nextDrafts = { ...measurementDrafts };
    const nextData = { ...measurementData };
    for (const key of Object.keys(EMPTY_MEASURE_DRAFTS) as MeasureKey[]) {
      const cm =
        normalizeMeasurementDraft(measurementUnit, measurementDrafts[key], MEASURE_MIN_CM[key]) ??
        measurementData[key];
      nextData[key] = cm;
      nextDrafts[key] = displayMeasurement(next, cm);
    }
    setMeasurementData(nextData);
    setMeasurementDrafts(nextDrafts);
    setMeasurementUnit(next);
  };

  const healthFields = useMemo((): FieldCheck[] => [
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
      code: checkoutCode,
    }),
    {
      key: "recipient",
      touched: isNonEmptyString(holdAddress.recipient),
      valid: isNonEmptyString(holdAddress.recipient),
      message: "Recipient is required",
    },
    ...(selfCollect
      ? []
      : [
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
            valid: isNonEmptyString(holdAddress.postal_code) || !usesPostalCode(holdAddress.country),
            message: "Postal code is required",
          },
        ]),
    holdShippingCheck(shippingStatus),
  ], [
    checkoutCode,
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
    holdAddress.country,
    shippingStatus,
    selfCollect,
  ]);

  const activeFields = useMemo((): FieldCheck[] => {
    switch (currentStep) {
      case "name":
        return nameFields;
      case "age":
        return ageFields;
      case "health":
        return healthFields;
      case "shoulder-length":
        return measureField("shoulderLength");
      case "neck-to-back":
        return measureField("neckToBack");
      case "head-to-back":
        return measureField("headToBack");
      case "neck-length":
        return measureField("neckLength");
      case "preview":
        return holdFields;
      default:
        return [];
    }
  }, [currentStep, nameFields, ageFields, healthFields, holdFields, measurementData, measurementDrafts, measurementUnit]);

  const [errorsStep, setErrorsStep] = useState(currentStep);
  if (errorsStep !== currentStep) {
    setErrorsStep(currentStep);
    setFieldErrors({});
  }
  const [errorsPrunedFor, setErrorsPrunedFor] = useState(activeFields);
  if (errorsPrunedFor !== activeFields) {
    setErrorsPrunedFor(activeFields);
    setFieldErrors((prev) => pruneFieldErrors(prev, activeFields));
  }

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
    if (staffEdit) return;
    if (resumeDraft) {
      window.localStorage.setItem(sessionStorageKey, resumeDraft.id);
      writeToken(tokenStorageKey, resumeDraft.token);
      setResponseId(resumeDraft.id);
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${stripContinueDraftQuery(window.location.search)}`,
      );
      return;
    }
    let id = window.localStorage.getItem(sessionStorageKey);
    if (!id) {
      id = newResponseId();
      window.localStorage.setItem(sessionStorageKey, id);
      writeToken(tokenStorageKey, null);
    }
    setResponseId(id);

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
        if (res.status === 401 || res.status === 403) {
          rotate();
          return;
        }
        const payload = await res.json().catch(() => null);
        if (!res.ok) return;
        const isFinal = Boolean(payload?.response?.is_final);
        if (!isFinal) return;
        rotate();
      } catch {}
    })();
  }, [sessionStorageKey, tokenStorageKey, staffEdit, resumeDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (staffEdit || resumeDraft) return;
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
      setFirstEmailSaved(true);
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
    if (staffAssist && !resumeFinish && draft?.staffAssist) {
      const restored = restorePillowAssist(draft.staffAssist);
      setAssistPlacements(restored.placements);
      setAssistLoadedTemplate(restored.loadedTemplate);
      restoredSizeTierRef.current = restored.sizeTier;
    }
    setCurrentStep("preview");
    setRestoringHoldCancel(true);

    const opensDetails = opensPairedDetails(window.location.search);
    const handoff = readPairedHandoff(window.sessionStorage);
    if (handoff && handoff.anchorId === draft?.responseId) {
      setPairedRestored(true);
      if (handoff.choice && (opensDetails || holdCancelled)) {
        setPairedChoice(handoff.choice);
        setPairedPhase(holdCancelled ? "review" : "details");
      }
    }
    if (opensDetails) {
      const params = new URLSearchParams(window.location.search);
      params.delete("paired");
      const rest = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    }

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
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentStep !== "preview") return;
    if (resumeFinish || staffEdit) return;
    if (restoringHoldCancel) return;
    const shown = asSizeTier(
      shopRecommendation?.pillow_product?.size,
      shopRecommendation?.pillow_product?.kind,
    );
    const stored = staffAssist && !shown ? readHoldCancelDraft(window.localStorage, holdSurface) : null;
    const staffSession = !staffAssist
      ? undefined
      : shown
        ? pillowAssistDraft(shown, assistPlacements, assistLoadedTemplate)
        : stored?.responseId === responseId
          ? stored?.staffAssist
          : undefined;
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
      ...(staffSession ? { staffAssist: staffSession } : {}),
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
    restoringHoldCancel,
    staffAssist,
    shopRecommendation?.pillow_product?.size,
    shopRecommendation?.pillow_product?.kind,
    assistPlacements,
    assistLoadedTemplate,
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
    setShopRecommendation(null);
    setShopLoading(false);
    setSelectedCover(null);
    setSelectedCase(null);
    setSelectedAddons(new Set());
    setAssistPlacements([]);
    setAssistLoadedTemplate(null);
    try {
      clearPairedHandoff(window.sessionStorage);
    } catch {}
    setPairedPhase("customize");
    setPairedChoice(null);
    setPairedRestored(false);
    setHoldSubmitting(false);
    setFirstEmailSaved(false);
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
    if (askMeasurer && measurer == null) return;
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

  const requestExit = () => {
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
    opts?: {
      isFinal?: boolean;
      firstEmail?: { email: string; marketingEmail: boolean };
    },
  ): Promise<{ id: string; telegramStatus?: "sent" | "skipped" | "failed" } | null> => {
    if (!responseId || resumeFinish || staffEdit) return null;
    if (emailFirst && !firstEmailSaved && !opts?.firstEmail) return null;
    if (!hasAnyInput) return { id: responseId };

    const snapshot = JSON.stringify({
      responseId,
      measurementData,
      isFinal: opts?.isFinal ?? null,
      firstEmail: opts?.firstEmail ?? null,
    });
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
          ...(assistCode ? { assistCode } : {}),
          ...(opts?.firstEmail
            ? {
                draftEmail: opts.firstEmail.email,
                marketingEmail: opts.firstEmail.marketingEmail,
                configurator: variant,
              }
            : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save");
      if (typeof payload?.accessToken === "string") writeToken(tokenStorageKey, payload.accessToken);
      lastSavedRef.current = snapshot;
      if (opts?.firstEmail) setFirstEmailSaved(true);
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
    emailFirst,
    firstEmailSaved,
    variant,
  ]);

  const saveFirstEmailThenContinue = async () => {
    setSavingFirstEmail(true);
    const saved = await upsertToDb({
      firstEmail: { email: holdEmail.trim(), marketingEmail },
    });
    setSavingFirstEmail(false);
    if (!saved) {
      setFieldErrors({ email: "We couldn't save your email. Check it and try again." });
      return;
    }
    goToNextStep();
  };

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

    const maxBytes = 30 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error("Image too large. Please use a smaller photo.");
      return;
    }

    const previous = photoDataUrls[view];
    setPhotoUploading((p) => ({ ...p, [view]: true }));
    setPhotoProblems((p) => ({ ...p, [view]: null }));
    try {
      let dataUrl: string;
      try {
        dataUrl = await shrinkPhoto(file);
      } catch {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 3 * 1024 * 1024) {
          throw new Error("We couldn't read this photo. Please use a JPEG or PNG photo.");
        }
        dataUrl = await fileToDataUrl(file);
      }
      setPhotoDataUrls((p) => ({ ...p, [view]: dataUrl }));

      await upsertToDb();

      const res = await fetch("/api/mp-config/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, view, dataUrl, token: readToken(tokenStorageKey) }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to save photo");
      }
      toast.success(view === "front" ? "Front view saved" : "Side view saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save photo";
      setPhotoDataUrls((p) => ({ ...p, [view]: previous }));
      setPhotoProblems((p) => ({ ...p, [view]: message }));
      toast.error(message);
    } finally {
      setPhotoUploading((p) => ({ ...p, [view]: false }));
    }
  };

  const currentStepIndex = stepOrder.indexOf(currentStep);
  const progressValue =
    currentStepIndex <= 0
      ? 0
      : Math.round((currentStepIndex / (stepOrder.length - 1)) * 100);

  const fetchShopRecommendation = useCallback(async (opts?: {
    preserveSelections?: boolean;
    assigned?: { size: string; tier: string };
    staffSizeTier?: SizeTier;
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

      const data = await onStaffSizeTier(await res.json(), opts?.staffSizeTier);
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

  const fetchBasicRecommendation = useCallback(async (opts?: {
    preserveSelections?: boolean;
    staffSizeTier?: SizeTier;
  }): Promise<RecommendationResponseData | null> => {
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

      const data = await onStaffSizeTier(await res.json(), opts?.staffSizeTier);
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

  const applyAssistSizeTier = async (next: SizeTier, from: SizeTier) => {
    const loadedContext = await fetchAssistContext(next);
    if (!loadedContext.ok) {
      toast.error(getApiErrorMessage(loadedContext.error, "Failed to switch size"));
      return;
    }
    const data = loadedContext.context;
    setShopRecommendation((prev) => withAssistContext(prev, next, data));

    const accessoryIds = new Set(
      assistItems
        .filter((i) => isInPillowAccessory({ category: i.category, name: i.name }))
        .map((i) => i.id),
    );
    const neckIds = new Set(
      assistItems.filter((i) => isNeckSupportItem({ category: i.category, name: i.name })).map((i) => i.id),
    );
    const kept = mixAfterTierChange(from, next, assistPlacements, (id) => accessoryIds.has(id));
    if (kept) {
      setAssistPlacements(kept.placements);
      if (kept.removed > 0) {
        const onlyNeck = assistPlacements.every((p) => !accessoryIds.has(p.itemId) || neckIds.has(p.itemId));
        toast.message(onlyNeck ? "Neck support removed" : "Accessories removed", {
          description: onlyNeck
            ? "A neck support is for Premium pillows only."
            : "A neck support or ear pad is for Premium pillows only.",
        });
      }
    } else {
      const startId = startingTemplateId(next.size, engineSuggestion, data.default_template?.id ?? null);
      const loaded =
        startId == null
          ? null
          : startId === data.default_template?.id
            ? {
                id: startId,
                placements: rowsToPillowPlacements(
                  (data.default_template?.placements ?? []) as PillowPlacementRow[],
                ),
              }
            : await fetchPillowTemplate(startId).catch(() => null);
      setAssistPlacements(loaded?.placements ?? []);
      setAssistLoadedTemplate(loaded);
    }

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

  useEffect(() => {
    if (!resumeDraft || currentStep !== "preview") return;
    if (isBasic) void fetchBasicRecommendation();
    else void Promise.all([loadSuggestion(), fetchShopRecommendation()]);
  }, []);

  useEffect(() => {
    if (!restoringHoldCancel || currentStep !== "preview") return;
    let cancelled = false;
    const staffSizeTier = restoredSizeTierRef.current ?? undefined;
    (async () => {
      if (isBasic) {
        await fetchBasicRecommendation({ preserveSelections: true, staffSizeTier });
      } else {
        await Promise.all([
          loadSuggestion(),
          fetchShopRecommendation({ preserveSelections: true, staffSizeTier }),
        ]);
      }
      if (!cancelled) {
        restoredSizeTierRef.current = null;
        setRestoringHoldCancel(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restoringHoldCancel, currentStep]);

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
      preserveSelections: Boolean(staffEdit),
    });
  }, []);

  useEffect(() => {
    if (currentStep !== "preview") return;
    const size =
      shopRecommendation?.pillow_product?.size ??
      suggestion?.recommended?.size ??
      suggestion?.product?.size ??
      "";
    let cancelled = false;
    if (!partnerAssisted) {
      const qs = new URLSearchParams({ productType: "pillow" });
      if (size) qs.set("size", size);
      fetch(`/api/results/addons?${qs.toString()}`)
        .then((r) => r.json())
        .then((d: { addons?: AddonOption[] }) => {
          if (cancelled) return;
          const list = staffAssist
            ? (d.addons ?? [])
            : addonsForAnswers(d.addons ?? [], {
                earDiscomfortSideSleep: measurementData.earDiscomfortSideSleep,
              });
          setAddons(list);
          setSelectedAddons((prev) => keepOfferedAddons(prev, list, size));
        })
        .catch(() => {
          if (!cancelled) setAddons([]);
        });
    }

    const country = holdAddress.country || "SG";
    fetch(`${HOLD_SHIPPING_METHODS_PATH}&country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then(async (d: { rows?: typeof shippingMethods }) => {
        let methods = d.rows ?? [];
        if (methods.length === 0 && country === "SG") {
          const all = await fetch(HOLD_SHIPPING_METHODS_PATH).then((r) => r.json());
          methods = all.rows ?? [];
        }
        if (cancelled) return;
        setShippingMethods(methods);
        setSelectedShippingId((prev) => {
          if (methods.some((m) => m.id === prev)) return prev;
          const stored = staffEdit?.shippingMethodSlug
            ? methods.find((m) => m.slug === staffEdit.shippingMethodSlug)
            : undefined;
          return stored?.id ?? methods[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) setShippingMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    shopRecommendation?.pillow_product?.size,
    suggestion?.recommended?.size,
    suggestion?.product?.size,
    holdAddress.country,
    staffEdit,
    staffAssist,
    measurementData.earDiscomfortSideSleep,
  ]);

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

  const finishPostUpsell = useCallback(async () => {
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

  const staffEditResultPath = staffEdit ? to(`/settings/results/${staffEdit.id}`) : null;

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
    code: checkoutCode,
    marketingEmail,
  };

  const handleSendToBuildTeam = () =>
    tryAdvance(previewContactFieldChecks(contactValues), async () => {
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
            token: readToken(tokenStorageKey),
            deferred: true,
            email: holdEmail.trim(),
            marketingEmail: askedMarketingEmail,
            phone: holdPhone.trim(),
            discoverySource,
            discoverySourceOther:
              discoverySource === "other" ? discoverySourceOther.trim() : undefined,
            code: checkoutCodeToSend(checkoutCode, codeStatus),
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
        try {
          window.localStorage.removeItem(sessionStorageKey);
          clearHoldCancelDraft(window.localStorage, holdSurface);
        } catch {}
        writeToken(tokenStorageKey, null);
        const staffDest = canViewResults ? to(`/settings/results/${data.resultId}#assignment`) : null;
        window.location.href = staffDest ?? ((data.checkoutUrl ?? data.statusUrl) as string);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not send to our build team");
        setHoldSubmitting(false);
      }
    });

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

  const handleStaffEditSave = async () => {
    if (!staffEdit) return;
    const size = shopRecommendation?.pillow_product?.size ?? staffEdit.size;
    const tier =
      (shopRecommendation?.pillow_product?.kind as "basic" | "premium" | undefined) ??
      staffEdit.tier;
    const coverCaseErrors = buildFieldErrorMap(
      holdFields.filter((f) => f.key === "cover" || f.key === "case"),
    );
    if (Object.keys(coverCaseErrors).length > 0 || selectedCover == null || selectedCase == null) {
      setFieldErrors(coverCaseErrors);
      toast.error("Choose a cover and a case");
      return;
    }
    if (!confirmSaveWithOverCells(assistFit, "Save")) return;
    const addressComplete =
      selfCollect ||
      Boolean(
        holdAddress.line1.trim() &&
          holdAddress.city.trim() &&
          (holdAddress.postal_code.trim() || !usesPostalCode(holdAddress.country)),
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

  const handleAuthorizeHold = useCallback(async (opts?: {
    paired?: PairedChoice;
  }) => {
    const size =
      shopRecommendation?.pillow_product?.size ??
      suggestion?.recommended?.size ??
      suggestion?.product?.size;
    const tier = soldTier;

    if (!size) {
      toast.error("Missing size suggestion");
      return;
    }

    const parsedRecord = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    const journeyRecord =
      !opts?.paired &&
      parsedRecord?.flowRoute?.targetFlow === "mbolster" &&
      isFlowRoutePending(parsedRecord)
        ? withJourneyOnDecline(parsedRecord)
        : parsedRecord;
    const routeGate = opts?.paired
      ? ({ ok: true } as const)
      : assertPreStripeRouteResolved(journeyRecord ?? { flowRoute: null });
    if (!routeGate.ok) {
      toast.error(routeGate.reason);
      return;
    }

    const errors = buildFieldErrorMap(holdFields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (opts?.paired) setPairedPhase(errors.cover || errors.case ? "customize" : "details");
      return;
    }
    if (staffAssist && !confirmSaveWithOverCells(assistFit, "Hold")) return;

    setHoldSubmitting(true);
    try {
      const saved = await upsertToDb();
      const holdBody = {
        responseId: responseId ?? undefined,
        token: readToken(tokenStorageKey),
        ...(assisted ? { deferred: true } : {}),
        email: holdEmail.trim(),
        marketingEmail: askedMarketingEmail,
        phone: holdPhone.trim(),
        discoverySource,
        discoverySourceOther:
          discoverySource === "other" ? discoverySourceOther.trim() : undefined,
        code: checkoutCodeToSend(checkoutCode, codeStatus),
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
      };
      let body: Record<string, unknown> = holdBody;
      if (opts?.paired) {
        const anchorId = saved?.id ?? responseId;
        const stored = readPairedHandoff(window.sessionStorage);
        const handoff = stored && anchorId ? reanchorPairedHandoff(stored, anchorId, newResponseId) : stored;
        if (handoff && handoff !== stored) writePairedHandoff(window.sessionStorage, handoff);
        const bolster = opts.paired.bolster ? (handoff?.choice?.bolster ?? null) : null;
        if (opts.paired.bolster && !bolster) {
          throw new Error("Your Mbolster was not saved on this device. Go back and add it again.");
        }
        body = pairedHoldBody(holdBody, bolster);
      }
      const res = await fetch("/api/results/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data.error, "Failed to start authorization"));
      }
      const next = data.checkoutUrl ?? data.statusUrl;
      if (!next) throw new Error("Missing checkout URL");
      if (!opts?.paired) {
        try {
          clearPairedHandoff(window.sessionStorage);
        } catch {}
      }
      trackGaEventThen(
        {
          name: "generate_lead",
          params: {
            product_type: "pillow",
            ...(typeof data.authorizedAmount === "number" ? { value: data.authorizedAmount } : {}),
            ...(data.currency ? { currency: String(data.currency) } : {}),
          },
        },
        () => {
          window.location.href = next as string;
        },
      );
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
    checkoutCode,
    codeStatus,
    holdNotes,
    holdAddress,
    selectedShippingId,
    selectedShipping,
    selectedAddons,
    responseId,
    measurementData,
    upsertToDb,
    isBasic,
    soldTier,
    configPath,
    holdFields,
    staffAssist,
    assistPlacements,
    assistFit,
    sessionFillingTemplateId,
    partner,
    tokenStorageKey,
  ]);

  const pairedFinishReady = () => {
    const errors = buildFieldErrorMap(
      holdFields.filter((f) => f.key === "cover" || f.key === "case"),
    );
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }
    return true;
  };

  const writeStep1Handoff = (
    anchorId: string,
    pillow: PairedHandoff["pillow"],
    choice?: PairedChoice,
  ) => {
    const prior = readPairedHandoff(window.sessionStorage);
    const base = prior ? reanchorPairedHandoff(prior, anchorId, newResponseId) : null;
    const record = parseRecommendationRecord(shopRecommendation?.recommendation_record ?? null);
    writePairedHandoff(window.sessionStorage, {
      v: 2,
      anchorId,
      companionId: base?.companionId ?? newResponseId(),
      sleepPosition: bolsterSleepPosition(deriveSleepPosition(measurementData.sleepPositionType)),
      reason: record?.flowRoute?.reason ?? "",
      configPath,
      pillow,
      ...(base?.bolster ? { bolster: base.bolster } : {}),
      ...(choice ? { choice } : {}),
    });
  };

  const handleToMbolster = async (pillow: PairedHandoff["pillow"]) => {
    if (!pairedFinishReady()) return;
    setHoldSubmitting(true);
    try {
      const saved = await upsertToDb();
      const anchorId = saved?.id ?? responseId;
      if (!anchorId) throw new Error("Could not save your answers. Please try again.");
      writeStep1Handoff(anchorId, pillow);
      router.push(withLocale(PAIRED_MBOLSTER_PATH, locale));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the Mbolster step");
      setHoldSubmitting(false);
    }
  };

  const handleSkipMbolster = (pillow: PairedHandoff["pillow"]) => {
    if (!pairedFinishReady()) return;
    const choice: PairedChoice = { bolster: null };
    if (responseId) {
      try {
        writeStep1Handoff(responseId, pillow, choice);
      } catch {}
    }
    setPairedChoice(choice);
    setPairedPhase("details");
  };

  const handlePairedContinue = (pillow: PairedHandoff["pillow"]) => {
    if (!pairedFinishReady()) return;
    try {
      const handoff = readPairedHandoff(window.sessionStorage);
      if (handoff) writePairedHandoff(window.sessionStorage, { ...handoff, pillow });
    } catch {}
    setPairedPhase("details");
  };

  const handlePairedReview = () => {
    const errors = buildFieldErrorMap(holdFields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setPairedPhase("review");
  };

  const openPairedMbolster = () => router.push(withLocale(PAIRED_MBOLSTER_PATH, locale));

  const handleRemoveMbolster = () => {
    const choice: PairedChoice = { bolster: null };
    try {
      const handoff = readPairedHandoff(window.sessionStorage);
      if (handoff) writePairedHandoff(window.sessionStorage, { ...handoff, choice });
    } catch {}
    setPairedChoice(choice);
  };

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
      guestPlacements: resumeFinish
        ? rowsToPillowPlacements(resumeFinish.placements)
        : rowsToPillowPlacements(tpl?.placements ?? []),
      guestItemSubtypes: new Map([
        ...guestFillings.map((f) => [f.item_id, fillingDescriptor(f) || null] as const),
        ...(resumeFinish?.items ?? []).map((i) => [i.id, fillingDescriptor(i) || null] as const),
      ]),
      guestItemSizes: new Map([
        ...guestFillings.map((f) => [f.item_id, f.size ?? null] as const),
        ...(resumeFinish?.items ?? []).map((i) => [i.id, i.size] as const),
      ]),
      guestItemDims: resolveItemDims(
        [
          ...guestFillings.map((f) => ({ id: f.item_id, name: f.name, subtype: f.subtype ?? null, size: f.size ?? null })),
          ...(resumeFinish?.items ?? []),
        ],
        registryFromPayload(shopRecommendation?.dimension_overrides ?? null),
      ),
      guestLoftAllowance: registryFromPayload(shopRecommendation?.dimension_overrides ?? null).loftAllowance,
      guestSoftBody: softBodyFromPayload(shopRecommendation?.dimension_overrides ?? null),
    };
  }, [shopRecommendation, resumeFinish]);
  const guestFit = useMemo(
    () =>
      fitPillow(guestPreview.guestPlacements, {
        size: previewSize,
        dims: guestPreview.guestItemDims,
        loftAllowance: guestPreview.guestLoftAllowance,
      }),
    [guestPreview, previewSize],
  );

  if (currentStep === "preview") {
    const size =
      shopRecommendation?.pillow_product?.size ??
      suggestion?.recommended?.size ??
      suggestion?.product?.size;
    const tier =
      shopRecommendation?.pillow_product?.kind ??
      suggestion?.recommended?.kind ??
      suggestion?.product?.kind;
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    const routePending = Boolean(record && isFlowRoutePending(record));
    const revealNow = shouldRevealRecommendation({
      requiredInputsComplete: Boolean(shopRecommendation && size),
      flowRouteUnresolved: routePending,
    });
    const { tpl, guestPlacements, guestItemSubtypes, guestItemSizes, guestItemDims, guestLoftAllowance, guestSoftBody } = guestPreview;
    const guestXray = !partnerAssisted && revealNow && previewMixMode(guestPlacements) === "xray";
    const xrayVisible = staffAssist || guestXray;
    const currency = shopRecommendation?.variant?.currency ?? "SGD";
    const addonTotal = addons
      .filter((a) => selectedAddons.has(a.item_id))
      .reduce((s, a) => s + a.msrp, 0);
    const pricingInputs = shopRecommendation?.pricing ?? null;
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
    let serviceLines: ServiceLine[] = [];
    let servicesBlocked = false;
    try {
      serviceLines = resultServiceLines(
        {
          measured_by_type: measuredByStaff ? "staff" : "by_user",
          product_type: "pillow",
          suggested_tier: soldTier,
        },
        servicePrices,
      );
    } catch {
      servicesBlocked = true;
    }
    const serviceTotal = sumServiceLines(serviceLines);
    const quoteBlocked = (pricingInputs != null && quote?.ok !== true) || servicesBlocked;
    const basePrice = quote?.ok ? quote.subtotal : (shopRecommendation?.variant?.price ?? 0);
    const codeContext: CheckoutCodeContext | null =
      quoteBlocked || !shopRecommendation || !size
        ? null
        : {
            flow: "customisation",
            build: { product_type: "pillow", size: String(size), tier: soldTier },
            goods: basePrice + addonTotal,
          };
    const storedCoupon = resumeFinish?.coupon ?? staffEdit?.coupon ?? null;
    const storedCouponPricing = storedCoupon
      ? resultCouponPricing(storedCoupon.terms, basePrice + addonTotal)
      : null;
    const codeDiscount = storedCouponPricing?.discount ?? checkoutCodeDiscount(codeStatus);
    const codeFreeShipping = storedCouponPricing?.freeShipping ?? checkoutCodeFreeShipping(codeStatus);
    const discountCode = storedCoupon?.code ?? checkoutCodeDiscountLabel(codeStatus);
    const shippingAmount = quoteBlocked
      ? null
      : holdShippingAmount(selectedShippingOption, basePrice + addonTotal, codeFreeShipping);
    const coverStock = preferenceStockFor(
      selectedCover,
      shopRecommendation?.components.covers ?? [],
    );
    const caseStock = preferenceStockFor(
      selectedCase,
      shopRecommendation?.components.cases ?? [],
    );
    const caseOverlay =
      (shopRecommendation?.components.cases ?? []).find((c) => c.item_id === selectedCase)
        ?.overlay ?? null;
    const coverOverlay =
      (shopRecommendation?.components.covers ?? []).find((c) => c.item_id === selectedCover)
        ?.overlay ?? null;
    const selectedOverlay =
      (showCoverOnPillow ? coverOverlay ?? caseOverlay : caseOverlay ?? coverOverlay) ?? null;
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
    const phase: PairedPhase | null = pairedFlow ? pairedPhase : null;
    const money = (n: number) => `${currency} ${n.toFixed(2)}`;
    const customizing = phase == null || phase === "customize";
    const askingDetails = phase == null || phase === "details";
    const pillowTotal =
      quoteBlocked || !shopRecommendation ? null : basePrice + addonTotal + serviceTotal;
    const pairedPillow: PairedHandoff["pillow"] = {
      label: `Mpillow ${size ?? ""} · ${tier ?? ""}`.trim(),
      ballpark: pillowTotal,
      currency,
      goods: pillowTotal == null ? null : basePrice + addonTotal,
      services: serviceLines.map((l) => ({ label: l.label, amount: l.msrp })),
    };
    const pairedBolster = pairedChoice?.bolster ? pairedChoice.summary : null;
    const orderTotal =
      pillowTotal == null || (pairedBolster && pairedBolster.ballpark == null)
        ? null
        : pillowTotal - codeDiscount + (pairedBolster?.ballpark ?? 0) + (shippingAmount ?? 0);
    const discountRow =
      discountCode && (codeDiscount > 0 || codeFreeShipping) && pillowTotal != null ? (
        <div className="mb-1 flex justify-between gap-4 text-sm text-emerald-700 dark:text-emerald-400">
          <span className="min-w-0">Discount ({discountCode})</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {codeDiscount > 0 ? `−${money(codeDiscount)}` : "Free shipping"}
          </span>
        </div>
      ) : null;
    const holdCta = holdSubmitting
      ? staffEdit
        ? "Saving…"
        : "Redirecting…"
      : staffEdit
        ? "Save configuration"
        : resumeFinish
          ? "Pay"
          : phase === "customize"
            ? pairedChoice
              ? "Next: Details"
              : "Next: Mbolster"
            : phase === "details"
              ? "Review order"
              :
                phase === "review" && !preOrder
                ? "Pay"
                : holdCtaLabel(preOrder, assisted);
    const returnPath = staffEditResultPath ?? resumeStatusPath;
    const backFromPreview = returnPath
      ? () => {
          window.location.href = returnPath;
        }
      : phase === "details"
        ? pairedChoice?.bolster
          ? openPairedMbolster
          : () => setPairedPhase("customize")
        : phase === "review"
          ? () => setPairedPhase("details")
          : goToPreviousStep;
    const onPreviewContinue = () =>
      void (staffEdit
        ? handleStaffEditSave()
        : resumeFinish
          ? handleFinishAndPay()
          : phase === "customize"
            ? pairedChoice
              ? handlePairedContinue(pairedPillow)
              : handleToMbolster(pairedPillow)
            : phase === "details"
              ? handlePairedReview()
              : phase === "review"
                ? handleAuthorizeHold({ paired: pairedChoice ?? { bolster: null } })
                : handleAuthorizeHold());
    const optionName = (id: number | null, options: Array<{ item_id: number; name: string }>) =>
      options.find((o) => o.item_id === id)?.name ?? null;
    const coverName = optionName(selectedCover, shopRecommendation?.components.covers ?? []);
    const caseName = optionName(selectedCase, shopRecommendation?.components.cases ?? []);
    const addonNames = addons.filter((a) => selectedAddons.has(a.item_id)).map((a) => a.name);
    const shippingMethod = selectedShippingOption?.method;
    const collect = shippingMethod?.collect_location ?? null;
    const editDetails = { label: "Edit", onClick: () => setPairedPhase("details") };
    const promiseTerms = servicePrices
      ? { readjustmentFee: servicePrices.readjustment.msrp, policy: readjustmentPolicy }
      : null;
    const earns = pointsPromise(
      pillowTotal == null || (pairedBolster && pairedBolster.ballpark == null)
        ? null
        : pillowTotal - codeDiscount + (pairedBolster?.ballpark ?? 0),
      pointsPerDollar,
    );
    const pairedReview = (
      <div className="space-y-3">
        <ReviewCard
          title={pairedPillow.label}
          lines={[
            ...(coverName ? [`Cover: ${coverName}`] : []),
            ...(caseName ? [`Case: ${caseName}`] : []),
            ...(addonNames.length ? [`Add-ons, subject to advisor review: ${addonNames.join(", ")}`] : []),
          ]}
          amount={pillowTotal != null ? money(pillowTotal) : null}
          actions={[{ label: "Edit", onClick: () => setPairedPhase("customize") }]}
        />
        {promiseTerms ? (
          <ReviewNote
            icon={<ShieldCheck />}
            title="Comes with your Mpillow"
            lines={pillowPromises(tier, promiseTerms)}
          />
        ) : null}
        {pairedBolster ? (
          <>
          <ReviewCard
            title={pairedBolster.label}
            detail="Ships with your Mpillow. You can still drop it later, when you accept the finished builds."
            lines={pairedBolster.lines}
            amount={
              pairedBolster.ballpark != null
                ? `${pairedBolster.currency} ${pairedBolster.ballpark.toFixed(2)}`
                : "Not available"
            }
            actions={[
              { label: "Edit", onClick: openPairedMbolster },
              { label: "Remove", onClick: handleRemoveMbolster },
            ]}
          />
          {promiseTerms ? (
            <ReviewNote
              icon={<ShieldCheck />}
              title="Comes with your Mbolster"
              lines={bolsterPromises(promiseTerms)}
            />
          ) : null}
          </>
        ) : (
          <ReviewCard
            title="Mbolster"
            detail="Not added"
            lines={[]}
            actions={[{ label: "Add an Mbolster", onClick: () => void handleToMbolster(pairedPillow) }]}
          />
        )}
        <ReviewCard
          title={collect ? "Collection" : "Delivery"}
          detail={
            shippingMethod
              ? [holdShippingName(shippingMethod), selectedShippingOption?.window].filter(Boolean).join(" · ")
              : null
          }
          lines={
            collect
              ? [`Collect from ${collect.name}`, collect.address, `Collected by ${holdAddress.recipient}`]
              : [
                  holdAddress.recipient,
                  holdAddress.line1,
                  holdAddress.line2,
                  [holdAddress.city, holdAddress.state, holdAddress.postal_code].filter(Boolean).join(" "),
                  countryName(holdAddress.country || "SG"),
                ].filter((l): l is string => Boolean(l))
          }
          amount={
            shippingAmount == null
              ? null
              : shippingAmount === 0
                ? "Free"
                : money(shippingAmount)
          }
          actions={[editDetails]}
        />
        <ReviewCard
          title="Contact"
          detail={measurementData.name || null}
          lines={[holdEmail, holdPhone, ...(holdNotes.trim() ? [`Notes: ${holdNotes.trim()}`] : [])]}
          actions={[editDetails]}
        />
        {earns ? (
          <ReviewNote
            icon={<Gift />}
            title={`You'll earn about ${earns.points}, worth ${earns.worth}`}
            lines={[
              "Added to your account 30 days after delivery, to spend in our shop.",
              shippingSignedIn && !(assisted || staffAssist)
                ? "You'll see them on your Profile."
                : `Sign in with ${holdEmail} to see and use them. Partner accounts don't earn points.`,
            ]}
          />
        ) : null}
        <ReviewNote
          icon={<ShieldCheck />}
          title="Our promise"
          lines={[
            `You are not charged until you accept the final ${pairedBolster ? "builds" : "build"}.`,
            "Made to your measurements, so it can't be refunded. If the fit isn't right, we adjust it.",
          ]}
          footer={
            <Link
              href={to("/shipping-refund-policies")}
              target="_blank"
              className="underline underline-offset-4"
            >
              Returns &amp; Warranty
            </Link>
          }
        />
      </div>
    );
    const continueBlocked =
      holdSubmitting ||
      shopLoading ||
      !shopRecommendation ||
      quoteBlocked ||
      (!staffEditing && flowRouteBlocksHold) ||
      (phase === "review" && shippingStatus === "quoting");
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
        <div
          className="relative min-h-dvh min-w-0 max-w-full overflow-x-clip bg-background"
          data-typography-scope="app"
        >
          {/* ponytail: remount beacon so step changes fire section_view without SPA path change */}
          <div
            key={currentStep}
            id={currentStep}
            data-section={currentStep}
            data-step={currentStep}
            className="pointer-events-none absolute left-0 top-0 z-30 h-4 w-full"
            aria-hidden
          />
          <header
            className={cn(
              configuratorStickyHeaderClassName,
              "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
            )}
          >
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
              <div role="heading" aria-level={2} className="text-sm font-semibold tracking-tight leading-tight">{isBasic ? "Your Basic Mpillow" : "Your Custom Mpillow"}</div>
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
            {phase ? (
              <PairedStepperBar
                className="border-t"
                step={phase === "customize" ? 1 : phase === "details" ? 3 : 4}
                bolsterSkipped={pairedChoice != null && !pairedChoice.bolster}
              />
            ) : null}
          </header>

          <div
            className={cn(
              "grid grid-cols-1 lg:grid-cols-[1fr_460px]",
              phase ? "min-h-[calc(100dvh-100px)]" : "min-h-[calc(100dvh-56px)]",
            )}
          >
            <div
              className={cn(
                "dark relative bg-background text-foreground lg:sticky lg:overflow-hidden",
                phase ? "lg:top-[100px] lg:h-[calc(100dvh-100px)]" : "lg:top-[56px] lg:h-[calc(100dvh-56px)]",
                (phase === "details" || phase === "review") && "max-lg:hidden",
              )}
            >
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
              <div className="relative z-10 flex flex-col p-4 max-md:px-3 lg:absolute lg:inset-0 lg:overflow-y-auto lg:overscroll-contain">
                <div
                  className={cn(
                    "my-auto w-full",
                    staffAssist && wideStage && "grid grid-cols-[20rem_minmax(0,1fr)] items-start gap-6",
                  )}
                >
                  {staffAssist && wideStage && (
                    <XraySectionDock
                      dived={divedSection}
                      onSlot={setSideSlot}
                      className={cn(
                        "sticky top-0 flex",
                        phase ? "max-h-[calc(100dvh-100px-2rem)]" : "max-h-[calc(100dvh-56px-2rem)]",
                        STAGE_PANEL_CLASS,
                      )}
                    />
                  )}
                  <div className="flex min-w-0 flex-col items-center gap-4 md:gap-6">
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
                        suggestedTemplateId={size === suggestedSize ? suggestedTemplateId : null}
                        sessionFillingTemplateId={sessionFillingTemplateId}
                        onApplySizeTier={applyAssistSizeTier}
                        onItemsChange={setAssistItems}
                        onColorOverridesChange={setAssistColorOverrides}
                        onDimensionOverridesChange={setAssistDimensionOverrides}
                        className={cn(STAGE_BLOCK_CLASS, "md:w-full")}
                      />
                    ) : null}
                    <div
                      className={cn("relative", STAGE_BLOCK_CLASS)}
                      style={{ aspectRatio: "664 / 374", ...xrayColorVars }}
                    >
                      <svg
                        className={cn(
                          "absolute inset-0 pointer-events-none",
                          xrayVisible && "opacity-80 saturate-50",
                        )}
                        viewBox="0 0 664 374"
                        xmlns="http://www.w3.org/2000/svg"
                        preserveAspectRatio="xMidYMid meet"
                      >
                        <path d={pillowPath(size)} fill="white" />
                        {selectedOverlay?.color && (
                          <path d={pillowPath(size)} fill={selectedOverlay.color} />
                        )}
                        {selectedOverlay?.url && (
                          <>
                            <defs>
                              <clipPath id="mp-config-overlay-clip">
                                <path d={pillowPath(size)} />
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
                          d={pillowPath(size)}
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
                          itemDims={staffAssist ? assistItemDims : guestItemDims}
                          pillowSize={pillowDimensions(size).dims.size}
                          loftAllowance={staffAssist ? assistRegistry.loftAllowance : guestLoftAllowance}
                          fit={staffAssist ? assistFit : guestFit}
                          onDiveChange={onStageDive}
                          items={staffAssist ? assistItems : undefined}
                          onPlacementsChange={staffAssist ? setAssistPlacements : undefined}
                          controlsSlot={staffAssist ? (wideStage ? sideSlot : inlineSlot) : undefined}
                          softBody={staffAssist ? assistSoftBody : guestSoftBody}
                          className="absolute inset-0"
                        />
                      )}
                      {(shopLoading || suggestionLoading) && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="size-12 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        </div>
                      )}
                    </div>
                    {staffAssist && !wideStage && (
                      <XraySectionDock
                        dived={divedSection}
                        onSlot={setInlineSlot}
                        className={cn(STAGE_BLOCK_CLASS, STAGE_PANEL_CLASS, "max-md:hidden", divedSection ? "flex" : "hidden")}
                      />
                    )}
                    {xrayVisible && (
                      <XrayCrossSection
                        fit={staffAssist ? assistFit : guestFit}
                        itemSubtypes={staffAssist ? assistItemSubtypes : guestItemSubtypes}
                        itemSizes={staffAssist ? assistItemSizes : guestItemSizes}
                        itemDims={staffAssist ? assistItemDims : guestItemDims}
                        cut={cut}
                        onCutChange={staffAssist ? setCut : undefined}
                        placements={staffAssist ? assistPlacements : undefined}
                        onPlacementsChange={staffAssist ? setAssistPlacements : undefined}
                        items={staffAssist ? assistItems : undefined}
                        colorOverrides={assistColorOverrides.length ? assistColorOverrides : shopColorOverrides ?? []}
                        softBody={staffAssist ? assistSoftBody : guestSoftBody}
                        themed={false}
                        className={STAGE_BLOCK_CLASS}
                      />
                    )}
                    {staffAssist && (
                      <section className={cn("space-y-1 rounded-xl border p-3", STAGE_BLOCK_CLASS, STAGE_PANEL_CLASS)}>
                        <div className="text-sm font-medium">Derived pack list</div>
                        <XrayPackList
                          placements={assistPlacements}
                          onPlacementsChange={setAssistPlacements}
                          items={assistItems}
                        />
                      </section>
                    )}
                    {(() => {
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
                      const showTierAdvice =
                        record?.tierSuggestion &&
                        record.tierSuggestion !== (record.soldTier ?? soldTier);
                      return (
                        <>
                          <Badge variant="outline" className="text-xs capitalize text-white">
                            {soldTier} tier
                          </Badge>
                          {showTierAdvice && record?.tierSuggestion ? (
                            <TierSuggestion tier={record.tierSuggestion} />
                          ) : null}
                          {routePending &&
                          record?.flowRoute &&
                          record.flowRoute.targetFlow !== "mbolster" &&
                          !partnerAssisted ? (
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
                            templateName={partnerAssisted ? null : tpl?.name ?? null}
                            mixLines={partnerAssisted ? [] : mixLines}
                          />
                        </>
                      );
                    })()}
                    <SelectedAddonPreviews addons={addons} selectedIds={selectedAddons} />
                    {!staffAssist && !shopRecommendation ? (
                      <p className="max-w-xs text-center text-xs text-white/80">
                        Fillings and protector are chosen by our team after review.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "flex min-h-0 flex-col bg-background lg:border-l",
                phase ? "lg:h-[calc(100dvh-100px)]" : "lg:h-[calc(100dvh-56px)]",
              )}
            >
              <div
                ref={previewPanelRef}
                className={cn("flex-1 space-y-8 overflow-y-auto", configuratorPreviewPadClassName)}
              >
                {partner ? <CoBrandBanner partner={partner} /> : null}
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {staffEdit
                      ? "Edit configuration"
                      : phase === "details"
                        ? "Your details"
                        : phase === "review"
                          ? "Review your order"
                          : "Customize finish"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {staffEdit
                      ? "Change size, tier, fillings, cover, case, add-ons or shipping for this Result. Saving reprices the build — send the customer the new quote with Request payment."
                      : resumeFinish
                        ? "Our team has built your fillings. Choose cover and case, optional add-ons and shipping, then pay to confirm your order."
                        : phase === "customize"
                          ? pairedChoice
                            ? "Choose cover and case, and any add-ons. Your details and a review of your order come next, before you pay."
                            : "Choose cover and case, and any add-ons. A matching Mbolster is next, then your details and a review of your order before you pay."
                          : phase === "details"
                            ? "How to reach you, and where your order goes. You will see a summary of everything before you pay."
                            : phase === "review"
                              ? `Check everything before you pay. You are not charged until you accept the final ${pairedBolster ? "builds" : "build"}.`
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

                {!customizing ? null : shopRecommendation ? (
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
                      coverPreview={{
                        checked: showCoverOnPillow && coverOverlay != null,
                        onCheckedChange: setShowCoverOnPillow,
                        disabled: coverOverlay == null,
                      }}
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

                {customizing && addons.length > 0 && !partnerAssisted && (
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
                    {!staffAssist && addons.some((a) => selectedAddons.has(a.item_id)) ? (
                      <AddonReviewNotice chargedAfterReview={!resumeFinish} />
                    ) : null}
                  </div>
                )}

                {customizing && staffAssist ? (
                  <ConfigImageUpload
                    sessionId={responseId}
                    ensureSessionId={ensureResponseId}
                  />
                ) : null}

                {askingDetails && !resumeFinish && !staffEdit && (
                <PreviewContactFields
                    discoverySourceOptions={discoverySourceOptions}
                    fieldErrors={fieldErrors}
                    values={contactValues}
                    codeContext={codeContext}
                    onCodeStatus={setCodeStatus}
                    formatAmount={money}
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
                      if (patch.code !== undefined) setCheckoutCode(patch.code);
                      if (patch.marketingEmail !== undefined) setMarketingEmail(patch.marketingEmail);
                    }}
                  />
                )}

                {askingDetails && (
                <HoldShippingFields
                  options={shippingOptions}
                  goodsSubtotal={quoteBlocked ? null : basePrice + addonTotal}
                  selectedId={selectedShippingId}
                  onSelect={setSelectedShippingId}
                  address={holdAddress}
                  setAddress={setHoldAddress}
                  errors={fieldErrors}
                  savedAddresses={{
                    signedIn: shippingSignedIn && !(assisted || staffAssist),
                    addresses: savedAddresses,
                    value: selectedAddressId,
                    onValueChange: handleSelectAddress,
                  }}
                  recipientPlaceholder={measurementData.name || "Name"}
                />
                )}

                {phase === "review" ? pairedReview : null}

                {!assisted && !resumeFinish && askingDetails && (
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
                          code: checkoutCode,
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
                            marketingEmail: askedMarketingEmail,
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
                {phase === "details" || phase === "review" ? (
                  <>
                    <div className="mb-1 flex justify-between gap-4 text-sm">
                      <span className="min-w-0 text-muted-foreground">{pairedPillow.label}</span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums">
                        {pillowTotal != null
                          ? money(basePrice + addonTotal)
                          : shopLoading || restoringHoldCancel
                            ? "…"
                            : "Not available"}
                      </span>
                    </div>
                    {pillowTotal != null &&
                      serviceLines.map((l) => (
                        <div key={l.key} className="mb-1 flex justify-between gap-4 text-sm">
                          <span className="min-w-0 text-muted-foreground">{l.label}</span>
                          <span className="shrink-0 whitespace-nowrap tabular-nums">{money(l.msrp)}</span>
                        </div>
                      ))}
                    {pairedBolster ? (
                      <div className="mb-1 flex justify-between gap-4 text-sm">
                        <span className="min-w-0 text-muted-foreground">{pairedBolster.label}</span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">
                          {pairedBolster.ballpark != null
                            ? `${pairedBolster.currency} ${pairedBolster.ballpark.toFixed(2)}`
                            : "Not available"}
                        </span>
                      </div>
                    ) : null}
                    {discountRow}
                    {pillowTotal != null && (
                      <HoldShippingTotalRow
                        option={selectedShippingOption}
                        goodsSubtotal={basePrice + addonTotal}
                        freeShipping={codeFreeShipping}
                      />
                    )}
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {shippingAmount == null ? "Ballpark (before shipping/tax)" : "Total (before tax)"}
                      </span>
                      <span className="font-medium tabular-nums">
                        {orderTotal != null
                          ? money(orderTotal)
                          : shopLoading || restoringHoldCancel
                            ? "…"
                            : "Not available"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {!quoteBlocked &&
                      serviceLines.map((l) => (
                        <div key={l.key} className="mb-1 flex justify-between gap-4 text-sm">
                          <span className="min-w-0 text-muted-foreground">{l.label}</span>
                          <span className="shrink-0 whitespace-nowrap tabular-nums">{`${currency} ${l.msrp.toFixed(2)}`}</span>
                        </div>
                      ))}
                    {phase !== "customize" && discountRow}
                    {!quoteBlocked && phase !== "customize" && (
                      <HoldShippingTotalRow
                        option={selectedShippingOption}
                        goodsSubtotal={basePrice + addonTotal}
                        freeShipping={codeFreeShipping}
                      />
                    )}
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {shippingAmount == null || phase === "customize"
                          ? "Ballpark (before shipping/tax)"
                          : "Total (before tax)"}
                      </span>
                      <span className="font-medium tabular-nums">
                        {quoteBlocked
                          ? "Not available"
                          : `${currency} ${(basePrice + addonTotal + serviceTotal + (phase === "customize" ? 0 : (shippingAmount ?? 0) - codeDiscount)).toFixed(2)}`}
                      </span>
                    </div>
                  </>
                )}
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex gap-3"
                >
                  <Button variant="outline" onClick={backFromPreview} className="flex-1 max-md:flex-none">
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
                </ConfiguratorStepActions>
                {phase === "customize" && !pairedChoice ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSkipMbolster(pairedPillow)}
                    disabled={continueBlocked}
                    className="mt-2 w-full text-muted-foreground"
                  >
                    Skip the Mbolster — just my Mpillow
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {isMobile && (
          <ConfiguratorMobileCloseBar onClose={requestExit} actionsRef={setMobileActionsSlot} />
        )}
      </>
    );
  }

  return (
    <div className="relative min-h-dvh w-full min-w-0 max-w-full overflow-x-clip bg-background">
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
        <ConfiguratorMobileCloseBar onClose={requestExit} actionsRef={setMobileActionsSlot} />
      )}

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
          {currentStep !== "welcome" && (
            <div className="mb-6 flex justify-center">
              <Progress
                value={progressValue}
                aria-label="Configuration progress"
                className="w-full max-w-2xl"
              />
            </div>
          )}

          {currentStep === "welcome" && (
            <div className="flex flex-col items-center justify-center space-y-8 text-center">
              <div className="space-y-4">
                <Image
                  src={LOGO_SRC}
                  unoptimized
                  alt="Mpillow Logo"
                  width={200}
                  height={200}
                  className="mx-auto mb-6"
                  priority
                />
                <div role="heading" aria-level={2} className="text-6xl font-bold tracking-tight leading-tight">
                  Customise{" "}
                  <span className="text-primary">{isBasic ? "Basic Mpillow" : "Mpillow"}</span>
                </div>
                <p className="text-xl text-muted-foreground">
                  {isBasic
                    ? "A quick fit for Basic Mpillow — one measurement, then checkout"
                    : "Let's create your perfect pillow, customized just for you"}
                </p>
              </div>
              {askMeasurer && pickMeasurer && (
                <WhoIsMeasuring profiles={pickMeasurer} chosen={measurer} onChosen={setMeasurer} />
              )}
              <Button
                size="lg"
                onClick={handleStart}
                className="group"
                disabled={askMeasurer && measurer == null}
              >
                Get Started
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
              {studioMeasureFee != null && (
                <p className="text-sm text-muted-foreground">
                  Prefer our team to measure you? Get it customised, adjusted and bring home immediately for
                  SGD {studioMeasureFee.toFixed(2)}.{" "}
                  <Link href={studioMeasureHref} className="font-medium text-foreground underline underline-offset-4">
                    Book here
                  </Link>
                </p>
              )}
            </div>
          )}

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
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold">Tell us about yourself</h3>
                    <p className="text-sm text-muted-foreground">
                      Your name, your age and a few questions about your health and sleep
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold">Take measurements</h3>
                    <p className="text-sm text-muted-foreground">
                      {isBasic
                        ? "We'll guide you through 1 simple measurement"
                        : "We'll guide you through 4 simple measurements"}
                    </p>
                    {studioMeasureFee != null && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Prefer our team to measure you? Get it customised, adjusted and bring home immediately for
                        SGD {studioMeasureFee.toFixed(2)}.{" "}
                        <Link href={studioMeasureHref} className="font-medium text-foreground underline underline-offset-4">
                          Book here
                        </Link>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold">Add photos</h3>
                    <p className="text-sm text-muted-foreground">
                      A front and a side photo of you, if you&apos;d like
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    4
                  </div>
                  <div>
                    <h3 className="font-semibold">See your results</h3>
                    <p className="text-sm text-muted-foreground">
                      Get your personalized pillow recommendation
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={goToNextStep}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </ConfiguratorStepActions>
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

          {currentStep === "name" && (
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
              <div className="text-center space-y-2">
                <User className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">
                  {forSomeoneElse ? "Tell us about them" : "Tell us about yourself"}
                </h2>
                <p className="text-muted-foreground">
                  {forSomeoneElse
                    ? "Answer each question as the person this pillow is for"
                    : "Let's personalize your experience"}
                </p>
              </div>

              <div className="space-y-4">
                {askPillowFor ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      You already have an Mpillow. Who is this one for?
                    </div>
                    <SingleSelectOptionRows
                      options={PILLOW_FOR_OPTIONS}
                      value={measurementData.pillowFor ?? ""}
                      onChange={(v) => choosePillowFor(v as PillowFor)}
                      invalid={!!fieldErrors.pillowFor}
                      error={fieldErrors.pillowFor}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <label htmlFor="mp-name" className="text-sm font-medium">
                    {forSomeoneElse ? "What's their name?" : "What's your name?"}
                  </label>
                  <Input
                    id="mp-name"
                    placeholder={forSomeoneElse ? "Enter their name" : "Enter your name"}
                    value={measurementData.name}
                    onChange={(e) => updateMeasurement("name", e.target.value)}
                    className="text-lg h-12"
                    autoFocus={!askPillowFor}
                    aria-invalid={!!fieldErrors.name}
                  />
                  {fieldErrors.name ? (
                    <p className="text-sm text-destructive">{fieldErrors.name}</p>
                  ) : null}
                </div>
                {emailFirst ? (
                  <div className="space-y-2" data-typography-scope="app">
                    <label htmlFor="mp-email" className="text-sm font-medium">
                      What&apos;s your email?
                    </label>
                    <Input
                      id="mp-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={holdEmail}
                      onChange={(e) => setHoldEmail(e.target.value)}
                      className="text-lg h-12"
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby="mp-email-why"
                    />
                    {fieldErrors.email ? (
                      <p className="text-sm text-destructive">{fieldErrors.email}</p>
                    ) : null}
                    <p id="mp-email-why" className="text-sm text-muted-foreground">
                      We&apos;ll save your measurement results to this email, so you can
                      decide on your pillow later.
                    </p>
                    <label className="flex items-start gap-2 pt-1 text-sm text-muted-foreground">
                      <Checkbox
                        id="mp-marketing-email"
                        className="mt-0.5"
                        checked={marketingEmail}
                        onCheckedChange={(checked) => setMarketingEmail(checked === true)}
                      />
                      {MARKETING_BOX_LABEL}
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() =>
                      tryAdvance(nameFields, emailFirst ? saveFirstEmailThenContinue : goToNextStep)
                    }
                    disabled={!hybridCtaEnabled(nameFields) || savingFirstEmail}
                  >
                    {savingFirstEmail ? "Saving…" : "Continue"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </ConfiguratorStepActions>
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

          {currentStep === "age" && (
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
              <div className="text-center space-y-2">
                <Cake className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">
                  {forSomeoneElse
                    ? measurementData.name ? `A little about ${measurementData.name}` : "A little about them"
                    : measurementData.name ? `Nice to meet you, ${measurementData.name}` : "A little about you"}
                </h2>
                <p className="text-muted-foreground">
                  {forSomeoneElse ? "How old are they?" : "How old are you?"}
                </p>
              </div>

              <div className="space-y-4">
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
              </div>

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => tryAdvance(ageFields, goToNextStep)}
                    disabled={!hybridCtaEnabled(ageFields)}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </ConfiguratorStepActions>
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

          {currentStep === "health" && (
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
              <div className="text-center space-y-2">
                <HeartPulse className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">Your health &amp; sleep</h2>
                <p className="text-muted-foreground">A few quick questions before we measure</p>
              </div>

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

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => tryAdvance(healthFields, goToNextStep)}
                    disabled={!hybridCtaEnabled(healthFields)}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </ConfiguratorStepActions>
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

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
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
                </ConfiguratorStepActions>
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

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
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
                </ConfiguratorStepActions>
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

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
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
                </ConfiguratorStepActions>
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

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between"
                >
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() =>
                      tryAdvance(measureField("neckLength"), () => {
                        commitMeasureDraft("neckLength");
                        if (upsoldToPremium && !stepOrder.includes("photos")) {
                          void finishPostUpsell();
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
                </ConfiguratorStepActions>
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

          {currentStep === "photos" && (
            <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
              <div className="text-center space-y-2">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
                <h2 className="text-3xl font-bold">
                  Great job{measurementData.name ? `, ${measurementData.name}` : ""}!
                </h2>
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
                          Follow these examples for clear front and side view photos. Each photo is
                          checked automatically before it&apos;s saved.
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
                        {photoUploading.front ? "Checking photo…" : photoDataUrls.front ? "Retake" : "Take photo"}
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
                    {photoProblems.front && (
                      <p role="alert" className="text-sm text-destructive">
                        {photoProblems.front}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border bg-background/60 p-3 space-y-3">
                    <div className="text-sm font-medium">Side view photo</div>

                    <div className="relative overflow-hidden rounded-md border bg-background/40 aspect-[4/3]">
                      {photoDataUrls.side ? (
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
                        {photoUploading.side ? "Checking photo…" : photoDataUrls.side ? "Retake" : "Take photo"}
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
                    {photoProblems.side && (
                      <p role="alert" className="text-sm text-destructive">
                        {photoProblems.side}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {assisted && (
                <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-lg">Your contact details</h4>
                  <p className="text-sm text-muted-foreground">
                    Our build team will send your finished fillings here. You choose your cover,
                    case and shipping after that — nothing is charged now.
                  </p>
                  <PreviewContactFields
                    discoverySourceOptions={discoverySourceOptions}
                    fieldErrors={fieldErrors}
                    values={contactValues}
                    codeContext={NO_ORDER_CODE_CONTEXT}
                    onCodeStatus={setCodeStatus}
                    formatAmount={(amount) => `SGD ${amount.toFixed(2)}`}
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
                      if (patch.code !== undefined) setCheckoutCode(patch.code);
                      if (patch.marketingEmail !== undefined) setMarketingEmail(patch.marketingEmail);
                    }}
                  />
                </div>
              )}

              <div className="pt-4 empty:hidden">
                <ConfiguratorStepActions
                  mobile={isMobile}
                  slot={mobileActionsSlot}
                  className="flex justify-between gap-3"
                >
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() =>
                      assisted
                        ? handleSendToBuildTeam()
                        : tryAdvance([], async () => {
                            await upsertToDb();
                            if (upsoldToPremium) {
                              await finishPostUpsell();
                              return;
                            }
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
                      photoUploading.front ||
                      photoUploading.side ||
                      shopLoading ||
                      holdSubmitting
                    }
                    size="lg"
                    className="group"
                  >
                    <Sparkles className={cn("mr-2 h-5 w-5", assisted && "max-md:hidden")} />
                    {holdSubmitting
                      ? "Sending…"
                      : assisted
                        ? holdCtaLabel(false, assisted)
                        : isBasic ? "Continue" : "Customise"}
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </ConfiguratorStepActions>
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
