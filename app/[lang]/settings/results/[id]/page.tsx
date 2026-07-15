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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatFillingPreview } from "@/lib/filling-preview";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";

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
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<MpConfigSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const [draft, setDraft] = useState<MeasurementData>(() => normalizeMeasurement(null));

  const [assignSize, setAssignSize] = useState<PillowSize>("M");
  const [assignTier, setAssignTier] = useState<PillowTier>("basic");
  const [assignLength, setAssignLength] = useState("");
  const [fillingTemplateId, setFillingTemplateId] = useState<string>("");
  const [fillingTemplates, setFillingTemplates] = useState<FillingTemplateOption[]>([]);
  const [assignPrep, setAssignPrep] = useState<AssignPrepData | null>(null);
  const [selectedFillingPreview, setSelectedFillingPreview] = useState<Array<{ variant: string; qty: number }>>([]);
  const [prepLoading, setPrepLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useSettingsBreadcrumbDetail(draft.name.trim() || orderNumber || null);

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
      setOrderNumber((payload?.order_number as string) ?? null);
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

  const loadAssignPrep = useCallback(async () => {
    if (!canAssign || !sizeKey) {
      setAssignPrep(null);
      setFillingTemplates([]);
      return;
    }
    setPrepLoading(true);
    setTemplatesLoading(true);
    try {
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
  }, [canAssign, sizeKey, productType, assignLength, assignSize, assignTier]);

  useEffect(() => {
    setFillingTemplateId("");
    setSelectedFillingPreview([]);
  }, [assignSize, assignTier, assignLength, productType]);

  useEffect(() => {
    if (!row || !canAssign) return;
    void loadAssignPrep();
  }, [row, canAssign, loadAssignPrep]);

  const loadSelectedFillingPreview = useCallback(
    async (templateId: string) => {
      if (!templateId) {
        setSelectedFillingPreview([]);
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
        const { supabaseClient } = await import("@/lib/supabase/client");
        const itemIds = lines.map((l) => l.item_id);
        const { data: itemRows } = itemIds.length
          ? await supabaseClient.from("items").select("id,name,subtype,size").in("id", itemIds)
          : { data: [] as Array<{ id: number; name: string; subtype: string | null; size: string | null }> };
        const itemsById = new Map(
          (itemRows ?? []).map((i) => [Number(i.id), { name: i.name, subtype: i.subtype, size: i.size }]),
        );
        setSelectedFillingPreview(formatFillingPreview(lines, itemsById, sizeKey));
      } catch {
        setSelectedFillingPreview([]);
      }
    },
    [sizeKey, to],
  );

  const assign = useCallback(async () => {
    if (!id) return;
    if (!fillingTemplateId) {
      toast.error("Select a Filling Template");
      return;
    }
    setAssigning(true);
    try {
      const body =
        productType === "bolster"
          ? {
              assignedLength: assignLength || "medium",
              fillingTemplateId: Number(fillingTemplateId),
            }
          : {
              assignedSize: assignSize,
              assignedTier: assignTier,
              fillingTemplateId: Number(fillingTemplateId),
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
    load,
  ]);

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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => router.push(to("/settings/results"))}
          >
            Back
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={load}
            disabled={saving || deleting}
          >
            Refresh
          </Button>
          <Button className="w-full sm:w-auto" onClick={save} disabled={saving || deleting}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Purchase-path assignment (held Results) */}
      {(row.status === "held" || row.status === "assigned") && (
        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Assignment</div>
            <p className="text-sm text-muted-foreground">
              {productType === "bolster"
                ? "Confirm or override length and select a bolster Filling Template. Customer is emailed on save."
                : "Confirm or override size×tier and select a Filling Template. Customer is emailed on save."}
            </p>
          </div>

          {row.status === "assigned" ? (
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
                <div className="font-medium">#{row.filling_template_id ?? "—"}</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Final amount</div>
                <div className="font-medium tabular-nums">
                  {row.final_amount != null
                    ? `${row.currency ?? "SGD"} ${Number(row.final_amount).toFixed(2)}`
                    : "—"}
                </div>
              </div>
            </div>
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
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="text-xs text-muted-foreground mb-1">Suggested default</div>
                    {prepLoading ? (
                      <p className="text-muted-foreground">Loading…</p>
                    ) : assignPrep?.defaultFillingTemplate ? (
                      <>
                        <p className="font-medium">{assignPrep.defaultFillingTemplate.name}</p>
                        {assignPrep.defaultFillingTemplate.preview.length ? (
                          <ul className="mt-1 text-muted-foreground space-y-0.5">
                            {assignPrep.defaultFillingTemplate.preview.map((line, idx) => (
                              <li key={idx}>
                                {line.variant} ×{line.qty}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">Default has no filling lines</p>
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

                  {fillingTemplateId && selectedFillingPreview.length > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="text-xs text-muted-foreground mb-1">Selected preview</div>
                      <ul className="space-y-0.5">
                        {selectedFillingPreview.map((line, idx) => (
                          <li key={idx}>
                            {line.variant} ×{line.qty}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Button onClick={assign} disabled={assigning || !fillingTemplateId}>
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

      {/* Order link banner */}
      {row.order_id && orderNumber && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-2.5">
          <span className="text-sm">Linked to Order</span>
          <a
            href={to(`/settings/orders/${row.order_id}`)}
            className="text-sm font-semibold text-primary hover:underline"
          >
            #{orderNumber}
          </a>
          {row.source === "online_customization" && (
            <span className="ml-auto rounded-full bg-blue-100 dark:bg-blue-900/40 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
              Online Customization
            </span>
          )}
        </div>
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

