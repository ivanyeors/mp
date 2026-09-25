"use client";

/**
 * Product Visualize tab on Products (formerly the Product Builder page, slice 10):
 * map cover/case Items to overlay Media Assets (+ optional fit) so the
 * configurator silhouette shows the real product. The data routes still live
 * under /settings/product-builder/.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitBranch, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OverlayWorkbench } from "@/components/product-builder/overlay-workbench";
import { FILLING_SHAPE_PATHS } from "@/components/spatial/xray-assets";
import {
  effectiveFillingColors,
  type ColorOverrideRow,
  type EffectiveFillingColor,
} from "@/lib/spatial-fillings/color-overrides";
import { formatDims, resolveDims } from "@/lib/spatial-fillings/dimensions";
import type { OverlayFit, OverlayMappingItem } from "@/lib/product-builder/overlays";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { getApiErrorMessage } from "@/lib/utils";

export type OverlayItem = OverlayMappingItem;

// ponytail: fetches on mount — the tab only mounts when opened, so the Products
// list pays nothing for it.
export function ProductVisualize() {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const settingsPath = useCallback(
    (path: string) => withLocale(path, locale),
    [locale],
  );

  const [items, setItems] = useState<OverlayItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Product Visualize</h2>
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

      <h3 className="text-base font-semibold tracking-tight">Overlay mapping</h3>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OverlayWorkbench
          items={items}
          onPick={(itemId, sel, fit) => void upsert(itemId, sel.assetId, fit)}
          onSaveFit={(itemId, assetId, fit) => void upsert(itemId, assetId, fit)}
          onRemove={(itemId) => void remove(itemId)}
        />
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
        <h3 className="text-base font-semibold tracking-tight">Filling visuals</h3>
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
              <TableHead>Dimensions</TableHead>
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
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
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

/**
 * Width × length × thickness in mm from the dimension registry, or a clear
 * "(fallback)" when the pouch has not been measured, so a fallback-sized
 * pouch in the x-ray is never mistaken for a measured one.
 */
function DimensionsCell({ subtype }: { subtype: string }) {
  const resolved = resolveDims({ name: subtype, subtype });
  if (resolved.source === "fallback") {
    return (
      <span className="text-muted-foreground text-xs" title={`Drawn at ${formatDims(resolved.dims)} until measured`}>
        — (fallback)
      </span>
    );
  }
  return (
    <span className="text-xs">
      {formatDims(resolved.dims)}
      {resolved.source === "configured" && (
        <Badge variant="default" className="ml-2 text-xs">
          Configured
        </Badge>
      )}
    </span>
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
      <TableCell>
        {/* Read-only in slice 01 (ADR 0019): the registry in code is the source; slice 12 makes it editable. */}
        <DimensionsCell subtype={row.subtype} />
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
