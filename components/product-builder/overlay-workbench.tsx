"use client";

/**
 * Product Builder overlay workbench: pick a cover/case Item on the left, see
 * its overlay rendered inside the real configurator silhouette on the right,
 * and drag/scale the fit instead of typing viewBox numbers.
 *
 * Items are grouped into families — one per (category, name), so Fibrecool
 * XS–L is one row. Selecting the family targets every size at once; a size chip
 * narrows it to that size. An overlay is a Media Asset image or a solid color.
 *
 * The stage is the same render the shopper gets — same silhouette path, same
 * `overlayFrame` math, same clip — so what is dialled in here is what ships.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Copy, ImageIcon, Move, Palette, RotateCcw, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ImagePicker } from "@/components/ui/image-picker";
import { bolsterCapsulePath, SILHOUETTE_PATH } from "@/components/spatial/xray-assets";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import {
  normalizeHexColor,
  overlayFamilies,
  overlayFrame,
  overlayShips,
  overlaySignature,
  overlayState,
  overlaysDiffer,
  type OverlayFamily,
  type OverlayFit,
  type OverlayMappingItem,
  type OverlayState,
} from "@/lib/product-builder/overlays";
import { cn } from "@/lib/utils";

/** What a save writes to every targeted Item. */
export type OverlayDraft = { assetId: string; fit: OverlayFit | null } | { color: string };

/** Silhouette viewBox shared by the configurator previews and `overlayFrame`. */
const VIEW_W = 664;
const VIEW_H = 374;
/**
 * Breathing room around the silhouette so an overlay scaled past 1x still shows
 * its frame instead of being cropped by the stage edge. Placement math stays in
 * 664x374 units; only the stage viewport is wider.
 */
const PAD_X = 88;
const PAD_Y = 50;
/** Mirrors OverlayFitSchema so the stage can never dial in a rejected save. */
const SCALE_MIN = 0.2;
const SCALE_MAX = 3;
const OFFSET_LIMIT = 400;
/** Starting swatch for an item with no color yet — a neutral undyed fabric. */
const DEFAULT_COLOR = "#d6d0c4";
/** Swatches offered from colors already mapped elsewhere. */
const MAX_USED_COLORS = 12;

const STATE_LABEL: Record<OverlayState, string> = {
  image: "image overlay",
  color: "color overlay",
  missing: "asset missing",
  none: "unmapped",
};

/** Inventory category → shopper-facing role (cover | case). */
// ponytail: inline copy of toComponentRole — importing it drags supabaseAdmin into the client bundle
function roleLabel(category: string): "cover" | "case" {
  return category === "cover" ? "cover" : "case";
}

export const BOLSTER_LENGTHS: readonly BolsterLength[] = ["short", "medium", "long"];

/**
 * Opening capsule length for a bolster case, guessed from its inventory size.
 * Only a starting point: /mbolster-config picks the length from the shopper's
 * recommendation (`bolster_variant`), not from the case's size, so the same
 * mapping can ship against any of the three. Hence the length switcher.
 */
function defaultBolsterLength(size: string | null): BolsterLength {
  const s = size?.trim().toUpperCase();
  if (s === "S") return "short";
  if (s === "L") return "long";
  return "medium";
}

/**
 * The silhouette this item is previewed against — the shape its own configurator
 * draws, so the fit is judged against what ships. Bolster cases use
 * `bolsterCapsulePath` (what /mbolster-config renders), never the static
 * BOLSTER_SILHOUETTE_PATH placeholder, which nothing draws.
 */
