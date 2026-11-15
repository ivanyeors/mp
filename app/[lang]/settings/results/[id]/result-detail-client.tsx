"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PageActions,
  pageActionClassName,
  pageActionDockedClassName,
  pageActionWideClassName,
} from "@/components/ui/page-actions";
import { useMobileDockActions } from "@/components/ui/page-dock-actions";
import type { DockAction } from "@/components/ui/app-dock-actions";
import { Ban, ChevronDown, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { confirmSaveWithBolsterFit, confirmSaveWithOverCells } from "@/components/spatial/xray-fit-banner";
import { useBolsterFit, useCut, useItemMaps, usePillowFit } from "@/components/spatial/use-pillow-fit";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import { InsertOrderList } from "@/components/spatial/insert-order-list";
import { XraySectionDock } from "@/components/spatial/xray-section-dock";
import { EAR_PAD, fillingLabel, NECK_SUPPORT, PLACEABLE_ITEMS_OR } from "@/lib/spatial-fillings/filling-groups";
import { useElementWidth } from "@/hooks/use-element-width";
import { fillingMixMode } from "@/lib/results/filling-mix";
import type { ResultFillingMixPayload } from "@/lib/results/admin/filling-mix";
import { FillingMixWorkbench, WorkbenchTile } from "./filling-mix-workbench";
import { ResultCustomerPanel } from "./result-customer-panel";
import { resultContactEditable, type ResultCustomerSummary } from "@/lib/results/result-customer";

/**
 * The x-ray editor and the cross-section load on demand, as on the Configure
 * card: the editor drags in @dnd-kit and the sunburst picker, both sit inside
 * the collapsed assign section, and importing them statically put that weight
 * in this route's first load and past its bundle budget. `ssr: false` — they
 * are interactive client editors with nothing to render on the server.
 */
const XrayEditor = dynamic(
  () => import("@/components/spatial/xray-editor").then((m) => m.XrayEditor),
  { ssr: false, loading: () => <Skeleton className="aspect-[664/374] w-full rounded-lg" /> },
);
// Left, center and right at once: three pinned XrayCrossSection cuts (xray-cross-section-strip.tsx).
const XrayCrossSectionStrip = dynamic(
  () => import("@/components/spatial/xray-cross-section-strip").then((m) => m.XrayCrossSectionStrip),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full rounded-lg" /> },
);
const BolsterCrossSection = dynamic(
  () => import("@/components/spatial/xray-cross-section").then((m) => m.BolsterCrossSection),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full rounded-lg" /> },
);
import {
  isSpatiallyAuthored,
  looksLikeLegacyImport,
  unauthoredReason,
} from "@/lib/spatial-fillings/authoring";
import type { ColorOverrideRow } from "@/lib/spatial-fillings/color-overrides";
import type { DimensionOverridesPayload } from "@/lib/spatial-fillings/dimension-overrides";
import { softBodyFromPayload } from "@/lib/spatial-fillings/soft-body-settings";
import { BolsterCompartmentList, type BolsterListItem } from "@/components/spatial/bolster-compartment-list";
import {
  bolsterPlacementsToRows,
  pillowPlacementsToRows,
  placementsExactMatch,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  type BolsterPlacement,
  type BolsterPlacementRow,
  type PillowPlacement,
  type PillowPlacementRow,
  type Section,
} from "@/lib/spatial-fillings/core";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import type { LinkedOrderDetail } from "@/lib/results/admin/response-detail";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import {
  parseRecommendationRecord,
  plainLanguageWhy,
  resolveAssignHintTemplateId,
  selectAssignHintSource,
} from "@/lib/rules-engine";
import { InfoTip } from "@/components/ui/info-tip";

function formatOrderMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: currency ?? "SGD",
    }).format(amount);
  } catch {
    return `${currency ?? "SGD"} ${amount.toFixed(2)}`;
  }
}

type YesNoEmpty = "yes" | "no" | "";

type MeasurementData = {
  name: string;
  gender: string;
  ageGroup: string;
  bloodPressureLevel: string;
  earDiscomfortSideSleep: YesNoEmpty;
  bedFirmness: string;
  acidReflux: YesNoEmpty;
  shoulderLength: string;
  neckToBack: string;
  headToBack: string;
  neckLength: string;
};

type PillowSize = "XS" | "S" | "M" | "L" | "XL";
type PillowTier = "basic" | "premium";

type MpConfigResponseRow = {
  id: string;
  data: Partial<MeasurementData> | null;
  is_final: boolean;
  /** Who measured — `staff` means the Measurement service fee applies (ADR 0024). */
  measured_by_type?: string | null;
  source?: string | null;
  order_id?: string | null;
  order_item_id?: string | null;
  created_at: string;
  updated_at: string;
  status?: string | null;
  product_type?: string | null;
  suggested_size?: string | null;
  suggested_tier?: string | null;
  suggested_length?: string | null;
  assigned_size?: string | null;
  assigned_tier?: string | null;
  assigned_length?: string | null;
  filling_template_id?: number | null;
  preference_lines?: unknown;
  addon_lines?: unknown;
  shipping_method?: string | null;
  authorized_amount?: number | null;
  final_amount?: number | null;
  currency?: string | null;
  payment_intent_id?: string | null;
  /** Discount code held with (ADR 0033); every repricing takes it off the goods. */
  coupon_code?: string | null;
  customer_id?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  discovery_source?: string | null;
  discovery_source_other?: string | null;
  discovery_source_label?: string | null;
  is_pre_order?: boolean | null;
  recommendation_record?: Record<string, unknown> | null;
  filling_fingerprint?: string | null;
  /** Paired build (ADR 0026): the anchor's id on both Results. */
  paired_build_id?: string | null;
  /** The other Result on the same hold. */
  paired_result_id?: string | null;
};

type BomLine = {
  quantity: number | string;
  item: { id: number; category: string; name: string; size: string | null; subtype: string | null } | null;
};

type MpConfigSuggestion = {
  recommended: { size: PillowSize; tier: PillowTier };
  product: { id: number; size: PillowSize; tier: PillowTier } | null;
  bom: BomLine[];
  reasons: string[];
};

type FillingTemplateOption = {
  id: number;
  name: string;
  key: string;
  kind: string;
  role: string;
  is_active: boolean;
};

type AssignPrepData = {
  productLines: Array<{ category: string; label: string; qty: number }>;
  defaultFillingTemplate: {
    id: number;
    name: string;
    preview: Array<{ variant: string; qty: number }>;
  } | null;
  sizeDefaultFillingTemplate?: {
    id: number;
    name: string;
    preview: Array<{ variant: string; qty: number }>;
  } | null;
  hintSource?: "engine" | "default";
  fillingTemplates: Array<{ id: number; name: string }>;
};

/** The answers the rules read, in the configurator's words, for "why no suggestion". */
const ENGINE_INPUT_LABELS: Record<string, string> = {
  shoulder_length_cm: "shoulder length",
  neck_to_back_cm: "neck to back",
  head_to_back_cm: "head to back",
  neck_length_cm: "neck length",
  sleep_position: "sleep position",
  bed_firmness: "bed firmness",
  acid_reflux: "acid reflux",
  ear_discomfort_side_sleep: "ear discomfort",
  blood_pressure: "blood pressure",
  sleep_pain_areas: "pain areas",
  uses_bolster: "bolster use",
  gender: "gender",
  age_group: "age group",
};

const engineInputLabel = (key: string): string =>
  ENGINE_INPUT_LABELS[key] ?? key.replace(/_cm$/, "").replace(/_/g, " ");

const safeString = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));
const safeYesNoEmpty = (value: unknown): YesNoEmpty => (value === "yes" || value === "no" ? value : "");

const missingFromPayload = (payload: unknown): string[] => {
  const missing = (payload as { suggestion_missing?: unknown } | null)?.suggestion_missing;
  return Array.isArray(missing) ? missing.filter((k): k is string => typeof k === "string") : [];
};

const normalizeMeasurement = (data: Partial<MeasurementData> | null | undefined): MeasurementData => ({
  name: safeString(data?.name),
  gender: safeString(data?.gender),
  ageGroup: safeString(data?.ageGroup),
  bloodPressureLevel: safeString(data?.bloodPressureLevel),
  earDiscomfortSideSleep: safeYesNoEmpty(data?.earDiscomfortSideSleep),
  bedFirmness: safeString(data?.bedFirmness),
  acidReflux: safeYesNoEmpty(data?.acidReflux),
  shoulderLength: safeString(data?.shoulderLength),
  neckToBack: safeString(data?.neckToBack),
  headToBack: safeString(data?.headToBack),
  neckLength: safeString(data?.neckLength),
});

/**
 * Server-rendered first paint. `detail` is exactly the JSON
 * `/api/mp-config/responses/[id]` returns; `assignPrep` exactly what
 * `/api/results/assign/prep` returns for the request this page would have
 * fired on mount; `fillingItems` the rows the browser `items` query returns.
 * Any member is null when the server could not (or should not) load it, and
 * the client then fetches it on mount exactly as before.
 */
