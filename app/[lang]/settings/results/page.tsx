"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SlaSettingsForm = {
  workingDays: number;
  reminderIntervalDays: number;
  remindTelegram: boolean;
  remindEmail: boolean;
  opsEmail: string;
  authExpiryBufferHours: number;
};

const DEFAULT_SLA_FORM: SlaSettingsForm = {
  workingDays: 5,
  reminderIntervalDays: 1,
  remindTelegram: true,
  remindEmail: true,
  opsEmail: "",
  authExpiryBufferHours: 48,
};

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

export default function ResultsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MpConfigResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ResultsTab>("active");
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MpConfigResponseRow | null>(null);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [pageLimit] = useState<number>(200);
  const [sla, setSla] = useState<SlaSettingsForm>(DEFAULT_SLA_FORM);
  const [slaLoading, setSlaLoading] = useState(true);
  const [slaSaving, setSlaSaving] = useState(false);

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
    void loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSlaLoading(true);
      try {
        const res = await fetch("/api/results/sla-settings", { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Failed to load SLA settings");
        if (cancelled) return;
        const s = payload.settings as Partial<SlaSettingsForm>;
        setSla({
          workingDays: s.workingDays ?? 5,
          reminderIntervalDays: s.reminderIntervalDays ?? 1,
          remindTelegram: s.remindTelegram ?? true,
          remindEmail: s.remindEmail ?? true,
          opsEmail: s.opsEmail ?? "",
          authExpiryBufferHours: s.authExpiryBufferHours ?? 48,
        });
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load SLA settings");
      } finally {
        if (!cancelled) setSlaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSla = useCallback(async () => {
    setSlaSaving(true);
    try {
      const res = await fetch("/api/results/sla-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sla,
          opsEmail: sla.opsEmail.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save SLA settings");
      const s = payload.settings as Partial<SlaSettingsForm>;
      setSla({
        workingDays: s.workingDays ?? sla.workingDays,
        reminderIntervalDays: s.reminderIntervalDays ?? sla.reminderIntervalDays,
        remindTelegram: s.remindTelegram ?? sla.remindTelegram,
        remindEmail: s.remindEmail ?? sla.remindEmail,
        opsEmail: s.opsEmail ?? "",
        authExpiryBufferHours: s.authExpiryBufferHours ?? sla.authExpiryBufferHours,
      });
      toast.success("SLA settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save SLA settings");
    } finally {
      setSlaSaving(false);
    }
  }, [sla]);

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
            <DialogTitle>Delete result?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.is_final
                ? "This released result will be permanently deleted from the database. This action cannot be undone."
                : "This result will be permanently deleted from the database. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteTarget ? Boolean(deleting[deleteTarget.id]) : false}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                void deleteRow(deleteTarget);
              }}
              disabled={deleteTarget ? Boolean(deleting[deleteTarget.id]) : true}
            >
              {deleteTarget && deleting[deleteTarget.id] ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <h2 className="text-sm font-medium">Review SLA</h2>
          <p className="text-xs text-muted-foreground">
            Unassigned held Results expire after the working-day SLA (always before the card
            authorization dies). Reminders go to Telegram and/or ops email.
          </p>
        </div>
        {slaLoading ? (
          <p className="text-xs text-muted-foreground">Loading SLA settings…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sla-days">Working days (default 5)</Label>
              <Input
                id="sla-days"
                type="number"
                min={1}
                max={30}
                value={sla.workingDays}
                onChange={(e) =>
                  setSla((p) => ({ ...p, workingDays: Number(e.target.value) || 1 }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sla-interval">Reminder interval (days)</Label>
              <Input
                id="sla-interval"
                type="number"
                min={1}
                max={14}
                value={sla.reminderIntervalDays}
                onChange={(e) =>
                  setSla((p) => ({
                    ...p,
                    reminderIntervalDays: Number(e.target.value) || 1,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sla-buffer">Auth expiry buffer (hours, default 48)</Label>
              <Input
                id="sla-buffer"
                type="number"
                min={1}
                max={72}
                value={sla.authExpiryBufferHours}
                onChange={(e) =>
                  setSla((p) => ({
                    ...p,
                    authExpiryBufferHours: Number(e.target.value) || 1,
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Keep ≥48 while the SLA cron runs once daily (Vercel Hobby limit).
              </p>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="sla-ops-email">Ops email for reminders</Label>
              <Input
                id="sla-ops-email"
                type="email"
                placeholder="ops@example.com"
                value={sla.opsEmail}
                onChange={(e) => setSla((p) => ({ ...p, opsEmail: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-3 justify-end">
              <div className="flex items-center gap-2">
                <Switch
                  id="sla-tg"
                  checked={sla.remindTelegram}
                  onCheckedChange={(v) => setSla((p) => ({ ...p, remindTelegram: v }))}
                />
                <Label htmlFor="sla-tg">Telegram reminders</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="sla-email"
                  checked={sla.remindEmail}
                  onCheckedChange={(v) => setSla((p) => ({ ...p, remindEmail: v }))}
                />
                <Label htmlFor="sla-email">Email reminders</Label>
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="button" size="sm" disabled={slaSaving} onClick={() => void saveSla()}>
                {slaSaving ? "Saving…" : "Save SLA settings"}
              </Button>
            </div>
          </div>
        )}
      </div>

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Updated</TableHead>
                <TableHead className="w-[220px]">Name</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[140px]">Order</TableHead>
                <TableHead className="w-[120px]">Gender</TableHead>
                <TableHead className="w-[140px]">Age group</TableHead>
                <TableHead className="w-[130px]">Shoulder (cm)</TableHead>
                <TableHead className="w-[220px]">Measured by</TableHead>
                <TableHead className="w-[140px]">Group Updates</TableHead>
                <TableHead className="w-[260px]">ID</TableHead>
                <TableHead className="w-[52px] text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
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
                      <TableCell>{gender}</TableCell>
                      <TableCell>{ageGroup}</TableCell>
                      <TableCell className="tabular-nums">{shoulder}</TableCell>
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
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.id}</TableCell>
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
                          className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
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

