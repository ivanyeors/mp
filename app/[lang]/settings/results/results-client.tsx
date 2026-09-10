"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rowsToCsv } from "@/lib/results/rows-to-csv";
import {
  STAGE_BUCKETS,
  STAGE_LABELS,
  STUCK_REASON_LABELS,
  bucketFor,
  resultStage,
  type ResultStage,
} from "@/lib/results/result-stage";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

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

type LinkedOrder = {
  id: string;
  order_number: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  tracking_number: string | null;
  needs_attention: boolean | null;
};

type MpConfigResponseRow = {
  id: string;
  data: Partial<MeasurementData> | null;
  is_final: boolean;
  measured_by_type?: string | null;
  measured_by_staff_id?: string | null;
  source?: string | null;
  location_id?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  order?: LinkedOrder | null;
  payment_intent_id?: string | null;
  topup_paid_at?: string | null;
  created_at: string;
  updated_at: string;
  status?: string | null;
  product_type?: string | null;
  suggested_size?: string | null;
  suggested_tier?: string | null;
  assigned_size?: string | null;
  assigned_tier?: string | null;
  customer_email?: string | null;
};

type StaffRow = {
  id: string;
  name: string;
};

type LocationOption = {
  id: string;
  name: string;
};

type ResultsTab = (typeof STAGE_BUCKETS)[number];

/** Order-linkage filter: staff need to find rows whose Order state is wrong. */
type OrderFilter = "all" | "has_order" | "no_order" | "mismatch";

const STAGE_BADGE_CLASS: Record<ResultStage, string> = {
  measurement_only: "bg-slate-100 text-slate-700 border-slate-200",
  needs_assign: "bg-amber-100 text-amber-800 border-amber-200",
  awaiting_customer: "bg-blue-100 text-blue-800 border-blue-200",
  to_build: "bg-indigo-100 text-indigo-800 border-indigo-200",
  building: "bg-violet-100 text-violet-800 border-violet-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  handed_over: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  stuck: "bg-red-100 text-red-800 border-red-200",
};

const TAB_LABELS: Record<ResultsTab, string> = {
  needs_assign: "Needs assign",
  awaiting_customer: "Awaiting customer",
  to_build: "To build",
  shipped: "Shipped",
  stuck: "Stuck",
  closed: "Closed",
};

/** Order-status badge tone, mirroring the Orders list vocabulary. */
const ORDER_STATUS_CLASS: Record<string, string> = {
  confirmed: "bg-indigo-100 text-indigo-800 border-indigo-200",
  processing: "bg-violet-100 text-violet-800 border-violet-200",
  shipped: "bg-purple-100 text-purple-800 border-purple-200",
  delivered: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
  refunded: "bg-red-100 text-red-800 border-red-200",
  partially_refunded: "bg-orange-100 text-orange-800 border-orange-200",
};

/** Why a row has no Order yet — a bare dash reads as a data bug, and usually isn't. */
function noOrderReason(stage: ResultStage): string {
  switch (stage) {
    case "measurement_only":
      return "Measurement only";
    case "needs_assign":
    case "awaiting_customer":
      return "Not yet captured";
    case "closed":
      return "Closed — no sale";
    default:
      return "—";
  }
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return "";
  try {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: currency ?? "SGD",
    }).format(amount);
  } catch {
    return `${currency ?? "SGD"} ${amount.toFixed(2)}`;
  }
}

const safeString = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

const normalizeMeasurement = (data: Partial<MeasurementData> | null | undefined): MeasurementData => ({
  name: safeString(data?.name),
  gender: safeString(data?.gender),
  ageGroup: safeString(data?.ageGroup),
  bloodPressureLevel: safeString(data?.bloodPressureLevel),
  earDiscomfortSideSleep:
    data?.earDiscomfortSideSleep === "yes" || data?.earDiscomfortSideSleep === "no"
      ? data.earDiscomfortSideSleep
      : "",
  bedFirmness: safeString(data?.bedFirmness),
  acidReflux: data?.acidReflux === "yes" || data?.acidReflux === "no" ? data.acidReflux : "",
  shoulderLength: safeString(data?.shoulderLength),
  neckToBack: safeString(data?.neckToBack),
  headToBack: safeString(data?.headToBack),
  neckLength: safeString(data?.neckLength),
});

