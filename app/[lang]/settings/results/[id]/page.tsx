"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";

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

type BomLine = {
  quantity: number | string;
  item: { id: number; category: string; name: string; size: string | null; subtype: string | null } | null;
};

type MpConfigSuggestion = {
  recommended: { size: "XS" | "S" | "M" | "L" | "XL"; kind: "basic" | "premium" };
  product: { id: number; size: "XS" | "S" | "M" | "L" | "XL"; kind: "basic" | "premium" } | null;
  bom: BomLine[];
  reasons: string[];
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

export default function ResultDetailPage() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const to = useCallback((href: string) => withLocale(href, locale), [locale]);

  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [row, setRow] = useState<MpConfigResponseRow | null>(null);
  const [suggestion, setSuggestion] = useState<MpConfigSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const [draft, setDraft] = useState<MeasurementData>(() => normalizeMeasurement(null));

  const headerMeta = useMemo(() => {
    if (!row) return null;
    return {
      createdAt: row.created_at ? new Date(row.created_at).toLocaleString() : "—",
      updatedAt: row.updated_at ? new Date(row.updated_at).toLocaleString() : "—",
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
      setSuggestion((payload?.suggestion ?? null) as MpConfigSuggestion | null);
      setDraft(normalizeMeasurement(response?.data ?? null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load result");
      setRow(null);
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push(to("/settings/results"))}>
            Back
          </Button>
          <Button onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Result details</h1>
          <p className="text-sm text-muted-foreground font-mono break-all">{row.id}</p>
          {headerMeta ? (
            <p className="text-xs text-muted-foreground mt-1">
              Created {headerMeta.createdAt} · Updated {headerMeta.updatedAt}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push(to("/settings/results"))}>
            Back
          </Button>
          <Button variant="secondary" onClick={load} disabled={saving || deleting}>
            Refresh
          </Button>
          <Button onClick={save} disabled={saving || deleting}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

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

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={refreshSuggestion} disabled={suggestionLoading || deleting}>
              {suggestionLoading ? "Refreshing suggestion…" : "Refresh suggestion"}
            </Button>
            <Button variant="destructive" onClick={deleteRow} disabled={deleting || saving}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
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
                <div className="text-xs text-muted-foreground">Recommended kind</div>
                <div className="text-lg font-semibold">{suggestion.recommended.kind}</div>
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
                  ? `Product #${suggestion.product.id} (${suggestion.product.kind} · ${suggestion.product.size})`
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

