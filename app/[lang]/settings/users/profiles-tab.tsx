"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAdminDateTime } from "@/lib/format/admin-date";

export type StaffRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

/** The `/api/staff` payload the page mounts with. */
export type StaffInitialData = { ok: true; rows: StaffRow[] };

/** Staff profiles tab: the people tagged as "measured by" on Results. */
export function ProfilesTab({ initialData }: { initialData?: StaffInitialData }) {
  const [rows, setRows] = useState<StaffRow[]>(initialData?.rows ?? []);
  const [loading, setLoading] = useState(!initialData);
  // The server already loaded the staff; Refresh and saves still refetch.
  const skipFirstFetch = useRef(initialData != null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff", { method: "GET" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load staff");
      setRows((payload?.rows ?? []) as StaffRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    void load();
  }, [load]);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to create staff");

      setName("");
      toast.success("Staff member created");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create staff");
    } finally {
      setSaving(false);
    }
  }, [load, name]);

  const staffContent = (
    <>
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium">Name</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter staff name"
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
            />
          </div>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-medium">Staff</div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sm:w-[260px]">Name</TableHead>
                <TableHead className="sm:w-[220px]">Updated</TableHead>
                <TableHead className="hidden sm:table-cell">ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    No staff yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[40vw] truncate font-medium sm:max-w-none">{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.updated_at ? formatAdminDateTime(r.updated_at) : "—"}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{r.id}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );

  return (
    <>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={load} disabled={loading || saving}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {staffContent}
    </>
  );
}
