"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { MbolsterLearnMoreSlideIn } from "@/components/slide-in-pages/mbolster-learn-more-slide-in";
import { ArrowLeft, ArrowRight, Check, Info, X } from "lucide-react";
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
  configuratorCardPadClassName,
  configuratorMobileCloseClearanceClassName,
  configuratorPreviewPadClassName,
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
} from "@/components/configurator/preview-contact-fields";
import { ConfigImageUpload } from "@/components/configurator/config-image-upload";
import {
  AddonOptionButton,
  SelectedAddonPreviews,
  type AddonOption,
} from "@/components/configurator/addon-cards";
import { CoBrandBanner } from "@/components/configurator/co-brand-banner";
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
  plainLanguageWhy,
  shouldRevealRecommendation,
  withJourneyOnAccept,
  withJourneyOnDecline,
  type RecommendationRecord,
  type RuleFlow,
} from "@/lib/rules-engine";
import { overlayFrame } from "@/lib/product-builder/overlays";
import { previewMixMode } from "@/lib/rules-engine/preview-xray";
import { XrayBolster } from "@/components/spatial/xray-bolster";
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
import {
  SavedAddressSelect,
  useSavedShippingPrefill,
  type HoldShippingAddress,
} from "@/components/shop/saved-address-select";
import {
  displayHeight,
  normalizeHeightDraft,
  type HeightUnit,
} from "@/lib/configurator/height-draft";
import { soleCaseId } from "@/lib/configurator/preference-policy";
import { StaffAssistBolsterPanel } from "@/components/configurator/staff-assist-bolster-panel";
import { sessionTemplateId, type LoadedTemplate } from "@/lib/configurator/staff-assist";

type Step = "welcome" | "height" | "sleep-position" | "recommendation" | "preview";
type SleepPosition = "side" | "stomach" | "other";
type BolsterLength = "short" | "medium" | "long";

/** RE slice 07: the bolster customize response also ships spatial placements + color overrides. */
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

