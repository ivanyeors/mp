"use client";

/**
 * Product Builder (slice 10): map cover/case Items to overlay Media Assets
 * (+ optional fit) so the configurator silhouette shows the real product.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImagePicker, type AssetSelection } from "@/components/ui/image-picker";
import { FILLING_SHAPE_PATHS } from "@/components/spatial/xray-assets";
import {
  effectiveFillingColors,
  type ColorOverrideRow,
  type EffectiveFillingColor,
} from "@/lib/spatial-fillings/color-overrides";
import type { OverlayFit } from "@/lib/product-builder/overlays";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { getApiErrorMessage } from "@/lib/utils";

/** Inventory category → shopper-facing role (cover | case). */
// ponytail: inline copy of toComponentRole — importing it drags supabaseAdmin into the client bundle
function roleLabel(category: string): string {
  return category === "cover" ? "cover" : "case";
}

export type OverlayItem = {
  id: number;
  name: string;
  category: string;
  size: string | null;
  mapping: {
    media_asset_id: string;
    hosted_url: string | null;
    fit: OverlayFit | null;
  } | null;
};

/** The mappings payload the page mounts with. */
export type ProductBuilderInitialData = { ok: true; items: OverlayItem[] };

export default function ProductBuilderPage({
  initialData,
}: {
  initialData?: ProductBuilderInitialData;
}) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const settingsPath = useCallback(
    (path: string) => withLocale(path, locale),
    [locale],
  );

  const [items, setItems] = useState<OverlayItem[]>(initialData?.items ?? []);
  const [loading, setLoading] = useState(!initialData);
  // The server already loaded the mappings; every save and removal reloads.
  const skipFirstFetch = useRef(initialData != null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(settingsPath("/settings/product-builder/mappings"));
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to load overlay mappings"));
        return;
      }
      setItems(data.items as OverlayItem[]);
    } catch {
      toast.error("Failed to load overlay mappings");
    } finally {
      setLoading(false);
    }
  }, [settingsPath]);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    void load();
  }, [load]);

  const upsert = useCallback(
    async (itemId: number, assetId: string, fit: OverlayFit | null) => {
      const res = await fetch(settingsPath("/settings/product-builder/mappings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, assetId, fit }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to save mapping"));
        return;
      }
      toast.success("Overlay saved");
      await load();
    },
    [settingsPath, load],
  );

  const remove = useCallback(
    async (itemId: number) => {
      const res = await fetch(settingsPath("/settings/product-builder/mappings"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to remove mapping"));
        return;
      }
      toast.success("Overlay removed — silhouette back to default");
      await load();
    },
    [settingsPath, load],
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Builder</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Map cover and case items to overlay images from the Media Asset Library.
            The configurator preview swaps the overlay when the item is selected;
            unmapped items keep the plain silhouette.
          </p>
        </div>
        <Button type="button" variant="outline" asChild>
          <Link href={settingsPath("/settings/product-builder/rules-engine")}>
            <GitBranch className="mr-1.5 h-4 w-4" />
            Rules Engine
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Overlay</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Fit (scale / x / y)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <OverlayRow
                key={item.id}
                item={item}
                onPick={(sel, fit) => void upsert(item.id, sel.assetId, fit)}
                onSaveFit={(fit) =>
                  item.mapping
                    ? void upsert(item.id, item.mapping.media_asset_id, fit)
                    : undefined
                }
                onRemove={() => void remove(item.id)}
              />
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No active cover or case items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <FillingVisualsSection settingsPath={settingsPath} />
    </div>
  );
}

/**
 * Slice 11: filling subtype → fluid shape + color. Shape is designer/code-owned
 * (read-only thumbnail, ADR 0009 guardrail 5); color overrides the code default
 * via the x-ray CSS-variable pipeline — renders pick it up on next load.
 */