export type ResultDetailInitialData = {
  detail: {
    ok: true;
    response: MpConfigResponseRow;
    order_number: string | null;
    order: LinkedOrderDetail | null;
    /** Null when the rules could not run on this Result's answers. */
    suggestion: MpConfigSuggestion | null;
    /** The answers the rules needed and this Result lacks, when `suggestion` is null. */
    suggestion_missing?: string[];
  } | null;
  assignPrep: AssignPrepData | null;
  fillingItems: BolsterListItem[] | null;
  /**
   * The Result's own saved Filling configuration with the colours and
   * dimensions the x-ray draws in (`lib/results/admin/filling-mix.ts`). The
   * editor opens on it, not on a template, whenever it has pieces.
   */
  fillingMix?: ResultFillingMixPayload | null;
  /**
   * The Customer this Result belongs to, for *Open customer*
   * (PRD-crm-retention-loop slice 02). Null when the viewer lacks `customers`
   * or no single Customer matches.
   */
  customerId?: string | null;
  /** The Customer panel's Customer and stage (ADR 0051 d); null with none or unread. */
  customer?: ResultCustomerSummary | null;
  /** The viewer holds `customers`: the panel shows at all. */
  canViewCustomers?: boolean;
  /** The viewer holds `customers-edit`: the panel links and creates. */
  canEditCustomer?: boolean;
};

/**
 * Rebuilds the state `load()` would have produced from the server payload.
 * Kept in one place so the seeded values and the fetched ones cannot drift.
 */
function deriveSeed(initialData: ResultDetailInitialData | undefined) {
  const detail = initialData?.detail ?? null;
  const response = detail?.response ?? null;
  const suggestion = detail?.suggestion ?? null;

  const assignSize =
    (response?.assigned_size as PillowSize | null) ??
    (response?.suggested_size as PillowSize | null) ??
    suggestion?.recommended.size ??
    "M";
  const assignTier =
    (response?.assigned_tier as PillowTier | null) ??
    (response?.suggested_tier as PillowTier | null) ??
    suggestion?.recommended.tier ??
    "basic";
  const assignLength = response?.assigned_length ?? response?.suggested_length ?? "";
  const productType = response?.product_type === "bolster" ? "bolster" : "pillow";
  const rowTemplateId =
    response?.filling_template_id != null ? String(response.filling_template_id) : "";

  // The "size/tier/length changed" effect also fires on mount, so today the
  // row's saved filling template only survives the initial load when the
  // loaded values match the pre-load defaults. Reproduce that exactly.
  const matchesPreLoadDefaults =
    assignSize === "M" && assignTier === "basic" && assignLength === "" && productType === "pillow";

  const prep = initialData?.assignPrep ?? null;
  const sizeKey = productType === "bolster" ? assignLength : assignSize;

  return {
    row: response,
    orderNumber: detail?.order_number ?? null,
    order: detail?.order ?? null,
    suggestion,
    suggestionMissing: detail?.suggestion_missing ?? [],
    draft: normalizeMeasurement(response?.data ?? null),
    assignSize,
    assignTier,
    assignLength,
    fillingTemplateId: matchesPreLoadDefaults ? rowTemplateId : "",
    assignPrep: prep,
    fillingTemplates: prep
      ? prep.fillingTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          key: sizeKey,
          kind: productType,
          role: "filling",
          is_active: true,
        }))
      : [],
    fillingItems: initialData?.fillingItems ?? [],
    savedMix: savedMixOf(initialData?.fillingMix ?? null),
    colorOverrides: initialData?.fillingMix?.colorOverrides ?? [],
    dimensionOverrides: initialData?.fillingMix?.dimensionOverrides,
  };
}

/** The Result's saved snapshot as editor placements, per kind, with the Items it places. */
type SavedMix = {
  pillow: PillowPlacement[];
  bolster: BolsterPlacement[];
  /** Placed Items, labelled for the lists — merged into the editor's Items so a retired piece still has a name. */
  items: BolsterListItem[];
};

const EMPTY_SAVED_MIX: SavedMix = { pillow: [], bolster: [], items: [] };

function savedMixOf(mix: ResultFillingMixPayload | null): SavedMix {
  if (!mix) return EMPTY_SAVED_MIX;
  return {
    pillow: mix.productType === "pillow" ? rowsToPillowPlacements(mix.placements as PillowPlacementRow[]) : [],
    bolster: mix.productType === "bolster" ? rowsToBolsterPlacements(mix.placements as BolsterPlacementRow[]) : [],
    items: mix.items.map((i) => ({ id: i.id, label: fillingLabel(i), name: i.name, subtype: i.subtype, size: i.size })),
  };
}

