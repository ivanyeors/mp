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
  upsertShopifyVariantOverride,
  deleteShopifyVariantOverride,
  linkPartToShopifyVariant,
  deleteShopifyMapping,
} from "./actions";

type Item = { id: number; category: string; subtype: string | null; name: string; size: string | null };

type AdminRow = {
  shopifyVariantId: number;
  shopifyVariantName: string | null;
  kind: "pillow" | "bolster" | "part";
  pillowSize: string | null;
  pillowKind: string | null;
  bolsterVariant: string | null;
  item: { id: number; category: string; name: string; size: string | null; subtype: string | null } | null;
  notes: string | null;
  override: { sku: string | null; price: string | number | null; compare_at_price: string | number | null; currency: string | null } | null;
};

export default function ShopifyAdminPanel({ items }: { items: Item[] }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [filter, setFilter] = useState("");

  const [linkItemId, setLinkItemId] = useState<string>("");
  const [linkVariantId, setLinkVariantId] = useState<string>("");
  const [linking, setLinking] = useState(false);

  const [unmappedVariants, setUnmappedVariants] = useState<Array<{ id: number; label: string; sku: string | null }>>([]);
  const [unmappedFilter, setUnmappedFilter] = useState("");

  const [draftByVariantId, setDraftByVariantId] = useState<Record<number, { sku: string; price: string; compareAt: string }>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [res, unmapped] = await Promise.all([listShopifyAdminState(), listShopifyUnmappedVariants()]);
      if (!res?.ok) throw new Error("Failed to load Shopify admin state");
      if (!unmapped?.ok) throw new Error("Failed to load unmapped Shopify variants");
      const next = (res.rows ?? []) as AdminRow[];
      setRows(next);
      setDraftByVariantId(() => {
        const out: Record<number, { sku: string; price: string; compareAt: string }> = {};
        next.forEach((r) => {
          out[r.shopifyVariantId] = {
            sku: r.override?.sku ?? "",
            price: r.override?.price === null || r.override?.price === undefined ? "" : String(r.override?.price),
            compareAt:
              r.override?.compare_at_price === null || r.override?.compare_at_price === undefined
                ? ""
                : String(r.override?.compare_at_price),
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

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      .sort((a, b) => getInventoryItemDisplayLabel(a).localeCompare(getInventoryItemDisplayLabel(b)));
    return sorted.map((it) => ({ id: it.id, label: getInventoryItemDisplayLabel(it) }));
  }, [items, rows, linkItemId]);

  const visibleUnmapped = useMemo(() => {
    const q = unmappedFilter.trim().toLowerCase();
    if (!q) return unmappedVariants;
    return unmappedVariants.filter((v) => `${v.label} ${v.sku ?? ""} ${v.id}`.toLowerCase().includes(q));
  }, [unmappedVariants, unmappedFilter]);

  const parseMoney = (raw: string): number | null | undefined => {
    const t = raw.trim();
    if (t === "") return undefined;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-semibold">Shopify Admin</div>
          <div className="text-sm text-muted-foreground">Active Shopify variants only. Edit overrides and mappings here.</div>
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
        <div className="text-sm font-medium">Link a part item to a Shopify variant</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
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
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Shopify variant</div>
              <div className="text-[11px] text-muted-foreground">Unmapped: {unmappedVariants.length}</div>
            </div>
            <Select
              value={unmappedVariants.some((v) => String(v.id) === linkVariantId) ? linkVariantId : ""}
              onValueChange={(v) => setLinkVariantId(v)}
              disabled={loading}
            >
              <SelectTrigger className="w-full">
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
            <Input value={linkVariantId} onChange={(e) => setLinkVariantId(e.target.value)} placeholder="Or paste a Shopify variant ID…" />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={linking}
              onClick={async () => {
                if (!linkItemId || !linkVariantId) {
                  toast.message("Select an item and enter a Shopify variant ID");
                  return;
                }
                setLinking(true);
                try {
                  await linkPartToShopifyVariant({ itemId: Number(linkItemId), shopifyVariantId: Number(linkVariantId) });
                  toast.success("Linked");
                  setLinkItemId("");
                  setLinkVariantId("");
                  setUnmappedFilter("");
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
              <TableHead>Name</TableHead>
              <TableHead>Mapping</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price (SGD)</TableHead>
              <TableHead>Compare-at (SGD)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const d = draftByVariantId[r.shopifyVariantId] ?? { sku: "", price: "", compareAt: "" };
              const mappingLabel =
                r.kind === "part"
                  ? r.item
                    ? `${r.item.category} — ${r.item.name}${r.item.size ? ` (${r.item.size})` : ""}${r.item.subtype ? ` — ${r.item.subtype}` : ""}`
                    : "part"
                  : r.kind === "pillow"
                    ? `${r.pillowKind ?? "basic"} / ${r.pillowSize ?? ""}`
                    : `bolster / ${r.bolsterVariant ?? ""}`;

              return (
                <TableRow key={r.shopifyVariantId}>
                  <TableCell className="font-mono text-xs">{r.shopifyVariantId}</TableCell>
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
                      value={d.price}
                      onChange={(e) =>
                        setDraftByVariantId((prev) => ({
                          ...prev,
                          [r.shopifyVariantId]: { ...d, price: e.target.value },
                        }))
                      }
                      placeholder="(optional)"
                      inputMode="decimal"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={d.compareAt}
                      onChange={(e) =>
                        setDraftByVariantId((prev) => ({
                          ...prev,
                          [r.shopifyVariantId]: { ...d, compareAt: e.target.value },
                        }))
                      }
                      placeholder="(optional)"
                      inputMode="decimal"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          const price = parseMoney(d.price);
                          const compareAt = parseMoney(d.compareAt);
                          if (price === null) { toast.error("Invalid price"); return; }
                          if (compareAt === null) { toast.error("Invalid compare-at"); return; }
                          try {
                            await upsertShopifyVariantOverride({
                              shopifyVariantId: r.shopifyVariantId,
                              sku: d.sku.trim() ? d.sku.trim() : null,
                              price: price === undefined ? undefined : price,
                              compareAtPrice: compareAt === undefined ? undefined : compareAt,
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
                            setDraftByVariantId((prev) => ({ ...prev, [r.shopifyVariantId]: { sku: "", price: "", compareAt: "" } }));
                            await refresh();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to clear override");
                          }
                        }}
                      >
                        Clear
                      </Button>
                      {r.kind === "part" ? (
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


