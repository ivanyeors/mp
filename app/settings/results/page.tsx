"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  created_at: string;
  updated_at: string;
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
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mp-config/responses?limit=200", { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load results");
      setRows((payload?.rows ?? []) as MpConfigResponseRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await fetch("/api/staff", { method: "GET" });
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
    const scope = tab === "active" ? rows.filter((r) => !r.is_final) : rows.filter((r) => r.is_final);
    if (!q) return scope;
    return scope.filter((row) => {
      const d = row.data ?? {};
      const name = safeString(d.name).toLowerCase();
      return row.id.toLowerCase().includes(q) || name.includes(q);
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
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_final: true } : r)));

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Results</h1>
          <p className="text-sm text-muted-foreground">
            Mp-config submissions synced from the database. Click a row to view details and edit.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
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
        <div className="text-xs text-muted-foreground">Showing {filtered.length} result(s)</div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading results…</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Updated</TableHead>
              <TableHead className="w-[220px]">Name</TableHead>
              <TableHead className="w-[120px]">Gender</TableHead>
              <TableHead className="w-[140px]">Age group</TableHead>
              <TableHead className="w-[130px]">Shoulder (cm)</TableHead>
              <TableHead className="w-[220px]">Measured by</TableHead>
              <TableHead className="w-[140px]">Group Updates</TableHead>
              <TableHead className="w-[260px]">ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
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
                const measuredByText = measuredByLabel(row);
                const measuredByOk = isMeasuredByValid(row);

                return (
                  <TableRow
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/settings/results/${row.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/settings/results/${row.id}`);
                      }
                    }}
                  >
                    <TableCell className="text-xs text-muted-foreground">{updated}</TableCell>
                    <TableCell className="font-medium">{name}</TableCell>
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
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

