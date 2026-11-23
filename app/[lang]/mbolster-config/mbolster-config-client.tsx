"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { MbolsterLearnMoreSlideIn } from "@/components/slide-in-pages/mbolster-learn-more-slide-in";
import { ArrowLeft, ArrowRight, Info, X } from "lucide-react";
import Link from "next/link";

import { getApiErrorMessage, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Particles } from "@/components/ui/particles";
import { DotPattern } from "@/components/ui/shadcn-io/dot-pattern";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ConfiguratorExitDialog,
  ConfiguratorMobileCloseBar,
  ConfiguratorStepActions,
  configuratorCardPadClassName,
  configuratorMobileCloseClearanceClassName,
  configuratorPreviewPadClassName,
  configuratorStickyHeaderClassName,
} from "@/components/configurator/configurator-mobile-chrome";
import { PageFaqAccordion } from "@/components/page-faq/page-faq-accordion";
import type { PageFaqSectionItem } from "@/components/page-faq/page-faq-section";
import {
  HOLD_CANCELLED_NOTICE,
  clearHoldCancelDraft,
  isHoldCancelledQuery,
  readHoldCancelDraft,
  shouldRestorePreview,
  stripHoldCancelledFromSearch,
  writeHoldCancelDraft,
} from "@/lib/configurator/hold-cancel-restore";
import {
  buildFieldErrorMap,
  hybridCtaEnabled,
  isNonEmptyString,
  pruneFieldErrors,
  type FieldCheck,
} from "@/lib/configurator/step-validation";
import {
  PreviewContactFields,
  previewContactFieldChecks,
  type DiscoverySourceChoice,
} from "@/components/configurator/preview-contact-fields";
import {
  checkoutCodeDiscount,
  checkoutCodeFreeShipping,
  checkoutCodeToSend,
  type CheckoutCodeContext,
  type CheckoutCodeStatus,
} from "@/lib/checkout-code/shared";
import { ConfigImageUpload } from "@/components/configurator/config-image-upload";
import {
  AddonOptionButton,
  AddonReviewNotice,
  SelectedAddonPreviews,
  type AddonOption,
} from "@/components/configurator/addon-cards";
import { CoBrandBanner } from "@/components/configurator/co-brand-banner";
import { keepOfferedAddons } from "@/lib/results/addons";
import {
  holdCtaLabel,
  isPreOrder,
  preferenceStockFor,
  preOrderWaitingCopy,
} from "@/lib/configurator/pre-order-trigger";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import {
  type RecommendationResponseData,
  CustomizationStepComponents,
} from "@/components/shop/customization-steps";
import { RecommendationReveal } from "@/components/rules-engine/recommendation-reveal";
import { UpsellCard } from "@/components/rules-engine/upsell-card";
import { TierSuggestion } from "@/components/rules-engine/tier-suggestion";
import {
  FLOW_ROUTE_EXPECTATION,
  assertPreStripeRouteResolved,
  carryOverAnswers,
  inputsFromBolsterHeight,
  isFlowRoutePending,
  missingStepsAfterCarryOver,
  parseRecommendationRecord,
  shouldRevealRecommendation,
  withJourneyOnAccept,
  withJourneyOnDecline,
  type RecommendationRecord,
  type RuleFlow,
} from "@/lib/rules-engine";
import { overlayFrame } from "@/lib/product-builder/overlays";
import { previewMixMode } from "@/lib/rules-engine/preview-xray";
import { XrayBolster } from "@/components/spatial/xray-bolster";
import { XraySectionDock } from "@/components/spatial/xray-section-dock";
import { BolsterCrossSection } from "@/components/spatial/xray-cross-section";
import { confirmSaveWithBolsterFit } from "@/components/spatial/xray-fit-banner";
import { fitBolster } from "@/lib/spatial-fillings/fit";
import { fillingDescriptor } from "@/lib/spatial-fillings/filling-groups";
import { bolsterCapsulePath } from "@/components/spatial/xray-assets";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import {
  bolsterPlacementsToRows,
  rowsToBolsterPlacements,
  type BolsterPlacement,
  type BolsterPlacementRow,
} from "@/lib/spatial-fillings/core";
import {
  xrayColorVarStyle,
  type ColorOverrideRow,
} from "@/lib/spatial-fillings/color-overrides";
import { resolveItemDims } from "@/lib/spatial-fillings/dimension-overrides";
import {
  useSavedShippingPrefill,
  type HoldShippingAddress,
} from "@/components/shop/saved-address-select";
import {
  HOLD_SHIPPING_METHODS_PATH,
  HoldShippingFields,
  holdShippingAmount,
  holdShippingCheck,
  HoldShippingTotalRow,
  isSelfCollectMethod,
  useHoldShippingQuote,
  type HoldShippingMethod,
  type HoldShippingMethods,
} from "@/components/shop/hold-shipping-fields";
import { usesPostalCode } from "@/lib/shipping/countries";
import type { PackageType } from "@/lib/shipping/types";
import {
  displayHeight,
  normalizeHeightDraft,
  type HeightUnit,
} from "@/lib/configurator/height-draft";
import { soleCaseId } from "@/lib/configurator/preference-policy";
import { StaffAssistBolsterPanel } from "@/components/configurator/staff-assist-bolster-panel";
import { PairedStepperBar } from "@/components/configurator/paired-stepper";
import {
  clearPairedHandoff,
  pairedDetailsPath,
  pairedPillowRows,
  readPairedHandoff,
  writePairedHandoff,
  type PairedBolsterAnswers,
  type PairedChoice,
  type PairedHandoff,
} from "@/lib/configurator/paired-mbolster";
import { sessionTemplateId, type LoadedTemplate } from "@/lib/configurator/staff-assist";
import {
  bolsterAssistDraft,
  restoreBolsterAssist,
  type BolsterAssistDraft,
} from "@/lib/configurator/staff-assist-draft";
import { trackGaEventThen } from "@/lib/analytics/ga-events";
import { resultServiceLines, sumServiceLines, type ServiceLine } from "@/lib/pricing/service-lines";
import type { ServiceFees } from "@/lib/pricing/service-prices";

type Step = "welcome" | "height" | "sleep-position" | "recommendation" | "preview";
type SleepPosition = "side" | "stomach" | "other";
type BolsterLength = "short" | "medium" | "long";

type ShopRecommendationData = Omit<
  RecommendationResponseData,
  "templates" | "available_fillings"
> & {
  templates: (RecommendationResponseData["templates"][number] & {
    placements?: BolsterPlacementRow[];
  })[];
  available_fillings: (RecommendationResponseData["available_fillings"][number] & {
    size?: string | null;
  })[];
  color_overrides?: ColorOverrideRow[];
};

type State = {
  step: Step;
  heightUnit: HeightUnit;
  heightCm: string;
  sleepPosition: SleepPosition | null;
};

const STORAGE_KEY = "mbolster_config_v4";
const CONFIG_SESSION_KEY = "mbolster_config_session_id";
const FLOW_ROUTE_HANDOFF_KEY = "mp_flow_route_handoff";

const FLOW_UI_LABEL: Record<RuleFlow, string> = {
  "basic-mpillow": "Basic Mpillow",
  "premium-mpillow": "Premium Mpillow",
  mbolster: "Mbolster",
};

