"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

type ResultsTab = "active" | "released";

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
  const [rows, setRows] = useState<MpConfigResponseRow[]>(
    initialData?.responses?.rows ?? [],
  );
  const [loading, setLoading] = useState(!initialData?.responses);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ResultsTab>("active");
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Purchase-path held/assigned Results stay in Active until the customer decides.
    const inQueue = (r: MpConfigResponseRow) =>
      r.status === "held" || r.status === "assigned";
    const scope =
      tab === "active"
        ? rows.filter((r) => !r.is_final || inQueue(r))
        : rows.filter((r) => r.is_final && !inQueue(r));
    if (!q) return scope;
    return scope.filter((row) => {
      const d = row.data ?? {};
      const name = safeString(d.name).toLowerCase();
      const email = safeString(row.customer_email).toLowerCase();
      return (
        row.id.toLowerCase().includes(q) ||
        name.includes(q) ||
        email.includes(q)
      );
    });
  }, [rows, search, tab]);

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

        setTab("released");
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
        order_number: r.order_number,
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
  }, [selectedRows]);

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:max-w-md">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or id…"
          />
          <Tabs value={tab} onValueChange={(v) => setTab(v as ResultsTab)}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="released">Released</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <div>Showing {filtered.length} result(s)</div>
          <div>
            Loaded {rows.length}
            {typeof totalCount === "number" ? ` of ${totalCount}` : ""} (page {pageLimit})
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
                    {tab === "active" ? "No active results yet." : "No released results yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const d = row.data ?? {};
                  const name = safeString(d.name) || "—";
                  const gender = safeString(d.gender) || "—";
                  const ageGroup = safeString(d.ageGroup) || "—";
                  const shoulder = safeString(d.shoulderLength) || "—";
                  const updated = row.updated_at ? new Date(row.updated_at).toLocaleString() : "—";
                  const busy = Boolean(sending[row.id]);
                  const isDeleting = Boolean(deleting[row.id]);
                  const measuredByText = measuredByLabel(row);
                  const measuredByOk = isMeasuredByValid(row);

                  return (
                    <TableRow
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      className="group cursor-pointer"
                      onClick={() => router.push(`/settings/results/${row.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/settings/results/${row.id}`);
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
                        {row.status ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                            {row.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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
                        {row.order_number ? (
                          <a
                            href={`/settings/orders/${row.order_id}`}
                            className="text-xs text-primary hover:underline font-mono"
                          >
                            {row.order_number}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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