function FillingVisualsSection({ settingsPath }: { settingsPath: (path: string) => string }) {
  const [subtypes, setSubtypes] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<ColorOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(settingsPath("/settings/product-builder/filling-visuals"));
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to load filling visuals"));
        return;
      }
      setSubtypes(data.subtypes as string[]);
      setOverrides(data.overrides as ColorOverrideRow[]);
    } catch {
      toast.error("Failed to load filling visuals");
    } finally {
      setLoading(false);
    }
  }, [settingsPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (subtype: string, color: string) => {
      const res = await fetch(settingsPath("/settings/product-builder/filling-visuals"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtype, color }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to save color"));
        return;
      }
      toast.success("Color override saved");
      await load();
    },
    [settingsPath, load],
  );

  const clear = useCallback(
    async (subtype: string) => {
      const res = await fetch(settingsPath("/settings/product-builder/filling-visuals"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtype }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to clear override"));
        return;
      }
      toast.success("Override cleared — back to code default");
      await load();
    },
    [settingsPath, load],
  );

  const rows = effectiveFillingColors(subtypes, overrides);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Filling visuals</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Each filling subtype renders in the x-ray with a designer-owned fluid shape
          (not editable) and a color. Overriding a color applies to all x-ray views on
          next load; clearing restores the code default.
        </p>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Shape</TableHead>
              <TableHead>Subtype</TableHead>
              <TableHead>Effective color</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <FillingVisualRow
                // remount on saved color so the picker draft resets
                key={`${row.subtype}-${row.color}`}
                row={row}
                onSave={(color) => void save(row.subtype, color)}
                onClear={() => void clear(row.subtype)}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No active filling items with a subtype found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FillingVisualRow({
  row,
  onSave,
  onClear,
}: {
  row: EffectiveFillingColor;
  onSave: (color: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(row.color);

  return (
    <TableRow>
      <TableCell>
        {/* Read-only fluid-shape thumbnail — shape is a designer/code concern */}
        <svg
          viewBox="0 0 100 100"
          className="h-10 w-10"
          role="img"
          aria-label={`${row.subtype} shape (read-only)`}
        >
          <path d={FILLING_SHAPE_PATHS[row.shape]} fill={row.color} />
        </svg>
      </TableCell>
      <TableCell className="font-medium">{row.subtype}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className="h-4 w-4 rounded border"
            style={{ backgroundColor: row.color }}
            aria-hidden
          />
          <code className="text-xs">{row.color}</code>
          <Badge variant={row.overridden ? "default" : "outline"} className="text-xs">
            {row.overridden ? "Override" : "Default"}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <input
            type="color"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== row.color && onSave(draft)}
            className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
            aria-label={`${row.subtype} color override`}
          />
          {row.overridden && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClear}
              aria-label={`Clear ${row.subtype} color override`}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Use default
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function OverlayRow({
  item,
  onPick,
  onSaveFit,
  onRemove,
}: {
  item: OverlayItem;
  onPick: (selection: AssetSelection, fit: OverlayFit | null) => void;
  onSaveFit: (fit: OverlayFit | null) => void;
  onRemove: () => void;
}) {
  const [scale, setScale] = useState(item.mapping?.fit?.scale?.toString() ?? "");
  const [x, setX] = useState(item.mapping?.fit?.x?.toString() ?? "");
  const [y, setY] = useState(item.mapping?.fit?.y?.toString() ?? "");

  const fitFromInputs = (): OverlayFit | null => {
    const fit: OverlayFit = {};
    if (scale.trim() !== "" && !Number.isNaN(Number(scale))) fit.scale = Number(scale);
    if (x.trim() !== "" && !Number.isNaN(Number(x))) fit.x = Number(x);
    if (y.trim() !== "" && !Number.isNaN(Number(y))) fit.y = Number(y);
    return Object.keys(fit).length ? fit : null;
  };

  return (
    <TableRow>
      <TableCell>
        <div className="h-12 w-12 rounded border bg-muted flex items-center justify-center overflow-hidden">
          {item.mapping?.hosted_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.mapping.hosted_url}
              alt={item.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground opacity-50" />
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="font-medium">{item.name}</div>
        {item.size && <div className="text-xs text-muted-foreground">Size {item.size}</div>}
      </TableCell>
      <TableCell className="capitalize">{roleLabel(item.category)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step="0.1"
            placeholder="1"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            className="h-8 w-16"
            aria-label={`${item.name} fit scale`}
          />
          <Input
            type="number"
            placeholder="0"
            value={x}
            onChange={(e) => setX(e.target.value)}
            className="h-8 w-16"
            aria-label={`${item.name} fit x`}
          />
          <Input
            type="number"
            placeholder="0"
            value={y}
            onChange={(e) => setY(e.target.value)}
            className="h-8 w-16"
            aria-label={`${item.name} fit y`}
          />
          {item.mapping && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSaveFit(fitFromInputs())}
            >
              Save fit
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <ImagePicker onSelect={(sel) => onPick(sel, fitFromInputs())}>
            <Button type="button" size="sm" variant="outline">
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              {item.mapping ? "Change" : "Pick"}
            </Button>
          </ImagePicker>
          {item.mapping && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRemove}
              aria-label={`Remove ${item.name} overlay`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