export default function ResultDetailPage({
  initialData,
}: {
  initialData?: ResultDetailInitialData;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = useCallback((href: string) => withLocale(href, locale), [locale]);

  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [seed] = useState(() => deriveSeed(initialData));
  const customer = initialData?.customer ?? null;

  const [loading, setLoading] = useState(!initialData?.detail);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [row, setRow] = useState<MpConfigResponseRow | null>(seed.row);
  const [orderNumber, setOrderNumber] = useState<string | null>(seed.orderNumber);
  const [linkedOrder, setLinkedOrder] = useState<LinkedOrderDetail | null>(seed.order);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [suggestion, setSuggestion] = useState<MpConfigSuggestion | null>(seed.suggestion);
  const [suggestionMissing, setSuggestionMissing] = useState<string[]>(seed.suggestionMissing);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const [draft, setDraft] = useState<MeasurementData>(seed.draft);

  const [assignSize, setAssignSize] = useState<PillowSize>(seed.assignSize);
  const [assignTier, setAssignTier] = useState<PillowTier>(seed.assignTier);
  const [assignLength, setAssignLength] = useState(seed.assignLength);
  const [fillingTemplateId, setFillingTemplateId] = useState<string>(seed.fillingTemplateId);
  const [fillingTemplates, setFillingTemplates] = useState<FillingTemplateOption[]>(
    seed.fillingTemplates,
  );
  const [assignPrep, setAssignPrep] = useState<AssignPrepData | null>(seed.assignPrep);
  // The Result's own saved mix, and the editor's working copy. The editor opens
  // on the saved mix when it has pieces (a template is then only the reference
  // Save assignment names); otherwise on the recommended template. Pillow =
  // spatial cells; bolster = single-compartment slot list (own schema, no cap).
  const [savedMix, setSavedMix] = useState<SavedMix>(seed.savedMix);
  const [placements, setPlacements] = useState<PillowPlacement[]>(seed.savedMix.pillow);
  const [bolsterMix, setBolsterMix] = useState<BolsterPlacement[]>(seed.savedMix.bolster);
  /** Where the editor's mix came from: the Result's saved snapshot, or the template last picked. */
  const [mixOrigin, setMixOrigin] = useState<"saved" | "template">(
    seed.savedMix.pillow.length || seed.savedMix.bolster.length ? "saved" : "template",
  );
  const [savingMix, setSavingMix] = useState(false);
  const [templateHadPlacements, setTemplateHadPlacements] = useState(true);
  const [colorOverrides, setColorOverrides] = useState<ColorOverrideRow[]>(seed.colorOverrides);
  const [dimensionOverrides, setDimensionOverrides] = useState<DimensionOverridesPayload | undefined>(seed.dimensionOverrides);
  const [templateLegacyLines, setTemplateLegacyLines] = useState<Array<{ item_id: number; quantity: number }>>([]);
  const [templateNotes, setTemplateNotes] = useState("");
  const [fillingItems, setFillingItems] = useState<BolsterListItem[]>(seed.fillingItems);

  // The server already delivered the row, the assignment preview and the
  // filling items; skip those mount fetches. Every re-fetch after a mutation
  // (save / assign / release) is untouched.
  const skipDetailFetch = useRef(Boolean(initialData?.detail));
  const skipPrepFetch = useRef(Boolean(initialData?.assignPrep));
  const skipFillingItemsFetch = useRef(Boolean(initialData?.fillingItems));
  const skipScopeReset = useRef(Boolean(initialData?.detail));
  const [prepLoading, setPrepLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [requestingPayment, setRequestingPayment] = useState(false);
  /** Customer's tokenised status URL, returned by the route — never built here. */
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [paymentLinkCopied, setPaymentLinkCopied] = useState(false);

  useSettingsBreadcrumbDetail(draft.name.trim() || orderNumber || null);

  const headerMeta = useMemo(() => {
    if (!row) return null;
    return {
      createdAt: row.created_at ? formatAdminDateTime(row.created_at) : "—",
      updatedAt: row.updated_at ? formatAdminDateTime(row.updated_at) : "—",
    };
  }, [row]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(id)}`, { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't load the result.");
      const response = payload?.response as MpConfigResponseRow | null;
      setRow(response);
      setOrderNumber((payload?.order_number as string) ?? null);
      setLinkedOrder((payload?.order as LinkedOrderDetail | null) ?? null);
      const sug = (payload?.suggestion ?? null) as MpConfigSuggestion | null;
      setSuggestion(sug);
      setSuggestionMissing(missingFromPayload(payload));
      setDraft(normalizeMeasurement(response?.data ?? null));

      const size =
        (response?.assigned_size as PillowSize | null) ??
        (response?.suggested_size as PillowSize | null) ??
        sug?.recommended.size ??
        "M";
      const tier =
        (response?.assigned_tier as PillowTier | null) ??
        (response?.suggested_tier as PillowTier | null) ??
        sug?.recommended.tier ??
        "basic";
      setAssignSize(size);
      setAssignTier(tier);
      setAssignLength(response?.assigned_length ?? response?.suggested_length ?? "");
      setFillingTemplateId(
        response?.filling_template_id != null ? String(response.filling_template_id) : "",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the result.");
      setRow(null);
      setSuggestion(null);
      setSuggestionMissing([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const productType = row?.product_type === "bolster" ? "bolster" : "pillow";
  const sizeKey = productType === "bolster" ? assignLength : assignSize;
  /**
   * What the page does with the Result's filling mix (`lib/results/filling-mix.ts`):
   * `assign` on a held Result (Save assignment), `draft` on a Draft Result Staff
   * lay out ahead of the customer (Save mix), `view` once it is assigned or later.
   */
  const mixMode = row ? fillingMixMode(row) : "view";
  const canEditMix = mixMode !== "view";
  const hasSavedMix = savedMix.pillow.length > 0 || savedMix.bolster.length > 0;
  /**
   * Re-open this build in the configurator (`lib/results/staff-edit.ts`) rather
   * than growing a second editor here. Mirrors `staffEditableResult`: the two
   * open states, no Order yet, and Mpillow only — Mbolster composes through its
   * own schema and stays with the assignment card above.
   */
  const canReconfigure =
    productType === "pillow" &&
    !row?.order_id &&
    (row?.status === "held" || row?.status === "assigned") &&
    Boolean(row?.assigned_size ?? row?.suggested_size) &&
    Boolean(row?.assigned_tier ?? row?.suggested_tier);
  // Both open states. Once an Order exists the money moves through the Order, not here.
  const canCancel =
    !row?.order_id && (row?.status === "held" || row?.status === "assigned");

  const engineRecord = useMemo(
    () => parseRecommendationRecord(row?.recommendation_record ?? null),
    [row?.recommendation_record],
  );
  const hasAssistSnapshot = Boolean(row?.filling_fingerprint);
  const sizeScopeChanged = useMemo(() => {
    if (!row) return false;
    if (productType === "bolster") {
      return Boolean(
        assignLength &&
          row.suggested_length &&
          assignLength !== row.suggested_length,
      );
    }
    return (
      (row.suggested_size != null && assignSize !== row.suggested_size) ||
      (row.suggested_tier != null && assignTier !== row.suggested_tier)
    );
  }, [row, productType, assignLength, assignSize, assignTier]);

  const loadAssignPrep = useCallback(async () => {
    if (!canEditMix || !sizeKey) {
      setAssignPrep(null);
      setFillingTemplates([]);
      return;
    }
    setPrepLoading(true);
    setTemplatesLoading(true);
    try {
      const hintSource = selectAssignHintSource({
        engineTemplateId: engineRecord?.templateId,
        sizeScopeChanged,
        hasAssistFillingSnapshot: hasAssistSnapshot,
      });
      const preferred = resolveAssignHintTemplateId({
        engineTemplateId: engineRecord?.templateId,
        defaultTemplateId: null,
        sizeScopeChanged,
        hasAssistFillingSnapshot: hasAssistSnapshot,
      });
      const qs =
        productType === "bolster"
          ? new URLSearchParams({
              productType: "bolster",
              length: assignLength || "medium",
            })
          : new URLSearchParams({
              productType: "pillow",
              size: assignSize,
              tier: assignTier,
            });
      if (preferred != null) qs.set("preferredTemplateId", String(preferred));
      qs.set("hintSource", hintSource);
      const res = await fetch(`/api/results/assign/prep?${qs.toString()}`);
      const payload = (await res.json().catch(() => null)) as AssignPrepData | { error?: string } | null;
      if (!res.ok) throw new Error((payload as { error?: string })?.error ?? "Couldn't load the assignment preview.");
      const prep = payload as AssignPrepData;
      setAssignPrep(prep);
      setFillingTemplates(
        prep.fillingTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          key: sizeKey,
          kind: productType,
          role: "filling",
          is_active: true,
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the assignment preview.");
      setAssignPrep(null);
      setFillingTemplates([]);
    } finally {
      setPrepLoading(false);
      setTemplatesLoading(false);
    }
  }, [
    canEditMix,
    sizeKey,
    productType,
    assignLength,
    assignSize,
    assignTier,
    engineRecord?.templateId,
    sizeScopeChanged,
    hasAssistSnapshot,
  ]);

  // Read by the size-change effect without re-running it when the origin moves.
  const mixOriginRef = useRef(mixOrigin);
  useEffect(() => {
    mixOriginRef.current = mixOrigin;
  }, [mixOrigin]);

  // Size×tier (or length) change clears the filling pick; the prep effect below
  // reloads the Default Filling Template hint for the new key. A template's mix
  // is cleared with it and re-seeded from the new hint. The Result's own saved
  // mix stays: nothing in a recipe is size-specific, and the fit redraws it at
  // the new Size.
  useEffect(() => {
    // Seeded state is already in sync on mount — only a real size/tier/length
    // change should clear the operator's pick.
    if (skipScopeReset.current) {
      skipScopeReset.current = false;
      return;
    }
    setFillingTemplateId("");
    // The old size's hint must not re-seed the mix before the new prep lands.
    setAssignPrep(null);
    if (mixOriginRef.current !== "saved") {
      setPlacements([]);
      setBolsterMix([]);
    }
    setTemplateHadPlacements(true);
    setTemplateLegacyLines([]);
  }, [assignSize, assignTier, assignLength, productType]);

  useEffect(() => {
    if (skipPrepFetch.current) {
      skipPrepFetch.current = false;
      return;
    }
    if (!row || !canEditMix) return;
    void loadAssignPrep();
  }, [row, canEditMix, loadAssignPrep]);

  // Filling Items for the spatial editor (pillow cells or bolster compartment).
  useEffect(() => {
    if (skipFillingItemsFetch.current) {
      skipFillingItemsFetch.current = false;
      return;
    }
    if (!canEditMix) return;
    let cancelled = false;
    (async () => {
      const { supabaseClient } = await import("@/lib/supabase/client");
      const { data } = await supabaseClient
        .from("items")
        .select("id,name,subtype,size")
        .or(PLACEABLE_ITEMS_OR)
        .eq("is_active", true)
        .order("name");
      if (!cancelled) {
        setFillingItems(
          (data ?? []).map((i) => ({
            id: Number(i.id),
            label: fillingLabel(i),
            // name/subtype/size feed the bolster picker's family grouping.
            name: i.name,
            subtype: i.subtype ?? null,
            size: i.size ?? null,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canEditMix, productType]);

  /**
   * Load a template. Picking one starts the mix over from it; `keepMix` loads
   * only what describes it (notes, legacy lines) and leaves the editor on the
   * Result's own saved mix, which the template is then just the reference for.
   */
  const loadSelectedFillingPreview = useCallback(
    async (templateId: string, opts: { keepMix?: boolean } = {}) => {
      if (!templateId) {
        if (!opts.keepMix) {
          setPlacements([]);
          setBolsterMix([]);
        }
        setTemplateHadPlacements(true);
        setTemplateLegacyLines([]);
        setTemplateNotes("");
        return;
      }
      try {
        const res = await fetch(
          to(`/settings/inventory/configure/templates/${encodeURIComponent(templateId)}`),
        );
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Couldn't load the template.");
        type LineRow = { item_id: number | string; quantity: number | string };
        const lines = ((payload?.lines ?? []) as LineRow[]).map((l) => ({
          item_id: Number(l.item_id),
          quantity: Number(l.quantity),
        }));
        // Confirming a template loads its placements into the spatial editor;
        // legacy flat templates load an empty editor (notice shown, like Configure).
        // Bolster rows are slot-only — never the pillow enums.
        if (productType === "pillow") {
          const placementRows = (payload?.placements ?? []) as PillowPlacementRow[];
          if (!opts.keepMix) setPlacements(rowsToPillowPlacements(placementRows));
          setTemplateHadPlacements(placementRows.length > 0);
        } else {
          const placementRows = (payload?.placements ?? []) as BolsterPlacementRow[];
          if (!opts.keepMix) setBolsterMix(rowsToBolsterPlacements(placementRows));
          setTemplateHadPlacements(placementRows.length > 0);
        }
        if (!opts.keepMix) setMixOrigin("template");
        setTemplateLegacyLines(lines);
        setTemplateNotes(String(payload?.template?.notes ?? ""));
        // Product Builder colours for the x-ray — same server route as Configure,
        // because filling_color_overrides is service-role-only under RLS.
        setColorOverrides((payload?.colorOverrides ?? []) as ColorOverrideRow[]);
        setDimensionOverrides((payload?.dimensionOverrides ?? undefined) as DimensionOverridesPayload | undefined);
      } catch {
        // A template that will not load never wipes the Result's own mix.
        if (opts.keepMix) return;
        setPlacements([]);
        setBolsterMix([]);
      }
    },
    [productType, to],
  );

  // Open the Filling mix pre-filled. A Result with its own saved mix opens on
  // it, and the template select names the template it still matches (else the
  // recommendation) as the reference Save assignment needs. Otherwise the
  // recommended (engine or size-default) template loads straight into the
  // x-ray, so Staff confirm or adjust a real mix instead of starting from a
  // hidden editor. Re-seeds after a size/tier change, which clears the pick and
  // reloads the prep.
  const ownTemplateId = row?.filling_template_id ?? null;
  useEffect(() => {
    if (!canEditMix || fillingTemplateId || !assignPrep) return;
    const own =
      ownTemplateId != null && assignPrep.fillingTemplates.some((t) => t.id === ownTemplateId) ? ownTemplateId : null;
    // Save assignment needs a template to name even when the mix is the Result's
    // own; with no recommendation for this size, the first one serves (the server
    // keeps it on the Result only if the mix still matches it exactly).
    const fallback = mixMode === "assign" && mixOriginRef.current === "saved" ? (assignPrep.fillingTemplates[0]?.id ?? null) : null;
    const pick = own ?? assignPrep.defaultFillingTemplate?.id ?? fallback;
    if (pick == null) return;
    const next = String(pick);
    setFillingTemplateId(next);
    void loadSelectedFillingPreview(next, { keepMix: mixOriginRef.current === "saved" });
  }, [canEditMix, mixMode, fillingTemplateId, assignPrep, ownTemplateId, loadSelectedFillingPreview]);

  /** Re-read the Result's saved mix (after a save, or when the page loaded without it) and open the editor on it. */
  const loadFillingMix = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/results/${encodeURIComponent(id)}/filling-mix`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't load the filling mix.");
      const mix = payload as ResultFillingMixPayload;
      const next = savedMixOf(mix);
      setSavedMix(next);
      setColorOverrides(mix.colorOverrides ?? []);
      setDimensionOverrides(mix.dimensionOverrides);
      if (next.pillow.length || next.bolster.length) {
        setPlacements(next.pillow);
        setBolsterMix(next.bolster);
        setMixOrigin("saved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the filling mix.");
    }
  }, [id]);

  // Rendered without the server's first paint (a client navigation fallback): fetch the saved mix too.
  const skipFillingMixFetch = useRef(initialData?.fillingMix !== undefined);
  useEffect(() => {
    if (skipFillingMixFetch.current) return;
    skipFillingMixFetch.current = true;
    void loadFillingMix();
  }, [loadFillingMix]);

  /** Put the Result's saved mix back in the editor after trying a template. */
  const restoreSavedMix = useCallback(() => {
    setPlacements(savedMix.pillow);
    setBolsterMix(savedMix.bolster);
    setMixOrigin("saved");
  }, [savedMix]);

  /**
   * Draft Result: save the mix onto it ahead of the customer submitting
   * (`/api/results/[id]/filling-mix`). No status, price or email moves; the
   * hold keeps it, and Save assignment confirms it once they have submitted.
   */
  const saveDraftMix = useCallback(async () => {
    if (!id) return;
    setSavingMix(true);
    try {
      const res = await fetch(`/api/results/${encodeURIComponent(id)}/filling-mix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: assignTier,
          fillingTemplateId: fillingTemplateId ? Number(fillingTemplateId) : null,
          placements: pillowPlacementsToRows(placements),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "Couldn't save the mix.";
        throw new Error(message);
      }
      toast.success(
        payload?.pieces
          ? "Mix saved on this result. It waits for the customer to submit."
          : "Mix cleared from this result",
      );
      // Only the snapshot moved, so only it is re-read. A full reload would reset
      // the size and the template pick to the row's and re-seed a template over
      // the mix just saved.
      setRow((prev) =>
        prev
          ? {
              ...prev,
              filling_fingerprint: (payload?.fillingFingerprint as string | null | undefined) ?? null,
              filling_template_id: (payload?.fillingTemplateId as number | null | undefined) ?? null,
            }
          : prev,
      );
      await loadFillingMix();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the mix.");
    } finally {
      setSavingMix(false);
    }
  }, [id, assignTier, fillingTemplateId, placements, loadFillingMix]);

  const assign = useCallback(async () => {
    if (!id) return;
    if (!fillingTemplateId) {
      toast.error("Choose a filling template.");
      return;
    }
    setAssigning(true);
    try {
      // Spatial Result snapshot per kind; server clears the template id on divergence.
      const body =
        productType === "bolster"
          ? {
              assignedLength: assignLength || "medium",
              fillingTemplateId: Number(fillingTemplateId),
              placements: bolsterPlacementsToRows(bolsterMix),
            }
          : {
              assignedSize: assignSize,
              assignedTier: assignTier,
              fillingTemplateId: Number(fillingTemplateId),
              placements: pillowPlacementsToRows(placements),
            };
      const res = await fetch(`/api/results/${encodeURIComponent(id)}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't save the assignment.");
      toast.success(
        payload?.emailStatus === "sent"
          ? "Assigned and emailed to the customer"
          : "Assigned",
      );
      // The assigned snapshot is now the Result's own mix: the read-only view draws it.
      await Promise.all([load(), loadFillingMix()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the assignment.");
    } finally {
      setAssigning(false);
    }
  }, [
    id,
    fillingTemplateId,
    productType,
    assignLength,
    assignSize,
    assignTier,
    placements,
    bolsterMix,
    load,
    loadFillingMix,
  ]);

  // Re-send the priced email and fetch the customer's link. The route reprices
  // the Result from its current configuration, so the stored final amount can
  // change here — reload afterwards rather than leave a stale number on screen.
  // Still safe to press twice: the same build reprices to the same total.
  const requestPayment = useCallback(async () => {
    if (!id) return;
    setRequestingPayment(true);
    try {
      const res = await fetch(
        `/api/results/${encodeURIComponent(id)}/request-payment`,
        { method: "POST" },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't request payment.");
      setPaymentLink((payload?.statusUrl as string | undefined) ?? null);
      // Three outcomes, not two: emailStatus "failed" comes back with HTTP 200.
      const emailStatus = payload?.emailStatus as
        | "sent"
        | "failed"
        | "skipped"
        | undefined;
      if (emailStatus === "sent") {
        // Which template went out is the operator's confirmation that the
        // customer was told the price moved — not just that mail was sent.
        toast.success(
          payload?.emailTemplate === "updated"
            ? "Repriced. The customer has the updated build and new total."
            : "Payment email sent",
        );
      } else if (emailStatus === "failed") {
        toast.error("Couldn't send the payment email. The link below still works.");
      } else {
        toast.success("Link ready, but there's no customer email on file.");
      }
      // The route stores the recomputed total, so the amount on screen is stale.
      if (payload?.repriced === "updated") await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't request payment.");
    } finally {
      setRequestingPayment(false);
    }
  }, [id, load]);

  const copyPaymentLink = async () => {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setPaymentLinkCopied(true);
      setTimeout(() => setPaymentLinkCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link stays selectable in the input */
    }
  };

  useEffect(() => {
    if (skipDetailFetch.current) {
      skipDetailFetch.current = false;
      return;
    }
    load();
  }, [load]);

  // Every Item the mix draws: the active placeable Items, plus any piece the
  // saved mix places that they no longer list (a read-only build loads only those).
  const mixItems = useMemo(() => {
    const known = new Set(fillingItems.map((i) => i.id));
    const extra = savedMix.items.filter((i) => !known.has(i.id));
    return extra.length ? [...fillingItems, ...extra] : fillingItems;
  }, [fillingItems, savedMix.items]);
  const fillingLabelById = useMemo(
    () => new Map(mixItems.map((i) => [i.id, i.label])),
    [mixItems],
  );
  // A neck support or an ear pad is for premium pillows only — never offered on
  // basic or a bolster. A piece the saved mix already places stays drawable.
  const pickerItems = useMemo(() => {
    if (productType === "pillow" && assignTier === "premium") return mixItems;
    const placed = new Set(savedMix.items.map((i) => i.id));
    return mixItems.filter((i) => placed.has(i.id) || (!NECK_SUPPORT.test(i.name) && !EAR_PAD.test(i.name)));
  }, [mixItems, savedMix.items, productType, assignTier]);
  // Slice 04: the physical fit of the assignment at its Size — one object for
  // the x-ray, the save confirm and the cross-section.
  const fit = usePillowFit(placements, assignSize, pickerItems, dimensionOverrides);
  // Slice 05: the cross-sections under the x-ray; the dived Section's cut is ringed.
  const { setCut, onDiveChange } = useCut();
  const [divedSection, setDivedSection] = useState<Section | null>(null);
  const onXrayDive = useCallback(
    (section: Section | null) => {
      onDiveChange(section);
      setDivedSection(section);
    },
    [onDiveChange],
  );
  // The workbench follows the card's width (a sidebar can be open or collapsed):
  // wide, the dived Section's controls dock in the rail beside the x-ray.
  const [workbenchRef, workbenchWidth] = useElementWidth<HTMLDivElement>();
  const wideWorkbench = workbenchWidth >= 760;
  const [controlsSlot, setControlsSlot] = useState<HTMLElement | null>(null);
  // Whether the editor still shows exactly what is saved on the Result.
  const mixDirty = useMemo(
    () =>
      productType === "bolster"
        ? !placementsExactMatch(bolsterMix, savedMix.bolster)
        : !placementsExactMatch(placements, savedMix.pillow),
    [productType, placements, bolsterMix, savedMix],
  );
  const { itemSubtypes: pickerItemSubtypes, itemSizes: pickerItemSizes, itemDims: pickerItemDims } = useItemMaps(pickerItems, dimensionOverrides);
  // ADR 0025: the soft cut draws with the settings Staff saved, carried by the same payload.
  const softBody = useMemo(() => softBodyFromPayload(dimensionOverrides), [dimensionOverrides]);
  // Slice 09: the Mbolster's fit at the assigned length, for the confirm and the end-on cut.
  const bolsterLength = (["short", "medium", "long"] as const).find((l) => l === assignLength) ?? "medium";
  const bolsterFit = useBolsterFit(bolsterMix, bolsterLength as BolsterLength, pickerItems, dimensionOverrides);

  const refreshSuggestion = useCallback(async () => {
    if (!id) return;
    setSuggestionLoading(true);
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(id)}`, { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't refresh the suggestion.");
      setSuggestion((payload?.suggestion ?? null) as MpConfigSuggestion | null);
      setSuggestionMissing(missingFromPayload(payload));
      const response = payload?.response as MpConfigResponseRow | null;
      if (response) setRow(response);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't refresh the suggestion.");
    } finally {
      setSuggestionLoading(false);
    }
  }, [id]);

  const save = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/mp-config/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          data: draft,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't save.");
      toast.success("Saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }, [draft, id, load]);

  const deleteRow = useCallback(async () => {
    if (!id) return;
    const ok = window.confirm("Delete this result? This can't be undone.");
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't delete.");
      toast.success("Deleted");
      router.push(to("/settings/results"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete.");
    } finally {
      setDeleting(false);
    }
  }, [id, router, to]);

  /**
   * Staff void. Covers both open states — unlike the SLA cron, which only expires
   * `held`, so an `assigned` Result whose customer goes quiet had no exit at all.
   * A release failure offers force: a Stripe auth that already died cannot be
   * cancelled, and refusing outright would strand the row forever.
   */
  const cancelResult = useCallback(
    async (force: boolean) => {
      if (!id) return;
      setCancelling(true);
      try {
        const res = await fetch(`/api/results/${encodeURIComponent(id)}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force, reason: cancelReason.trim() || undefined }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          if (payload?.canForce) {
            setCancelError(payload?.error ?? "Couldn't release the hold.");
            return;
          }
          throw new Error(payload?.error ?? "Couldn't cancel the result.");
        }
        toast.success(
          payload?.holdReleased ? "Result cancelled and hold released" : "Result cancelled",
        );
        setCancelDialogOpen(false);
        setCancelError(null);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't cancel the result.");
      } finally {
        setCancelling(false);
      }
    },
    [cancelReason, id, load],
  );

  // Phones: the header cluster moves into the bottom dock, within thumb reach.
  // Built before the early returns so the hook order never changes; the ids are
  // stable, so the dock animates values rather than remounting buttons.
  const dockActions = useMemo<DockAction[]>(() => {
    const actions: DockAction[] = [];
    if (canReconfigure && row) {
      actions.push({
        id: "reconfigure",
        title: "Edit configuration",
        icon: SlidersHorizontal,
        onClick: () => router.push(to(`/mp-config?result=${encodeURIComponent(row.id)}&edit=1`)),
      });
    }
    if (canCancel) {
      actions.push({
        id: "cancel",
        title: "Cancel result",
        icon: Ban,
        onClick: () => setCancelDialogOpen(true),
        active: cancelDialogOpen,
      });
    }
    if (row) {
      actions.push({ id: "save", title: saving ? "Saving…" : "Save", icon: Save, onClick: () => void save() });
    }
    return actions;
  }, [canCancel, canReconfigure, cancelDialogOpen, router, row, save, saving, to]);
  useMobileDockActions(dockActions);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <div>
          <h1>Result</h1>
          <p className="text-sm text-muted-foreground">Couldn&apos;t find or load this result.</p>
        </div>
        <PageActions>
          <Button
            variant="secondary"
            className={pageActionClassName}
            onClick={() => router.push(to("/settings/results"))}
          >
            Back
          </Button>
          <Button className={pageActionClassName} onClick={load}>
            Retry
          </Button>
        </PageActions>
      </div>
    );
  }

  const sizeTierFields = (
    <>
      <Field label="Size">
        <Select value={assignSize} onValueChange={(v) => setAssignSize(v as PillowSize)}>
          <SelectTrigger className="max-md:w-full max-md:min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["XS", "S", "M", "L", "XL"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Tier">
        <Select value={assignTier} onValueChange={(v) => setAssignTier(v as PillowTier)}>
          <SelectTrigger className="max-md:w-full max-md:min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  );

  // The short state beside the Filling mix title.
  const mixStatusLabel =
    mixMode === "view"
      ? "Read-only"
      : mixMode === "draft"
        ? !hasSavedMix
          ? placements.length
            ? "Not saved yet"
            : "Nothing placed yet"
          : mixDirty
            ? "Unsaved changes"
            : "Saved on this result"
        : hasSavedMix && mixOrigin === "saved"
          ? mixDirty
            ? "Saved mix, edited"
            : "Saved on this result"
          : fillingTemplateId
            ? "From a template"
            : "Needs confirming";

  /**
   * One Filling mix workbench for every state (`filling-mix-workbench.tsx`):
   * editable on a held Result (Save assignment) and a Draft Result (Save mix),
   * read-only after. Rendered in one place at a time, so the width measure
   * and the dock slot belong to whichever card shows it.
   */
  const renderFillingMix = () => {
    const editable = canEditMix;
    const isPillow = productType === "pillow";
    const hint = assignPrep?.defaultFillingTemplate ?? null;
    const pieceCount = isPillow ? placements.length : bolsterMix.length;

    const notices: ReactNode[] = [];
    if (editable && hasSavedMix) {
      notices.push(
        <div
          key="saved"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">
            {mixOrigin === "saved"
              ? mixMode === "assign"
                ? "Showing the mix saved on this result. Save assignment confirms it; the template is only a reference."
                : "Showing the mix saved on this result."
              : "Showing the template. The mix saved on this result is kept until you save."}
          </span>
          {mixOrigin === "template" && (
            <Button type="button" size="sm" variant="outline" onClick={restoreSavedMix}>
              Back to the saved mix
            </Button>
          )}
        </div>,
      );
    }
    if (editable && mixOrigin === "template" && !templateHadPlacements && templateLegacyLines.length > 0) {
      notices.push(
        <div key="legacy" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <div className="font-medium">Legacy flat recipe. Saving gives each piece a placement.</div>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {templateLegacyLines.map((l) => (
              <li key={l.item_id}>
                {fillingLabelById.get(l.item_id) ?? `Item #${l.item_id}`} × {l.quantity}
              </li>
            ))}
          </ul>
        </div>,
      );
    }
    if (editable && isPillow && placements.length > 0 && !isSpatiallyAuthored(placements)) {
      notices.push(
        <div key="unauthored" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <div className="font-medium">Not spatially authored.</div>
          <p className="mt-1 text-muted-foreground">
            {unauthoredReason(placements.map((p) => p.section))}{" "}
            {looksLikeLegacyImport(placements.map((p) => p.section))
              ? "These placements were auto-generated from a legacy flat recipe. "
              : ""}
            Lay the pieces out before confirming the build.
          </p>
        </div>,
      );
    }

    const picker = editable ? (
      <div className="space-y-1.5">
        <Field label="Filling template">
          <Select
            value={fillingTemplateId}
            onValueChange={(value) => {
              setFillingTemplateId(value);
              void loadSelectedFillingPreview(value);
            }}
          >
            <SelectTrigger className="w-full min-w-0" disabled={templatesLoading || !sizeKey}>
              <SelectValue
                placeholder={
                  templatesLoading
                    ? "Loading…"
                    : fillingTemplates.length
                      ? "Choose a template…"
                      : "No templates for this size"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {fillingTemplates.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">
          {prepLoading ? (
            "Loading the recommendation…"
          ) : hint ? (
            <>
              {assignPrep?.hintSource === "engine" ? "Engine pick" : "Size default"}:{" "}
              <span className="font-medium text-foreground">{hint.name}</span>
              {engineRecord && assignPrep?.hintSource === "engine" ? <> · {plainLanguageWhy(engineRecord)}</> : null}
            </>
          ) : (
            "No default template for this size."
          )}
        </p>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">
        {row.filling_template_id != null ? `From template #${row.filling_template_id}` : "Custom mix"}
        {pieceCount ? ` · ${pieceCount} piece${pieceCount === 1 ? "" : "s"}` : ""}
      </p>
    );

    const xray = isPillow ? (
      <div className="mx-auto w-full max-w-[52rem]">
        <XrayEditor
          placements={placements}
          onPlacementsChange={editable ? setPlacements : undefined}
          items={pickerItems}
          pillowSize={assignSize}
          colorOverrides={colorOverrides}
          dimensionOverrides={dimensionOverrides}
          fit={fit}
          onDiveChange={onXrayDive}
          controlsSlot={editable && wideWorkbench ? controlsSlot : null}
        />
      </div>
    ) : editable ? (
      // Mbolster: single compartment — ordered list, no cap, never the 3×3 grid.
      <BolsterCompartmentList value={bolsterMix} onChange={setBolsterMix} items={pickerItems} />
    ) : null;

    const cuts = isPillow ? (
      <XrayCrossSectionStrip
        fit={fit}
        active={divedSection}
        onActiveChange={editable ? setCut : undefined}
        itemSubtypes={pickerItemSubtypes}
        itemSizes={pickerItemSizes}
        itemDims={pickerItemDims}
        placements={placements}
        onPlacementsChange={editable ? setPlacements : undefined}
        items={pickerItems}
        colorOverrides={colorOverrides}
        softBody={softBody}
      />
    ) : (
      <BolsterCrossSection fit={bolsterFit} itemSubtypes={pickerItemSubtypes} colorOverrides={colorOverrides} />
    );

    const dock =
      editable && isPillow && wideWorkbench ? (
        <XraySectionDock dived={divedSection} onSlot={setControlsSlot} className="flex max-h-[28rem]" />
      ) : null;

    const actions =
      mixMode === "assign" ? (
        <Button
          className="w-full"
          onClick={() => {
            // Slice 04: a cell that cannot close is a confirm, never a block (ADR 0019).
            if (productType === "pillow" && !confirmSaveWithOverCells(fit, "Save assignment")) return;
            if (productType === "bolster" && !confirmSaveWithBolsterFit(bolsterFit, "Save assignment")) return;
            void assign();
          }}
          disabled={assigning || !fillingTemplateId}
        >
          {assigning ? "Assigning…" : "Save assignment"}
        </Button>
      ) : mixMode === "draft" ? (
        <Button
          className="w-full"
          onClick={() => {
            if (!confirmSaveWithOverCells(fit, "Save mix")) return;
            void saveDraftMix();
          }}
          disabled={savingMix || !mixDirty}
        >
          {savingMix ? "Saving…" : mixDirty || !hasSavedMix ? "Save mix" : "Mix saved"}
        </Button>
      ) : canReconfigure ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => router.push(to(`/mp-config?result=${encodeURIComponent(row.id)}&edit=1`))}
        >
          Edit configuration
        </Button>
      ) : null;

    const packList = (
      <WorkbenchTile
        title="Derived pack list"
        aside={<span className="tabular-nums">{pieceCount} piece{pieceCount === 1 ? "" : "s"}</span>}
      >
        {isPillow ? (
          <XrayPackList placements={placements} onPlacementsChange={editable ? setPlacements : undefined} items={mixItems} />
        ) : (
          <XrayPackList placements={bolsterMix} onPlacementsChange={editable ? setBolsterMix : undefined} items={mixItems} />
        )}
      </WorkbenchTile>
    );

    const notes =
      templateNotes && mixOrigin === "template" ? (
        <div className="mt-3 border-t pt-2">
          <div className="text-xs text-muted-foreground mb-1">Assembly notes</div>
          <p className="whitespace-pre-wrap text-sm">{templateNotes}</p>
        </div>
      ) : null;
    const insertSteps = isPillow ? (
      <InsertOrderList placements={placements} onPlacementsChange={editable ? setPlacements : undefined} items={mixItems} />
    ) : null;
    // The insert order folds away: one row per piece runs far longer than the
    // pack list beside it, and the build team reads it after the pack list.
    const insertOrder = isPillow ? (
      <Collapsible className="min-w-0 rounded-md border">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted/50 active:bg-press [&[data-state=open]>svg]:rotate-180">
          <span>
            Insert order
            <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
              {pieceCount} step{pieceCount === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronDown className="size-4 transition-transform" aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-3 py-3">
          {insertSteps}
          {notes}
        </CollapsibleContent>
      </Collapsible>
    ) : notes ? (
      <WorkbenchTile title="Assembly notes">{notes}</WorkbenchTile>
    ) : undefined;

    return (
      <FillingMixWorkbench
        measureRef={workbenchRef}
        wide={wideWorkbench}
        notice={notices.length ? <div className="space-y-2">{notices}</div> : undefined}
        picker={picker}
        xray={xray}
        dock={dock}
        actions={actions}
        cuts={cuts}
        packList={packList}
        insertOrder={insertOrder}
      />
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h1>Result details</h1>
            <Button
              variant="secondary"
              size="icon"
              className="md:hidden"
              onClick={load}
              disabled={saving || deleting}
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground break-all max-md:hidden">{row.id}</p>
          {headerMeta ? (
            <p className="text-xs text-muted-foreground mt-1">
              Created {headerMeta.createdAt}, updated {headerMeta.updatedAt}
            </p>
          ) : null}
        </div>
        {/* Phones: Edit configuration, Cancel and Save are in the dock, Refresh
            sits beside the title, and the shell breadcrumb is the way back. */}
        <PageActions className="max-md:hidden">
          <Button
            variant="secondary"
            className={pageActionClassName}
            onClick={() => router.push(to("/settings/results"))}
          >
            Back
          </Button>
          <Button
            variant="secondary"
            className={pageActionClassName}
            onClick={load}
            disabled={saving || deleting}
          >
            Refresh
          </Button>
          {canReconfigure && (
            <Button
              variant="secondary"
              className={cn(pageActionClassName, pageActionDockedClassName)}
              onClick={() =>
                router.push(to(`/mp-config?result=${encodeURIComponent(row.id)}&edit=1`))
              }
              disabled={saving || deleting}
            >
              Edit configuration
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              className={cn(
                pageActionClassName,
                pageActionDockedClassName,
                "border-destructive/40 text-destructive hover:bg-destructive/10",
              )}
              onClick={() => setCancelDialogOpen(true)}
              disabled={saving || deleting || cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel result"}
            </Button>
          )}
          <Button
            className={cn(pageActionWideClassName, pageActionDockedClassName)}
            onClick={save}
            disabled={saving || deleting}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </PageActions>
      </div>

      {/* Inline rather than a modal: keeps Radix Dialog out of this route's bundle. */}
      {cancelDialogOpen && (
        <Card className="border-destructive/40 p-4 space-y-3">
          <div>
            <div className="text-sm font-medium">Cancel this result?</div>
            <p className="text-sm text-muted-foreground">
              {row.payment_intent_id
                ? "This releases the hold on the customer's card and closes the result. They'd have to start again."
                : "This closes the result. There's no payment hold, so nothing is refunded."}
            </p>
          </div>
          <Field label="Reason (optional)">
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. customer changed their mind"
            />
          </Field>
          {cancelError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {cancelError}
              <div className="mt-1 text-muted-foreground">
                The hold couldn&apos;t be released. It may have already expired at Stripe.
                Force cancel closes the result anyway.
              </div>
            </div>
          )}
          <PageActions>
            <Button
              variant="destructive"
              className={pageActionClassName}
              onClick={() => void cancelResult(Boolean(cancelError))}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : cancelError ? "Force cancel" : "Cancel result"}
            </Button>
            <Button
              variant="secondary"
              className={pageActionClassName}
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelError(null);
              }}
              disabled={cancelling}
            >
              Keep it
            </Button>
          </PageActions>
        </Card>
      )}

      {/* Who this Result belongs to, for every Result: a Draft that stopped
          part-way most of all (ADR 0051). */}
      {initialData?.canViewCustomers ? (
        <ResultCustomerPanel
          resultId={row.id}
          resultName={typeof row.data?.name === "string" && row.data.name.trim() ? row.data.name.trim() : null}
          resultEmail={row.customer_email ?? null}
          resultPhone={row.customer_phone ?? null}
          editable={resultContactEditable({
            status: row.status ?? null,
            customer_email: row.customer_email ?? null,
            data: row.data,
          })}
          customer={customer}
          canEdit={initialData?.canEditCustomer === true}
          customerHref={(cid) => to(`/settings/customers/${cid}`)}
          onChanged={() => router.refresh()}
        />
      ) : null}

      {/* Purchase-path assignment (held Results) */}
      {(row.status === "held" || row.status === "assigned") && (
        // `#assignment`: the configurator sends Staff here after an Assist submit.
        <Card id="assignment" className="p-4 space-y-4 scroll-mt-20">
          <div>
            <div className="text-sm font-medium">Assignment</div>
            <p className="text-sm text-muted-foreground">
              {productType === "bolster"
                ? "Confirm or change the length and choose a bolster filling template. Saving emails the customer."
                : "Confirm or change the size and tier and choose a filling template. Saving emails the customer."}
            </p>
          </div>

          {row.status === "assigned" ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 text-sm">
                {productType === "bolster" ? (
                  <div className={valueTileClassName}>
                    <div className="text-xs text-muted-foreground">Length</div>
                    <div className="font-medium">{row.assigned_length ?? "—"}</div>
                  </div>
                ) : (
                  <>
                    <div className={valueTileClassName}>
                      <div className="text-xs text-muted-foreground">Size</div>
                      <div className="font-medium">{row.assigned_size ?? "—"}</div>
                    </div>
                    <div className={valueTileClassName}>
                      <div className="text-xs text-muted-foreground">Tier</div>
                      <div className="font-medium capitalize">{row.assigned_tier ?? "—"}</div>
                    </div>
                  </>
                )}
                <div className={valueTileClassName}>
                  <div className="text-xs text-muted-foreground">Filling template</div>
                  <div className="font-medium">
                    {row.filling_template_id != null ? `#${row.filling_template_id}` : "Custom mix"}
                  </div>
                </div>
                <div className={valueTileClassName}>
                  <div className="text-xs text-muted-foreground">Final amount</div>
                  <div className="font-medium tabular-nums">
                    {row.final_amount != null
                      ? `${row.currency ?? "SGD"} ${Number(row.final_amount).toFixed(2)}`
                      : "—"}
                  </div>
                  {row.measured_by_type === "staff" && row.product_type !== "bolster" ? (
                    // The fee follows who measured (ADR 0024); Mbolster carries none.
                    // "Measured by" locks once the Result is held, so a wrong value
                    // can't be corrected from the Results list after that.
                    <div className="mt-1 text-xs text-muted-foreground">
                      Measured by staff, so the measurement fee applies.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Button
                  variant="secondary"
                  onClick={requestPayment}
                  disabled={requestingPayment}
                >
                  {requestingPayment ? "Sending…" : "Request payment"}
                </Button>
                {paymentLink && (
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={paymentLink}
                      onFocus={(e) => e.currentTarget.select()}
                      className="text-xs"
                    />
                    <Button type="button" variant="outline" onClick={copyPaymentLink}>
                      {paymentLinkCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Reprices this result from its current configuration, emails the
                  customer and gives you their link to paste into WhatsApp. It&apos;s safe
                  to press twice, because the same build reprices to the same total.
                </p>
                <p className="text-sm text-muted-foreground">
                  If the price changed since they were last told (after{" "}
                  <span className="font-medium">Edit configuration</span>), they get
                  &ldquo;your build has been updated&rdquo;, showing the old total
                  beside the new one and what their card covers. Otherwise it re-sends
                  the build-ready email.
                </p>
              </div>

              {hasSavedMix && (
                <Collapsible defaultOpen className="rounded-lg border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 active:bg-press">
                    Filling mix
                    <span className="text-xs font-normal text-muted-foreground">{mixStatusLabel}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t px-4 py-3 max-md:px-3">
                    {renderFillingMix()}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                {productType === "bolster" ? (
                  <Field label="Length">
                    <Select
                      value={assignLength || "medium"}
                      onValueChange={setAssignLength}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["short", "medium", "long"] as const).map((len) => (
                          <SelectItem key={len} value={len}>
                            {len}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : (
                  sizeTierFields
                )}
              </div>

              <Collapsible defaultOpen className="rounded-lg border">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 active:bg-press">
                  Product
                  <span className="text-xs font-normal text-muted-foreground">
                    {prepLoading ? "Loading…" : `${assignPrep?.productLines.length ?? 0} parts`}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t px-4 py-3">
                  {prepLoading ? (
                    <p className="text-sm text-muted-foreground">Loading product recipe…</p>
                  ) : assignPrep?.productLines.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part</TableHead>
                          <TableHead className="w-[80px]">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignPrep.productLines.map((line, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-sm">
                              {line.category}, {line.label}
                            </TableCell>
                            <TableCell className="tabular-nums">×{line.qty}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No parts set up besides fillings.</p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible defaultOpen className="rounded-lg border">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 active:bg-press">
                  Filling mix
                  <span className="text-xs font-normal text-muted-foreground">{mixStatusLabel}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t px-4 py-3 max-md:px-3">
                  {renderFillingMix()}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {row.paired_build_id ? (
            <div className="rounded-md border bg-muted/40 p-2.5 text-sm">
              <span className="font-medium">Paired build.</span>{" "}
              {row.paired_build_id === row.id
                ? "This Mpillow carries an Mbolster on the same hold. The customer accepts both together; cancelling this one cancels the Mbolster too."
                : "This Mbolster rides with an Mpillow on the same hold and ships with it at no shipping charge. Cancelling it leaves the Mpillow."}
              {row.paired_result_id ? (
                <>
                  {" "}
                  <a
                    className="font-medium underline underline-offset-2 active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
                    href={to(`/settings/results/${row.paired_result_id}`)}
                  >
                    Open the {row.paired_build_id === row.id ? "Mbolster" : "Mpillow"}
                  </a>
                </>
              ) : null}
            </div>
          ) : null}


          {(row.authorized_amount != null ||
            row.customer_email ||
            row.customer_phone ||
            row.discovery_source) && (
            <div className="grid gap-3 sm:grid-cols-2 text-sm border-t pt-3">
              {row.authorized_amount != null && (
                <div>
                  <span className="text-muted-foreground">Authorized hold: </span>
                  <span className="tabular-nums">
                    {row.currency ?? "SGD"} {Number(row.authorized_amount).toFixed(2)}
                  </span>
                </div>
              )}
              {row.coupon_code && (
                <div>
                  <span className="text-muted-foreground">Discount code: </span>
                  <span className="font-medium">{row.coupon_code}</span>
                </div>
              )}
              {/* The Customer itself, and *Open customer*, are on the panel above. */}
              {row.customer_email && (
                <div>
                  <span className="text-muted-foreground">Email: </span>
                  {row.customer_email}
                </div>
              )}
              {row.customer_phone && (
                <div>
                  <span className="text-muted-foreground">Phone: </span>
                  <a
                    href={`tel:${row.customer_phone}`}
                    className="font-medium hover:underline active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
                  >
                    {row.customer_phone}
                  </a>
                </div>
              )}
              {row.discovery_source && (
                <div>
                  <span className="text-muted-foreground">Discovery source: </span>
                  {row.discovery_source_label ?? row.discovery_source}
                  {row.discovery_source_other ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({row.discovery_source_other})
                    </span>
                  ) : null}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Status: </span>
                <span className="font-medium">{row.status}</span>
                {row.is_pre_order ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    Pre-order
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* The filling mix outside the Assignment card: a Draft Result Staff lay out
          ahead of the customer, or a settled build's mix, read-only. */}
      {(mixMode === "draft" || (hasSavedMix && row.status !== "held" && row.status !== "assigned")) && (
        <Card id="filling-mix" className="p-4 space-y-4 scroll-mt-20">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-sm font-medium">Filling mix</div>
              <span className="text-xs text-muted-foreground">{mixStatusLabel}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {mixMode === "draft"
                ? "The customer hasn't submitted yet. Lay their fillings out now: the mix is saved on this result and is ready to confirm when it arrives in Needs assign. Saving it emails no one and doesn't change the price."
                : "The fillings this build was made with."}
            </p>
          </div>
          {mixMode === "draft" && (
            <div className="grid grid-cols-2 gap-3 sm:max-w-md sm:gap-4">
              {sizeTierFields}
            </div>
          )}
          {renderFillingMix()}
        </Card>
      )}

      {/* Linked Order — the fulfilment half of this customisation's story. */}
      {row.order_id && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Order</h2>
            <a
              href={to(`/settings/orders/${row.order_id}`)}
              className="text-sm font-semibold text-primary hover:underline active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
            >
              #{orderNumber ?? "view"}
            </a>
            {linkedOrder?.status && (
              <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize">
                {linkedOrder.status.replace(/_/g, " ")}
              </span>
            )}
            {row.source === "online_customization" && (
              <span className="ml-auto rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                Online customisation
              </span>
            )}
          </div>

          {linkedOrder?.needs_attention && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              This order needs attention. Inventory couldn&apos;t be deducted or the
              payment ledger didn&apos;t record. Open the order to fix it.
            </div>
          )}

          {linkedOrder && (
            <div className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {linkedOrder.total != null && (
                <div>
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-medium tabular-nums">
                    {formatOrderMoney(linkedOrder.total, linkedOrder.currency)}
                  </span>
                  {linkedOrder.amount_refunded ? (
                    <span className="ml-2 text-xs text-orange-700">
                      −{formatOrderMoney(linkedOrder.amount_refunded, linkedOrder.currency)}{" "}
                      refunded
                    </span>
                  ) : null}
                </div>
              )}
              {linkedOrder.paid_at && (
                <div>
                  <span className="text-muted-foreground">Paid: </span>
                  {formatAdminDateTime(linkedOrder.paid_at)}
                </div>
              )}
              {linkedOrder.tracking_number && (
                <div>
                  <span className="text-muted-foreground">Tracking: </span>
                  {linkedOrder.tracking_url ? (
                    <a
                      href={linkedOrder.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
                    >
                      {linkedOrder.tracking_number}
                    </a>
                  ) : (
                    <span>{linkedOrder.tracking_number}</span>
                  )}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Delivered: </span>
                {linkedOrder.delivered_at ? (
                  formatAdminDateTime(linkedOrder.delivered_at)
                ) : (
                  <span className="text-muted-foreground">
                    not yet. Mark it on the order when it arrives.
                  </span>
                )}
              </div>
            </div>
          )}

          {!linkedOrder?.delivered_at && (
            <p className="mt-3 text-xs text-muted-foreground">
              The return window and any partner commission are dated from delivery, so
              this order stays open until someone marks it delivered.
            </p>
          )}
        </Card>
      )}

      {/* Online customization preferences (read-only, only for online-sourced results) */}
      {row.source === "online_customization" && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Online customisation preferences</div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className={cn(valueTileClassName, "md:p-2.5")}>
              <div className="text-xs text-muted-foreground">Sleep position</div>
              <div className="text-sm font-medium capitalize">{safeString((row.data as Record<string, unknown>)?.sleep_position) || "—"}</div>
            </div>
            <div className={cn(valueTileClassName, "md:p-2.5")}>
              <div className="text-xs text-muted-foreground">Body type</div>
              <div className="text-sm font-medium capitalize">{safeString((row.data as Record<string, unknown>)?.body_type) || "—"}</div>
            </div>
            <div className={cn(valueTileClassName, "md:p-2.5")}>
              <div className="text-xs text-muted-foreground">Firmness</div>
              <div className="text-sm font-medium capitalize">{safeString((row.data as Record<string, unknown>)?.firmness) || "—"}</div>
            </div>
            <div className={cn(valueTileClassName, "md:p-2.5")}>
              <div className="text-xs text-muted-foreground">Recommended</div>
              <div className="text-sm font-medium">
                {safeString((row.data as Record<string, unknown>)?.online_recommended_kind) || "—"}, {safeString((row.data as Record<string, unknown>)?.online_recommended_size) || "—"}
              </div>
            </div>
          </div>
          {safeString((row.data as Record<string, unknown>)?.notes) && (
            <div className={cn(valueTileClassName, "mt-3 md:p-2.5")}>
              <div className="text-xs text-muted-foreground">Customer notes</div>
              <div className="text-sm">{safeString((row.data as Record<string, unknown>)?.notes)}</div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-col gap-4">
          {/* Two columns from the phone up: eleven short fields stacked one per row
              ran past two screens. Bottom-aligned on a phone, so a label that wraps to
              two lines doesn't push its input out of line with its neighbour's. */}
          <div className="grid grid-cols-2 gap-3 max-md:items-end sm:gap-4 lg:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
            <Field label="Name">
              <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            </div>
            <Field label="Gender">
              <Input value={draft.gender} onChange={(e) => setDraft((p) => ({ ...p, gender: e.target.value }))} />
            </Field>
            <Field label="Age group">
              <Input value={draft.ageGroup} onChange={(e) => setDraft((p) => ({ ...p, ageGroup: e.target.value }))} />
            </Field>

            <Field label="Shoulder length (cm)">
              <Input
                value={draft.shoulderLength}
                onChange={(e) => setDraft((p) => ({ ...p, shoulderLength: e.target.value }))}
              />
            </Field>
            <Field label="Neck to back (cm)">
              <Input value={draft.neckToBack} onChange={(e) => setDraft((p) => ({ ...p, neckToBack: e.target.value }))} />
            </Field>
            <Field label="Head to back (cm)">
              <Input value={draft.headToBack} onChange={(e) => setDraft((p) => ({ ...p, headToBack: e.target.value }))} />
            </Field>

            <Field label="Neck length (cm)">
              <Input value={draft.neckLength} onChange={(e) => setDraft((p) => ({ ...p, neckLength: e.target.value }))} />
            </Field>
            <Field label="Blood pressure level">
              <Input
                value={draft.bloodPressureLevel}
                onChange={(e) => setDraft((p) => ({ ...p, bloodPressureLevel: e.target.value }))}
              />
            </Field>
            <Field label="Bed firmness">
              <Input value={draft.bedFirmness} onChange={(e) => setDraft((p) => ({ ...p, bedFirmness: e.target.value }))} />
            </Field>

            <Field label="Ear discomfort (side sleep)">
              <Select value={draft.earDiscomfortSideSleep} onValueChange={(v) => setDraft((p) => ({ ...p, earDiscomfortSideSleep: v as YesNoEmpty }))}>
                <SelectTrigger className="max-md:w-full max-md:min-w-0">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unknown</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Acid reflux">
              <Select value={draft.acidReflux} onValueChange={(v) => setDraft((p) => ({ ...p, acidReflux: v as YesNoEmpty }))}>
                <SelectTrigger className="max-md:w-full max-md:min-w-0">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unknown</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <div className="text-sm text-muted-foreground">{row.is_final ? "Released" : "Active"}</div>
            </Field>
          </div>

          <Separator />

          <PageActions>
            <Button
              variant="secondary"
              className={pageActionWideClassName}
              onClick={refreshSuggestion}
              disabled={suggestionLoading || deleting}
            >
              {suggestionLoading ? "Refreshing suggestion…" : "Refresh suggestion"}
            </Button>
            {/* Phones: Delete moves to the end of the page, away from this button. */}
            <Button
              variant="destructive"
              className={cn(pageActionClassName, "max-md:hidden")}
              onClick={deleteRow}
              disabled={deleting || saving}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </PageActions>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <h2>Suggestion</h2>
              <InfoTip label="About the suggestion">
                <p>Worked out from the current inventory and BOM.</p>
              </InfoTip>
            </div>
          </div>
        </div>

        {!suggestion ? (
          <div className="text-sm text-muted-foreground">
            {suggestionMissing.length > 0
              ? `No suggestion. The rules need answers this Result doesn't have: ${suggestionMissing
                  .map(engineInputLabel)
                  .join(", ")}.`
              : "No suggestion available."}
          </div>
        ) : (
          <Card className="p-4 space-y-4 max-md:space-y-0">
            <div className="grid grid-cols-2 gap-3">
              <div className={valueTileClassName}>
                <div className="text-xs text-muted-foreground">Recommended tier</div>
                <div className="text-lg font-semibold capitalize">{suggestion.recommended.tier}</div>
              </div>
              <div className={valueTileClassName}>
                <div className="text-xs text-muted-foreground">Recommended size</div>
                <div className="text-lg font-semibold">{suggestion.recommended.size}</div>
              </div>
            </div>

            <div className={valueTileClassName}>
              <div className="text-xs text-muted-foreground">Matched active product</div>
              <div className="text-sm">
                {suggestion.product
                  ? `Product #${suggestion.product.id} (${suggestion.product.tier}, ${suggestion.product.size})`
                  : "—"}
              </div>
            </div>

            <div className={valueTileClassName}>
              <div className="text-xs text-muted-foreground mb-2">BOM</div>
              {suggestion.bom?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-[80px]">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestion.bom.map((line, idx) => {
                      const item = line.item;
                      const label = item
                        ? `${item.category}, ${item.name}${item.subtype ? ` (${item.subtype})` : ""}${item.size ? `, ${item.size}` : ""}`
                        : "Unknown item";
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{label}</TableCell>
                          <TableCell className="tabular-nums">x{line.quantity}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-sm text-muted-foreground">No BOM lines.</div>
              )}
            </div>

            {suggestion.reasons?.length ? (
              <div className={valueTileClassName}>
                <div className="text-xs text-muted-foreground mb-2">Reasons</div>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                  {suggestion.reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full border-destructive/40 text-destructive md:hidden"
        onClick={deleteRow}
        disabled={deleting || saving}
      >
        {deleting ? "Deleting…" : "Delete result"}
      </Button>
    </div>
  );
}

/**
 * A labelled value tile. On a phone it drops its frame: it already sits inside a
 * card, and a box in a box costs width and height for nothing.
 */
const valueTileClassName =
  "rounded-md border bg-muted/30 p-3 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

