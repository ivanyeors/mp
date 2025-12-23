"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
type DraftState = Record<number, DraftRow>;
type BaselineState = Record<number, { cost: number | null; msrp: number | null }>;

const CATEGORY_TITLES: Record<string, string> = {
  cover: "Covers",
  case: "Pillow Cases",
  protector: "Protectors",
  filling: "Fillings",
  packaging: "Packaging",
};

const CATEGORY_ORDER = ["cover", "case", "protector", "filling", "packaging"];

const humanize = (value: string) =>
  value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const describeItem = (item: ItemRow): string => {
  switch (item.category) {
    case "cover":
      return `Cover${item.size ? ` — ${item.size}` : ""}`;
    case "case":
      return `Pillow Case${item.size ? ` — ${item.size}` : ""}`;
    case "protector":
      return `Protector${item.size ? ` — ${item.size}` : ""}`;
    case "filling":
      return item.subtype ? humanize(item.subtype) : humanize(item.name);
    case "packaging": {
      const base = humanize(item.name);
      return item.size ? `${base} — ${item.size}` : base;
    }
    default:
      return humanize(item.name);
  }
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
  const [draft, setDraft] = useState<DraftState>({});
  const [baseline, setBaseline] = useState<BaselineState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      type RawRow = ItemRow;
      const { data, error } = await supabaseClient
        .from("items")
        .select("id,category,name,size,subtype,pricing:item_prices(cost_price,msrp)")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true })
        .order("size", { ascending: true, nullsFirst: false })
        .order("subtype", { ascending: true, nullsFirst: false });
      if (error) {
        throw new Error(error.message);
      }
      const rows = (data ?? []) as RawRow[];
      const nextItems = rows.map(({ pricing, ...rest }) => rest);
      const nextDraft: DraftState = {};
      const nextBaseline: BaselineState = {};
      rows.forEach((row) => {
        const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
        const costCents = toCents(pricing?.cost_price);
        const msrpCents = toCents(pricing?.msrp);
        nextDraft[row.id] = {
          costPrice: formatFromCents(costCents),
          msrp: formatFromCents(msrpCents),
        };
        nextBaseline[row.id] = { cost: costCents, msrp: msrpCents };
      });
      setItems(nextItems);
      setDraft(nextDraft);
      setBaseline(nextBaseline);
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

  const handleInputChange = (itemId: number, field: keyof DraftRow, raw: string) => {
    const sanitized = sanitizeCurrencyInput(raw);
    setDraft((prev) => {
      const current = prev[itemId] ?? { costPrice: "", msrp: "" };
      return {
        ...prev,
        [itemId]: { ...current, [field]: sanitized },
      };
    });
  };

  const handleBlur = (itemId: number, field: keyof DraftRow) => {
    setDraft((prev) => {
      const current = prev[itemId] ?? { costPrice: "", msrp: "" };
      const cents = parseToCents(current[field]);
      if (cents === null) {
        return {
          ...prev,
          [itemId]: { ...current, [field]: "" },
        };
      }
      return {
        ...prev,
        [itemId]: { ...current, [field]: (cents / 100).toFixed(2) },
      };
    });
  };

  const isDirty = useMemo(() => {
    return items.some((item) => {
      const current = draft[item.id] ?? { costPrice: "", msrp: "" };
      const baselineRow = baseline[item.id] ?? { cost: null, msrp: null };
      const costCents = parseToCents(current.costPrice);
      const msrpCents = parseToCents(current.msrp);
      return costCents !== baselineRow.cost || msrpCents !== baselineRow.msrp;
    });
  }, [items, draft, baseline]);

  const save = async () => {
    const rows = items
      .map((item) => {
        const current = draft[item.id] ?? { costPrice: "", msrp: "" };
        const baselineRow = baseline[item.id] ?? { cost: null, msrp: null };
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

    if (rows.length === 0) {
      toast.message("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/settings/costings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
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

  if (items.length === 0) {
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
        {grouped.map((group) => (
          <section key={group.category} className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">{group.title}</h2>
              <p className="text-sm text-muted-foreground">
                Enter values as dollars. Leave blank to clear existing pricing for a part.
              </p>
            </div>
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
                  const current = draft[item.id] ?? { costPrice: "", msrp: "" };
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{describeItem(item)}</TableCell>
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
                            onChange={(event) => handleInputChange(item.id, "costPrice", event.target.value)}
                            onBlur={() => handleBlur(item.id, "costPrice")}
                            className="pl-6"
                            aria-label={`Cost price for ${describeItem(item)}`}
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
                            onChange={(event) => handleInputChange(item.id, "msrp", event.target.value)}
                            onBlur={() => handleBlur(item.id, "msrp")}
                            className="pl-6"
                            aria-label={`MSRP for ${describeItem(item)}`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        ))}
      </div>
    </div>
  );
}


