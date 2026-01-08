"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { getInventoryItemDisplayLabel } from "./item-label";
import {
  listShopifyAdminState,
  listShopifyUnmappedVariants,
  listTemplates,
  upsertShopifyVariantOverride,
  deleteShopifyVariantOverride,
  linkPartToShopifyVariant,
  linkPillowToShopifyVariant,
  linkBolsterToShopifyVariant,
  deleteShopifyMapping,
} from "./actions";

type Item = {
  id: number;
  category: string;
  subtype: string | null;
  name: string;
  size: string | null;
  alteration_of_item_id: number | null;
};

type AdminRow = {
  shopifyVariantId: number;
  shopifyVariantName: string | null;
  kind: "pillow" | "bolster" | "part" | "unmapped";
  pillowSize: string | null;
  pillowKind: string | null;
  bolsterVariant: string | null;
  item: { id: number; category: string; name: string; size: string | null; subtype: string | null } | null;
  notes: string | null;
  override: { sku: string | null; price: string | number | null; compare_at_price: string | number | null; currency: string | null } | null;
  msrp: string | null;
};

const ALL_PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;
const ALL_BOLSTER_VARIANTS = ["short", "medium", "long"] as const;

export default function ShopifyAdminPanel({ items }: { items: Item[] }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [filter, setFilter] = useState("");

  const [linkKind, setLinkKind] = useState<"part" | "pillow" | "bolster">("part");
  const [linkItemId, setLinkItemId] = useState<string>("");
  const [linkVariantId, setLinkVariantId] = useState<string>("");
  const [linking, setLinking] = useState(false);
  const [linkPillowKind, setLinkPillowKind] = useState<"basic" | "premium">("basic");
  const [linkPillowSize, setLinkPillowSize] = useState<"" | "XS" | "S" | "M" | "L" | "XL">("M");
  const [linkBolsterVariant, setLinkBolsterVariant] = useState<"" | "short" | "medium" | "long">("medium");
  const [linkTemplateId, setLinkTemplateId] = useState<string>("");
  const [linkTemplates, setLinkTemplates] = useState<Array<{ id: number; name: string }>>([]);
  const [loadingLinkTemplates, setLoadingLinkTemplates] = useState(false);

  const [unmappedVariants, setUnmappedVariants] = useState<Array<{ id: number; label: string; sku: string | null }>>([]);
  const [unmappedFilter, setUnmappedFilter] = useState("");

  const [draftByVariantId, setDraftByVariantId] = useState<Record<number, { sku: string }>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [res, unmapped] = await Promise.all([listShopifyAdminState(), listShopifyUnmappedVariants()]);
      if (!res?.ok) throw new Error("Failed to load Shopify admin state");
      if (!unmapped?.ok) throw new Error("Failed to load unmapped Shopify variants");
      const next = (res.rows ?? []) as AdminRow[];
      setRows(next);
      setDraftByVariantId(() => {
        const out: Record<number, { sku: string }> = {};
        next.forEach((r) => {
          out[r.shopifyVariantId] = {
            sku: r.override?.sku ?? "",
          };
        });
        return out;
      });
      setUnmappedVariants(
        ((unmapped.variants ?? []) as Array<{ id: number; label: string; sku: string | null }>).map((v) => ({
          id: Number(v.id),
          label: String(v.label),
          sku: v.sku ?? null,
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Shopify admin state");
    } finally {
      setLoading(false);
    }
  }, []);

  const mappedPillowSizesByKind = useMemo(() => {
    const basic = new Set<string>();
    const premium = new Set<string>();
    rows.forEach((r) => {
      if (r.kind !== "pillow") return;
      const k = (r.pillowKind ?? "basic") === "premium" ? "premium" : "basic";
      const sz = r.pillowSize ? String(r.pillowSize) : "";
      if (!sz) return;
      if (k === "premium") premium.add(sz);
      else basic.add(sz);
    });
    return { basic, premium };
  }, [rows]);

  const unmappedPillowSizesForSelection = useMemo(() => {
    const mapped = linkPillowKind === "premium" ? mappedPillowSizesByKind.premium : mappedPillowSizesByKind.basic;
    return ALL_PILLOW_SIZES.filter((sz) => !mapped.has(sz));
  }, [linkPillowKind, mappedPillowSizesByKind]);

  const mappedBolsterVariants = useMemo(() => {
    const out = new Set<string>();
    rows.forEach((r) => {
      if (r.kind !== "bolster") return;
      const v = r.bolsterVariant ? String(r.bolsterVariant) : "";
      if (v) out.add(v);
    });
    return out;
  }, [rows]);

  const unmappedBolsterVariantsForSelection = useMemo(() => {
    return ALL_BOLSTER_VARIANTS.filter((v) => !mappedBolsterVariants.has(v));
  }, [mappedBolsterVariants]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // After linking, already-mapped pillow sizes / bolster variants should no longer be selectable.
    if (linkKind === "pillow") {
      if (!linkPillowSize || !unmappedPillowSizesForSelection.includes(linkPillowSize as (typeof ALL_PILLOW_SIZES)[number])) {
        setLinkPillowSize(unmappedPillowSizesForSelection[0] ?? "");
      }
    }
    if (linkKind === "bolster") {
      if (
        !linkBolsterVariant ||
        !unmappedBolsterVariantsForSelection.includes(linkBolsterVariant as (typeof ALL_BOLSTER_VARIANTS)[number])
      ) {
        setLinkBolsterVariant(unmappedBolsterVariantsForSelection[0] ?? "");
      }
    }
  }, [linkKind, linkPillowSize, linkBolsterVariant, unmappedPillowSizesForSelection, unmappedBolsterVariantsForSelection]);

  useEffect(() => {
    const load = async () => {
      // Parts don't use BOM templates.
      if (linkKind === "part") {
        setLinkTemplates([]);
        setLinkTemplateId("");
        return;
      }

      setLoadingLinkTemplates(true);
      try {
        if (linkKind === "pillow") {
          if (!linkPillowSize) {
            setLinkTemplates([]);
            return;
          }
          const payload = await listTemplates("pillow", linkPillowSize, linkPillowKind);
          const list = (payload.templates ?? []) as Array<{ id: number; name: string }>;
          setLinkTemplates(list.map((t) => ({ id: Number(t.id), name: String(t.name) })));
        } else {
          if (!linkBolsterVariant) {
            setLinkTemplates([]);
            return;
          }
          const payload = await listTemplates("bolster", linkBolsterVariant);
          const list = (payload.templates ?? []) as Array<{ id: number; name: string }>;
          setLinkTemplates(list.map((t) => ({ id: Number(t.id), name: String(t.name) })));
        }
      } catch (e) {
        setLinkTemplates([]);
        toast.error(e instanceof Error ? e.message : "Failed to load templates");
      } finally {
        setLoadingLinkTemplates(false);
      }
    };

    load();
    // Reset chosen template whenever the selection changes.
    setLinkTemplateId("");
  }, [linkKind, linkPillowKind, linkPillowSize, linkBolsterVariant]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const parts = [
        String(r.shopifyVariantId),
        r.kind,
        r.pillowKind ?? "",
        r.pillowSize ?? "",
        r.bolsterVariant ?? "",
        r.item?.category ?? "",
        r.item?.name ?? "",
        r.item?.size ?? "",
        r.item?.subtype ?? "",
        r.override?.sku ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return parts.includes(q);
    });
  }, [rows, filter]);

  const itemOptions = useMemo(() => {
    const mappedPartItemIds = new Set(
      rows
        .filter((r) => r.kind === "part" && r.item?.id)
        .map((r) => Number(r.item!.id)),
    );

    const selectedId = linkItemId ? Number(linkItemId) : null;

    const sorted = [...items]
      // Hide parts that are already mapped to a Shopify variant (but keep the currently selected item visible).
      .filter((it) => !mappedPartItemIds.has(it.id) || (selectedId !== null && it.id === selectedId))
      // Hide altered fillings from Shopify mapping UI (they should inherit mapping from their base item).
      .filter((it) => !(it.category === "filling" && it.alteration_of_item_id))
      .sort((a, b) => getInventoryItemDisplayLabel(a).localeCompare(getInventoryItemDisplayLabel(b)));
    return sorted.map((it) => ({ id: it.id, label: getInventoryItemDisplayLabel(it) }));
  }, [items, rows, linkItemId]);

  const visibleUnmapped = useMemo(() => {
    const q = unmappedFilter.trim().toLowerCase();
    if (!q) return unmappedVariants;
    return unmappedVariants.filter((v) => `${v.label} ${v.sku ?? ""} ${v.id}`.toLowerCase().includes(q));
  }, [unmappedVariants, unmappedFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-semibold">Shopify Admin</div>
          <div className="text-sm text-muted-foreground">
            Active Shopify variants only. Price + compare-at are synced from <span className="font-medium">Costings</span>; override SKU here.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by variantId, SKU, item name…" />
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="text-sm font-medium">Link an unmapped Shopify variant</div>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Mapping type</div>
            <Select value={linkKind} onValueChange={(v) => setLinkKind(v as "part" | "pillow" | "bolster")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="part">Part (inventory item)</SelectItem>
                <SelectItem value="pillow">Pillow (kind + size)</SelectItem>
                <SelectItem value="bolster">Bolster (length variant)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            {linkKind === "part" ? (
              <>
                <div className="text-xs text-muted-foreground">Inventory item</div>
                <Select value={linkItemId} onValueChange={setLinkItemId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select item…" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemOptions.map((opt) => (
                      <SelectItem key={opt.id} value={String(opt.id)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {linkKind === "pillow" ? (
              <>
                <div className="text-xs text-muted-foreground">Pillow kind</div>
                <Select value={linkPillowKind} onValueChange={(v) => setLinkPillowKind(v as "basic" | "premium")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">basic</SelectItem>
                    <SelectItem value="premium">premium</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {linkKind === "bolster" ? (
              <>
                <div className="text-xs text-muted-foreground">Bolster variant</div>
                <Select value={linkBolsterVariant} onValueChange={(v) => setLinkBolsterVariant(v as "" | "short" | "medium" | "long")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={!linkBolsterVariant ? "Select bolster variant…" : undefined} />
                  </SelectTrigger>
                  <SelectContent>
                    {unmappedBolsterVariantsForSelection.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">All bolster variants already mapped</div>
                    ) : (
                      unmappedBolsterVariantsForSelection.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Pillow size</div>
            <Select
              value={linkKind === "pillow" ? linkPillowSize : ""}
              onValueChange={(v) => setLinkPillowSize(v as "" | "XS" | "S" | "M" | "L" | "XL")}
            >
              <SelectTrigger className="w-full" disabled={linkKind !== "pillow"}>
                <SelectValue
                  placeholder={linkKind !== "pillow" ? "Not required" : (!linkPillowSize ? "Select pillow size…" : undefined)}
                />
              </SelectTrigger>
              <SelectContent>
                {linkKind !== "pillow" ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Not required</div>
                ) : unmappedPillowSizesForSelection.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">All sizes already mapped</div>
                ) : (
                  unmappedPillowSizesForSelection.map((sz) => (
                    <SelectItem key={sz} value={sz}>
                      {sz}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Template</div>
            <Select value={linkKind === "part" ? "" : linkTemplateId} onValueChange={setLinkTemplateId}>
              <SelectTrigger className="w-full" disabled={loadingLinkTemplates || linkKind === "part"}>
                <SelectValue
                  placeholder={
                    linkKind === "part"
                      ? "Not required"
                      : (loadingLinkTemplates ? "Loading…" : "Select template…")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {linkTemplates.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {linkKind === "part" ? "Not required" : "No templates found"}
                  </div>
                ) : (
                  linkTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Shopify variant</div>
              <div className="text-[11px] text-muted-foreground">Unmapped: {unmappedVariants.length}</div>
            </div>
            <Select
              value={unmappedVariants.some((v) => String(v.id) === linkVariantId) ? linkVariantId : ""}
              onValueChange={(v) => setLinkVariantId(v)}
            >
              <SelectTrigger className="w-full" disabled={loading}>
                <SelectValue placeholder="Pick an unmapped Shopify variant…" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <div className="sticky top-0 z-10 bg-popover p-1">
                  <Input
                    value={unmappedFilter}
                    onChange={(e) => setUnmappedFilter(e.target.value)}
                    placeholder="Search variants…"
                    aria-label="Search unmapped Shopify variants"
                    autoFocus
                    onKeyDown={(e) => {
                      // Keep typing/navigation inside the input without the menu stealing arrow keys.
                      if (e.key !== "Escape") e.stopPropagation();
                    }}
                  />
                </div>
                {visibleUnmapped.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No variants found</div>
                ) : (
                  visibleUnmapped.slice(0, 200).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.label}
                      {v.sku ? ` — ${v.sku}` : ""} #{v.id}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={linking}
              onClick={async () => {
                if (!linkVariantId) {
                  toast.message("Pick an unmapped Shopify variant");
                  return;
                }
                setLinking(true);
                try {
                  const shopifyVariantId = Number(linkVariantId);
                  if (linkKind === "part") {
                    if (!linkItemId) {
                      toast.message("Select an inventory item");
                      return;
                    }
                    await linkPartToShopifyVariant({ itemId: Number(linkItemId), shopifyVariantId });
                  } else if (linkKind === "pillow") {
                    if (!linkPillowSize) {
                      toast.message("Select a pillow size");
                      return;
                    }
                    if (!linkTemplateId) {
                      toast.message("Select a template");
                      return;
                    }
                    await linkPillowToShopifyVariant({
                      shopifyVariantId,
                      pillowKind: linkPillowKind,
                      pillowSize: linkPillowSize,
                      templateId: Number(linkTemplateId),
                    });
                  } else {
                    if (!linkBolsterVariant) {
                      toast.message("Select a bolster variant");
                      return;
                    }
                    if (!linkTemplateId) {
                      toast.message("Select a template");
                      return;
                    }
                    await linkBolsterToShopifyVariant({
                      shopifyVariantId,
                      bolsterVariant: linkBolsterVariant,
                      templateId: Number(linkTemplateId),
                    });
                  }
                  toast.success("Linked");
                  setLinkItemId("");
                  setLinkVariantId("");
                  setUnmappedFilter("");
                  setLinkTemplateId("");
                  await refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to link");
                } finally {
                  setLinking(false);
                }
              }}
            >
              {linking ? "Linking…" : "Link"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Mapping</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price (SGD)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const d = draftByVariantId[r.shopifyVariantId] ?? { sku: "" };
              const status =
                r.kind === "unmapped"
                  ? "unmapped"
                  : r.kind === "part" && !r.item
                    ? "broken"
                    : "mapped";

              const mappingLabel =
                r.kind === "part"
                  ? r.item
                    ? `${r.item.category} — ${r.item.name}${r.item.size ? ` (${r.item.size})` : ""}${r.item.subtype ? ` — ${r.item.subtype}` : ""}`
                    : "part"
                  : r.kind === "pillow"
                    ? `${r.pillowKind ?? "basic"} / ${r.pillowSize ?? ""}`
                    : r.kind === "bolster"
                      ? `bolster / ${r.bolsterVariant ?? ""}`
                      : "—";

              return (
                <TableRow key={r.shopifyVariantId}>
                  <TableCell className="font-mono text-xs">{r.shopifyVariantId}</TableCell>
                  <TableCell>
                    {status === "unmapped" ? (
                      <span className="inline-flex items-center rounded border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Unmapped
                      </span>
                    ) : status === "broken" ? (
                      <span className="inline-flex items-center rounded border border-red-300/60 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
                        Broken
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Mapped
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{r.shopifyVariantName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{mappingLabel}</TableCell>
                  <TableCell>
                    <Input
                      value={d.sku}
                      onChange={(e) =>
                        setDraftByVariantId((prev) => ({
                          ...prev,
                          [r.shopifyVariantId]: { ...d, sku: e.target.value },
                        }))
                      }
                      placeholder="(optional)"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={r.msrp ?? ""}
                      disabled
                      placeholder="Set in Costings…"
                      inputMode="decimal"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await upsertShopifyVariantOverride({
                              shopifyVariantId: r.shopifyVariantId,
                              sku: d.sku.trim() ? d.sku.trim() : null,
                            });
                            toast.success("Saved");
                            await refresh();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to save");
                          }
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await deleteShopifyVariantOverride(r.shopifyVariantId);
                            toast.success("Override cleared");
                            setDraftByVariantId((prev) => ({ ...prev, [r.shopifyVariantId]: { sku: "" } }));
                            await refresh();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to clear override");
                          }
                        }}
                      >
                        Clear
                      </Button>
                      {r.kind !== "unmapped" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            try {
                              await deleteShopifyMapping(r.shopifyVariantId);
                              toast.success("Mapping deleted");
                              await refresh();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to delete mapping");
                            }
                          }}
                        >
                          Unlink
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No rows
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


