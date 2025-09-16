"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { cn } from "@/lib/utils";

interface ClothRoundedSquareProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number; // base size in px
  cornerRadius?: number; // px
  stroke?: string;
  fill?: string;
  resolution?: number; // number of points along perimeter
  stiffness?: number; // spring stiffness toward ideal shape
  damping?: number; // velocity damping
  coupling?: number; // how much drag velocity affects points
  neighborStiffness?: number; // spring stiffness between adjacent points
  bendStiffness?: number; // spring stiffness for second-neighbor (bending)
  edgeStiffness?: number; // collision stiffness against container edges
  edgeDamping?: number; // additional damping when colliding
  edgePadding?: number; // keep some padding off the edges
  collisionPathD?: string; // SVG path data for collision shape
  collisionViewBox?: { width: number; height: number };
  squashEnabled?: boolean; // enable squash & stretch
  squashStrength?: number; // 0..1
  squashMaxScale?: number; // max stretch factor
  squashSmoothing?: number; // lerp speed per second
  collisionPadding?: number; // gap (in CSS px) to keep from SVG boundary
  velSmoothing?: number; // velocity low-pass smoothing (per second)
  hangStrength?: number; // 0..1 deformation trailing along velocity
  bounceRestitution?: number; // 0..1 bounciness on boundary hit
  bounceTangentDamping?: number; // 0..1 extra damping along tangent on hit
  gravityX?: number; // constant force in x (px/s^2) in local coords
  gravityY?: number; // constant force in y (px/s^2) in local coords (down positive)
}

type Point = { x: number; y: number; vx: number; vy: number };

