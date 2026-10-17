"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Ban, Save, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { confirmSaveWithBolsterFit, confirmSaveWithOverCells, FitBanner } from "@/components/spatial/xray-fit-banner";
import { useBolsterFit, useCut, useItemMaps, usePillowFit } from "@/components/spatial/use-pillow-fit";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import { InsertOrderList } from "@/components/spatial/insert-order-list";
import { fillingLabel, NECK_SUPPORT, PLACEABLE_ITEMS_OR } from "@/lib/spatial-fillings/filling-groups";

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
const XrayCrossSection = dynamic(
  () => import("@/components/spatial/xray-cross-section").then((m) => m.XrayCrossSection),
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
import { BolsterCompartmentList, type BolsterListItem } from "@/components/spatial/bolster-compartment-list";
import {
  bolsterPlacementsToRows,
  pillowPlacementsToRows,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  type BolsterPlacement,
  type BolsterPlacementRow,
  type PillowPlacement,
  type PillowPlacementRow,
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
  customer_email?: string | null;
  customer_phone?: string | null;
  discovery_source?: string | null;
  discovery_source_other?: string | null;
  discovery_source_label?: string | null;
  is_pre_order?: boolean | null;
  recommendation_record?: Record<string, unknown> | null;
  filling_fingerprint?: string | null;
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

const safeString = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));
const safeYesNoEmpty = (value: unknown): YesNoEmpty => (value === "yes" || value === "no" ? value : "");

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
    suggestion: MpConfigSuggestion;
  } | null;
  assignPrep: AssignPrepData | null;
  fillingItems: BolsterListItem[] | null;
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
  // Spatial editor state: confirmed template's placements, editable. Pillow =
  // per-cell grid; bolster = single-compartment slot list (own schema, no cap).
  const [placements, setPlacements] = useState<PillowPlacement[]>([]);
  const [bolsterMix, setBolsterMix] = useState<BolsterPlacement[]>([]);
  const [templateHadPlacements, setTemplateHadPlacements] = useState(true);
  const [colorOverrides, setColorOverrides] = useState<ColorOverrideRow[]>([]);
  const [dimensionOverrides, setDimensionOverrides] = useState<DimensionOverridesPayload | undefined>(undefined);
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
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load result");
      const response = payload?.response as MpConfigResponseRow | null;
      setRow(response);
      setOrderNumber((payload?.order_number as string) ?? null);
      setLinkedOrder((payload?.order as LinkedOrderDetail | null) ?? null);
      const sug = (payload?.suggestion ?? null) as MpConfigSuggestion | null;
      setSuggestion(sug);
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
      toast.error(e instanceof Error ? e.message : "Failed to load result");
      setRow(null);
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const productType = row?.product_type === "bolster" ? "bolster" : "pillow";
  const sizeKey = productType === "bolster" ? assignLength : assignSize;
  const canAssign = row?.status === "held";
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
    if (!canAssign || !sizeKey) {
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
      if (!res.ok) throw new Error((payload as { error?: string })?.error ?? "Failed to load assignment preview");
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
      toast.error(e instanceof Error ? e.message : "Failed to load assignment preview");
      setAssignPrep(null);
      setFillingTemplates([]);
    } finally {
      setPrepLoading(false);
      setTemplatesLoading(false);
    }
  }, [
    canAssign,
    sizeKey,
    productType,
    assignLength,
    assignSize,
    assignTier,
    engineRecord?.templateId,
    sizeScopeChanged,
    hasAssistSnapshot,
  ]);

  // Size×tier (or length) change clears the filling pick + placements; the prep
  // effect below reloads the Default Filling Template hint for the new key.
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
    setPlacements([]);
    setBolsterMix([]);
    setTemplateHadPlacements(true);
    setTemplateLegacyLines([]);
  }, [assignSize, assignTier, assignLength, productType]);

  useEffect(() => {
    if (skipPrepFetch.current) {
      skipPrepFetch.current = false;
      return;
    }
    if (!row || !canAssign) return;
    void loadAssignPrep();
  }, [row, canAssign, loadAssignPrep]);

  // Filling Items for the spatial editor (pillow cells or bolster compartment).
  useEffect(() => {
    if (skipFillingItemsFetch.current) {
      skipFillingItemsFetch.current = false;
      return;
    }
    if (!canAssign) return;
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
  }, [canAssign, productType]);

  const loadSelectedFillingPreview = useCallback(
    async (templateId: string) => {
      if (!templateId) {
        setPlacements([]);
        setBolsterMix([]);
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
        if (!res.ok) throw new Error(payload?.error ?? "Failed to load template");
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
          setPlacements(rowsToPillowPlacements(placementRows));
          setTemplateHadPlacements(placementRows.length > 0);
        } else {
          const placementRows = (payload?.placements ?? []) as BolsterPlacementRow[];
          setBolsterMix(rowsToBolsterPlacements(placementRows));
          setTemplateHadPlacements(placementRows.length > 0);
        }
        setTemplateLegacyLines(lines);
        setTemplateNotes(String(payload?.template?.notes ?? ""));
        // Product Builder colours for the x-ray — same server route as Configure,
        // because filling_color_overrides is service-role-only under RLS.
        setColorOverrides((payload?.colorOverrides ?? []) as ColorOverrideRow[]);
        setDimensionOverrides((payload?.dimensionOverrides ?? undefined) as DimensionOverridesPayload | undefined);
      } catch {
        setPlacements([]);
        setBolsterMix([]);
      }
    },
    [productType, to],
  );

  // Open the Filling mix pre-filled: load the recommended (engine or size-default)
  // template straight into the x-ray, so Staff confirm or adjust a real mix
  // instead of starting from a hidden editor. Re-seeds after a size/tier change,
  // which clears the pick and reloads the prep.
  useEffect(() => {
    const hint = assignPrep?.defaultFillingTemplate;
    if (!canAssign || fillingTemplateId || !hint) return;
    const next = String(hint.id);
    setFillingTemplateId(next);
    void loadSelectedFillingPreview(next);
  }, [canAssign, fillingTemplateId, assignPrep, loadSelectedFillingPreview]);

  const assign = useCallback(async () => {
    if (!id) return;
    if (!fillingTemplateId) {
      toast.error("Select a Filling Template");
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
      if (!res.ok) throw new Error(payload?.error ?? "Failed to assign");
      toast.success(
        payload?.emailStatus === "sent"
          ? "Assigned and customer notified"
          : "Assigned",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign");
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
      if (!res.ok) throw new Error(payload?.error ?? "Failed to request payment");
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
            ? "Repriced — sent the customer the updated build and new total"
            : "Payment email sent",
        );
      } else if (emailStatus === "failed") {
        toast.error("Could not send the payment email — the link below still works");
      } else {
        toast.success("Link ready — no customer email on file");
      }
      // The route stores the recomputed total, so the amount on screen is stale.
      if (payload?.repriced === "updated") await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to request payment");
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

  const fillingLabelById = useMemo(
    () => new Map(fillingItems.map((i) => [i.id, i.label])),
    [fillingItems],
  );
  // A neck support is for premium pillows only — never offered on basic or a bolster.
  const pickerItems = useMemo(
    () =>
      productType === "pillow" && assignTier === "premium"
        ? fillingItems
        : fillingItems.filter((i) => !NECK_SUPPORT.test(i.name)),
    [fillingItems, productType, assignTier],
  );
  // Slice 04: the physical fit of the assignment at its Size — one object for
  // the x-ray, the banner, the save confirm and the cross-section.
  const fit = usePillowFit(placements, assignSize, pickerItems, dimensionOverrides);
  // Slice 05: the cross-section beside the pack list, cut where the x-ray's line says.
  const { cut, setCut, onDiveChange } = useCut();
  const { itemSubtypes: pickerItemSubtypes, itemSizes: pickerItemSizes, itemDims: pickerItemDims } = useItemMaps(pickerItems, dimensionOverrides);
  // Slice 09: the Mbolster's fit at the assigned length, for the confirm and the end-on cut.
  const bolsterLength = (["short", "medium", "long"] as const).find((l) => l === assignLength) ?? "medium";
  const bolsterFit = useBolsterFit(bolsterMix, bolsterLength as BolsterLength, pickerItems, dimensionOverrides);

  const refreshSuggestion = useCallback(async () => {
    if (!id) return;
    setSuggestionLoading(true);
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(id)}`, { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to refresh suggestion");
      setSuggestion((payload?.suggestion ?? null) as MpConfigSuggestion | null);
      const response = payload?.response as MpConfigResponseRow | null;
      if (response) setRow(response);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh suggestion");
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
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save");
      toast.success("Saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [draft, id, load]);

  const deleteRow = useCallback(async () => {
    if (!id) return;
    const ok = window.confirm("Delete this result? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to delete");
      toast.success("Deleted");
      router.push(to("/settings/results"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
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
            setCancelError(payload?.error ?? "Failed to release the hold");
            return;
          }
          throw new Error(payload?.error ?? "Failed to cancel");
        }
        toast.success(
          payload?.holdReleased ? "Result cancelled and hold released" : "Result cancelled",
        );
        setCancelDialogOpen(false);
        setCancelError(null);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to cancel");
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
        title: "Cancel Result",
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
          <p className="text-sm text-muted-foreground">Not found or failed to load.</p>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1>Result details</h1>
          <p className="text-sm text-muted-foreground font-mono break-all">{row.id}</p>
          {headerMeta ? (
            <p className="text-xs text-muted-foreground mt-1">
              Created {headerMeta.createdAt} · Updated {headerMeta.updatedAt}
            </p>
          ) : null}
        </div>
        <PageActions>
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
              {cancelling ? "Cancelling…" : "Cancel Result"}
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
            <div className="text-sm font-medium">Cancel this Result?</div>
            <p className="text-sm text-muted-foreground">
              {row.payment_intent_id
                ? "The authorization hold on the customer's card is released and the Result is closed. The customer would have to configure again."
                : "The Result is closed. It has no payment hold, so nothing is refunded."}
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
                The hold could not be released — it may have already expired at Stripe.
                Force-cancel closes the Result anyway.
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
              {cancelling ? "Cancelling…" : cancelError ? "Force cancel" : "Cancel Result"}
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

      {/* Purchase-path assignment (held Results) */}
      {(row.status === "held" || row.status === "assigned") && (
        // `#assignment`: the configurator sends Staff here after an Assist submit.
        <Card id="assignment" className="p-4 space-y-4 scroll-mt-20">
          <div>
            <div className="text-sm font-medium">Assignment</div>
            <p className="text-sm text-muted-foreground">
              {productType === "bolster"
                ? "Confirm or override length and select a bolster Filling Template. Customer is emailed on save."
                : "Confirm or override size×tier and select a Filling Template. Customer is emailed on save."}
            </p>
          </div>

          {row.status === "assigned" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                {productType === "bolster" ? (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">Length</div>
                    <div className="font-medium">{row.assigned_length ?? "—"}</div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">Size</div>
                      <div className="font-medium">{row.assigned_size ?? "—"}</div>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">Tier</div>
                      <div className="font-medium capitalize">{row.assigned_tier ?? "—"}</div>
                    </div>
                  </>
                )}
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Filling Template</div>
                  <div className="font-medium">
                    {row.filling_template_id != null ? `#${row.filling_template_id}` : "Custom mix"}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
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
                      Measured by Staff, so the Measurement service fee applies.
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
                      className="font-mono text-xs"
                    />
                    <Button type="button" variant="outline" onClick={copyPaymentLink}>
                      {paymentLinkCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Reprices this Result from its current configuration, emails the
                  customer, and gives you their link to paste into WhatsApp. Safe to
                  press twice — the same build reprices to the same total.
                </p>
                <p className="text-sm text-muted-foreground">
                  If the price moved since they were last told — after{" "}
                  <span className="font-medium">Edit configuration</span> — they get
                  &ldquo;your build has been updated&rdquo;, showing the old total
                  beside the new one and what their card covers. Otherwise it is a
                  plain re-send of the build-ready email.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <>
                    <Field label="Size">
                      <Select
                        value={assignSize}
                        onValueChange={(v) => setAssignSize(v as PillowSize)}
                      >
                        <SelectTrigger>
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
                      <Select
                        value={assignTier}
                        onValueChange={(v) => setAssignTier(v as PillowTier)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">basic</SelectItem>
                          <SelectItem value="premium">premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}
              </div>

              <Collapsible defaultOpen className="rounded-lg border">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-muted/50">
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
                              {line.category} · {line.label}
                            </TableCell>
                            <TableCell className="tabular-nums">×{line.qty}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No non-filling BOM configured.</p>
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible defaultOpen className="rounded-lg border">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-muted/50">
                  Filling mix
                  <span className="text-xs font-normal text-muted-foreground">
                    {fillingTemplateId ? "Selected" : "Confirm required"}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 border-t px-4 py-3">
                  {hasAssistSnapshot ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      <div className="text-xs text-muted-foreground mb-1">
                        Staff assist mix (truth on this Result)
                      </div>
                      <p className="text-muted-foreground">
                        An assist-supplied filling snapshot is already on this Result. Confirm
                        below still required — engine recommendation is reference only.
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="text-xs text-muted-foreground mb-1">
                      {assignPrep?.hintSource === "engine"
                        ? "Engine recommendation"
                        : "Suggested default"}
                    </div>
                    {prepLoading ? (
                      <p className="text-muted-foreground">Loading…</p>
                    ) : assignPrep?.defaultFillingTemplate ? (
                      <>
                        <p className="font-medium">{assignPrep.defaultFillingTemplate.name}</p>
                        {engineRecord && assignPrep.hintSource === "engine" ? (
                          <p className="mt-1 text-muted-foreground">
                            {plainLanguageWhy(engineRecord)}
                          </p>
                        ) : null}
                        {assignPrep.defaultFillingTemplate.preview.length ? (
                          <ul className="mt-1 text-muted-foreground space-y-0.5">
                            {assignPrep.defaultFillingTemplate.preview.map((line, idx) => (
                              <li key={idx}>
                                {line.variant} ×{line.qty}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">Hint has no filling lines</p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">No default configured</p>
                    )}
                  </div>

                  <Field label="Filling Template">
                    <Select
                      value={fillingTemplateId}
                      onValueChange={(value) => {
                        setFillingTemplateId(value);
                        void loadSelectedFillingPreview(value);
                      }}
                    >
                      <SelectTrigger disabled={templatesLoading || !sizeKey}>
                        <SelectValue
                          placeholder={
                            templatesLoading
                              ? "Loading…"
                              : fillingTemplates.length
                                ? "Select template…"
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

                  {fillingTemplateId && (
                    <div className="space-y-3">
                      {!templateHadPlacements && templateLegacyLines.length > 0 && (
                        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                          <div className="font-medium">
                            Legacy flat recipe — saving spatially will set placements.
                          </div>
                          <ul className="mt-1 list-inside list-disc text-muted-foreground">
                            {templateLegacyLines.map((l) => (
                              <li key={l.item_id}>
                                {fillingLabelById.get(l.item_id) ?? `Item #${l.item_id}`} × {l.quantity}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {productType === "pillow" ? (
                        <>
                          {placements.length > 0 && !isSpatiallyAuthored(placements) && (
                            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                              <div className="font-medium">Not spatially authored.</div>
                              <p className="mt-1 text-muted-foreground">
                                {unauthoredReason(placements.map((p) => p.section))}{" "}
                                {looksLikeLegacyImport(placements.map((p) => p.section))
                                  ? "These placements were auto-generated from a legacy flat recipe. "
                                  : ""}
                                Lay the pieces out before confirming the build.
                              </p>
                            </div>
                          )}
                          <FitBanner fit={fit} />
                          <XrayEditor
                            placements={placements}
                            onPlacementsChange={setPlacements}
                            items={pickerItems}
                            pillowSize={assignSize}
                            colorOverrides={colorOverrides}
                            dimensionOverrides={dimensionOverrides}
                            fit={fit}
                            onDiveChange={onDiveChange}
                          />
                          <XrayCrossSection
                            fit={fit}
                            cut={cut}
                            onCutChange={setCut}
                            itemSubtypes={pickerItemSubtypes}
                            itemSizes={pickerItemSizes}
                            itemDims={pickerItemDims}
                            placements={placements}
                            onPlacementsChange={setPlacements}
                            items={pickerItems}
                            colorOverrides={colorOverrides}
                          />
                        </>
                      ) : (
                        // Mbolster: single compartment — ordered list, no cap, never the 3×3 grid.
                        <>
                          <BolsterCompartmentList
                            value={bolsterMix}
                            onChange={setBolsterMix}
                            items={pickerItems}
                          />
                          <BolsterCrossSection fit={bolsterFit} itemSubtypes={pickerItemSubtypes} colorOverrides={colorOverrides} />
                        </>
                      )}
                      <div className="rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="text-xs text-muted-foreground mb-1">Derived pack list</div>
                        {productType === "pillow" ? (
                          <XrayPackList placements={placements} onPlacementsChange={setPlacements} items={fillingItems} />
                        ) : (
                          <XrayPackList placements={bolsterMix} onPlacementsChange={setBolsterMix} items={fillingItems} />
                        )}
                      </div>
                      {productType === "pillow" && (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm">
                          <div className="text-xs text-muted-foreground mb-1">Insert order</div>
                          <InsertOrderList placements={placements} onPlacementsChange={setPlacements} items={fillingItems} />
                        </div>
                      )}
                      {templateNotes && (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm">
                          <div className="text-xs text-muted-foreground mb-1">Assembly notes</div>
                          <p className="whitespace-pre-wrap">{templateNotes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
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
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

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
              {row.customer_email && (
                <div>
                  <span className="text-muted-foreground">Email: </span>
                  {row.customer_email}
                </div>
              )}
              {row.customer_phone && (
                <div>
                  <span className="text-muted-foreground">Phone: </span>
                  <a href={`tel:${row.customer_phone}`} className="font-medium hover:underline">
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
                      — {row.discovery_source_other}
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

      {/* Linked Order — the fulfilment half of this customisation's story. */}
      {row.order_id && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Order</h2>
            <a
              href={to(`/settings/orders/${row.order_id}`)}
              className="font-mono text-sm font-semibold text-primary hover:underline"
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
                Online Customization
              </span>
            )}
          </div>

          {linkedOrder?.needs_attention && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              This Order needs attention — inventory could not be deducted, or the
              payment ledger failed to record. Open the Order to resolve it.
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
                      className="font-mono text-primary hover:underline"
                    >
                      {linkedOrder.tracking_number}
                    </a>
                  ) : (
                    <span className="font-mono">{linkedOrder.tracking_number}</span>
                  )}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Delivered: </span>
                {linkedOrder.delivered_at ? (
                  formatAdminDateTime(linkedOrder.delivered_at)
                ) : (
                  <span className="text-muted-foreground">
                    not yet — mark it on the Order when it arrives
                  </span>
                )}
              </div>
            </div>
          )}

          {!linkedOrder?.delivered_at && (
            <p className="mt-3 text-xs text-muted-foreground">
              The return window and any partner commission are dated from delivery, so
              this Order stays open until someone marks it delivered.
            </p>
          )}
        </Card>
      )}

      {/* Online customization preferences (read-only, only for online-sourced results) */}
      {row.source === "online_customization" && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Online Customization Preferences</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-2.5">
              <div className="text-xs text-muted-foreground">Sleep Position</div>
              <div className="text-sm font-medium capitalize">{safeString((row.data as Record<string, unknown>)?.sleep_position) || "—"}</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2.5">
              <div className="text-xs text-muted-foreground">Body Type</div>
              <div className="text-sm font-medium capitalize">{safeString((row.data as Record<string, unknown>)?.body_type) || "—"}</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2.5">
              <div className="text-xs text-muted-foreground">Firmness</div>
              <div className="text-sm font-medium capitalize">{safeString((row.data as Record<string, unknown>)?.firmness) || "—"}</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2.5">
              <div className="text-xs text-muted-foreground">Recommended</div>
              <div className="text-sm font-medium">
                {safeString((row.data as Record<string, unknown>)?.online_recommended_kind) || "—"} · {safeString((row.data as Record<string, unknown>)?.online_recommended_size) || "—"}
              </div>
            </div>
          </div>
          {safeString((row.data as Record<string, unknown>)?.notes) && (
            <div className="mt-3 rounded-md border bg-muted/30 p-2.5">
              <div className="text-xs text-muted-foreground">Customer Notes</div>
              <div className="text-sm">{safeString((row.data as Record<string, unknown>)?.notes)}</div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name">
              <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
            </Field>
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
                <SelectTrigger>
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
                <SelectTrigger>
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
              className={pageActionClassName}
              onClick={refreshSuggestion}
              disabled={suggestionLoading || deleting}
            >
              {suggestionLoading ? "Refreshing suggestion…" : "Refresh suggestion"}
            </Button>
            <Button
              variant="destructive"
              className={pageActionClassName}
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
            <h2>Suggestion</h2>
            <p className="text-sm text-muted-foreground">Computed using the current inventory/BOM configuration.</p>
          </div>
        </div>

        {!suggestion ? (
          <div className="text-sm text-muted-foreground">No suggestion available.</div>
        ) : (
          <Card className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Recommended tier</div>
                <div className="text-lg font-semibold capitalize">{suggestion.recommended.tier}</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Recommended size</div>
                <div className="text-lg font-semibold">{suggestion.recommended.size}</div>
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Matched active product</div>
              <div className="text-sm">
                {suggestion.product
                  ? `Product #${suggestion.product.id} (${suggestion.product.tier} · ${suggestion.product.size})`
                  : "—"}
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
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
                        ? `${item.category} · ${item.name}${item.subtype ? ` (${item.subtype})` : ""}${item.size ? ` · ${item.size}` : ""}`
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
              <div className="rounded-md border bg-muted/30 p-3">
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
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}