const DEFAULT_BOLSTER_LENGTH: BolsterLength = "medium";
const SHIPS_AS_MBOLSTER: PackageType[] = ["bolster"];

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function labelForSleepPosition(v: SleepPosition): string {
  if (v === "side") return "Side sleeper";
  if (v === "stomach") return "Stomach sleeper";
  return "Other / mixed";
}

function normalizeStep(step: unknown): Step | null {
  if (step === "components" || step === "purchase") return "preview";
  if (
    step === "welcome" ||
    step === "height" ||
    step === "sleep-position" ||
    step === "recommendation" ||
    step === "preview"
  ) {
    return step;
  }
  return null;
}

function pairedHandoffOnPage(): PairedHandoff | null {
  if (typeof window === "undefined") return null;
  if (new URLSearchParams(window.location.search).get("paired") !== "1") return null;
  return readPairedHandoff(window.sessionStorage);
}

const STEP_ORDER: Step[] = [
  "welcome",
  "height",
  "sleep-position",
  "recommendation",
  "preview",
];

function stepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

type MbolsterConfigInfo = {
  h1: string;
  lede: string;
  faqTitle: string | null;
  faqItems: PageFaqSectionItem[];
};

const FAQ_VIEW_ALL: Record<Locale, string> = {
  "en-US": "View all FAQs",
  "zh-CN": "查看全部常见问题",
};

