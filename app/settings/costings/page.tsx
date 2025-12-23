"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type PriceRecord = { cost_price: string | number | null; msrp: string | number | null };

type ItemRow = {
  id: number;
  category: string;
  name: string;
  size: string | null;
  subtype: string | null;
  pricing?: PriceRecord | PriceRecord[] | null;
};

type DraftRow = { costPrice: string; msrp: string };
type DraftState = Record<string, DraftRow>;
type BaselineState = Record<string, { cost: number | null; msrp: number | null }>;

type BolsterVariant = "short" | "medium" | "long";

type ProductRow = {
  key: string;
  kind: "pillow" | "bolster";
  label: string;
  productId?: number;
  variant?: BolsterVariant;
  costCents: number | null;
  msrpCents: number | null;
};

type ProductSaveRow = {
  key: string;
  kind: "pillow" | "bolster";
  productId?: number;
  variant?: BolsterVariant;
  msrpCents: number | null;
};

const BOLSTER_VARIANTS: BolsterVariant[] = ["short", "medium", "long"];

const BOLSTER_VARIANT_TITLES: Record<BolsterVariant, string> = {
  short: "Short (0.8m)",
  medium: "Medium (1m)",
  long: "Long (1.2m)",
};

const itemKey = (id: number) => `item:${id}`;
const pillowKey = (productId: number) => `product:pillow:${productId}`;
const bolsterKey = (variant: BolsterVariant) => `product:bolster:${variant}`;

const CATEGORY_TITLES: Record<string, string> = {
  cover: "Covers",
  case: "Pillow Cases",
  protector: "Protectors",
  filling: "Fillings",
  packaging: "Packaging",
  accessories: "Accessories",
  other: "Other",
};

const CATEGORY_ORDER = ["cover", "case", "protector", "filling", "packaging", "accessories", "other"];

const humanize = (value: string) =>
  value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeNameOrFallback = (value: string | null | undefined, fallback: string): string => {
  if (!value) return humanize(fallback);
  const trimmed = value.trim();
  if (trimmed === "") return humanize(fallback);
  if (/[_-]/.test(trimmed) || trimmed === trimmed.toLowerCase()) {
    return humanize(trimmed);
  }
  return trimmed;
};

const describeItem = (item: ItemRow): string => {
  if (item.category === "filling") {
    const base = normalizeNameOrFallback(item.subtype ?? item.name, "filling");
    return item.size ? `${base} — ${item.size}` : base;
  }
  const base = normalizeNameOrFallback(item.name, item.category);
  if (item.size) {
    return `${base} — ${item.size}`;
  }
  if (item.subtype) {
    return `${base} — ${normalizeNameOrFallback(item.subtype, item.category)}`;
  }
  return base;
};

const toCents = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(numeric)) return null;
  return Math.round(numeric * 100);
};

const formatFromCents = (cents: number | null): string => {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
};

const sanitizeCurrencyInput = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return "";
  const [intPart = "", ...rest] = cleaned.split(".");
  const decimals = rest.join("");
  const normalizedInt = intPart.replace(/^0+(?=\d)/, "") || "0";
  if (raw.includes(".") && decimals === "") {
    return `${normalizedInt}.`;
  }
  if (decimals) {
    return `${normalizedInt}.${decimals.slice(0, 2)}`;
  }
  return normalizedInt;
};

const parseToCents = (value: string): number | null => {
  if (!value || value === ".") return null;
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  if (normalized === "") return null;
  const num = Number.parseFloat(normalized);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
};