/** Fallback capsule length until the recommendation resolves one. */
const DEFAULT_BOLSTER_LENGTH: BolsterLength = "medium";

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
}: {
  info: MbolsterConfigInfo;
  /** Staff-only x-ray filling editor on the bolster preview (slice 13). */
  staffAssist?: boolean;
  /**
   * Partner-assisted co-brand context (#78). Non-null → assisted run: co-brand
   * finish panel, no add-on / upsell / filling-template surfaces, assist-priority
   * attribution. null → guest/staff flow renders PIXEL-IDENTICAL (AC5).
   */
  partner?: {
    code: string;
    name: string;
    logoUrl: string | null;
    description: string | null;
  } | null;
}) {
  // Everything assist-specific gates on this; false ⇒ zero render change (AC5).
  const partnerAssisted = Boolean(partner);
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);
  const to = (href: string) => withLocale(href, locale);
  const isMobile = useIsMobile();
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
  const [referralCode, setReferralCode] = React.useState("");
  const [holdNotes, setHoldNotes] = React.useState("");
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
  const [routeBusy, setRouteBusy] = React.useState(false);
  // Reference-photo session id (slice 04): bolster has no response record, so mint a UUID
  // lazily, persist it (survives reload + Stripe cancel), reuse it as the hold's responseId
  // so the resulting Result id equals the session id (gallery finds photos with no extra column).
  const [configSessionId, setConfigSessionId] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setConfigSessionId(window.localStorage.getItem(CONFIG_SESSION_KEY));
    } catch {
      // best-effort
    }
  }, []);
  const ensureConfigSessionId = React.useCallback(() => {
    if (configSessionId) return configSessionId;
    if (typeof window === "undefined") return null;
    const id = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    try {
      window.localStorage.setItem(CONFIG_SESSION_KEY, id);
    } catch {
      // best-effort
    }
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

  // --- Staff assist (slice 13) — top-level so the session mix survives step navigation ---
  const [assistPlacements, setAssistPlacements] = React.useState<BolsterPlacement[]>([]);
  const [assistLoadedTemplate, setAssistLoadedTemplate] = React.useState<LoadedTemplate | null>(null);
  // Filling items surfaced from the assist panel; the x-ray resolves colors/scale by subtype/size.
  const [assistItems, setAssistItems] = React.useState<FillingItem[]>([]);
  const [assistColorOverrides, setAssistColorOverrides] = React.useState<ColorOverrideRow[]>([]);
  const assistItemSubtypes = React.useMemo(
    () => new Map(assistItems.map((i) => [i.id, i.subtype])),
    [assistItems],
  );
  const assistItemSizes = React.useMemo(
    () => new Map(assistItems.map((i) => [i.id, i.size])),
    [assistItems],
  );
  // Same DB table either way — assist rows win once the Staff panel loads them,
  // guests ride the shop customize response (RE slice 07).
  const shopColorOverrides = shopRecommendation?.color_overrides;
  const xrayColorVars = React.useMemo(
    () =>
      xrayColorVarStyle(
        assistColorOverrides.length ? assistColorOverrides : (shopColorOverrides ?? []),
      ),
    [assistColorOverrides, shopColorOverrides],
  );
  // Kept only while the mix exactly matches the loaded template; the hold snapshot claims this.
  const sessionFillingTemplateId = React.useMemo(
    () => sessionTemplateId(assistLoadedTemplate, assistPlacements),
    [assistLoadedTemplate, assistPlacements],
  );
  // Length-based eligibility: a different recommended length invalidates the loaded mix.
  React.useEffect(() => {
    setAssistPlacements([]);
    setAssistLoadedTemplate(null);
  }, [suggestedLength]);

  // --- RE slice 07: reveal + recommended-template derivation shared by the x-ray
  // mount and the reveal card. Guest data rides the shop customize response —
  // the client never fetches assist endpoints for guests.
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
  const guestItemSubtypes = new Map(
    (shopRecommendation?.available_fillings ?? []).map((f) => [f.item_id, f.subtype]),
  );
  const guestItemSizes = new Map(
    (shopRecommendation?.available_fillings ?? []).map((f) => [f.item_id, f.size ?? null]),
  );
  // Legacy-flat templates (no placements) keep the text mix summary.
  // Assisted runs show LENGTH ONLY — no filling x-ray (AC3).
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

  React.useEffect(() => {
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
    } catch {
      // best-effort
    }

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
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // best-effort
    }
  }, [state]);

  // Persist hold-prep while on preview (covers Stripe cancel return).
  React.useEffect(() => {
    if (state.step !== "preview") return;
    try {
      writeHoldCancelDraft(window.localStorage, {
        v: 1,
        surface: "mbolster",
        step: "preview",
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
    } catch {
      // best-effort
    }
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

  const activeFields = React.useMemo((): FieldCheck[] => {
    switch (state.step) {
      case "height":
        return heightFields;
      case "sleep-position":
        return sleepFields;
      case "preview":
        return holdFields;
      default:
        return [];
    }
  }, [state.step, heightFields, sleepFields, holdFields]);

  React.useEffect(() => {
    setFieldErrors({});
  }, [state.step]);

  React.useEffect(() => {
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
    // Keep holdEmail/holdAddress — signed-in shoppers stay prefilled.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem("mbolster_config_v3");
      clearHoldCancelDraft(window.localStorage, "mbolster");
    } catch {
      // ignore
    }
  };

  const confirmExit = () => {
    toast.message("Exit configuration?", {
      description: "This will clear your session and return home.",
      action: {
        label: "Exit",
        onClick: () => {
          reset();
          router.push(homeHref);
        },
      },
      cancel: "Stay",
      id: "mbolster-config-exit",
    });
  };

  const exitConfirmed = () => {
    reset();
    router.push(homeHref);
  };

  /** Mobile → centered Dialog; desktop → toast (unchanged). */
  const requestExit = () => {
    if (isMobile) setExitDialogOpen(true);
    else confirmExit();
  };

  const fetchBolsterRecommendation = React.useCallback(async (opts?: { preserveSelections?: boolean; stayOnStep?: boolean }) => {
    if (!heightNum) return;
    setShopLoading(true);
    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "ballpark",
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

      const data: ShopRecommendationData = await res.json();
      setShopRecommendation(data);

      if (!opts?.preserveSelections) {
        setSelectedCase(soleCaseId(data.components.cases));
      }

      if (!opts?.stayOnStep) {
        setState((s) => ({ ...s, step: "recommendation" }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get recommendation");
    } finally {
      setShopLoading(false);
    }
  }, [heightNum, state.sleepPosition]);

  // After hold-cancel restore: re-fetch recommendation, keep the case, stay on preview.
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

  // Load bolster-specific add-ons + shipping when entering the purchase preview.
  React.useEffect(() => {
    if (state.step !== "preview") return;

    // Assisted runs offer no add-ons (AC3) — skip the fetch entirely.
    if (!partnerAssisted) {
      const length = shopRecommendation?.bolster_variant ?? "";
      const qs = new URLSearchParams({ productType: "bolster" });
      if (length) qs.set("length", length);
      fetch(`/api/results/addons?${qs.toString()}`)
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
    }

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
  }, [state.step, holdAddress.country, shopRecommendation?.bolster_variant]);

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

    setHoldSubmitting(true);
    try {
      const res = await fetch("/api/results/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Reuse the reference-photo session id as the Result id when staff uploaded photos.
          ...(configSessionId ? { responseId: configSessionId } : {}),
          email: holdEmail.trim(),
          phone: holdPhone.trim(),
          discoverySource,
          discoverySourceOther:
            discoverySource === "other" ? discoverySourceOther.trim() : undefined,
          referralCode: referralCode.trim() || undefined,
          // Assist priority (#78): server re-resolves this code → partner id.
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
          // Staff assist snapshot (slice 13): session mix + still-matching template claim.
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
      if (!data.checkoutUrl) throw new Error("Missing checkout URL");
      window.location.href = data.checkoutUrl;
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
    referralCode,
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
    sessionFillingTemplateId,
    partner,
  ]);

  const flowRouteBlocksHold = (() => {
    const r = parseRecommendationRecord(
      shopRecommendation?.recommendation_record ?? null,
    );
    return Boolean(r && isFlowRoutePending(r));
  })();

  // Hold preview uses the same mp-config split layout (case, add-ons, shipping).
  if (state.step === "preview") {
    const caseStock = preferenceStockFor(
      selectedCase,
      shopRecommendation?.components.cases ?? [],
    );
    const preferenceStocks = caseStock !== null ? [caseStock] : [];
    // Product Builder overlay (slice 10): unmapped case → plain silhouette.
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

    return (
      <div className="relative min-h-dvh min-w-0 max-w-full overflow-x-hidden bg-background">
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
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 max-md:px-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={goBack}
              aria-label="Back"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="text-sm font-semibold">Your Custom Mbolster</h1>
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
          {/* Left: product visual */}
          <div className="relative max-h-[40vh] overflow-hidden lg:sticky lg:top-[56px] lg:h-[calc(100vh-56px)] lg:max-h-none">
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
            <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 p-4 max-md:px-3">
              <div
                className="relative"
                // xrayColorVars: Product Builder color overrides reach the x-ray here (slice 11)
                style={{ aspectRatio: "664 / 374", width: "min(75vmin, 500px)", ...xrayColorVars }}
              >
                {(() => {
                  // Long-pill silhouette; length follows the recommended Mbolster length.
                  const bolsterPath = bolsterCapsulePath(suggestedLength ?? DEFAULT_BOLSTER_LENGTH);
                  return (
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
                      <path d={bolsterPath} fill="white" />
                      {selectedOverlay && (
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
                    // Guests view, never edit: omitting these keeps the renderer read-only.
                    items={staffAssist ? assistItems : undefined}
                    onPlacementsChange={staffAssist ? setAssistPlacements : undefined}
                    className="absolute inset-0"
                  />
                )}
                {shopLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="size-12 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  </div>
                )}
              </div>
              {(() => {
                const why = previewRecord
                  ? plainLanguageWhy(previewRecord)
                  : shopRecommendation?.recommendation?.explanation ?? "";
                // Guest x-ray replaces the text mix summary; legacy-flat templates keep it.
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
                    {routePending && previewRecord?.flowRoute && !partnerAssisted ? (
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
                      why={why}
                      // Assisted: LENGTH ONLY — drop the Filling Template surface (AC3).
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
                  onPlacementsChange={setAssistPlacements}
                  loadedTemplate={assistLoadedTemplate}
                  onLoadTemplate={setAssistLoadedTemplate}
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

          {/* Right: customization panel (case, add-ons, shipping) */}
          <div className="flex min-h-0 flex-col bg-background lg:h-[calc(100vh-56px)] lg:border-l">
            <div
              className={cn(
                "flex-1 space-y-8 overflow-y-auto",
                configuratorPreviewPadClassName,
              )}
            >
              {partner ? <CoBrandBanner partner={partner} /> : null}
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight">Customize finish</h2>
                <p className="text-sm text-muted-foreground">
                  Choose a case, optional add-ons, then authorize payment. You are not
                  charged until you accept the final build.
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
                </div>
              )}

              {staffAssist ? (
                <ConfigImageUpload
                  sessionId={configSessionId}
                  ensureSessionId={ensureConfigSessionId}
                />
              ) : null}

              <PreviewContactFields
                  locale={locale}
                  fieldErrors={fieldErrors}
                  values={{
                    email: holdEmail,
                    phone: holdPhone,
                    discoverySource,
                    discoverySourceOther,
                    notes: holdNotes,
                    referralCode,
                  }}
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

              <div className="space-y-3">
                <Label className="text-base font-semibold">Shipping</Label>
                <SavedAddressSelect
                  signedIn={shippingSignedIn}
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
                    placeholder="Name"
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
                    onChange={(e) => setHoldAddress((a) => ({ ...a, line1: e.target.value }))}
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
                      onChange={(e) => setHoldAddress((a) => ({ ...a, city: e.target.value }))}
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
                        const label = m.content?.["en-US"]?.name ?? m.slug;
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
                  {shopCurrency} {(shopBasePrice + addonTotal).toFixed(2)}
                </span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={goBack} className="flex-1">
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
              </div>
            </div>
          </div>
        </div>
        {isMobile && <ConfiguratorMobileCloseBar onClose={requestExit} />}
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh w-full min-w-0 max-w-full overflow-x-hidden bg-background">
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
        <ConfiguratorMobileCloseBar onClose={requestExit} />
      )}
      <div
        className={cn(
          "relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center py-10 px-3 md:px-6",
          state.step !== "welcome" && configuratorMobileCloseClearanceClassName,
        )}
      >
        {state.step !== "welcome" ? (
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
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                Customise your Mbolster
              </h1>
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
          </div>
        ) : null}

        {state.step === "height" ? (
          <Card className={cn("bg-card/80 backdrop-blur-sm gap-4", configuratorCardPadClassName)}>
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

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button
                onClick={() =>
                  tryAdvance(heightFields, () => {
                    const heightCm = normalizeHeightDraft(state.heightUnit, heightDraft)!;
                    setState((s) => ({ ...s, heightCm }));
                    setHeightDraft(displayHeight(state.heightUnit, heightCm));
                    goNext();
                  })
                }
                disabled={!hybridCtaEnabled(heightFields)}
              >
                Continue
              </Button>
            </div>
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

            <div className="flex items-center justify-between pt-2">
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
            </div>
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
              <p className="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground text-left">
                {shopRecommendation.recommendation.explanation}
              </p>
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
                    {routePending && record?.flowRoute && !partnerAssisted ? (
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
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
                <Button onClick={goNext}>Continue</Button>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