export function MbolsterConfigClient({
  info,
  staffAssist = false,
  partner = null,
  servicePrices = null,
  measuredByStaff = false,
  discoverySourceOptions,
}: {
  info: MbolsterConfigInfo;
  discoverySourceOptions: DiscoverySourceChoice[];
  servicePrices?: ServiceFees | null;
  measuredByStaff?: boolean;
  staffAssist?: boolean;
  partner?: {
    code: string;
    name: string;
    logoUrl: string | null;
    description: string | null;
  } | null;
}) {
  const partnerAssisted = Boolean(partner);
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);
  const to = (href: string) => withLocale(href, locale);
  const isMobile = useIsMobile();
  const [compartmentSlot, setCompartmentSlot] = React.useState<HTMLElement | null>(null);
  const [mobileActionsSlot, setMobileActionsSlot] = React.useState<HTMLDivElement | null>(null);
  const [exitDialogOpen, setExitDialogOpen] = React.useState(false);
  const [restoringHoldCancel, setRestoringHoldCancel] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [state, setState] = React.useState<State>({
    step: "welcome",
    heightUnit: "in",
    heightCm: "",
    sleepPosition: null,
  });
  const [heightDraft, setHeightDraft] = React.useState("");
  const [paired, setPaired] = React.useState<PairedHandoff | null>(null);
  const reopenPairedPreviewRef = React.useRef(false);

  const [shopRecommendation, setShopRecommendation] =
    React.useState<ShopRecommendationData | null>(null);
  const [shopLoading, setShopLoading] = React.useState(false);
  const [selectedCase, setSelectedCase] = React.useState<number | null>(null);
  const [selectedAddons, setSelectedAddons] = React.useState<Set<number>>(new Set());
  const [addons, setAddons] = React.useState<AddonOption[]>([]);
  const [holdEmail, setHoldEmail] = React.useState("");
  const [holdPhone, setHoldPhone] = React.useState("");
  const [discoverySource, setDiscoverySource] = React.useState("");
  const [discoverySourceOther, setDiscoverySourceOther] = React.useState("");
  const [checkoutCode, setCheckoutCode] = React.useState("");
  const [codeStatus, setCodeStatus] = React.useState<CheckoutCodeStatus>({ state: "idle" });
  const [holdNotes, setHoldNotes] = React.useState("");
  const [marketingEmail, setMarketingEmail] = React.useState(true);
  const [holdAddress, setHoldAddress] = React.useState<HoldShippingAddress>({
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    postal_code: "",
    country: "SG",
  });
  const {
    signedIn: shippingSignedIn,
    savedAddresses,
    selectedAddressId,
    handleSelectAddress,
  } = useSavedShippingPrefill(setHoldEmail, setHoldAddress);
  const [shippingMethods, setShippingMethods] = React.useState<HoldShippingMethods>({ country: "", rows: [] });
  const [selectedShippingId, setSelectedShippingId] = React.useState("");
  const {
    options: shippingOptions,
    selected: selectedShippingOption,
    loading: shippingLoading,
  } = useHoldShippingQuote({
    methods: shippingMethods,
    address: holdAddress,
    parcelTypes: SHIPS_AS_MBOLSTER,
    selectedId: selectedShippingId,
    onSelect: setSelectedShippingId,
  });
  const selfCollect = isSelfCollectMethod(selectedShippingOption?.method);
  const shippingStatus = selectedShippingOption?.status;
  const [holdSubmitting, setHoldSubmitting] = React.useState(false);
  const [routeBusy, setRouteBusy] = React.useState(false);
  const [configSessionId, setConfigSessionId] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setConfigSessionId(window.localStorage.getItem(CONFIG_SESSION_KEY));
    } catch {}
  }, []);
  const ensureConfigSessionId = React.useCallback(() => {
    if (configSessionId) return configSessionId;
    if (typeof window === "undefined") return null;
    const id = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    try {
      window.localStorage.setItem(CONFIG_SESSION_KEY, id);
    } catch {}
    setConfigSessionId(id);
    return id;
  }, [configSessionId]);

  const patchRecommendationRecord = React.useCallback((next: RecommendationRecord) => {
    setShopRecommendation((prev) =>
      prev ? { ...prev, recommendation_record: next } : prev,
    );
  }, []);

  const shopCurrency = shopRecommendation?.variant?.currency ?? "SGD";
  const shopBasePrice = shopRecommendation?.variant?.price ?? 0;
  const suggestedLength = (shopRecommendation?.bolster_variant ?? null) as BolsterLength | null;

  const [assistPlacements, setAssistPlacements] = React.useState<BolsterPlacement[]>([]);
  const [assistLoadedTemplate, setAssistLoadedTemplate] = React.useState<LoadedTemplate | null>(null);
  const [assistItems, setAssistItems] = React.useState<FillingItem[]>([]);
  const [assistColorOverrides, setAssistColorOverrides] = React.useState<ColorOverrideRow[]>([]);
  const assistItemSubtypes = React.useMemo(
    () => new Map(assistItems.map((i) => [i.id, fillingDescriptor(i)])),
    [assistItems],
  );
  const assistItemSizes = React.useMemo(
    () => new Map(assistItems.map((i) => [i.id, i.size])),
    [assistItems],
  );
  const assistItemDims = React.useMemo(() => resolveItemDims(assistItems), [assistItems]);
  const assistBolsterFit = React.useMemo(
    () => fitBolster(assistPlacements, suggestedLength ?? DEFAULT_BOLSTER_LENGTH, { dims: assistItemDims }),
    [assistPlacements, suggestedLength, assistItemDims],
  );
  const shopColorOverrides = shopRecommendation?.color_overrides;
  const xrayColorVars = React.useMemo(
    () =>
      xrayColorVarStyle(
        assistColorOverrides.length ? assistColorOverrides : (shopColorOverrides ?? []),
      ),
    [assistColorOverrides, shopColorOverrides],
  );
  const sessionFillingTemplateId = React.useMemo(
    () => sessionTemplateId(assistLoadedTemplate, assistPlacements),
    [assistLoadedTemplate, assistPlacements],
  );
  const [assistLength, setAssistLength] = React.useState(suggestedLength);
  if (assistLength !== suggestedLength) {
    setAssistLength(suggestedLength);
    setAssistPlacements([]);
    setAssistLoadedTemplate(null);
  }

  const previewRecord = parseRecommendationRecord(
    shopRecommendation?.recommendation_record ?? null,
  );
  const routePending = Boolean(previewRecord && isFlowRoutePending(previewRecord));
  const revealNow = shouldRevealRecommendation({
    requiredInputsComplete: Boolean(shopRecommendation && suggestedLength),
    flowRouteUnresolved: routePending,
  });
  const recommendedTemplate = shopRecommendation?.templates?.find(
    (t) => String(t.id) === String(previewRecord?.templateId),
  );
  const guestPlacements = rowsToBolsterPlacements(recommendedTemplate?.placements ?? []);
  const seededLengthRef = React.useRef<string | null>(null);
  const restoreAssistRef = React.useRef<BolsterAssistDraft | null>(null);
  React.useEffect(() => {
    if (!staffAssist || !suggestedLength) return;
    if (assistLoadedTemplate || assistPlacements.length > 0) return;
    if (seededLengthRef.current === suggestedLength) return;
    const restored = restoreBolsterAssist(restoreAssistRef.current, suggestedLength);
    if (restored) {
      seededLengthRef.current = suggestedLength;
      restoreAssistRef.current = null;
      setAssistLoadedTemplate(restored.loadedTemplate);
      setAssistPlacements(restored.placements);
      return;
    }
    if (!recommendedTemplate) return;
    seededLengthRef.current = suggestedLength;
    const placements = rowsToBolsterPlacements(recommendedTemplate.placements ?? []);
    setAssistLoadedTemplate({ id: Number(recommendedTemplate.id), placements });
    setAssistPlacements(placements);
  }, [staffAssist, suggestedLength, recommendedTemplate, assistLoadedTemplate, assistPlacements.length]);
  const guestItemSubtypes = new Map(
    (shopRecommendation?.available_fillings ?? []).map((f) => [f.item_id, fillingDescriptor(f) || null]),
  );
  const guestItemSizes = new Map(
    (shopRecommendation?.available_fillings ?? []).map((f) => [f.item_id, f.size ?? null]),
  );
  const guestItemDims = resolveItemDims(
    (shopRecommendation?.available_fillings ?? []).map((f) => ({ id: f.item_id, name: f.name, subtype: f.subtype ?? null, size: f.size ?? null })),
  );
  const guestBolsterFit = fitBolster(guestPlacements, suggestedLength ?? DEFAULT_BOLSTER_LENGTH, { dims: guestItemDims });
  const guestXray =
    !partnerAssisted && revealNow && previewMixMode(recommendedTemplate?.placements) === "xray";
  const xrayVisible = staffAssist || guestXray;

  const addonTotal = React.useMemo(() => {
    let sum = 0;
    for (const a of addons) {
      if (selectedAddons.has(a.item_id)) sum += a.msrp;
    }
    return sum;
  }, [addons, selectedAddons]);

  const serviceLines = React.useMemo<ServiceLine[] | null>(() => {
    try {
      return resultServiceLines(
        { measured_by_type: measuredByStaff ? "staff" : "by_user", product_type: "bolster" },
        servicePrices,
      );
    } catch {
      return null;
    }
  }, [measuredByStaff, servicePrices]);

  React.useEffect(() => {
    const handoff = pairedHandoffOnPage();
    if (handoff) {
      const heightUnit = (handoff.bolster?.heightUnit as HeightUnit | undefined) ?? "in";
      const heightCm = handoff.bolster?.heightCm ?? "";
      const { choice, ...open } = handoff;
      setPaired(open);
      try {
        writePairedHandoff(window.sessionStorage, open);
      } catch {}
      reopenPairedPreviewRef.current = Boolean(choice?.bolster && heightCm);
      restoreAssistRef.current = handoff.bolster?.assist ?? null;
      setConfigSessionId(handoff.companionId);
      setState({ step: "height", heightUnit, heightCm, sleepPosition: handoff.sleepPosition });
      setHeightDraft(displayHeight(heightUnit, heightCm));
      if (handoff.bolster?.caseId != null) setSelectedCase(handoff.bolster.caseId);
      if (handoff.bolster?.addonIds) setSelectedAddons(new Set(handoff.bolster.addonIds));
      return;
    }
    let hydratedStep: Step | null = null;
    try {
      const raw =
        window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem("mbolster_config_v3");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State> | null;
        if (parsed) {
          const step = normalizeStep(parsed.step);
          const heightUnit = (parsed.heightUnit as HeightUnit) ?? "in";
          const heightCm = typeof parsed.heightCm === "string" ? parsed.heightCm : "";
          hydratedStep = step;
          setState((prev) => ({
            ...prev,
            step: step ?? prev.step,
            heightUnit,
            heightCm,
            sleepPosition: (parsed.sleepPosition as SleepPosition) ?? prev.sleepPosition,
          }));
          setHeightDraft(displayHeight(heightUnit, heightCm));
        }
      }
    } catch {}

    const holdCancelled = isHoldCancelledQuery(window.location.search);
    const draft = readHoldCancelDraft(window.localStorage, "mbolster");
    const draftStep = draft?.step ?? (hydratedStep === "preview" ? "preview" : null);
    if (shouldRestorePreview({ holdCancelled, draftStep })) {
      if (draft) {
        setState((s) => ({
          ...s,
          step: "preview",
          heightUnit: draft.heightUnit ?? s.heightUnit,
          heightCm: draft.heightCm ?? s.heightCm,
          sleepPosition: draft.sleepPosition !== undefined ? draft.sleepPosition : s.sleepPosition,
        }));
        if (draft.heightCm) {
          setHeightDraft(displayHeight(draft.heightUnit ?? "in", draft.heightCm));
        }
        const sel = draft.selections;
        setSelectedCase(sel.selectedCase);
        setSelectedAddons(new Set(sel.selectedAddons));
        setSelectedShippingId(sel.selectedShippingId);
        if (sel.holdEmail) setHoldEmail(sel.holdEmail);
        if (sel.holdPhone) setHoldPhone(sel.holdPhone);
        if (sel.discoverySource) setDiscoverySource(sel.discoverySource);
        if (sel.discoverySourceOther) setDiscoverySourceOther(sel.discoverySourceOther);
        if (sel.notes) setHoldNotes(sel.notes);
        setHoldAddress(sel.holdAddress);
        if (holdCancelled && draft.responseId) {
          try {
            window.localStorage.setItem(CONFIG_SESSION_KEY, draft.responseId);
          } catch {}
          setConfigSessionId(draft.responseId);
        }
      } else {
        setState((s) => ({ ...s, step: "preview" }));
      }
      setRestoringHoldCancel(true);
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
  }, []);

  React.useEffect(() => {
    if (pairedHandoffOnPage()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const pairedAnswers = React.useMemo((): PairedBolsterAnswers => {
    const assist = !staffAssist
      ? undefined
      : suggestedLength && (assistLoadedTemplate || assistPlacements.length > 0)
        ? bolsterAssistDraft(suggestedLength, assistPlacements, assistLoadedTemplate)
        : paired?.bolster?.assist;
    return {
      heightUnit: state.heightUnit,
      heightCm: state.heightCm,
      caseId: selectedCase,
      addonIds: [...selectedAddons],
      ...(assist ? { assist } : {}),
    };
  }, [
    staffAssist,
    suggestedLength,
    assistLoadedTemplate,
    assistPlacements,
    paired,
    state.heightUnit,
    state.heightCm,
    selectedCase,
    selectedAddons,
  ]);

  React.useEffect(() => {
    if (!paired) return;
    try {
      writePairedHandoff(window.sessionStorage, { ...paired, bolster: pairedAnswers });
    } catch {}
  }, [paired, pairedAnswers]);

  React.useEffect(() => {
    if (state.step !== "preview" || paired) return;
    try {
      writeHoldCancelDraft(window.localStorage, {
        v: 1,
        surface: "mbolster",
        step: "preview",
        responseId: configSessionId,
        heightUnit: state.heightUnit,
        heightCm: state.heightCm,
        sleepPosition: state.sleepPosition,
        selections: {
          selectedCover: null,
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
    } catch {}
  }, [
    state.step,
    state.heightUnit,
    state.heightCm,
    state.sleepPosition,
    selectedCase,
    selectedAddons,
    selectedShippingId,
    holdEmail,
    holdPhone,
    discoverySource,
    discoverySourceOther,
    holdNotes,
    holdAddress,
    configSessionId,
    paired,
  ]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const shouldHideDock = state.step !== "welcome";
    document.body.classList.toggle("dock-hidden", shouldHideDock);
    return () => {
      document.body.classList.remove("dock-hidden");
    };
  }, [state.step]);

  const heightNum = toNumber(state.heightCm);

  const heightFields = React.useMemo((): FieldCheck[] => [
    {
      key: "heightCm",
      touched: heightDraft.trim() !== "",
      valid: normalizeHeightDraft(state.heightUnit, heightDraft) !== null,
      message: "Enter a height between 80 and 250 cm",
    },
  ], [heightDraft, state.heightUnit]);

  const sleepFields = React.useMemo((): FieldCheck[] => [
    {
      key: "sleepPosition",
      touched: state.sleepPosition != null,
      valid: state.sleepPosition != null,
      message: "Select a sleep position",
    },
  ], [state.sleepPosition]);

  const holdFields = React.useMemo((): FieldCheck[] => [
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

  const pairedFields = React.useMemo(
    (): FieldCheck[] => holdFields.filter((f) => f.key === "case"),
    [holdFields],
  );

  const activeFields = React.useMemo((): FieldCheck[] => {
    switch (state.step) {
      case "height":
        return heightFields;
      case "sleep-position":
        return sleepFields;
      case "preview":
        return paired ? pairedFields : holdFields;
      default:
        return [];
    }
  }, [state.step, heightFields, sleepFields, holdFields, pairedFields, paired]);

  const [errorsStep, setErrorsStep] = React.useState(state.step);
  if (errorsStep !== state.step) {
    setErrorsStep(state.step);
    setFieldErrors({});
  }
  const [errorsPrunedFor, setErrorsPrunedFor] = React.useState(activeFields);
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
      heightUnit: "in",
      heightCm: "",
      sleepPosition: null,
    });
    setHeightDraft("");
    setShopRecommendation(null);
    setSelectedCase(null);
    setSelectedAddons(new Set());
    setAddons([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem("mbolster_config_v3");
      clearHoldCancelDraft(window.localStorage, "mbolster");
    } catch {}
  };

  const confirmExit = () => {
    toast.message("Exit configuration?", {
      description: "This will clear your session and return home.",
      action: {
        label: "Exit",
        onClick: () => exitConfirmed(),
      },
      cancel: "Stay",
      id: "mbolster-config-exit",
    });
  };

  const exitConfirmed = () => {
    if (paired) {
      try {
        clearPairedHandoff(window.sessionStorage);
      } catch {}
    } else {
      reset();
    }
    router.push(homeHref);
  };

  const requestExit = () => {
    if (isMobile) setExitDialogOpen(true);
    else confirmExit();
  };

  const fetchBolsterRecommendation = React.useCallback(async (opts?: {
    preserveSelections?: boolean;
    stayOnStep?: boolean;
    heightCm?: number;
    nextStep?: Step;
  }) => {
    const height = opts?.heightCm ?? heightNum;
    if (!height) return;
    setShopLoading(true);
    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "ballpark",
          bolster_preferences: {
            height_cm: height,
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

      const data: ShopRecommendationData = await res.json();
      setShopRecommendation(data);

      if (!opts?.preserveSelections) {
        setSelectedCase(soleCaseId(data.components.cases));
      } else {
        setSelectedCase((prev) =>
          data.components.cases.some((c) => c.item_id === prev)
            ? prev
            : soleCaseId(data.components.cases),
        );
      }

      if (!opts?.stayOnStep) {
        setState((s) => ({ ...s, step: opts?.nextStep ?? "recommendation" }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get recommendation");
    } finally {
      setShopLoading(false);
    }
  }, [heightNum, state.sleepPosition]);

  React.useEffect(() => {
    if (!restoringHoldCancel || state.step !== "preview") return;
    if (!heightNum || !state.sleepPosition) {
      setRestoringHoldCancel(false);
      return;
    }
    let cancelled = false;
    (async () => {
      await fetchBolsterRecommendation({ preserveSelections: true, stayOnStep: true });
      if (!cancelled) setRestoringHoldCancel(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    restoringHoldCancel,
    state.step,
    state.sleepPosition,
    heightNum,
    fetchBolsterRecommendation,
  ]);

  React.useEffect(() => {
    if (!reopenPairedPreviewRef.current || !paired || !heightNum) return;
    reopenPairedPreviewRef.current = false;
    void fetchBolsterRecommendation({ heightCm: heightNum, preserveSelections: true, nextStep: "preview" });
  }, [paired, heightNum, fetchBolsterRecommendation]);

  React.useEffect(() => {
    if (state.step !== "preview") return;

    let cancelled = false;
    const stale = () => {
      cancelled = true;
    };
    if (!partnerAssisted) {
      const length = shopRecommendation?.bolster_variant ?? "";
      const qs = new URLSearchParams({ productType: "bolster" });
      if (length) qs.set("length", length);
      fetch(`/api/results/addons?${qs.toString()}`)
        .then((r) => r.json())
        .then((d: { addons?: typeof addons }) => {
          if (cancelled) return;
          const list = d.addons ?? [];
          setAddons(list);
          setSelectedAddons((prev) => keepOfferedAddons(prev, list, length));
        })
        .catch(() => {
          if (!cancelled) setAddons([]);
        });
    }

    if (paired) return stale;
    const country = holdAddress.country || "SG";
    fetch(`${HOLD_SHIPPING_METHODS_PATH}&country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then(async (d: { rows?: HoldShippingMethod[] }) => {
        let methods = d.rows ?? [];
        if (methods.length === 0 && country === "SG") {
          const all = await fetch(HOLD_SHIPPING_METHODS_PATH).then((r) => r.json());
          methods = all.rows ?? [];
        }
        if (cancelled) return;
        setShippingMethods({ country, rows: methods });
        setSelectedShippingId((prev) =>
          methods.some((m) => m.id === prev) ? prev : (methods[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!cancelled) setShippingMethods({ country, rows: [] });
      });
    return stale;
  }, [state.step, holdAddress.country, shopRecommendation?.bolster_variant, paired]);

  const handleKeepFlowRoute = React.useCallback(() => {
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    if (!record?.flowRoute) return;
    setRouteBusy(true);
    patchRecommendationRecord(withJourneyOnDecline(record));
    setRouteBusy(false);
  }, [shopRecommendation?.recommendation_record, patchRecommendationRecord]);

  const handleUpgradeFlowRoute = React.useCallback(() => {
    const record = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    if (!record?.flowRoute) return;
    const target = record.flowRoute.targetFlow;
    if (target !== "premium-mpillow" && target !== "basic-mpillow") return;

    setRouteBusy(true);
    try {
      const bolsterInputs =
        heightNum != null ? inputsFromBolsterHeight(heightNum) : {};
      const carried = carryOverAnswers("mbolster", target, bolsterInputs);
      const missing = missingStepsAfterCarryOver("mbolster", target, carried);
      const accepted = withJourneyOnAccept(record, target);
      sessionStorage.setItem(
        FLOW_ROUTE_HANDOFF_KEY,
        JSON.stringify({
          journey: accepted,
          targetFlow: target,
          carriedAnswers: carried,
          missingSteps: missing,
        }),
      );
      router.push(to(target === "basic-mpillow" ? "/mp-basic" : "/mp-config"));
    } finally {
      setRouteBusy(false);
    }
  }, [
    shopRecommendation?.recommendation_record,
    heightNum,
    router,
    to,
  ]);

  const handlePairedChoice = (withBolster: boolean) => {
    if (!paired) return;
    let choice: PairedChoice = { bolster: null };
    if (withBolster) {
      if (!suggestedLength || heightNum == null) {
        toast.error("Missing length recommendation");
        return;
      }
      const errors = buildFieldErrorMap(pairedFields);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      if (staffAssist && !confirmSaveWithBolsterFit(assistBolsterFit, "Hold")) return;
      const caseName = shopRecommendation?.components.cases.find((c) => c.item_id === selectedCase)?.name;
      const addonNames = addons.filter((a) => selectedAddons.has(a.item_id)).map((a) => a.name);
      choice = {
        bolster: {
          responseId: paired.companionId,
          suggestedLength,
          measurements: {
            height_cm: heightNum,
            sleep_position: state.sleepPosition ?? paired.sleepPosition,
          },
          preferenceLines: [{ item_id: selectedCase!, quantity: 1, category: "case" }],
          addonLines: [...selectedAddons].map((item_id) => ({ item_id, quantity: 1 })),
          ...(shopRecommendation?.recommendation_record
            ? { recommendationRecord: shopRecommendation.recommendation_record as Record<string, unknown> }
            : {}),
          ...(staffAssist && assistPlacements.length > 0
            ? {
                assistFilling: {
                  placements: bolsterPlacementsToRows(assistPlacements),
                  templateId: sessionFillingTemplateId,
                },
              }
            : {}),
        },
        summary: {
          label: `Mbolster · ${suggestedLength}`,
          lines: [
            ...(caseName ? [`Case: ${caseName}`] : []),
            ...(addonNames.length ? [`Add-ons, subject to advisor review: ${addonNames.join(", ")}`] : []),
          ],
          ballpark: serviceLines ? shopBasePrice + addonTotal + sumServiceLines(serviceLines) : null,
          currency: shopCurrency,
        },
      };
    }
    try {
      writePairedHandoff(window.sessionStorage, { ...paired, bolster: pairedAnswers, choice });
    } catch {
      toast.error("Could not save your Mbolster on this device. Please try again.");
      return;
    }
    router.push(to(pairedDetailsPath(paired.configPath)));
  };

  const handleAuthorizeHold = React.useCallback(async () => {
    if (!suggestedLength) {
      toast.error("Missing length recommendation");
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
    if (staffAssist && !confirmSaveWithBolsterFit(assistBolsterFit, "Hold")) return;

    setHoldSubmitting(true);
    try {
      const res = await fetch("/api/results/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(configSessionId ? { responseId: configSessionId } : {}),
          email: holdEmail.trim(),
          marketingEmail: !paired && marketingEmail,
          phone: holdPhone.trim(),
          discoverySource,
          discoverySourceOther:
            discoverySource === "other" ? discoverySourceOther.trim() : undefined,
          code: checkoutCodeToSend(checkoutCode, codeStatus),
          ...(partner ? { partnerAssistCode: partner.code } : {}),
          productType: "bolster",
          suggestedLength,
          measurements: {
            height_cm: heightNum,
            sleep_position: state.sleepPosition,
            ...(holdNotes.trim() ? { notes: holdNotes.trim() } : {}),
          },
          preferenceLines: [
            { item_id: selectedCase!, quantity: 1, category: "case" },
          ],
          addonLines: [...selectedAddons].map((item_id) => ({ item_id, quantity: 1 })),
          ...(staffAssist && assistPlacements.length > 0
            ? {
                assistFilling: {
                  placements: bolsterPlacementsToRows(assistPlacements),
                  templateId: sessionFillingTemplateId,
                },
              }
            : {}),
          shippingMethodId: selectedShippingId,
          shippingAddress: holdAddress,
          cancelPath: "/mbolster-config",
          ...(journeyRecord ? { recommendationRecord: journeyRecord } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data.error, "Failed to start authorization"));
      }
      const next = data.checkoutUrl ?? data.statusUrl;
      if (!next) throw new Error("Missing checkout URL");
      try {
        window.localStorage.removeItem(CONFIG_SESSION_KEY);
      } catch {}
      trackGaEventThen(
        {
          name: "generate_lead",
          params: {
            product_type: "bolster",
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
    suggestedLength,
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
    selectedAddons,
    heightNum,
    state.sleepPosition,
    holdFields,
    shopRecommendation?.recommendation_record,
    staffAssist,
    assistPlacements,
    assistBolsterFit,
    sessionFillingTemplateId,
    partner,
    configSessionId,
  ]);

  const flowRouteBlocksHold = (() => {
    const r = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    return Boolean(r && isFlowRoutePending(r));
  })();

  if (state.step === "preview") {
    const backFromPreview = paired ? () => setState((s) => ({ ...s, step: "height" })) : goBack;
    const caseStock = preferenceStockFor(
      selectedCase,
      shopRecommendation?.components.cases ?? [],
    );
    const preferenceStocks = caseStock !== null ? [caseStock] : [];
    const selectedOverlay =
      (shopRecommendation?.components.cases ?? []).find((c) => c.item_id === selectedCase)
        ?.overlay ?? null;
    // ponytail: no rec yet → not Pre-order (CTA already disabled until rec loads)
    const preOrder = shopRecommendation
      ? isPreOrder({
          preferenceStocks,
          composedBuildable: shopRecommendation.composed_buildable ?? 0,
        }).isPreOrder
      : false;
    const holdCta = holdSubmitting ? "Redirecting…" : holdCtaLabel(preOrder);
    const waitingCopy = preOrder ? preOrderWaitingCopy(locale) : null;
    const goodsSubtotal = shopBasePrice + addonTotal;
    const bolsterBallpark = serviceLines ? goodsSubtotal + sumServiceLines(serviceLines) : null;
    const codeContext: CheckoutCodeContext | null =
      paired || !shopRecommendation || !suggestedLength
        ? null
        : { flow: "customisation", build: { product_type: "bolster", length: suggestedLength }, goods: goodsSubtotal };
    const codeDiscount = paired ? 0 : checkoutCodeDiscount(codeStatus);
    const codeFreeShipping = !paired && checkoutCodeFreeShipping(codeStatus);
    const shippingAmount = paired
      ? null
      : holdShippingAmount(selectedShippingOption, goodsSubtotal, codeFreeShipping);
    const oneTotal =
      bolsterBallpark == null
        ? null
        : paired
          ? paired.pillow.ballpark == null
            ? null
            : paired.pillow.ballpark + bolsterBallpark + (shippingAmount ?? 0)
          : bolsterBallpark - codeDiscount + (shippingAmount ?? 0);

    return (
      <div className="relative min-h-dvh min-w-0 max-w-full overflow-x-clip bg-background">
        {/* ponytail: remount beacon so step changes fire section_view without SPA path change */}
        <div
          key={state.step}
          id={state.step}
          data-section={state.step}
          data-step={state.step}
          className="pointer-events-none absolute left-0 top-0 z-30 h-4 w-full"
          aria-hidden
        />
        <ConfiguratorExitDialog
          open={exitDialogOpen}
          onOpenChange={setExitDialogOpen}
          description="This will clear your session and return home."
          onConfirmExit={exitConfirmed}
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
            <div role="heading" aria-level={2} className="text-sm font-semibold tracking-tight leading-tight">Your Custom Mbolster</div>
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
          {paired ? <PairedStepperBar className="border-t" step={2} /> : null}
        </header>

        <div
          className={cn(
            "grid grid-cols-1 lg:grid-cols-[1fr_460px]",
            paired ? "min-h-[calc(100dvh-100px)]" : "min-h-[calc(100dvh-56px)]",
          )}
        >
          <div
            className={cn(
              "relative lg:sticky lg:overflow-hidden",
              paired ? "lg:top-[100px] lg:h-[calc(100vh-100px)]" : "lg:top-[56px] lg:h-[calc(100vh-56px)]",
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
            <div className="my-auto flex w-full flex-col items-center gap-4 md:gap-6">
              <div
                className="relative w-full max-w-[500px] lg:w-[min(75vmin,500px)]"
                style={{ aspectRatio: "664 / 374", ...xrayColorVars }}
              >
                {(() => {
                  const bolsterPath = bolsterCapsulePath(suggestedLength ?? DEFAULT_BOLSTER_LENGTH);
                  return (
                    <svg
                      className={cn(
                        "absolute inset-0 pointer-events-none",
                        xrayVisible && "opacity-80 saturate-50",
                      )}
                      viewBox="0 0 664 374"
                      xmlns="http://www.w3.org/2000/svg"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <path d={bolsterPath} fill="white" />
                      {selectedOverlay?.color && (
                        <path d={bolsterPath} fill={selectedOverlay.color} />
                      )}
                      {selectedOverlay?.url && (
                        <>
                          <defs>
                            <clipPath id="mbolster-config-overlay-clip">
                              <path d={bolsterPath} />
                            </clipPath>
                          </defs>
                          <image
                            href={selectedOverlay.url}
                            clipPath="url(#mbolster-config-overlay-clip)"
                            preserveAspectRatio="xMidYMid slice"
                            {...overlayFrame(selectedOverlay.fit)}
                          />
                        </>
                      )}
                      <path
                        d={bolsterPath}
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  );
                })()}
                {xrayVisible && (
                  <XrayBolster
                    placements={staffAssist ? assistPlacements : guestPlacements}
                    length={suggestedLength ?? DEFAULT_BOLSTER_LENGTH}
                    itemSubtypes={staffAssist ? assistItemSubtypes : guestItemSubtypes}
                    itemSizes={staffAssist ? assistItemSizes : guestItemSizes}
                    itemDims={staffAssist ? assistItemDims : guestItemDims}
                    fit={staffAssist ? assistBolsterFit : guestBolsterFit}
                    items={staffAssist ? assistItems : undefined}
                    onPlacementsChange={staffAssist ? setAssistPlacements : undefined}
                    controlsSlot={staffAssist ? compartmentSlot : undefined}
                    className="absolute inset-0"
                  />
                )}
                {shopLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="size-12 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  </div>
                )}
              </div>
              {staffAssist && xrayVisible && !isMobile && (
                <XraySectionDock
                  dived="compartment"
                  onSlot={setCompartmentSlot}
                  className="flex w-full max-w-[500px] border-border/60 bg-background/70 shadow-xl backdrop-blur-xl lg:w-[min(75vmin,500px)]"
                />
              )}
              {xrayVisible && (
                <BolsterCrossSection
                  fit={staffAssist ? assistBolsterFit : guestBolsterFit}
                  itemSubtypes={staffAssist ? assistItemSubtypes : guestItemSubtypes}
                  colorOverrides={assistColorOverrides.length ? assistColorOverrides : (shopColorOverrides ?? [])}
                  themed={false}
                  className="w-full max-w-[500px] lg:w-[min(97.5vmin,650px)] lg:max-w-none"
                />
              )}
              {(() => {
                const mixLines = guestXray
                  ? []
                  : (recommendedTemplate?.lines ?? []).map((l) => {
                      const filling = shopRecommendation?.available_fillings?.find(
                        (f) => f.item_id === l.item_id,
                      );
                      return {
                        label: filling?.name ?? l.subtype ?? `Item ${l.item_id}`,
                        qty: l.quantity,
                      };
                    });
                const showTierAdvice =
                  previewRecord?.tierSuggestion &&
                  previewRecord.tierSuggestion !== previewRecord.soldTier;
                const targetIsMpillow =
                  previewRecord?.flowRoute?.targetFlow === "basic-mpillow" ||
                  previewRecord?.flowRoute?.targetFlow === "premium-mpillow";
                return (
                  <>
                    {showTierAdvice && previewRecord?.tierSuggestion ? (
                      <TierSuggestion tier={previewRecord.tierSuggestion} />
                    ) : null}
                    {routePending && previewRecord?.flowRoute && !partnerAssisted && !paired ? (
                      <UpsellCard
                        reason={previewRecord.flowRoute.reason}
                        fromLabel="Mbolster"
                        toLabel={FLOW_UI_LABEL[previewRecord.flowRoute.targetFlow]}
                        fromPrice={shopBasePrice > 0 ? shopBasePrice : null}
                        toPrice={null}
                        currency={shopCurrency}
                        expectation={targetIsMpillow ? FLOW_ROUTE_EXPECTATION : null}
                        onUpgrade={() => handleUpgradeFlowRoute()}
                        onKeep={handleKeepFlowRoute}
                        busy={routeBusy}
                      />
                    ) : null}
                    <RecommendationReveal
                      reveal={revealNow}
                      sizeLabel={suggestedLength ? String(suggestedLength) : ""}
                      templateName={partnerAssisted ? null : recommendedTemplate?.name ?? null}
                      mixLines={partnerAssisted ? [] : mixLines}
                    />
                  </>
                );
              })()}
              <SelectedAddonPreviews addons={addons} selectedIds={selectedAddons} />
              {staffAssist && suggestedLength ? (
                <StaffAssistBolsterPanel
                  length={suggestedLength}
                  placements={assistPlacements}
                  onPlacementsChange={setAssistPlacements}
                  loadedTemplate={assistLoadedTemplate}
                  onLoadTemplate={setAssistLoadedTemplate}
                  suggestedTemplateId={recommendedTemplate ? Number(recommendedTemplate.id) : null}
                  sessionFillingTemplateId={sessionFillingTemplateId}
                  onItemsChange={setAssistItems}
                  onColorOverridesChange={setAssistColorOverrides}
                />
              ) : !shopRecommendation ? (
                <p className="max-w-xs text-center text-xs text-white/80">
                  Fillings are chosen by our team after review.
                </p>
              ) : null}
            </div>
            </div>
          </div>

          <div
            className={cn(
              "flex min-h-0 flex-col bg-background lg:border-l",
              paired ? "lg:h-[calc(100vh-100px)]" : "lg:h-[calc(100vh-56px)]",
            )}
          >
            <div
              className={cn(
                "flex-1 space-y-8 overflow-y-auto",
                configuratorPreviewPadClassName,
              )}
            >
              {partner ? <CoBrandBanner partner={partner} /> : null}
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">
                  {paired ? "Customize your Mbolster" : "Customize finish"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {paired
                    ? "Choose a case and any add-ons. It ships with your Mpillow, on the same card authorisation. Your details and a review of both come next, before you pay."
                    : "Choose a case, optional add-ons, then authorize payment. You are not charged until you accept the final build."}
                </p>
              </div>

              {shopRecommendation ? (
                <div className="space-y-2">
                  {fieldErrors.case && (
                    <p className="text-sm text-destructive">
                      {fieldErrors.case}
                    </p>
                  )}
                  <CustomizationStepComponents
                    components={shopRecommendation.components}
                    selectedCover={null}
                    onSelectCover={() => {}}
                    selectedCase={selectedCase}
                    onSelectCase={setSelectedCase}
                    componentQtyOverrides={new Map()}
                    onQtyChange={() => {}}
                    currency={shopCurrency}
                    basePrice={shopBasePrice}
                    addonPrice={addonTotal}
                    onBack={goBack}
                    onContinue={() => void handleAuthorizeHold()}
                    preferencesOnly
                    caseOnly
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void fetchBolsterRecommendation()}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {addons.length > 0 && !partnerAssisted && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">
                    Add-ons for your Mbolster (optional)
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
                    <AddonReviewNotice chargedAfterReview />
                  ) : null}
                </div>
              )}

              {staffAssist ? (
                <ConfigImageUpload
                  sessionId={configSessionId}
                  ensureSessionId={ensureConfigSessionId}
                />
              ) : null}

              {paired ? (
                <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Ships with your Mpillow in one delivery — you choose where on the next step.
                </p>
              ) : (
              <>
              <PreviewContactFields
                  discoverySourceOptions={discoverySourceOptions}
                  fieldErrors={fieldErrors}
                  values={{
                    email: holdEmail,
                    phone: holdPhone,
                    discoverySource,
                    discoverySourceOther,
                    notes: holdNotes,
                    code: checkoutCode,
                    marketingEmail,
                  }}
                  codeContext={codeContext}
                  onCodeStatus={setCodeStatus}
                  formatAmount={(amount) => `${shopCurrency} ${amount.toFixed(2)}`}
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

              <HoldShippingFields
                options={shippingOptions}
                loading={shippingLoading}
                goodsSubtotal={goodsSubtotal}
                selectedId={selectedShippingId}
                onSelect={setSelectedShippingId}
                address={holdAddress}
                setAddress={setHoldAddress}
                errors={fieldErrors}
                savedAddresses={{
                  signedIn: shippingSignedIn,
                  addresses: savedAddresses,
                  value: selectedAddressId,
                  onValueChange: handleSelectAddress,
                }}
                recipientPlaceholder="Name"
              />

              </>
              )}

              {paired ? null : (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="text-muted-foreground"
                >
                  Start over
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
              {(serviceLines ?? []).map((l) => (
                <div key={l.key} className="mb-1 flex justify-between gap-4 text-sm">
                  <span className="min-w-0 text-muted-foreground">{l.label}</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">
                    {shopCurrency} {l.msrp.toFixed(2)}
                  </span>
                </div>
              ))}
              {paired
                ? pairedPillowRows(paired.pillow).map((row) => (
                    <div key={row.key} className="mb-1 flex justify-between gap-4 text-sm">
                      <span className="min-w-0 text-muted-foreground">{row.label}</span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums">
                        {row.amount != null
                          ? `${paired.pillow.currency} ${row.amount.toFixed(2)}`
                          : "Not available"}
                      </span>
                    </div>
                  ))
                : null}
              {paired ? (
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Mbolster (ships with it)</span>
                  <span className="tabular-nums">
                    {bolsterBallpark != null ? `${shopCurrency} ${bolsterBallpark.toFixed(2)}` : "Not available"}
                  </span>
                </div>
              ) : null}
              {!paired && codeStatus.state === "discount" && (codeDiscount > 0 || codeFreeShipping) && bolsterBallpark != null ? (
                <div className="mb-1 flex justify-between gap-4 text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="min-w-0">Discount ({codeStatus.code})</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">
                    {codeDiscount > 0 ? `−${shopCurrency} ${codeDiscount.toFixed(2)}` : "Free shipping"}
                  </span>
                </div>
              ) : null}
              {paired ? null : (
                <HoldShippingTotalRow
                  option={selectedShippingOption}
                  goodsSubtotal={goodsSubtotal}
                  freeShipping={codeFreeShipping}
                />
              )}
              <div className="mb-3 flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {shippingAmount == null ? "Ballpark (before shipping/tax)" : "Total (before tax)"}
                </span>
                <span className="font-medium tabular-nums">
                  {oneTotal != null ? `${shopCurrency} ${oneTotal.toFixed(2)}` : "Not available"}
                </span>
              </div>
              {paired ? (
                <>
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
                    onClick={() => handlePairedChoice(true)}
                    disabled={shopLoading || !shopRecommendation}
                  >
                    Add Mbolster
                    <ArrowRight className="size-4" />
                  </Button>
                </ConfiguratorStepActions>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePairedChoice(false)}
                  className="mt-2 w-full text-muted-foreground"
                >
                  Skip the Mbolster — just my Mpillow
                </Button>
                </>
              ) : (
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
                  onClick={() => void handleAuthorizeHold()}
                  disabled={
                    holdSubmitting ||
                    shopLoading ||
                    !shopRecommendation ||
                    flowRouteBlocksHold
                  }
                >
                  {holdCta}
                  <ArrowRight className="size-4" />
                </Button>
              </ConfiguratorStepActions>
              )}
            </div>
          </div>
        </div>
        {isMobile && (
          <ConfiguratorMobileCloseBar onClose={requestExit} actionsRef={setMobileActionsSlot} />
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh w-full min-w-0 max-w-full overflow-x-clip bg-background">
      {/* ponytail: remount beacon so step changes fire section_view without SPA path change */}
      <div
        key={state.step}
        id={state.step}
        data-section={state.step}
        data-step={state.step}
        className="pointer-events-none absolute left-0 top-0 z-30 h-4 w-full"
        aria-hidden
      />
      <ConfiguratorExitDialog
        open={exitDialogOpen}
        onOpenChange={setExitDialogOpen}
        description="This will clear your session and return home."
        onConfirmExit={exitConfirmed}
      />
      {state.step !== "welcome" && isMobile && (
        <ConfiguratorMobileCloseBar onClose={requestExit} actionsRef={setMobileActionsSlot} />
      )}
      {paired ? (
        <PairedStepperBar
          className={cn(
            configuratorStickyHeaderClassName,
            "border-b backdrop-blur supports-[backdrop-filter]:bg-background/60",
          )}
          step={2}
        />
      ) : null}
      <div
        className={cn(
          "relative mx-auto flex w-full max-w-3xl flex-col justify-center py-10 px-3 md:px-6",
          paired ? "min-h-[calc(100dvh-44px)]" : "min-h-dvh",
          state.step !== "welcome" && configuratorMobileCloseClearanceClassName,
        )}
      >
        {state.step !== "welcome" && !paired ? (
          <div className="mb-6">
            <Progress value={progressValue} aria-label="Mbolster customisation progress" />
          </div>
        ) : null}

        {state.step === "welcome" ? (
          <div className="relative space-y-6 text-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 right-0 h-8 w-8 text-muted-foreground"
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

            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">Mbolster</div>
              <div role="heading" aria-level={2} className="text-4xl font-semibold tracking-tight leading-tight md:text-5xl">
                Customise your Mbolster
              </div>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Answer a few quick questions, choose a case preference, then authorize
                payment for operator review. You are not charged until you accept the final build.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={goNext}>
                Get started
              </Button>
              <MbolsterLearnMoreSlideIn
                className="h-11 px-8 text-base"
                triggerLabel="Learn more"
                faq={
                  info.faqItems.length > 0
                    ? { title: info.faqTitle ?? "FAQs", items: info.faqItems }
                    : null
                }
              />
            </div>
            {!staffAssist && !measuredByStaff && !partnerAssisted ? (
              <p className="text-sm text-muted-foreground">
                Prefer our team to measure you? Get it customised, adjusted and bring home immediately — no
                measurement fee for Mbolster.{" "}
                <Link
                  href={to("/appointments?type=customisation")}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Book here
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        {state.step === "height" ? (
          <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
            <div className="space-y-1">
              {paired ? null : (
                <div className="text-sm font-semibold text-muted-foreground">Step 1</div>
              )}
              <h2 className="text-2xl font-semibold tracking-tight">Your height</h2>
              <p className="text-sm text-muted-foreground">
                {paired
                  ? `${paired.reason ? `${paired.reason} ` : ""}Your height is all we need to size it.`
                  : "We use height to recommend a Mbolster length."}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Input
                  value={heightDraft}
                  onChange={(e) => setHeightDraft(e.target.value)}
                  onBlur={() => {
                    const heightCm = normalizeHeightDraft(state.heightUnit, heightDraft);
                    if (heightCm === null) return;
                    setState((s) => ({ ...s, heightCm }));
                    setHeightDraft(displayHeight(state.heightUnit, heightCm));
                  }}
                  inputMode="decimal"
                  placeholder={
                    state.heightUnit === "in"
                      ? "e.g. 66"
                      : state.heightUnit === "m"
                        ? "e.g. 1.68"
                        : "e.g. 168"
                  }
                  className="h-12 text-lg"
                  autoFocus
                  aria-invalid={!!fieldErrors.heightCm}
                />
                <Tabs
                  value={state.heightUnit}
                  onValueChange={(v) => {
                    const heightUnit = v as HeightUnit;
                    const heightCm =
                      normalizeHeightDraft(state.heightUnit, heightDraft) ?? state.heightCm;
                    setState((s) => ({
                      ...s,
                      heightUnit,
                      heightCm,
                    }));
                    setHeightDraft(displayHeight(heightUnit, heightCm));
                  }}
                >
                  <TabsList className="h-12">
                    <TabsTrigger value="in" className="px-4">
                      in
                    </TabsTrigger>
                    <TabsTrigger value="cm" className="px-4">
                      cm
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {fieldErrors.heightCm ? (
                <p className="text-sm text-destructive">{fieldErrors.heightCm}</p>
              ) : null}
            </div>

            <ConfiguratorStepActions
              mobile={isMobile}
              slot={mobileActionsSlot}
              className="flex items-center justify-between pt-2"
            >
              <Button
                variant="outline"
                onClick={paired ? () => router.push(to(paired.configPath)) : goBack}
              >
                Back
              </Button>
              <Button
                onClick={() =>
                  tryAdvance(heightFields, async () => {
                    const heightCm = normalizeHeightDraft(state.heightUnit, heightDraft)!;
                    setState((s) => ({ ...s, heightCm }));
                    setHeightDraft(displayHeight(state.heightUnit, heightCm));
                    if (paired) {
                      await fetchBolsterRecommendation({
                        heightCm: Number(heightCm),
                        preserveSelections: true,
                        nextStep: "preview",
                      });
                      return;
                    }
                    goNext();
                  })
                }
                disabled={!hybridCtaEnabled(heightFields) || shopLoading}
              >
                {paired && shopLoading ? "Sizing…" : "Continue"}
              </Button>
            </ConfiguratorStepActions>
          </Card>
        ) : null}

        {state.step === "sleep-position" ? (
          <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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
                        : fieldErrors.sleepPosition
                          ? "border-destructive bg-background/50"
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
              {fieldErrors.sleepPosition ? (
                <p className="text-sm text-destructive">{fieldErrors.sleepPosition}</p>
              ) : null}
            </div>

            <ConfiguratorStepActions
              mobile={isMobile}
              slot={mobileActionsSlot}
              className="flex items-center justify-between pt-2"
            >
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button
                onClick={() =>
                  tryAdvance(sleepFields, () => void fetchBolsterRecommendation())
                }
                disabled={!hybridCtaEnabled(sleepFields) || shopLoading}
              >
                {shopLoading ? "Loading..." : "Get Recommendation"}
              </Button>
            </ConfiguratorStepActions>
          </Card>
        ) : null}

        {state.step === "recommendation" && shopRecommendation && suggestedLength ? (
          <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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
              {(() => {
                const record = parseRecommendationRecord(
                  shopRecommendation.recommendation_record ?? null,
                );
                const routePending = Boolean(record && isFlowRoutePending(record));
                const showTierAdvice =
                  record?.tierSuggestion &&
                  record.tierSuggestion !== record.soldTier;
                const targetIsMpillow =
                  record?.flowRoute?.targetFlow === "basic-mpillow" ||
                  record?.flowRoute?.targetFlow === "premium-mpillow";
                return (
                  <>
                    {showTierAdvice && record?.tierSuggestion ? (
                      <TierSuggestion tier={record.tierSuggestion} />
                    ) : null}
                    {routePending && record?.flowRoute && !partnerAssisted && !paired ? (
                      <UpsellCard
                        reason={record.flowRoute.reason}
                        fromLabel="Mbolster"
                        toLabel={FLOW_UI_LABEL[record.flowRoute.targetFlow]}
                        fromPrice={shopBasePrice > 0 ? shopBasePrice : null}
                        toPrice={null}
                        currency={shopCurrency}
                        expectation={targetIsMpillow ? FLOW_ROUTE_EXPECTATION : null}
                        onUpgrade={() => handleUpgradeFlowRoute()}
                        onKeep={handleKeepFlowRoute}
                        busy={routeBusy}
                      />
                    ) : null}
                  </>
                );
              })()}
              <p className="text-xs text-muted-foreground">
                Fillings are chosen by our team after review. You pick a case preference next.
              </p>
              <ConfiguratorStepActions
                mobile={isMobile}
                slot={mobileActionsSlot}
                className="flex items-center justify-between pt-2"
              >
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
                <Button onClick={goNext}>Continue</Button>
              </ConfiguratorStepActions>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