export default function CostingsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [draft, setDraft] = useState<DraftState>({});
  const [baseline, setBaseline] = useState<BaselineState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      type RawItemRow = ItemRow & { pricing?: PriceRecord | PriceRecord[] | null };
      type RawPillowRow = { id: number; size: string };
      type RawBomLine = { product_id: number; item_id: number; quantity: number | string };
      type RawBolsterLine = { variant: string; item_id: number; quantity: number | string };
      type RawProductPrice = {
        key: string;
        kind: "pillow" | "bolster";
        product_id: number | null;
        variant: string | null;
        msrp: string | number | null;
      };

      const [
        { data: itemsData, error: itemsError },
        { data: pillowData, error: pillowError },
        { data: bomData, error: bomError },
        { data: bolsterData, error: bolsterError },
        { data: productPricesData, error: productPricesError },
      ] = await Promise.all([
        supabaseClient
          .from("items")
          .select("id,category,name,size,subtype,pricing:item_prices!left(cost_price,msrp)")
          .eq("is_active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true })
          .order("size", { ascending: true, nullsFirst: false })
          .order("subtype", { ascending: true, nullsFirst: false }),
        supabaseClient
          .from("pillow_products")
          .select("id,size")
          .eq("is_active", true)
          .order("size", { ascending: true }),
        supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
        supabaseClient.from("bolster_bom_lines").select("variant,item_id,quantity"),
        supabaseClient.from("product_prices").select("key,kind,product_id,variant,msrp"),
      ]);

      if (itemsError) throw new Error(itemsError.message);
      if (pillowError) throw new Error(pillowError.message);
      if (bomError) throw new Error(bomError.message);
      if (bolsterError) throw new Error(bolsterError.message);
      if (productPricesError) throw new Error(productPricesError.message);

      const rows = (itemsData ?? []) as RawItemRow[];
      const nextItems = rows.map(({ id, category, name, size, subtype }) => ({
        id,
        category,
        name,
        size,
        subtype,
      }));
      const nextDraft: DraftState = {};
      const nextBaseline: BaselineState = {};
      const itemCostById = new Map<number, number | null>();

      rows.forEach((row) => {
        const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
        const costCents = toCents(pricing?.cost_price);
        const msrpCents = toCents(pricing?.msrp);
        const key = itemKey(row.id);
        nextDraft[key] = {
          costPrice: formatFromCents(costCents),
          msrp: formatFromCents(msrpCents),
        };
        nextBaseline[key] = { cost: costCents, msrp: msrpCents };
        itemCostById.set(row.id, costCents);
      });

      const bomLines = (bomData ?? []) as RawBomLine[];
      const bolsterLines = (bolsterData ?? []) as RawBolsterLine[];
      const pillowProducts = (pillowData ?? []) as RawPillowRow[];
      const productPrices = (productPricesData ?? []) as RawProductPrice[];

      const bomByProduct = new Map<number, Array<{ item_id: number; quantity: number }>>();
      bomLines.forEach((line) => {
        const productId = Number(line.product_id);
        const itemId = Number(line.item_id);
        const quantity = Number(line.quantity);
        if (!Number.isFinite(productId) || !Number.isFinite(itemId) || !Number.isFinite(quantity)) {
          return;
        }
        const list = bomByProduct.get(productId) ?? [];
        list.push({ item_id: itemId, quantity });
        bomByProduct.set(productId, list);
      });

      const bolsterByVariant: Record<BolsterVariant, Array<{ item_id: number; quantity: number }>> = {
        short: [],
        medium: [],
        long: [],
      };
      bolsterLines.forEach((line) => {
        const variant = line.variant;
        if (variant !== "short" && variant !== "medium" && variant !== "long") return;
        const itemId = Number(line.item_id);
        const quantity = Number(line.quantity);
        if (!Number.isFinite(itemId) || !Number.isFinite(quantity)) return;
        bolsterByVariant[variant].push({ item_id: itemId, quantity });
      });

      const priceByProductId = new Map<number, RawProductPrice>();
      const priceByVariant = new Map<BolsterVariant, RawProductPrice>();
      productPrices.forEach((row) => {
        if (row.kind === "pillow" && row.product_id !== null) {
          priceByProductId.set(row.product_id, row);
        } else if (row.kind === "bolster" && row.variant && (row.variant === "short" || row.variant === "medium" || row.variant === "long")) {
          const variant = row.variant as BolsterVariant;
          priceByVariant.set(variant, row);
        }
      });

      const costForLines = (lines: Array<{ item_id: number; quantity: number }>): number | null => {
        if (lines.length === 0) return null;
        let total = 0;
        for (const line of lines) {
          const cost = itemCostById.get(line.item_id);
          if (cost === undefined || cost === null) {
            return null;
          }
          total += Math.round(cost * line.quantity);
        }
        return total;
      };

      const productDraft: DraftState = {};
      const productBaseline: BaselineState = {};
      const productRows: ProductRow[] = [];

      const pillowOrder = new Map(
        ["XS", "S", "M", "L", "XL"].map((size, index) => [size, index]),
      );

      pillowProducts
        .slice()
        .sort((a, b) => {
          const left = pillowOrder.get(a.size) ?? Number.MAX_SAFE_INTEGER;
          const right = pillowOrder.get(b.size) ?? Number.MAX_SAFE_INTEGER;
          if (left !== right) return left - right;
          return a.size.localeCompare(b.size);
        })
        .forEach((product) => {
          const key = pillowKey(product.id);
          const lines = bomByProduct.get(product.id) ?? [];
          const costCents = costForLines(lines);
          const price = priceByProductId.get(product.id);
          const msrpCents = toCents(price?.msrp ?? null);
          productDraft[key] = {
            costPrice: formatFromCents(costCents),
            msrp: formatFromCents(msrpCents),
          };
          productBaseline[key] = { cost: costCents, msrp: msrpCents };
          productRows.push({
            key,
            kind: "pillow",
            label: `Pillow — ${product.size}`,
            productId: product.id,
            costCents,
            msrpCents,
          });
        });

      BOLSTER_VARIANTS.forEach((variant) => {
        const key = bolsterKey(variant);
        const lines = bolsterByVariant[variant];
        const costCents = costForLines(lines);
        const price = priceByVariant.get(variant);
        const msrpCents = toCents(price?.msrp ?? null);
        productDraft[key] = {
          costPrice: formatFromCents(costCents),
          msrp: formatFromCents(msrpCents),
        };
        productBaseline[key] = { cost: costCents, msrp: msrpCents };
        productRows.push({
          key,
          kind: "bolster",
          label: `Bolster — ${BOLSTER_VARIANT_TITLES[variant]}`,
          variant,
          costCents,
          msrpCents,
        });
      });

      setItems(nextItems);
      setProducts(productRows);
      setDraft({ ...nextDraft, ...productDraft });
      setBaseline({ ...nextBaseline, ...productBaseline });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load costings";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabaseClient
      .channel("costings-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pillow_products" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bom_lines" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bolster_bom_lines" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_prices" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    const handleInventoryChange = () => {
      load();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("inventory:changed", handleInventoryChange);
      let broadcast: BroadcastChannel | null = null;
      try {
        if ("BroadcastChannel" in window) {
          broadcast = new BroadcastChannel("inventory:changed");
          broadcast.onmessage = handleInventoryChange;
        }
      } catch {
        broadcast = null;
      }
      return () => {
        window.removeEventListener("inventory:changed", handleInventoryChange);
        if (broadcast) {
          broadcast.close();
        }
      };
    }
    return undefined;
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const aIndex = CATEGORY_ORDER.indexOf(a[0]);
        const bIndex = CATEGORY_ORDER.indexOf(b[0]);
        if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      })
      .map(([category, list]) => ({
        category,
        title: CATEGORY_TITLES[category] ?? humanize(category),
        items: list.sort((left, right) => describeItem(left).localeCompare(describeItem(right))),
      }));
  }, [items]);

  useEffect(() => {
    setCollapsedCategories((prev) => {
      const desiredKeys = new Set<string>();
      if (products.length > 0) {
        desiredKeys.add("products");
      }
      for (const { category } of grouped) {
        desiredKeys.add(category);
      }

      const next: Record<string, boolean> = {};
      let changed = false;

      desiredKeys.forEach((key) => {
        next[key] = prev[key] ?? false;
        if (next[key] !== prev[key]) {
          changed = true;
        }
      });

      for (const key of Object.keys(prev)) {
        if (!desiredKeys.has(key)) {
          changed = true;
          break;
        }
      }

      return changed ? next : prev;
    });
  }, [grouped, products]);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleInputChange = (rowKey: string, field: keyof DraftRow, raw: string) => {
    const sanitized = sanitizeCurrencyInput(raw);
    setDraft((prev) => {
      const current = prev[rowKey] ?? { costPrice: "", msrp: "" };
      return {
        ...prev,
        [rowKey]: { ...current, [field]: sanitized },
      };
    });
  };

  const handleBlur = (rowKey: string, field: keyof DraftRow) => {
    setDraft((prev) => {
      const current = prev[rowKey] ?? { costPrice: "", msrp: "" };
      const cents = parseToCents(current[field]);
      if (cents === null) {
        return {
          ...prev,
          [rowKey]: { ...current, [field]: "" },
        };
      }
      return {
        ...prev,
        [rowKey]: { ...current, [field]: (cents / 100).toFixed(2) },
      };
    });
  };

  const isDirty = useMemo(() => {
    const itemChanged = items.some((item) => {
      const key = itemKey(item.id);
      const current = draft[key] ?? { costPrice: "", msrp: "" };
      const baselineRow = baseline[key] ?? { cost: null, msrp: null };
      const costCents = parseToCents(current.costPrice);
      const msrpCents = parseToCents(current.msrp);
      return costCents !== baselineRow.cost || msrpCents !== baselineRow.msrp;
    });
    if (itemChanged) return true;
    return products.some((product) => {
      const key = product.key;
      const current = draft[key] ?? { costPrice: "", msrp: "" };
      const baselineRow = baseline[key] ?? { cost: product.costCents ?? null, msrp: product.msrpCents ?? null };
      const msrpCents = parseToCents(current.msrp);
      return msrpCents !== baselineRow.msrp;
    });
  }, [items, products, draft, baseline]);

  const save = async () => {
    const rows = items
      .map((item) => {
        const key = itemKey(item.id);
        const current = draft[key] ?? { costPrice: "", msrp: "" };
        const baselineRow = baseline[key] ?? { cost: null, msrp: null };
        const costCents = parseToCents(current.costPrice);
        const msrpCents = parseToCents(current.msrp);
        if (costCents === baselineRow.cost && msrpCents === baselineRow.msrp) {
          return null;
        }
        return {
          itemId: item.id,
          costPriceCents: costCents,
          msrpCents: msrpCents,
        };
      })
      .filter((row): row is { itemId: number; costPriceCents: number | null; msrpCents: number | null } => row !== null);

    const productPayload = products
      .map((product) => {
        const key = product.key;
        const current = draft[key] ?? { costPrice: "", msrp: "" };
        const baselineRow = baseline[key] ?? { cost: product.costCents ?? null, msrp: product.msrpCents ?? null };
        const msrpCents = parseToCents(current.msrp);
        if (msrpCents === baselineRow.msrp) {
          return null;
        }
        const payload: ProductSaveRow = {
          key,
          kind: product.kind,
          msrpCents,
        };
        if (product.kind === "pillow") {
          if (product.productId === undefined) {
            return null;
          }
          payload.productId = product.productId;
        }
        if (product.kind === "bolster") {
          if (!product.variant) {
            return null;
          }
          payload.variant = product.variant;
        }
        return payload;
      })
      .filter((row): row is ProductSaveRow => row !== null);

    if (rows.length === 0 && productPayload.length === 0) {
      toast.message("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/settings/costings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, products: productPayload }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? "Failed to save costings";
        throw new Error(message);
      }
      toast.success("Costings saved");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save costings";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading costings…</div>;
  }

  if (items.length === 0 && products.length === 0) {
    return (
      <div className="space-y-4 p-6">
        <div className="text-2xl font-semibold">Costings</div>
        <p className="text-sm text-muted-foreground">No parts are currently active. Add items to begin tracking pricing.</p>
        <Button variant="secondary" onClick={load} disabled={saving}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Costings</h1>
          <p className="text-sm text-muted-foreground">
            Track cost price and MSRP for each part to keep your pricing consistent.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={saving}>
            Refresh
          </Button>
          <Button onClick={save} disabled={saving || !isDirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-8">
        {products.length > 0 && (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => toggleCategory("products")}
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={!(collapsedCategories.products ?? false)}
            >
              <div>
                <h2 className="text-lg font-medium">Products</h2>
                <p className="text-sm text-muted-foreground">
                  Cost price is calculated from configured components. Enter MSRP to set retail pricing.
                </p>
              </div>
              <ChevronDown
                className={`mt-1 h-5 w-5 shrink-0 transition-transform ${
                  collapsedCategories.products ? "-rotate-90" : ""
                }`}
              />
            </button>
            {!(collapsedCategories.products ?? false) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-2/5">Product</TableHead>
                    <TableHead className="w-1/5">Cost Price</TableHead>
                    <TableHead className="w-1/5">MSRP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const current = draft[product.key] ?? { costPrice: "", msrp: "" };
                    return (
                      <TableRow key={product.key}>
                        <TableCell className="font-medium">{product.label}</TableCell>
                        <TableCell>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              $
                            </span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={current.costPrice}
                              placeholder="0.00"
                              disabled
                              className="pl-6"
                              aria-label={`Cost price for ${product.label}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              $
                            </span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={current.msrp}
                              placeholder="0.00"
                              onChange={(event) => handleInputChange(product.key, "msrp", event.target.value)}
                              onBlur={() => handleBlur(product.key, "msrp")}
                              className="pl-6"
                              aria-label={`MSRP for ${product.label}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        )}
        {grouped.map((group) => (
          <section key={group.category} className="space-y-4">
            <button
              type="button"
              onClick={() => toggleCategory(group.category)}
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={!(collapsedCategories[group.category] ?? false)}
            >
              <div>
                <h2 className="text-lg font-medium">{group.title}</h2>
                <p className="text-sm text-muted-foreground">
                  Enter values as dollars. Leave blank to clear existing pricing for a part.
                </p>
              </div>
              <ChevronDown
                className={`mt-1 h-5 w-5 shrink-0 transition-transform ${
                  collapsedCategories[group.category] ? "-rotate-90" : ""
                }`}
              />
            </button>
            {!(collapsedCategories[group.category] ?? false) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-2/5">Part</TableHead>
                    <TableHead className="w-1/5">Cost Price</TableHead>
                    <TableHead className="w-1/5">MSRP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => {
                    const rowKey = itemKey(item.id);
                    const current = draft[rowKey] ?? { costPrice: "", msrp: "" };
                    const itemLabel = describeItem(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{itemLabel}</TableCell>
                        <TableCell>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              $
                            </span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={current.costPrice}
                              placeholder="0.00"
                              onChange={(event) => handleInputChange(rowKey, "costPrice", event.target.value)}
                              onBlur={() => handleBlur(rowKey, "costPrice")}
                              className="pl-6"
                              aria-label={`Cost price for ${itemLabel}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              $
                            </span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={current.msrp}
                              placeholder="0.00"
                              onChange={(event) => handleInputChange(rowKey, "msrp", event.target.value)}
                              onBlur={() => handleBlur(rowKey, "msrp")}
                              className="pl-6"
                              aria-label={`MSRP for ${itemLabel}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}