export default function ClothRoundedSquare({
  className,
  size = 220,
  cornerRadius = 42,
  stroke = "#ffffff",
  fill = "#66C3E8",
  resolution = 8,
  stiffness = 3.4,
  damping = -0.01,
  coupling = 8.5,
  neighborStiffness = 0.1,
  bendStiffness = 10.5,
  edgeStiffness = 10,
  edgeDamping = 42,
  edgePadding = 10.5,
  collisionPathD = "M441.322 14.7728C409.558 27.3692 379.727 35.5927 331.965 35.5927C284.202 35.5927 254.372 27.3692 222.607 14.7728C182.901 -0.972711 120.418 -7.80227 69.7585 31.9038C19.099 71.6098 -2.80784 127.746 1.29974 209.896C5.52474 294.395 33.4738 349.165 83.8767 349.165C134.28 349.165 132.251 315.979 160.907 298.148C183.771 283.922 213.925 285.205 229.723 298.148C251.964 316.368 255.062 333.726 263.277 352.894C269.849 368.229 295.474 372.828 331.271 372.828L332.658 372.828C368.455 372.828 394.08 368.229 400.652 352.894C408.867 333.726 411.966 316.368 434.206 298.148C450.005 285.205 480.158 283.922 503.022 298.148C531.678 315.979 529.65 349.165 580.052 349.165C630.455 349.165 658.404 294.395 662.629 209.896C666.737 127.746 644.83 71.6098 594.171 31.9038C543.511 -7.80226 481.029 -0.972712 441.322 14.7728Z",
  collisionViewBox = { width: 664, height: 374 },
  squashEnabled = false,
  squashStrength = 0.75,
  squashMaxScale = 0.52,
  squashSmoothing = 21,
  collisionPadding = 18,
  bounceRestitution = 0.35,
  bounceTangentDamping = 0.15,
  gravityX = 0,
  gravityY = -90,
  ...rest
}: ClothRoundedSquareProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const shapeRef = useRef<HTMLDivElement>(null);
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);
  const dragVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const filteredVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [pathD, setPathD] = useState<string>("");
  const collCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const collCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const collPathRef = useRef<Path2D | null>(null);
  const squashRef = useRef<{ sx: number; sy: number; ang: number }>({ sx: 1, sy: 1, ang: 0 });

  // Register GSAP plugin once
  useEffect(() => {
    gsap.registerPlugin(Draggable);
  }, [collisionPadding, collisionViewBox.height, collisionViewBox.width]);

  // Prepare collision Path2D on an offscreen canvas
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(collisionViewBox.width));
    canvas.height = Math.max(1, Math.floor(collisionViewBox.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = new Path2D(collisionPathD);
    collCanvasRef.current = canvas;
    collCtxRef.current = ctx;
    collPathRef.current = p;
  }, [collisionPathD, collisionViewBox.width, collisionViewBox.height]);

  // Generate ideal offsets around a rounded rectangle perimeter
  const idealOffsets = useMemo(() => {
    const half = size / 2;
    const r = Math.min(cornerRadius, half - 1);
    const perimeter: { x: number; y: number }[] = [];

    const samplesPerCorner = Math.max(4, Math.floor(resolution / 8));
    const samplesPerSide = Math.max(6, Math.floor(resolution / 4));

    // Helper to push arc points
    const pushArc = (cx: number, cy: number, start: number, end: number, steps: number) => {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = start + (end - start) * t;
        perimeter.push({ x: cx + Math.cos(a) * r - 0, y: cy + Math.sin(a) * r - 0 });
      }
    };

    // Straight segments helper
    const pushLine = (x0: number, y0: number, x1: number, y1: number, steps: number) => {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        perimeter.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
      }
    };

    // Define corner centers relative to (0,0)
    const left = -half + r;
    const right = half - r;
    const top = -half + r;
    const bottom = half - r;

    // Start at top-right corner arc (clockwise)
    pushArc(right, top, -Math.PI / 2, 0, samplesPerCorner);
    pushLine(right + r, top, right + r, bottom, samplesPerSide); // right side
    pushArc(right, bottom, 0, Math.PI / 2, samplesPerCorner);
    pushLine(right, bottom + r, left, bottom + r, samplesPerSide); // bottom side
    pushArc(left, bottom, Math.PI / 2, Math.PI, samplesPerCorner);
    pushLine(left - r, bottom, left - r, top, samplesPerSide); // left side
    pushArc(left, top, Math.PI, (3 * Math.PI) / 2, samplesPerCorner);
    pushLine(left, top - r, right, top - r, samplesPerSide); // top side

    return perimeter;
  }, [size, cornerRadius, resolution]);

  // Rest lengths for structural and bend springs along the loop
  const restStructRef = useRef<number[]>([]);
  const restBendRef = useRef<number[]>([]);
  useEffect(() => {
    const N = idealOffsets.length;
    const rs: number[] = new Array(N).fill(0);
    const rb: number[] = new Array(N).fill(0);
    if (N > 0) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const k = (i + 2) % N;
        const pi = idealOffsets[i];
        const pj = idealOffsets[j];
        const pk = idealOffsets[k];
        const dx1 = pj.x - pi.x;
        const dy1 = pj.y - pi.y;
        const dx2 = pk.x - pi.x;
        const dy2 = pk.y - pi.y;
        rs[i] = Math.hypot(dx1, dy1);
        rb[i] = Math.hypot(dx2, dy2);
      }
    }
    restStructRef.current = rs;
    restBendRef.current = rb;
  }, [idealOffsets]);

  // Dynamic points that follow idealOffsets with springy motion
  const pointsRef = useRef<Point[]>([]);
  useEffect(() => {
    pointsRef.current = idealOffsets.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0 }));
  }, [idealOffsets]);

  // Build an SVG path from current points
  const buildPath = (pts: Point[]) => {
    if (pts.length === 0) return "";
    const first = pts[0];
    let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
    }
    d += " Z";
    return d;
  };

  // Animation loop for cloth-like motion
  useEffect(() => {
    const step = () => {
      const pts = pointsRef.current;
      const N = pts.length;
      // smooth incoming drag velocity for stability
      {
        const v = dragVelRef.current;
        const fv = filteredVelRef.current;
        const t = Math.min(1, 12 * 0.016);
        fv.x += (v.x - fv.x) * t;
        fv.y += (v.y - fv.y) * t;
      }
      const dv = filteredVelRef.current;
      const speed = Math.hypot(dv.x, dv.y);
      const k = stiffness; // target-to-ideal
      const c = damping;
      const g = coupling;

      // Determine current center in parent's coordinate space
      const wrap = wrapRef.current;
      const dragEl = dragRef.current;
      let centerX = 0;
      let centerY = 0;
      let parentW = 0;
      let parentH = 0;
      if (wrap && dragEl) {
        const rect = wrap.getBoundingClientRect();
        parentW = rect.width;
        parentH = rect.height;
        // Base center is parent's center + current draggable x/y
        const x = Number(gsap.getProperty(dragEl, "x")) || 0;
        const y = Number(gsap.getProperty(dragEl, "y")) || 0;
        centerX = parentW * 0.5 + x;
        centerY = parentH * 0.5 + y;
      }

      const dt = 0.016;
      const invDamp = Math.max(0, 1 - c * dt);

      // Accumulate forces
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const target = idealOffsets[i];
        let fx = 0;
        let fy = 0;

        // target spring (keeps general shape) + gravity
        fx += (target.x - p.x) * k + dv.x * g + gravityX;
        fy += (target.y - p.y) * k + dv.y * g + gravityY;
        // hanging deformation: trail opposite velocity
        if (speed > 0) {
          const nx = dv.x / speed;
          const ny = dv.y / speed;
          const proj = (p.x * nx + p.y * ny) / Math.max(1, (size * 0.5));
          const w = Math.max(-1, Math.min(1, proj));
          fx += -nx * speed * 0.02 * w;
          fy += -ny * speed * 0.02 * w;
        }

        // structural springs to neighbors i±1
        if (N > 1) {
          const j = (i + 1) % N;
          const jm = (i - 1 + N) % N;
          const pj = pts[j];
          const pm = pts[jm];
          const restJ = restStructRef.current[i] || 0;
          const restM = restStructRef.current[jm] || 0;

          // i -> j
          let dx = pj.x - p.x;
          let dy = pj.y - p.y;
          let dist = Math.hypot(dx, dy) || 1e-6;
          let diff = dist - restJ;
          let f = (diff / dist) * (neighborStiffness);
          fx += dx * f;
          fy += dy * f;

          // i -> jm
          dx = pm.x - p.x;
          dy = pm.y - p.y;
          dist = Math.hypot(dx, dy) || 1e-6;
          diff = dist - restM;
          f = (diff / dist) * (neighborStiffness);
          fx += dx * f;
          fy += dy * f;
        }

        // bend springs to i±2
        if (N > 4) {
          const j2 = (i + 2) % N;
          const m2 = (i - 2 + N) % N;
          const pj2 = pts[j2];
          const pm2 = pts[m2];
          const restJ2 = restBendRef.current[i] || 0;
          const restM2 = restBendRef.current[m2] || 0;

          let dx = pj2.x - p.x;
          let dy = pj2.y - p.y;
          let dist = Math.hypot(dx, dy) || 1e-6;
          let diff = dist - restJ2;
          let f = (diff / dist) * (bendStiffness);
          fx += dx * f;
          fy += dy * f;

          dx = pm2.x - p.x;
          dy = pm2.y - p.y;
          dist = Math.hypot(dx, dy) || 1e-6;
          diff = dist - restM2;
          f = (diff / dist) * (bendStiffness);
          fx += dx * f;
          fy += dy * f;
        }

        // edge collisions against SVG path shape (fallback to rect if no ctx/path)
        const ctx = collCtxRef.current;
        const path2D = collPathRef.current;
        if (wrap && ctx && path2D) {
          // world -> viewBox coords
          const worldX = centerX + p.x;
          const worldY = centerY + p.y;
          const xVB = (worldX / Math.max(1, parentW)) * collisionViewBox.width;
          const yVB = (worldY / Math.max(1, parentH)) * collisionViewBox.height;
          const inside = ctx.isPointInPath(path2D, xVB, yVB);
          // Convert padding (CSS px) to viewBox units
          const padVBx = (collisionPadding / Math.max(1, parentW)) * collisionViewBox.width;
          const padVBy = (collisionPadding / Math.max(1, parentH)) * collisionViewBox.height;
          const padVB = Math.max(0.25, Math.min(padVBx, padVBy));

          // Determine if "near boundary" using stroke test with width=2*padding
          ctx.save();
          ctx.lineWidth = padVB * 2;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          const nearBoundary = inside && ctx.isPointInStroke(path2D, xVB, yVB);
          ctx.restore();

          if (!inside || nearBoundary) {
            // Estimate inward normal by sampling around the point (more directions, smaller step)
            const step = padVB; // small step in VB units
            const dirs = 16;
            let nxVB = 0;
            let nyVB = 0;
            for (let kdir = 0; kdir < dirs; kdir++) {
              const a = (kdir / dirs) * Math.PI * 2;
              const dx = Math.cos(a) * step;
              const dy = Math.sin(a) * step;
              const ok = ctx.isPointInPath(path2D, xVB + dx, yVB + dy);
              if (ok) { nxVB += dx; nyVB += dy; }
            }
            if (nxVB === 0 && nyVB === 0) {
              // Fallback: push toward center of VB
              nxVB = collisionViewBox.width * 0.5 - xVB;
              nyVB = collisionViewBox.height * 0.5 - yVB;
            }
            // Convert VB normal to world/local units and normalize
            let nx = (nxVB / collisionViewBox.width) * parentW;
            let ny = (nyVB / collisionViewBox.height) * parentH;
            const nlen = Math.hypot(nx, ny) || 1e-6;
            nx /= nlen; ny /= nlen;
            const scale = !inside ? 1 : 0.6;
            fx += nx * edgeStiffness * scale;
            fy += ny * edgeStiffness * scale;
            // bounce: reflect velocity across normal with restitution
            const vn = p.vx * nx + p.vy * ny;
            const vtX = p.vx - vn * nx;
            const vtY = p.vy - vn * ny;
            p.vx = vtX * (1 - bounceTangentDamping) - vn * bounceRestitution * nx;
            p.vy = vtY * (1 - bounceTangentDamping) - vn * bounceRestitution * ny;
          }
        } else if (wrap) {
          // Rect fallback
          const worldX = centerX + p.x;
          const worldY = centerY + p.y;
          const minX = edgePadding;
          const maxX = parentW - edgePadding;
          const minY = edgePadding;
          const maxY = parentH - edgePadding;
          if (worldX < minX) { fx += (minX - worldX) * edgeStiffness; p.vx *= Math.max(0, 1 - edgeDamping * dt); }
          else if (worldX > maxX) { fx -= (worldX - maxX) * edgeStiffness; p.vx *= Math.max(0, 1 - edgeDamping * dt); }
          if (worldY < minY) { fy += (minY - worldY) * edgeStiffness; p.vy *= Math.max(0, 1 - edgeDamping * dt); }
          else if (worldY > maxY) { fy -= (worldY - maxY) * edgeStiffness; p.vy *= Math.max(0, 1 - edgeDamping * dt); }
        }

        // integrate
        p.vx += fx * dt;
        p.vy += fy * dt;
      }

      // apply damping and position updates in separate pass (more stable)
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        p.vx *= invDamp;
        p.vy *= invDamp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // Squash & stretch visual effect
      if (shapeRef.current) {
        if (squashEnabled) {
          const sNorm = Math.min(1, speed / 900);
          const targetStretch = 1 + (squashMaxScale - 1) * sNorm * Math.max(0, Math.min(1, squashStrength));
          const targetSquash = 1 / targetStretch;
          const deadzone = 120; // px/s threshold to avoid noisy angles
          const targetAngle = speed > deadzone ? Math.atan2(dv.y, dv.x) * (180 / Math.PI) : 0;
          const cur = squashRef.current;
          const t = Math.min(1, squashSmoothing * dt);
          cur.sx += (targetStretch - cur.sx) * t;
          cur.sy += (targetSquash - cur.sy) * t;
          let da = targetAngle - cur.ang;
          da = ((da + 180) % 360) - 180;
          // clamp per-frame angle change to prevent snaps
          const maxDegPerSec = 540;
          const maxStep = maxDegPerSec * dt;
          if (da > maxStep) da = maxStep; else if (da < -maxStep) da = -maxStep;
          cur.ang += da * t;
          gsap.set(shapeRef.current, { transformOrigin: "50% 50%", rotate: cur.ang, scaleX: cur.sx, scaleY: cur.sy });
        } else {
          gsap.set(shapeRef.current, { transformOrigin: "50% 50%", rotate: 0, scaleX: 1, scaleY: 1 });
        }
      }

      setPathD(buildPath(pts));
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stiffness, damping, coupling, idealOffsets, neighborStiffness, bendStiffness, edgeStiffness, edgeDamping, edgePadding, collisionViewBox.height, collisionViewBox.width, squashEnabled, squashStrength, squashMaxScale, squashSmoothing, collisionPadding, size, bounceRestitution, bounceTangentDamping, gravityX, gravityY]);

  // Setup Draggable on the drag element
  useEffect(() => {
    if (!dragRef.current || !wrapRef.current) return;

    const adjustXY = (x: number, y: number) => {
      const wrap = wrapRef.current;
      const ctx = collCtxRef.current;
      const path2D = collPathRef.current;
      if (!wrap || !ctx || !path2D) return { x, y };
      const rect = wrap.getBoundingClientRect();
      const parentW = rect.width || 1;
      const parentH = rect.height || 1;
      // world (px) → viewBox coords
      let worldX = parentW * 0.5 + x;
      let worldY = parentH * 0.5 + y;
      let xVB = (worldX / parentW) * collisionViewBox.width;
      let yVB = (worldY / parentH) * collisionViewBox.height;
      const padVBx = (collisionPadding / parentW) * collisionViewBox.width;
      const padVBy = (collisionPadding / parentH) * collisionViewBox.height;
      const padVB = Math.max(0.25, Math.min(padVBx, padVBy));

      for (let iter = 0; iter < 2; iter++) {
        const inside = ctx.isPointInPath(path2D, xVB, yVB);
        ctx.save();
        ctx.lineWidth = padVB * 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        const nearBoundary = inside && ctx.isPointInStroke(path2D, xVB, yVB);
        ctx.restore();
        if (!inside || nearBoundary) {
          // estimate inward normal from samples
          const dirs = 16;
          const step = padVB;
          let nxVB = 0, nyVB = 0;
          for (let k = 0; k < dirs; k++) {
            const a = (k / dirs) * Math.PI * 2;
            const dx = Math.cos(a) * step;
            const dy = Math.sin(a) * step;
            const ok = ctx.isPointInPath(path2D, xVB + dx, yVB + dy);
            if (ok) { nxVB += dx; nyVB += dy; }
          }
          if (nxVB === 0 && nyVB === 0) {
            nxVB = collisionViewBox.width * 0.5 - xVB;
            nyVB = collisionViewBox.height * 0.5 - yVB;
          }
          // normal VB → world px
          let nx = (nxVB / collisionViewBox.width) * parentW;
          let ny = (nyVB / collisionViewBox.height) * parentH;
          const nlen = Math.hypot(nx, ny) || 1e-6;
          nx /= nlen; ny /= nlen;
          const padPx = collisionPadding;
          // nudge center by small amount away from boundary
          worldX += nx * padPx;
          worldY += ny * padPx;
          xVB = (worldX / parentW) * collisionViewBox.width;
          yVB = (worldY / parentH) * collisionViewBox.height;
        } else {
          break;
        }
      }
      return { x: worldX - parentW * 0.5, y: worldY - parentH * 0.5 };
    };

    const d = Draggable.create(dragRef.current, {
      type: "x,y",
      bounds: wrapRef.current,
      inertia: false,
      edgeResistance: 0.8,
      liveSnap: {
        x: function (val: number) {
          const self = this as unknown as { x: number; y: number };
          const y = (typeof self.y === "number" ? self.y : (lastCenterRef.current?.y ?? 0));
          const adj = adjustXY(val, y);
          return adj.x;
        },
        y: function (val: number) {
          const self = this as unknown as { x: number; y: number };
          const x = (typeof self.x === "number" ? self.x : (lastCenterRef.current?.x ?? 0));
          const adj = adjustXY(x, val);
          return adj.y;
        },
      },
      dragResistance: 0.12,
      onDrag: function () {
        const x = this.x as number;
        const y = this.y as number;
        const dx = (this.deltaX as number) || 0;
        const dy = (this.deltaY as number) || 0;
        dragVelRef.current = { x: dx * 60, y: dy * 60 };
        lastCenterRef.current = { x, y };
      },
      onDragStart: function () {
        const x = this.x;
        const y = this.y;
        lastCenterRef.current = { x, y };
        // no-op
      },
      onRelease: function () {
        // decay velocity when released
        dragVelRef.current = { x: 0, y: 0 };
      },
    })[0];

    return () => {
      if (d) d.kill();
    };
  }, [collisionPadding, collisionViewBox.height, collisionViewBox.width]);

  return (
    <div ref={wrapRef} className={cn("absolute inset-0", className)} {...rest}>
      <div
        ref={dragRef}
        style={{ width: size, height: size, position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", willChange: "transform", backfaceVisibility: "hidden" }}
      >
        <div ref={shapeRef} style={{ width: "100%", height: "100%", willChange: "transform", backfaceVisibility: "hidden" }}>
          <svg ref={svgRef} width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} style={{ overflow: "visible" }}>
            <path d={pathD} fill={fill} stroke={stroke} strokeWidth={3} />
          </svg>
        </div>
      </div>
    </div>
  );
}


