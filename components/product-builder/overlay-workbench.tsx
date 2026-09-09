"use client";

/**
 * Product Builder overlay workbench: pick a cover/case Item on the left, see
 * its Media Asset overlay rendered inside the real configurator silhouette on
 * the right, and drag/scale the fit instead of typing viewBox numbers.
 *
 * The stage is the same render the shopper gets — same silhouette path, same
 * `overlayFrame` math, same clip — so what is dialled in here is what ships.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { ImageIcon, Move, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ImagePicker, type AssetSelection } from "@/components/ui/image-picker";
import { bolsterCapsulePath, SILHOUETTE_PATH } from "@/components/spatial/xray-assets";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import {
  overlayFrame,
  type OverlayFit,
  type OverlayMappingItem,
} from "@/lib/product-builder/overlays";
import { cn } from "@/lib/utils";

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

/** Inventory category → shopper-facing role (cover | case). */
// ponytail: inline copy of toComponentRole — importing it drags supabaseAdmin into the client bundle
function roleLabel(category: string): "cover" | "case" {
  return category === "cover" ? "cover" : "case";
}

/** Mbolster item size (S/M/L) → the capsule length /mbolster-config draws. */
function bolsterLengthFor(size: string | null): BolsterLength {
  const s = size?.trim().toUpperCase();
  if (s === "S") return "short";
  if (s === "L") return "long";
  return "medium";
}

/**
 * The silhouette this item is previewed against — the same shape its own
 * configurator renders, so a fit dialled in here transfers exactly.
 * Bolster cases get `bolsterCapsulePath` at their size (what /mbolster-config
 * draws), not the static placeholder capsule.
 */