function silhouetteFor(
  item: OverlayMappingItem,
  length: BolsterLength,
): { d: string; label: string } {
  if (item.category === "bolster_case") {
    return { d: bolsterCapsulePath(length), label: `Mbolster capsule · ${length}` };
  }
  return { d: SILHOUETTE_PATH, label: "Mpillow silhouette" };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Identity placement is stored as `null` (fills the silhouette) — same as before. */
function toFit(scale: number, x: number, y: number): OverlayFit | null {
  const fit: OverlayFit = {};
  if (scale !== 1) fit.scale = scale;
  if (x !== 0) fit.x = x;
  if (y !== 0) fit.y = y;
  return Object.keys(fit).length ? fit : null;
}

function sizeList(items: OverlayMappingItem[]): string {
  return items.map((i) => i.size ?? "one size").join(", ");
}

export function OverlayWorkbench({
  items,
  busy = false,
  onSave,
  onRemove,
}: {
  items: OverlayMappingItem[];
  busy?: boolean;
  onSave: (itemIds: number[], overlay: OverlayDraft) => void;
  onRemove: (itemIds: number[]) => void;
}) {
  // `itemId: null` targets every size in the family.
  const [selection, setSelection] = useState<{ family: string; itemId: number | null } | null>(
    null,
  );
  const [query, setQuery] = useState("");

  const families = useMemo(() => overlayFamilies(items), [items]);
  // Selection survives a reload because it is resolved by key and id, not by index.
  const family = families.find((f) => f.key === selection?.family) ?? families[0] ?? null;
  const sizeItem = family?.items.find((i) => i.id === selection?.itemId) ?? null;
  const targets = sizeItem ? [sizeItem] : (family?.items ?? []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by: Record<"cover" | "case", OverlayFamily[]> = { cover: [], case: [] };
    for (const f of families) {
      if (q && !f.name.toLowerCase().includes(q)) continue;
      by[roleLabel(f.category)].push(f);
    }
    return by;
  }, [families, query]);

  // Colors already in use, so two fabrics of the same dye can match exactly.
  const usedColors = useMemo(
    () =>
      [...new Set(items.map((i) => i.mapping?.color).filter((c): c is string => !!c))].slice(
        0,
        MAX_USED_COLORS,
      ),
    [items],
  );

  const mappedCount = items.filter(overlayShips).length;

  if (items.length === 0 || !family) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        No active cover or case items found.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <aside className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Items</span>
          <span className="text-xs text-muted-foreground">
            {mappedCount}/{items.length} mapped
          </span>
        </div>
        <div className="relative border-b p-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter items"
            aria-label="Filter items by name"
            className="h-8 pl-7 text-xs md:text-xs"
          />
        </div>
        <div className="max-h-[28rem] overflow-y-auto p-2 md:max-h-[34rem]">
          {(["cover", "case"] as const).map((role) =>
            groups[role].length ? (
              <div key={role} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {role}
                </p>
                <ul className="space-y-1">
                  {groups[role].map((f) => (
                    <FamilyRow
                      key={f.key}
                      family={f}
                      active={f.key === family.key}
                      selectedItemId={f.key === family.key ? (sizeItem?.id ?? null) : null}
                      onSelect={(itemId) => setSelection({ family: f.key, itemId })}
                    />
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {groups.cover.length === 0 && groups.case.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No items match “{query.trim()}”.
            </p>
          )}
        </div>
      </aside>

      <OverlayStage
        // Remount on the saved mappings so the draft resets after a save.
        key={`${family.key}:${targets
          .map((t) => `${t.id}=${overlaySignature(t.mapping)}`)
          .join(",")}`}
        family={family}
        targets={targets}
        usedColors={usedColors}
        busy={busy}
        onSave={onSave}
        onRemove={onRemove}
      />
    </div>
  );
}

/**
 * One family in the rail: the name targets every size, the chips below target
 * one. A family of one size is just the item.
 */
function FamilyRow({
  family,
  active,
  selectedItemId,
  onSelect,
}: {
  family: OverlayFamily;
  active: boolean;
  /** The selected size when this family is active; null = all sizes. */
  selectedItemId: number | null;
  onSelect: (itemId: number | null) => void;
}) {
  const single = family.items.length === 1;
  const first = family.items[0]!;
  const preview = family.items.find(overlayShips) ?? first;
  const wholeSelected = active && selectedItemId == null;

  return (
    <li
      className={cn(
        "rounded-md border transition-colors",
        wholeSelected
          ? "border-primary bg-primary/10"
          : active
            ? "border-primary/40"
            : "border-transparent hover:bg-accent",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={wholeSelected}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
      >
        <Thumb mapping={preview.mapping} alt={family.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{family.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {single
              ? first.size
                ? `Size ${first.size}`
                : "One size"
              : `All ${family.items.length} sizes`}
            {family.category === "bolster_case" ? " · Bolster" : ""}
          </span>
        </span>
        <FamilyBadge items={family.items} />
      </button>
      {!single && (
        <div
          role="group"
          aria-label={`${family.name} sizes`}
          className="flex flex-wrap gap-1 px-2 pb-2 pl-[3.25rem]"
        >
          {family.items.map((item) => {
            const state = overlayState(item.mapping);
            const selected = active && selectedItemId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={selected}
                aria-label={`${family.name} size ${item.size ?? "unsized"}, ${STATE_LABEL[state]}`}
                title={STATE_LABEL[state]}
                className={cn(
                  "inline-flex h-7 min-w-9 items-center justify-center gap-1 rounded border px-1.5 text-[11px] font-medium transition-colors max-md:h-9",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:border-foreground/40",
                )}
              >
                <StateMark mapping={item.mapping} />
                {item.size ?? "—"}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

function FamilyBadge({ items }: { items: OverlayMappingItem[] }) {
  const shipped = items.filter(overlayShips).length;
  if (items.some((i) => overlayState(i.mapping) === "missing")) {
    return (
      <Badge variant="destructive" className="shrink-0 text-[10px]">
        Asset missing
      </Badge>
    );
  }
  if (shipped === items.length) return null;
  return (
    <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
      {shipped === 0 ? "Unmapped" : `${shipped}/${items.length}`}
    </Badge>
  );
}

/** Per-size state on a chip: image icon, the color itself, missing, or empty. */
function StateMark({ mapping }: { mapping: OverlayMappingItem["mapping"] }) {
  const state = overlayState(mapping);
  if (state === "image") return <ImageIcon className="h-3 w-3" aria-hidden />;
  return (
    <span
      aria-hidden
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        state === "color" && "ring-1 ring-foreground/20",
        state === "missing" && "bg-destructive",
        state === "none" && "border border-current opacity-40",
      )}
      style={state === "color" ? { backgroundColor: mapping!.color! } : undefined}
    />
  );
}

function Thumb({ mapping, alt }: { mapping: OverlayMappingItem["mapping"]; alt: string }) {
  const state = overlayState(mapping);
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted"
      style={state === "color" ? { backgroundColor: mapping!.color! } : undefined}
    >
      {state === "image" ? (
        <img src={mapping!.hosted_url!} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : state === "color" ? null : (
        <ImageIcon className="h-4 w-4 text-muted-foreground opacity-50" />
      )}
    </span>
  );
}

function OverlayStage({
  family,
  targets,
  usedColors,
  busy,
  onSave,
  onRemove,
}: {
  family: OverlayFamily;
  /** The Items a save writes to: one size, or every size in the family. */
  targets: OverlayMappingItem[];
  usedColors: string[];
  busy: boolean;
  onSave: (itemIds: number[], overlay: OverlayDraft) => void;
  onRemove: (itemIds: number[]) => void;
}) {
  // The size the stage previews: the first that ships an overlay, so a family
  // with one mapped size shows that size's image ready to copy to the rest.
  const item = targets.find(overlayShips) ?? targets.find((t) => t.mapping) ?? targets[0]!;
  const mapping = item.mapping;
  const whole = targets.length > 1;
  const targetIds = targets.map((t) => t.id);
  const familyIds = family.items.map((i) => i.id);
  // Sizes in the target that would change if this overlay were saved to all.
  const differing = whole
    ? targets.filter((t) => overlaySignature(t.mapping) !== overlaySignature(mapping))
    : [];
  const mixed = differing.length > 0;

  // Derived from the item, not useId(): React's generated ids carry colons /
  // guillemets, which are not safe inside a url(#...) fragment.
  const clipId = `overlay-clip-${item.id}`;
  const maskId = `overlay-outside-${item.id}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const [mode, setMode] = useState<"image" | "color">(mapping?.color ? "color" : "image");
  const [scale, setScale] = useState(item.mapping?.fit?.scale ?? 1);
  const [x, setX] = useState(item.mapping?.fit?.x ?? 0);
  const [y, setY] = useState(item.mapping?.fit?.y ?? 0);
  const [hex, setHex] = useState(mapping?.color ?? DEFAULT_COLOR);
  const [length, setLength] = useState(() => defaultBolsterLength(item.size));
  // Announcing every pointermove would be a stream of coordinates; keyboard
  // nudges are discrete and worth hearing.
  const [dragging, setDragging] = useState(false);

  const isBolster = item.category === "bolster_case";
  const { d: path, label: shapeLabel } = silhouetteFor(item, length);
  const imageUrl = mapping?.hosted_url ?? null;
  const url = mode === "image" ? imageUrl : null;
  // fetchOverlayMap skips mapping rows whose asset has no hosted_url, so the
  // shop shows a plain silhouette. Say so rather than looking merely unmapped.
  const assetMissing = overlayState(item.mapping) === "missing";
  const fit = toFit(scale, x, y);
  const saved = item.mapping?.fit ?? null;
  const fitDirty =
    mixed ||
    JSON.stringify(fit) !==
      JSON.stringify(toFit(saved?.scale ?? 1, saved?.x ?? 0, saved?.y ?? 0));
  const frame = overlayFrame(fit, VIEW_W, VIEW_H);

  const color = normalizeHexColor(hex);
  const previewColor = color ?? mapping?.color ?? DEFAULT_COLOR;
  const colorDirty = color != null && (mixed || color !== mapping?.color);

  /** What the stage shows right now, as a save — null when there is nothing to save. */
  const draft: OverlayDraft | null =
    mode === "color"
      ? color
        ? { color }
        : null
      : mapping?.media_asset_id && imageUrl
        ? { assetId: mapping.media_asset_id, fit }
        : null;
  const dirty = mode === "color" ? colorDirty : fitDirty;
  // One size of a multi-size family: offer to push what is on the stage to the
  // siblings, unless they already all carry exactly this.
  const canApplyToFamily =
    !whole && family.items.length > 1 && draft != null && (dirty || overlaysDiffer(family.items));
  const mappedTargetIds = targets.filter((t) => t.mapping).map((t) => t.id);
  const scope = whole ? ` to ${targets.length} sizes` : "";

  const remove = () => {
    if (
      mappedTargetIds.length > 1 &&
      !window.confirm(
        `Remove the overlay from ${mappedTargetIds.length} sizes of ${family.name}? ` +
          "The configurator falls back to the plain silhouette.",
      )
    ) {
      return;
    }
    onRemove(mappedTargetIds);
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!url) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { px: e.clientX, py: e.clientY, x, y };
      setDragging(true);
    },
    [url, x, y],
  );

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!start || !rect || rect.width === 0) return;
    // Pointer pixels → viewBox units; the stage keeps the 664×374 aspect so one
    // ratio covers both axes.
    const k = (VIEW_W + PAD_X * 2) / rect.width;
    setX(clamp(Math.round(start.x + (e.clientX - start.px) * k), -OFFSET_LIMIT, OFFSET_LIMIT));
    setY(clamp(Math.round(start.y + (e.clientY - start.py) * k), -OFFSET_LIMIT, OFFSET_LIMIT));
  };

  const endDrag = useCallback(() => {
    drag.current = null;
    setDragging(false);
  }, []);

  /** Arrow keys nudge the fit (Shift = 10 units) — dragging cannot be the only input. */
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[e.key];
    if (!delta) return;
    e.preventDefault();
    setX((v) => clamp(v + delta[0], -OFFSET_LIMIT, OFFSET_LIMIT));
    setY((v) => clamp(v + delta[1], -OFFSET_LIMIT, OFFSET_LIMIT));
  };

  const applyToFamily = canApplyToFamily && (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => draft && onSave(familyIds, draft)}
      title={`Give ${sizeList(family.items)} this overlay`}
    >
      <Copy className="mr-1.5 h-3.5 w-3.5" />
      Apply to all {family.items.length} sizes
    </Button>
  );

  return (
    <section className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{family.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="capitalize">{roleLabel(item.category)}</span>
            {whole
              ? ` · all ${targets.length} sizes (${sizeList(targets)})`
              : item.size
                ? ` · size ${item.size}`
                : ""}
            {` · ${shapeLabel}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {isBolster && (
            <div
              className="mr-1 flex items-center gap-0.5 rounded-md border p-0.5"
              role="group"
              aria-label="Preview capsule length"
            >
              {BOLSTER_LENGTHS.map((l) => (
                <Button
                  key={l}
                  type="button"
                  size="sm"
                  variant={l === length ? "secondary" : "ghost"}
                  onClick={() => setLength(l)}
                  aria-pressed={l === length}
                  className="h-6 px-1.5 text-[11px] capitalize"
                >
                  {l}
                </Button>
              ))}
            </div>
          )}
          <div
            className="mr-1 flex items-center gap-0.5 rounded-md border p-0.5"
            role="group"
            aria-label="Overlay type"
          >
            <Button
              type="button"
              size="sm"
              variant={mode === "image" ? "secondary" : "ghost"}
              onClick={() => setMode("image")}
              aria-pressed={mode === "image"}
              className="h-6 px-1.5 text-[11px]"
            >
              <ImageIcon className="mr-1 h-3 w-3" />
              Image
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "color" ? "secondary" : "ghost"}
              onClick={() => setMode("color")}
              aria-pressed={mode === "color"}
              className="h-6 px-1.5 text-[11px]"
            >
              <Palette className="mr-1 h-3 w-3" />
              Color
            </Button>
          </div>
          {mode === "image" && (
            <ImagePicker onSelect={(sel) => onSave(targetIds, { assetId: sel.assetId, fit })}>
              <Button type="button" size="sm" variant="outline" disabled={busy}>
                <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                {mapping?.media_asset_id ? "Change image" : "Pick image"}
                {whole ? ` for ${targets.length} sizes` : ""}
              </Button>
            </ImagePicker>
          )}
          {mappedTargetIds.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={remove}
              aria-label={
                whole
                  ? `Remove the overlay from every size of ${family.name}`
                  : `Remove ${item.name} overlay`
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-3">
        {mixed && (
          <p className="mb-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Sizes differ — previewing size {item.size ?? "—"}. {sizeList(differing)}{" "}
            {differing.length === 1 ? "has" : "have"} no overlay or a different one; saving here
            gives all {targets.length} sizes the same overlay.
          </p>
        )}
        <div
          className={cn(
            "relative mx-auto w-full max-w-3xl",
            url ? "cursor-grab active:cursor-grabbing" : "",
          )}
        >
          <svg
            ref={svgRef}
            viewBox={`${-PAD_X} ${-PAD_Y} ${VIEW_W + PAD_X * 2} ${VIEW_H + PAD_Y * 2}`}
            className={cn(
              "block w-full select-none",
              url && "touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            role={url ? "application" : "img"}
            tabIndex={url ? 0 : undefined}
            aria-label={
              url
                ? `${item.name} overlay placement against the ${shapeLabel}. ` +
                  `Scale ${scale.toFixed(2)}, x ${x}, y ${y}. ` +
                  `Arrow keys reposition, hold shift for larger steps.`
                : mode === "color"
                  ? `${item.name} preview filled with ${previewColor}`
                  : `${item.name} preview, no overlay`
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={url ? onKeyDown : undefined}
          >
            <defs>
              <clipPath id={clipId}>
                <path d={path} />
              </clipPath>
              {/* Everything except the silhouette, so the ghost cannot paint
                  inside it — an asset with alpha would otherwise show ghost
                  content the configurator never renders. */}
              <mask id={maskId}>
                <rect
                  x={-PAD_X}
                  y={-PAD_Y}
                  width={VIEW_W + PAD_X * 2}
                  height={VIEW_H + PAD_Y * 2}
                  fill="white"
                />
                <path d={path} fill="black" />
              </mask>
            </defs>
            <path d={path} fill="none" />
            {/* Color overlay: the configurator fills the silhouette itself. */}
            {mode === "color" && <path d={path} fill={previewColor} />}
            {url && (
              <>
                {/* Ghost of the discarded part only — masked out of the silhouette. */}
                <image
                  href={url}
                  mask={`url(#${maskId})`}
                  preserveAspectRatio="xMidYMid slice"
                  opacity={0.18}
                  {...frame}
                />
                <image
                  href={url}
                  clipPath={`url(#${clipId})`}
                  preserveAspectRatio="xMidYMid slice"
                  {...frame}
                />
                {/* Where the image actually sits, including the part the clip hides. */}
                <rect
                  {...frame}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="8 6"
                  className="text-primary/50"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-foreground/60"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {mode === "image" && !url && (
            <p
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm",
                assetMissing ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {assetMissing
                ? "Mapped asset is missing from the library — the configurator falls back to the plain silhouette. Pick a new image."
                : mapping?.color
                  ? "This overlay is a color. Pick an image to replace it."
                  : "No overlay — the configurator shows the plain silhouette."}
            </p>
          )}
        </div>

        {url && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-[12rem] flex-1 items-center gap-2">
            <span className="text-xs text-muted-foreground">Scale</span>
            <Slider
              value={[scale]}
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={0.05}
              onValueChange={([v]) => setScale(Number((v ?? 1).toFixed(2)))}
              aria-label={`${item.name} overlay scale`}
              className="flex-1"
            />
          </div>
          <p
            className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
            aria-live={dragging ? "off" : "polite"}
          >
            <Move className="h-3.5 w-3.5" aria-hidden />
            {scale.toFixed(2)}× · x {x} · y {y}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={scale === 1 && x === 0 && y === 0}
              onClick={() => {
                setScale(1);
                setX(0);
                setY(0);
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset fit
            </Button>
            {applyToFamily}
            <Button
              type="button"
              size="sm"
              disabled={!fitDirty || busy}
              onClick={() => draft && onSave(targetIds, draft)}
            >
              {fitDirty ? (whole ? `Save${scope}` : "Save fit") : "Saved"}
            </Button>
          </div>
        </div>
        )}
        {url && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Drag the preview or use arrow keys (Shift for 10) to reposition. The dashed
            frame is the whole image; the silhouette clips it exactly as the
            configurator does.
            {isBolster
              ? " Mbolster picks its capsule length from the shopper's recommendation, not the case size — check the fit against all three."
              : ""}
          </p>
        )}

        {mode === "color" && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Color</span>
                <input
                  type="color"
                  value={previewColor}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                  aria-label={`${family.name} overlay color`}
                />
                <Input
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  onBlur={() => color && setHex(color)}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  aria-label={`${family.name} overlay color hex`}
                  aria-invalid={color == null}
                  className="h-8 w-24 text-xs md:text-xs"
                />
              </div>
              {usedColors.length > 0 && (
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Colors already in use">
                  <span className="mr-1 text-xs text-muted-foreground">In use</span>
                  {usedColors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setHex(c)}
                      aria-label={`Use ${c}`}
                      aria-pressed={color === c}
                      title={c}
                      className={cn(
                        "h-6 w-6 rounded-full border shadow-sm transition-transform hover:scale-110",
                        color === c && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-1">
                {applyToFamily}
                <Button
                  type="button"
                  size="sm"
                  disabled={!colorDirty || busy}
                  onClick={() => draft && onSave(targetIds, draft)}
                >
                  {colorDirty ? (whole ? `Save${scope}` : "Save color") : "Saved"}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {color == null
                ? "Enter a hex color like #1f3a5f."
                : mapping?.media_asset_id
                  ? "Saving a color replaces the image overlay. The configurator fills the silhouette with it."
                  : "The configurator fills the silhouette with this color — for plain fabrics without a photo."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