/**
 * Server-rendered first paint. Exactly the JSON
 * `/api/mp-config/responses?limit=200&offset=0` and `/api/staff` return,
 * pre-fetched by the RSC page wrapper. A null member means that server load
 * failed, and the client fetches it on mount as before.
 */
export type ResultsInitialData = {
  responses: {
    ok: true;
    rows: MpConfigResponseRow[];
    locations: LocationOption[];
    count: number | null;
    limit: number;
    offset: number;
  } | null;
  staff: { ok: true; rows: StaffRow[] } | null;
};

export default function ResultsPage({
  initialData,
}: {
  initialData?: ResultsInitialData;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = useCallback((href: string) => withLocale(href, locale), [locale]);
  const [rows, setRows] = useState<MpConfigResponseRow[]>(
    initialData?.responses?.rows ?? [],
  );
  const [loading, setLoading] = useState(!initialData?.responses);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ResultsTab>("needs_assign");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MpConfigResponseRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLocation, setBulkLocation] = useState<string>("none");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [staffRows, setStaffRows] = useState<StaffRow[]>(initialData?.staff?.rows ?? []);
  const [staffLoading, setStaffLoading] = useState(!initialData?.staff);
  const [locations, setLocations] = useState<LocationOption[]>(
    initialData?.responses?.locations ?? [],
  );
  const [totalCount, setTotalCount] = useState<number | null>(
    typeof initialData?.responses?.count === "number" ? initialData.responses.count : null,
  );
  const [pageLimit] = useState<number>(200);

  // The server already delivered both; skip the duplicate mount fetches. Every
  // later load (append/paging, post-mutation refresh) is untouched.
  const skipResponsesFetch = useRef(Boolean(initialData?.responses));
  const skipStaffFetch = useRef(Boolean(initialData?.staff));

  const load = useCallback(async (opts?: { mode?: "replace" | "append"; offset?: number }) => {
    const mode = opts?.mode ?? "replace";
    const offset = mode === "append" ? (opts?.offset ?? 0) : 0;
    setLoading(true);
    try {
      const res = await fetch(`/api/mp-config/responses?limit=${pageLimit}&offset=${offset}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load results");
      const nextRows = (payload?.rows ?? []) as MpConfigResponseRow[];
      setLocations((payload?.locations ?? []) as LocationOption[]);
      setTotalCount(typeof payload?.count === "number" ? (payload.count as number) : null);

      setRows((prev) => {
        if (mode === "append") return [...prev, ...nextRows];
        return nextRows;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [pageLimit]);

  useEffect(() => {
    if (skipResponsesFetch.current) {
      skipResponsesFetch.current = false;
      return;
    }
    load();
  }, [load]);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await fetch("/api/staff", { method: "GET", cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load staff");
      setStaffRows((payload?.rows ?? []) as StaffRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load staff");
      setStaffRows([]);
    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipStaffFetch.current) {
      skipStaffFetch.current = false;
      return;
    }
    void loadStaff();
  }, [loadStaff]);

  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staffRows) m.set(s.id, s.name);
    return m;
  }, [staffRows]);

  const measuredByValue = (row: MpConfigResponseRow): string => {
    if (row.measured_by_type === "staff" && row.measured_by_staff_id) return `staff:${row.measured_by_staff_id}`;
    return "by_user";
  };

  const measuredByLabel = (row: MpConfigResponseRow): string => {
    if (row.measured_by_type === "staff" && row.measured_by_staff_id) {
      return staffNameById.get(row.measured_by_staff_id) ?? "staff";
    }
    return "by user";
  };

  const isMeasuredByValid = (row: MpConfigResponseRow): boolean => {
    if (row.measured_by_type === "by_user") return true;
    if (row.measured_by_type === "staff" && !!row.measured_by_staff_id) return true;
    // If the DB columns aren't present yet / null, treat as not ready.
    return false;
  };

  const updateMeasuredBy = useCallback(
    async (row: MpConfigResponseRow, value: string) => {
      const measuredBy =
        value === "by_user"
          ? ({ type: "by_user" } as const)
          : value.startsWith("staff:")
            ? ({ type: "staff", staffId: value.slice("staff:".length) } as const)
            : null;
      if (!measuredBy) return;

      const prev = { type: row.measured_by_type, staffId: row.measured_by_staff_id };

      // Optimistic UI update.
      setRows((p) =>
        p.map((r) =>
          r.id === row.id
            ? {
                ...r,
                measured_by_type: measuredBy.type,
                measured_by_staff_id: measuredBy.type === "staff" ? measuredBy.staffId : null,
              }
            : r,
        ),
      );

      try {
        const data = normalizeMeasurement(row.data ?? {});
        const res = await fetch("/api/mp-config/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            data,
            measuredBy,
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Failed to update measured by");
      } catch (e) {
        // Revert on failure.
        setRows((p) =>
          p.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  measured_by_type: prev.type ?? null,
                  measured_by_staff_id: prev.staffId ?? null,
                }
              : r,
          ),
        );
        toast.error(e instanceof Error ? e.message : "Failed to update measured by");
      }
    },
    [],
  );

  const updateLocation = useCallback(
    async (row: MpConfigResponseRow, value: string) => {
      const locationId = value === "none" ? null : value;
      const prev = row.location_id ?? null;

      // Optimistic UI update.
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, location_id: locationId } : r)));

      try {
        const data = normalizeMeasurement(row.data ?? {});
        const res = await fetch("/api/mp-config/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, data, locationId }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Failed to update location");
      } catch (e) {
        setRows((p) => p.map((r) => (r.id === row.id ? { ...r, location_id: prev } : r)));
        toast.error(e instanceof Error ? e.message : "Failed to update location");
      }
    },
    [],
  );

  /**
   * One stage per row, spanning the Result → Order handover. Computed once and
   * reused by the tabs, the counts and the row badges. `now` is pinned per render
   * so a row cannot change bucket midway through a pass.
   */
  const staged = useMemo(() => {
    const now = new Date();
    return rows.map((row) => ({
      row,
      ...resultStage(
        {
          status: row.status ?? null,
          source: row.source ?? null,
          payment_intent_id: row.payment_intent_id ?? null,
          created_at: row.created_at,
          order_id: row.order_id ?? null,
          topup_paid_at: row.topup_paid_at ?? null,
          order: row.order ?? null,
        },
        now,
      ),
    }));
  }, [rows]);

  const stageById = useMemo(
    () => new Map(staged.map((s) => [s.row.id, s])),
    [staged],
  );

  /** Per-tab counts, so staff can see where the work is without switching tabs. */
  const bucketCounts = useMemo(() => {
    const counts = Object.fromEntries(STAGE_BUCKETS.map((b) => [b, 0])) as Record<
      ResultsTab,
      number
    >;
    for (const s of staged) counts[bucketFor(s.stage)] += 1;
    return counts;
  }, [staged]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staged
      .filter((s) => bucketFor(s.stage) === tab)
      .filter((s) => sourceFilter === "all" || (s.row.source ?? "manual") === sourceFilter)
      .filter((s) => {
        if (orderFilter === "all") return true;
        if (orderFilter === "has_order") return Boolean(s.row.order_id);
        if (orderFilter === "no_order") return !s.row.order_id;
        return s.stuckReason === "order_mismatch";
      })
      .filter((s) => {
        if (!q) return true;
        const d = s.row.data ?? {};
        return (
          s.row.id.toLowerCase().includes(q) ||
          safeString(d.name).toLowerCase().includes(q) ||
          safeString(s.row.customer_email).toLowerCase().includes(q) ||
          safeString(s.row.order_number).toLowerCase().includes(q)
        );
      })
      .map((s) => s.row);
  }, [staged, search, tab, sourceFilter, orderFilter]);

  const sendToTelegram = useCallback(
    async (row: MpConfigResponseRow) => {
      if (row.is_final) return;
      if (!isMeasuredByValid(row)) {
        toast.error("Measured by is required before sending to Telegram");
        return;
      }
      setSending((prev) => ({ ...prev, [row.id]: true }));
      try {
        const data = normalizeMeasurement(row.data ?? {});
        const res = await fetch("/api/mp-config/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            data,
            isFinal: true,
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Failed to update");
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  is_final: true,
                  ...(payload?.reviewOnly
                    ? {
                        status: payload.status ?? "held",
                        suggested_size: payload.suggested_size ?? r.suggested_size,
                        suggested_tier: payload.suggested_tier ?? r.suggested_tier,
                        product_type: payload.product_type ?? r.product_type,
                      }
                    : {}),
                }
              : r,
          ),
        );

        const telegramStatus = payload?.telegramStatus as "sent" | "skipped" | "failed" | undefined;
        if (telegramStatus === "sent") toast.success("Sent to Telegram");
        else if (telegramStatus === "failed") toast.error("Saved, but failed to send to Telegram");
        else toast.success("Sent");
        // No tab switch: releasing to the Telegram group is a notification, not a
        // lifecycle move. The row keeps its stage.
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      } finally {
        setSending((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }
    },
    [],
  );

  const deleteRow = useCallback(async (row: MpConfigResponseRow) => {
    setDeleting((prev) => ({ ...prev, [row.id]: true }));
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to delete");

      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotalCount((prev) => (typeof prev === "number" ? Math.max(0, prev - 1) : prev));
      toast.success("Deleted");
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  }, []);

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected],
  );
  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set());
    },
    [filtered],
  );

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Bulk actions reuse the per-row handlers in a loop (no bulk API).
  const bulkSetLocation = useCallback(async () => {
    setBulkBusy(true);
    try {
      for (const row of selectedRows) await updateLocation(row, bulkLocation);
      toast.success(`Location set on ${selectedRows.length} result(s)`);
    } finally {
      setBulkBusy(false);
    }
  }, [selectedRows, bulkLocation, updateLocation]);

  const bulkSend = useCallback(async () => {
    setBulkBusy(true);
    try {
      for (const row of selectedRows) if (!row.is_final) await sendToTelegram(row);
    } finally {
      setBulkBusy(false);
    }
  }, [selectedRows, sendToTelegram]);

  const bulkDelete = useCallback(async () => {
    setBulkBusy(true);
    try {
      for (const row of selectedRows) await deleteRow(row);
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
      setDeleteDialogOpen(false);
    }
  }, [selectedRows, deleteRow]);

  const exportCsv = useCallback(() => {
    const csv = rowsToCsv(
      selectedRows.map((r) => ({
        id: r.id,
        updated_at: r.updated_at,
        name: safeString(r.data?.name) || null,
        customer_email: r.customer_email,
        status: r.status,
        source: r.source,
        location_id: r.location_id,
        stage: stageById.get(r.id)?.stage ?? null,
        order_number: r.order_number,
        order_status: r.order?.status ?? null,
        suggested_size: r.suggested_size,
        suggested_tier: r.suggested_tier,
        assigned_size: r.assigned_size,
        assigned_tier: r.assigned_tier,
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedRows, stageById]);

  return (
    <div className="space-y-6">
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteTarget ? "Delete result?" : `Delete ${selectedRows.length} result(s)?`}</DialogTitle>
            <DialogDescription>
              {deleteTarget?.is_final
                ? "This released result will be permanently deleted from the database. This action cannot be undone."
                : "This action will permanently delete the selected result(s) from the database. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteTarget ? Boolean(deleting[deleteTarget.id]) : bulkBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteTarget) void deleteRow(deleteTarget);
                else void bulkDelete();
              }}
              disabled={deleteTarget ? Boolean(deleting[deleteTarget.id]) : bulkBusy || selectedRows.length === 0}
            >
              {(deleteTarget && deleting[deleteTarget.id]) || bulkBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Results</h1>
          <p className="text-sm text-muted-foreground">
            Mp-config submissions synced from the database. Click a row to view details and edit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => load({ mode: "replace" })} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as ResultsTab)}>
          <TabsList className="flex-wrap">
            {STAGE_BUCKETS.map((bucket) => (
              <TabsTrigger key={bucket} value={bucket}>
                {TAB_LABELS[bucket]}
                {bucketCounts[bucket] > 0 && (
                  <span
                    className={
                      bucket === "stuck"
                        ? "ml-1.5 rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-800"
                        : "ml-1.5 rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground"
                    }
                  >
                    {bucketCounts[bucket]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:max-w-2xl sm:flex-row">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, order # or id…"
              className="sm:max-w-xs"
            />
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="online_purchase">Purchase</SelectItem>
                <SelectItem value="online_customization">Online</SelectItem>
                <SelectItem value="manual">In-store</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={orderFilter}
              onValueChange={(v) => setOrderFilter(v as OrderFilter)}
            >
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any order state</SelectItem>
                <SelectItem value="has_order">Has an Order</SelectItem>
                <SelectItem value="no_order">No Order</SelectItem>
                <SelectItem value="mismatch">Order without capture</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            <div>Showing {filtered.length} result(s)</div>
            <div>
              Loaded {rows.length}
              {typeof totalCount === "number" ? ` of ${totalCount}` : ""} (page {pageLimit})
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading results…</div>
      ) : (
        <div className="space-y-3">
          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
              <span className="text-sm font-medium">{selectedRows.length} selected</span>
              <Select value={bulkLocation} onValueChange={setBulkLocation}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Set location…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void bulkSetLocation()}>
                Set Location
              </Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void bulkSend()}>
                Send Group Updates
              </Button>
              <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={exportCsv}>
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkBusy}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteDialogOpen(true);
                }}
              >
                Delete
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Select all rows"
                  />
                </TableHead>
                <TableHead className="w-[120px]">Updated</TableHead>
                <TableHead className="w-[220px]">Name</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[200px]">Location</TableHead>
                <TableHead className="w-[140px]">Order</TableHead>
                <TableHead className="hidden w-[120px] md:table-cell">Gender</TableHead>
                <TableHead className="hidden w-[140px] md:table-cell">Age group</TableHead>
                <TableHead className="hidden w-[130px] md:table-cell">Shoulder (cm)</TableHead>
                <TableHead className="w-[220px]">Measured by</TableHead>
                <TableHead className="w-[140px]">Group Updates</TableHead>
                <TableHead className="hidden w-[260px] lg:table-cell">ID</TableHead>
                <TableHead className="w-[52px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="py-10 text-center text-sm text-muted-foreground">
                    {tab === "stuck"
                      ? "Nothing stuck — every Result is moving."
                      : `Nothing in ${TAB_LABELS[tab].toLowerCase()}.`}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const d = row.data ?? {};
                  const name = safeString(d.name) || "—";
                  const gender = safeString(d.gender) || "—";
                  const ageGroup = safeString(d.ageGroup) || "—";
                  const shoulder = safeString(d.shoulderLength) || "—";
                  const updated = row.updated_at ? formatAdminDateTime(row.updated_at) : "—";
                  const busy = Boolean(sending[row.id]);
                  const isDeleting = Boolean(deleting[row.id]);
                  const measuredByText = measuredByLabel(row);
                  const measuredByOk = isMeasuredByValid(row);
                  const staging = stageById.get(row.id);
                  const stage = staging?.stage ?? "measurement_only";
                  const stuckReason = staging?.stuckReason ?? null;

                  return (
                    <TableRow
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className="group cursor-pointer"
                      onClick={() => router.push(to(`/settings/results/${row.id}`))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(to(`/settings/results/${row.id}`));
                        }
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(v) => toggleOne(row.id, v === true)}
                          aria-label="Select row"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{updated}</TableCell>
                      <TableCell className="font-medium">
                        {row.customer_email || name}
                        {(row.assigned_size ?? row.suggested_size) && (
                          <div className="text-xs font-normal text-muted-foreground capitalize">
                            {(row.assigned_size ?? row.suggested_size) ?? "—"} ·{" "}
                            {(row.assigned_tier ?? row.suggested_tier) ?? "—"} tier
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${STAGE_BADGE_CLASS[stage]}`}
                        >
                          {STAGE_LABELS[stage]}
                        </Badge>
                        {stuckReason && (
                          <div className="mt-0.5 text-[10px] leading-tight text-red-700">
                            {STUCK_REASON_LABELS[stuckReason]}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {row.source === "online_purchase"
                            ? "Purchase"
                            : row.source === "online_customization"
                              ? "Online"
                              : "In-store"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={row.location_id ?? "none"}
                          onValueChange={(v) => void updateLocation(row, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {locations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell
                        onClick={(e) => {
                          if (row.order_id) e.stopPropagation();
                        }}
                      >
                        {row.order_id ? (
                          <div className="flex flex-col gap-0.5">
                            <a
                              href={to(`/settings/orders/${row.order_id}`)}
                              className="text-xs text-primary hover:underline font-mono"
                            >
                              {row.order_number ?? "View order"}
                            </a>
                            {row.order?.status && (
                              <Badge
                                variant="outline"
                                className={`w-fit text-[10px] px-1.5 py-0 capitalize ${
                                  ORDER_STATUS_CLASS[row.order.status] ?? ""
                                }`}
                              >
                                {row.order.status.replace(/_/g, " ")}
                              </Badge>
                            )}
                            {row.order?.total != null && (
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                {formatMoney(row.order.total, row.order.currency)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {noOrderReason(stage)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{gender}</TableCell>
                      <TableCell className="hidden md:table-cell">{ageGroup}</TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{shoulder}</TableCell>
                      <TableCell
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Select
                          value={measuredByValue(row)}
                          onValueChange={(v) => {
                            if (row.is_final || staffLoading) return;
                            void updateMeasuredBy(row, v);
                          }}
                        >
                          <SelectTrigger
                            disabled={row.is_final || staffLoading}
                            className={!measuredByOk ? "border-destructive" : undefined}
                          >
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="by_user">by user</SelectItem>
                            {staffRows.map((s) => (
                              <SelectItem key={s.id} value={`staff:${s.id}`}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!measuredByOk ? (
                          <div className="mt-1 text-[11px] text-destructive">Required</div>
                        ) : (
                          <div className="mt-1 text-[11px] text-muted-foreground">Selected: {measuredByText}</div>
                        )}
                      </TableCell>
                      <TableCell
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Button
                          size="sm"
                          variant={row.is_final ? "secondary" : "default"}
                          onClick={() => sendToTelegram(row)}
                          disabled={busy || row.is_final || !measuredByOk}
                        >
                          {busy ? "Sending…" : row.is_final ? "Sent" : "Send"}
                        </Button>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                        {row.id}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="min-h-11 min-w-11"
                          onClick={() => {
                            setDeleteTarget(row);
                            setDeleteDialogOpen(true);
                          }}
                          disabled={isDeleting}
                          aria-label="Delete result"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {typeof totalCount === "number" && rows.length < totalCount ? (
            <div className="flex items-center justify-center">
              <Button
                variant="secondary"
                onClick={() => load({ mode: "append", offset: rows.length })}
                disabled={loading}
              >
                {loading ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