function silhouetteFor(item: OverlayMappingItem): { d: string; label: string } {
  if (item.category === "bolster_case") {
    const length = bolsterLengthFor(item.size);
    return { d: bolsterCapsulePath(length), label: `Mbolster capsule (${length})` };
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

export function OverlayWorkbench({
  items,
  onPick,
  onSaveFit,
  onRemove,
}: {
  items: OverlayMappingItem[];
  onPick: (itemId: number, selection: AssetSelection, fit: OverlayFit | null) => void;
  onSaveFit: (itemId: number, assetId: string, fit: OverlayFit | null) => void;
  onRemove: (itemId: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Selection survives a reload because it is resolved by id, not by index.
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const groups = useMemo(() => {
    const by: Record<"cover" | "case", OverlayMappingItem[]> = { cover: [], case: [] };
    for (const item of items) by[roleLabel(item.category)].push(item);
    return by;
  }, [items]);

  const mappedCount = items.filter((i) => i.mapping?.hosted_url).length;

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        No active cover or case items found.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <aside className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Items</span>
          <span className="text-xs text-muted-foreground">
            {mappedCount}/{items.length} mapped
          </span>
        </div>
        <div className="max-h-[28rem] overflow-y-auto p-2 md:max-h-[34rem]">
            {(["cover", "case"] as const).map((role) =>
              groups[role].length ? (
                <div key={role} className="mb-2 last:mb-0">
                  <p className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {role}
                  </p>
                  <ul className="space-y-1">
                    {groups[role].map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          aria-current={selected?.id === item.id}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                            selected?.id === item.id
                              ? "border-primary bg-primary/10"
                              : "border-transparent hover:bg-accent",
                          )}
                        >
                          <Thumb url={item.mapping?.hosted_url ?? null} alt={item.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {item.name}
                            </span>
                            {item.size && (
                              <span className="block text-xs text-muted-foreground">
                                Size {item.size}
                              </span>
                            )}
                          </span>
                          {!item.mapping?.hosted_url && (
                            <Badge
                              variant={item.mapping ? "destructive" : "outline"}
                              className="shrink-0 text-[10px]"
                            >
                              {item.mapping ? "Asset missing" : "Unmapped"}
                            </Badge>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
        </div>
      </aside>

      {selected && (
        <OverlayStage
          // Remount on the saved mapping so the draft fit resets after a save.
          key={`${selected.id}:${selected.mapping?.media_asset_id ?? ""}:${JSON.stringify(
            selected.mapping?.fit ?? null,
          )}`}
          item={selected}
          onPick={(sel, fit) => onPick(selected.id, sel, fit)}
          onSaveFit={(fit) =>
            selected.mapping && onSaveFit(selected.id, selected.mapping.media_asset_id, fit)
          }
          onRemove={() => onRemove(selected.id)}
        />
      )}
    </div>
  );
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground opacity-50" />
      )}
    </span>
  );
}

function OverlayStage({
  item,
  onPick,
  onSaveFit,
  onRemove,
}: {
  item: OverlayMappingItem;
  onPick: (selection: AssetSelection, fit: OverlayFit | null) => void;
  onSaveFit: (fit: OverlayFit | null) => void;
  onRemove: () => void;
}) {
  // Derived from the item, not useId(): React's generated ids carry colons /
  // guillemets, which are not safe inside a url(#...) fragment.
  const clipId = `overlay-clip-${item.id}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const [scale, setScale] = useState(item.mapping?.fit?.scale ?? 1);
  const [x, setX] = useState(item.mapping?.fit?.x ?? 0);
  const [y, setY] = useState(item.mapping?.fit?.y ?? 0);

  const { d: path, label: shapeLabel } = silhouetteFor(item);
  const url = item.mapping?.hosted_url ?? null;
  // fetchOverlayMap skips mapping rows whose asset has no hosted_url, so the
  // shop shows a plain silhouette. Say so rather than looking merely unmapped.
  const assetMissing = item.mapping != null && url == null;
  const fit = toFit(scale, x, y);
  const saved = item.mapping?.fit ?? null;
  const dirty =
    JSON.stringify(fit) !==
    JSON.stringify(toFit(saved?.scale ?? 1, saved?.x ?? 0, saved?.y ?? 0));
  const frame = overlayFrame(fit, VIEW_W, VIEW_H);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!url) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { px: e.clientX, py: e.clientY, x, y };
    },
    [url, x, y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!start || !rect || rect.width === 0) return;
    // Pointer pixels → viewBox units; the stage keeps the 664×374 aspect so one
    // ratio covers both axes.
    const k = (VIEW_W + PAD_X * 2) / rect.width;
    setX(clamp(Math.round(start.x + (e.clientX - start.px) * k), -OFFSET_LIMIT, OFFSET_LIMIT));
    setY(clamp(Math.round(start.y + (e.clientY - start.py) * k), -OFFSET_LIMIT, OFFSET_LIMIT));
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  /** Arrow keys nudge the fit (Shift = 10 units) — dragging cannot be the only input. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
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
    },
    [],
  );

  return (
    <section className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="capitalize">{roleLabel(item.category)}</span>
            {item.size ? ` · size ${item.size}` : ""}
            {` · ${shapeLabel}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ImagePicker onSelect={(sel) => onPick(sel, fit)}>
            <Button type="button" size="sm" variant="outline">
              <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              {item.mapping ? "Change image" : "Pick image"}
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
      </div>

      <div className="p-3">
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
            role="img"
            tabIndex={url ? 0 : undefined}
            aria-label={
              url
                ? `${item.name} overlay placement — drag or use arrow keys to reposition`
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
            </defs>
            <path d={path} fill="none" />
            {url && (
              <>
                {/* Ghost of the whole asset — shows the part the clip discards. */}
                <image
                  href={url}
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
          {!url && (
            <p
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm",
                assetMissing ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {assetMissing
                ? "Mapped asset is missing from the library — the configurator falls back to the plain silhouette. Pick a new image."
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
            className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            <Move className="h-3.5 w-3.5" aria-hidden />
            {scale.toFixed(2)}× · x {x} · y {y}
          </p>
          <div className="ml-auto flex items-center gap-1">
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
            <Button
              type="button"
              size="sm"
              disabled={!dirty}
              onClick={() => onSaveFit(fit)}
            >
              {dirty ? "Save fit" : "Saved"}
            </Button>
          </div>
        </div>
        )}
        {url && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Drag the preview or use arrow keys (Shift for 10) to reposition. The dashed
            frame is the whole image; the silhouette clips it exactly as the
            configurator does.
          </p>
        )}
      </div>
    </section>
  );
}
