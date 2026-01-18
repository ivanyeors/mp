"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  created_at: string;
  updated_at: string;
};

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
  const [togglingFinal, setTogglingFinal] = useState<Record<string, boolean>>({});

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const d = row.data ?? {};
      const name = safeString(d.name).toLowerCase();
      return row.id.toLowerCase().includes(q) || name.includes(q);
    });
  }, [rows, search]);

  const toggleIsFinal = useCallback(
    async (row: MpConfigResponseRow) => {
      setTogglingFinal((prev) => ({ ...prev, [row.id]: true }));
      try {
        const data = normalizeMeasurement(row.data ?? {});
        const res = await fetch("/api/mp-config/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            data,
            isFinal: !row.is_final,
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Failed to update");
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_final: !row.is_final } : r)));
        toast.success(!row.is_final ? "Marked as final" : "Marked as not final");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      } finally {
        setTogglingFinal((prev) => {
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
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or id…"
          className="sm:max-w-sm"
        />
        <div className="text-xs text-muted-foreground">Showing {filtered.length} result(s)</div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading results…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground">No results yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Updated</TableHead>
              <TableHead className="w-[220px]">Name</TableHead>
              <TableHead className="w-[120px]">Gender</TableHead>
              <TableHead className="w-[140px]">Age group</TableHead>
              <TableHead className="w-[130px]">Shoulder (cm)</TableHead>
              <TableHead className="w-[120px]">Final</TableHead>
              <TableHead className="w-[260px]">ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => {
              const d = row.data ?? {};
              const name = safeString(d.name) || "—";
              const gender = safeString(d.gender) || "—";
              const ageGroup = safeString(d.ageGroup) || "—";
              const shoulder = safeString(d.shoulderLength) || "—";
              const updated = row.updated_at ? new Date(row.updated_at).toLocaleString() : "—";
              const busy = Boolean(togglingFinal[row.id]);

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
                    <Button
                      size="sm"
                      variant={row.is_final ? "default" : "secondary"}
                      onClick={() => toggleIsFinal(row)}
                      disabled={busy}
                    >
                      {busy ? "Saving…" : row.is_final ? "Final" : "Not final"}
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.id}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

