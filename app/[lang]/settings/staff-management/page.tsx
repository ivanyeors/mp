"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StaffRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export default function StaffManagementPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Staff management</h1>
          <p className="text-sm text-muted-foreground">
            Create staff members so you can tag who measured each configuration.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading || saving}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

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
                <TableHead className="w-[260px]">Name</TableHead>
                <TableHead className="w-[220px]">Updated</TableHead>
                <TableHead>ID</TableHead>
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
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

