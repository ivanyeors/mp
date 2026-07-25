"use client";

import * as React from "react";
import { motion, AnimatePresence, useMotionValue, useMotionValueEvent, animate } from "motion/react";
import { Menu, X, ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  arcCentroid,
  arcPath,
  buildArcs,
  outerArcPath,
  type ArcSpec,
  type SunburstNode,
} from "./sunburst-menu-layout";

export type { SunburstNode } from "./sunburst-menu-layout";

export type SunburstMenuProps = {
  /** Top-level segments (ring 1). */
  root: SunburstNode[];
  /** Fired when a leaf (no children) is chosen. */
  onSelect: (leaf: SunburstNode) => void;
  /** Controlled selected leaf id. Falls back to internal state when omitted. */
  selectedId?: string;
  /** What to render inside each segment. */
  display?: "icon" | "text" | "both";
  /** Outer diameter in px. */
  size?: number;
  /** Radial thickness of each ring in px. */
  ringWidth?: number;
  /** Center gap / ring-1 inner radius; also sizes the closed trigger. Defaults to size × 0.1375.
   *  Pass a small value with a large `size` to keep a compact trigger but larger rings. */
  holeRadius?: number;
  /** Glyph for the closed center trigger. Defaults to a menu icon. */
  centerIcon?: React.ComponentType<{ className?: string }>;
  /** Accessible label for the menu / closed trigger (e.g. "Add filling to top"). */
  ariaLabel?: string;
  /** Fired when the bloom opens/closes — lets a parent hide sibling menus. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** Fill/stroke per interaction state — mirrors the token variants in button.tsx. */
function segmentClass(state: "default" | "hover" | "selected" | "disabled"): string {
  const base = "cursor-pointer transition-colors duration-150";
  switch (state) {
    case "selected":
      return cn(base, "fill-primary stroke-background [stroke-width:2]");
    case "hover":
      // subtle fill tint; the blue outer-edge highlight is drawn separately
      return cn(base, "fill-accent stroke-background [stroke-width:2]");
    case "disabled":
      return "cursor-not-allowed fill-muted stroke-background [stroke-width:2] opacity-40";
    default:
      return cn(base, "fill-muted stroke-background [stroke-width:2]");
  }
}

export function SunburstMenu({
  root,
  onSelect,
  selectedId,
  display = "both",
  size: sizeProp = 320,
  ringWidth: ringWidthProp = sizeProp * 0.1625, // ~52 at 320; scales with size so one knob resizes all
  holeRadius: holeRadiusProp = sizeProp * 0.1375, // ~44 at 320; trigger size unless overridden
  centerIcon: CenterIcon = Menu,
  ariaLabel,
  onOpenChange,
  className,
}: SunburstMenuProps) {
  // Issue #63 (ADR 0009): the bloom is `size` wide and centered on the trigger,
  // so it overflows a narrow x-ray dive column on phones. Measure the container
  // and clamp the diameter to it (only shrink, never grow past the caller's
  // `size`). ringWidth/holeRadius scale by the same factor so the rings keep
  // their proportions inside the smaller viewBox — visuals unchanged, just smaller.
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = measureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const size = containerW && containerW > 0 ? Math.min(sizeProp, containerW) : sizeProp;
  const scale = size / sizeProp;
  const ringWidth = ringWidthProp * scale;
  const holeRadius = holeRadiusProp * scale;
  const [open, setOpen] = React.useState(false);
  // Fire onOpenChange only when `open` flips — via a ref so a fresh inline
  // callback each parent render doesn't retrigger it (that would thrash the
  // parent's "hide siblings" state). The sync effect is declared first, so the
  // ref holds the latest callback before the open effect reads it.
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  React.useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);
  const [expansionPath, setExpansionPath] = React.useState<string[]>([]);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [internalSelected, setInternalSelected] = React.useState<string | undefined>();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const gradId = React.useId(); // unique per instance for the blue-edge gradient

  const activeSelected = selectedId ?? internalSelected;
  const cx = size / 2;
  const cy = size / 2;
  const buttonSize = holeRadius * 2 - 8; // closed footprint = just the center trigger

  const targetArcs = React.useMemo(
    () => buildArcs(root, expansionPath, { cx, cy, holeRadius, ringWidth }),
    [root, expansionPath, cx, cy, holeRadius, ringWidth],
  );

  // Drilling reflows ring-1 spans (equal → weighted). Animate a single 0→1
  // progress spring and lerp each persistent wedge's angles between its old and
  // new layout, recomputing the path per frame — a naive `d` tween breaks when a
  // wedge grows past 180° (SVG's large-arc-flag can't be interpolated).
  const pathKey = expansionPath.join("/");
  const prevTargetRef = React.useRef(targetArcs);
  const fromRef = React.useRef(new Map<string, { a0: number; a1: number }>());
  const progress = useMotionValue(1);
  const [p, setP] = React.useState(1);
  useMotionValueEvent(progress, "change", (v) => setP(v));
  React.useEffect(() => {
    const from = new Map<string, { a0: number; a1: number }>();
    for (const a of prevTargetRef.current) from.set(a.path.join("/"), { a0: a.startAngle, a1: a.endAngle });
    fromRef.current = from;
    progress.set(0);
    const controls = animate(progress, 1, { type: "spring", stiffness: 260, damping: 30 });
    return () => controls.stop();
  }, [pathKey, progress]);
  React.useEffect(() => {
    prevTargetRef.current = targetArcs;
  });

  // ponytail: per-frame re-render during the ~250ms reflow — fine at <10 wedges.
  const arcs = React.useMemo(() => {
    if (p >= 1) return targetArcs;
    return targetArcs.map((a) => {
      const from = fromRef.current.get(a.path.join("/"));
      if (!from) return a; // freshly-fanned child: no morph, it springs in
      const a0 = from.a0 + (a.startAngle - from.a0) * p;
      const a1 = from.a1 + (a.endAngle - from.a1) * p;
      return { ...a, startAngle: a0, endAngle: a1, centroid: arcCentroid(cx, cy, a.innerR, a.outerR, a0, a1) };
    });
  }, [targetArcs, p, cx, cy]);

  // Deepest rendered ring is the one you act on; keyboard focus lives there.
  const activeDepth = arcs.reduce((m, a) => Math.max(m, a.depth), 1);
  const activeRing = React.useMemo(
    () => arcs.filter((a) => a.depth === activeDepth),
    [arcs, activeDepth],
  );

  // Derived, not stored: an explicit focusId only wins while it's still on the
  // actionable ring; otherwise default to the first segment.
  const effectiveFocusId = activeRing.some((a) => a.node.id === focusId)
    ? focusId
    : (activeRing[0]?.node.id ?? null);

  const collapse = React.useCallback(() => {
    setOpen(false);
    setExpansionPath([]);
  }, []);

  // Click away closes the whole menu.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) collapse();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, collapse]);

  const stepBack = React.useCallback(() => {
    if (!open) {
      setOpen(true);
      return;
    }
    if (expansionPath.length > 0) {
      setExpansionPath((p) => p.slice(0, -1));
    } else {
      collapse();
    }
  }, [open, expansionPath.length, collapse]);

  const activate = React.useCallback(
    (arc: ArcSpec) => {
      if (arc.node.disabled) return;
      if (arc.hasChildren) {
        setExpansionPath(arc.path);
      } else {
        setInternalSelected(arc.node.id);
        onSelect(arc.node);
        collapse();
      }
    },
    [onSelect, collapse],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || activeRing.length === 0) return;
      const idx = Math.max(0, activeRing.findIndex((a) => a.node.id === effectiveFocusId));
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusId(activeRing[(idx + 1) % activeRing.length].node.id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusId(activeRing[(idx - 1 + activeRing.length) % activeRing.length].node.id);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const arc = activeRing.find((a) => a.node.id === effectiveFocusId);
        if (arc) activate(arc);
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        stepBack();
      }
    },
    [open, activeRing, effectiveFocusId, activate, stepBack],
  );

  const showText = display !== "icon";
  const showIcon = display !== "text";
  const centerState = !open ? "closed" : expansionPath.length > 0 ? "back" : "close";

  return (
    <div ref={measureRef} className="flex w-full justify-center">
    <div
      ref={rootRef}
      role="menu"
      aria-label={ariaLabel ?? "Sunburst menu"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      style={{ width: buttonSize, height: buttonSize }}
    >
      {/* Bloom overlay: centered on the trigger, escapes the closed footprint.
          pointer-events-none so an empty (closed) menu never blocks the canvas —
          the interactive wedges opt back in below. */}
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
        style={{ width: size, height: size }}
      >
        <defs>
          {/* brand blue gradient — matches the top-loading bar (blue-500 → blue-400) */}
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <AnimatePresence>
          {open &&
            arcs.map((arc, i) => {
              const isSelected = arc.node.id === activeSelected;
              const isHover = arc.node.id === hoverId || arc.node.id === effectiveFocusId;
              const state = arc.node.disabled
                ? "disabled"
                : isSelected
                  ? "selected"
                  : isHover
                    ? "hover"
                    : "default";
              const Icon = arc.node.icon;
              // Label box hugs the wedge: a shrunk sibling gets a tight box (its
              // text just fits), everyone else caps at the roomy default.
              const foW = Math.min(
                ringWidth * 1.7,
                Math.max(24, ((arc.innerR + arc.outerR) / 2) * (arc.endAngle - arc.startAngle)),
              );
              const foH = ringWidth * 0.95;
              return (
                <motion.g
                  key={arc.path.join("/")}
                  initial={{ opacity: 0, rotate: -14, scale: 0.85 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24, delay: (arc.depth - 1) * 0.05 + Math.min(i, 8) * 0.015 }}
                  style={{ transformBox: "view-box", transformOrigin: `${cx}px ${cy}px` }}
                >
                  <path
                    role="menuitem"
                    aria-label={arc.node.label}
                    aria-disabled={arc.node.disabled || undefined}
                    d={arcPath(cx, cy, arc.innerR, arc.outerR, arc.startAngle, arc.endAngle)}
                    className={cn("pointer-events-auto", segmentClass(state))}
                    onMouseEnter={() => setHoverId(arc.node.id)}
                    onMouseLeave={() => setHoverId((h) => (h === arc.node.id ? null : h))}
                    onClick={() => activate(arc)}
                  />
                  {state === "hover" && (
                    <path
                      d={outerArcPath(cx, cy, arc.outerR - 1, arc.startAngle, arc.endAngle)}
                      fill="none"
                      stroke={`url(#${gradId})`}
                      strokeWidth={2}
                      strokeLinecap="round"
                      className="pointer-events-none"
                    />
                  )}
                  <foreignObject
                    x={arc.centroid.x - foW / 2}
                    y={arc.centroid.y - foH / 2}
                    width={foW}
                    height={foH}
                    className="pointer-events-none"
                  >
                    <div
                      className={cn(
                        "flex h-full w-full flex-col items-center justify-center gap-0.5 text-center leading-tight",
                        state === "selected" ? "text-primary-foreground" : "text-foreground",
                        arc.node.disabled && "text-muted-foreground",
                      )}
                    >
                      {showIcon && Icon ? <Icon className="size-4 shrink-0" /> : null}
                      {showText ? <span className="text-[10px] font-medium">{arc.node.label}</span> : null}
                    </div>
                  </foreignObject>
                </motion.g>
              );
            })}
        </AnimatePresence>
      </svg>

      <motion.button
        type="button"
        aria-label={
          centerState === "closed"
            ? (ariaLabel ?? "Open menu")
            : centerState === "back"
              ? "Back"
              : "Close menu"
        }
        onClick={stepBack}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
        className="relative z-10 flex items-center justify-center rounded-full border bg-background text-foreground shadow-sm hover:bg-accent"
        style={{ width: buttonSize, height: buttonSize }}
      >
        {centerState === "closed" ? (
          <CenterIcon className="size-5" />
        ) : centerState === "back" ? (
          <ChevronLeft className="size-5" />
        ) : (
          <X className="size-5" />
        )}
      </motion.button>
    </div>
    </div>
  );
}
