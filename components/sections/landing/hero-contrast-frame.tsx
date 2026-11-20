"use client";

import * as React from "react";

import { decideTextTone, requiredRatio, type ContrastRegion, type ToneDecision } from "@/lib/a11y/text-contrast";
import { cn } from "@/lib/utils";

const SAMPLE_PX = 4;

const DARK_WASHES = [
  { css: "var(--background)", rgb: [10, 10, 10], alpha: [0.85, 0.25, 0], phoneOnly: false },
  { css: "#000", rgb: [0, 0, 0], alpha: [0.55, 0.25, 0], phoneOnly: true },
] as const;
const PHONE_QUERY = "(width < 48rem)";

type HeroContrast = { light: ToneDecision; dark: ToneDecision };

export function HeroContrastFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [contrast, setContrast] = React.useState<HeroContrast | null>(null);

  React.useEffect(() => {
    const frame = frameRef.current;
    const img = frame?.querySelector<HTMLImageElement>("img[data-hero-backdrop]");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!frame || !img || !ctx || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    let disposed = false;
    const measure = () => {
      raf = 0;
      if (disposed || !img.complete || !img.naturalWidth) return;
      const next = measureContrast(frame, img, canvas, ctx);
      setContrast((prev) => (sameContrast(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    img.addEventListener("load", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    frame.querySelectorAll("[data-hero-copy]").forEach((el) => observer.observe(el));
    void document.fonts?.ready.then(schedule);
    schedule();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      img.removeEventListener("load", schedule);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={frameRef}
      data-hero-tone={contrast?.light.tone}
      data-hero-tone-dark={contrast?.dark.tone}
      data-hero-aa={contrast ? aa(contrast.light) : undefined}
      data-hero-aa-dark={contrast ? aa(contrast.dark) : undefined}
      className={cn("group/hero", className)}
    >
      {children}
      {DARK_WASHES.map((wash) => (
        <div
          key={wash.css}
          className={cn(
            "pointer-events-none absolute inset-0 z-[1] hidden",
            wash.phoneOnly ? "dark:max-md:block" : "dark:block",
          )}
          style={{
            backgroundImage: `linear-gradient(to top, ${wash.alpha
              .map((a) => `color-mix(in oklab, ${wash.css} ${a * 100}%, transparent)`)
              .join(", ")})`,
          }}
        />
      ))}
    </div>
  );
}

function aa(decision: ToneDecision): "pass" | "fail" {
  return decision.passes ? "pass" : "fail";
}

function washAlpha(alpha: readonly [number, number, number], fromBottom: number): number {
  const f = Math.min(1, Math.max(0, fromBottom));
  return f <= 0.5 ? alpha[0] + (alpha[1] - alpha[0]) * (f / 0.5) : alpha[1] + (alpha[2] - alpha[1]) * ((f - 0.5) / 0.5);
}

function measureContrast(
  frame: HTMLElement,
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): HeroContrast | null {
  const box = img.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
  const offsetX = (box.width - img.naturalWidth * scale) / 2;
  const offsetY = (box.height - img.naturalHeight * scale) / 2;
  const phone = window.matchMedia(PHONE_QUERY).matches;
  const washes = DARK_WASHES.filter((w) => phone || !w.phoneOnly);

  const light: ContrastRegion[] = [];
  const dark: ContrastRegion[] = [];
  try {
    for (const el of frame.querySelectorAll<HTMLElement>("[data-hero-copy]")) {
      const rect = el.getBoundingClientRect();
      const x0 = Math.max(rect.left, box.left) - box.left;
      const x1 = Math.min(rect.right, box.right) - box.left;
      const y0 = Math.max(rect.top, box.top) - box.top;
      const y1 = Math.min(rect.bottom, box.bottom) - box.top;
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;

      const w = Math.max(1, Math.round((x1 - x0) / SAMPLE_PX));
      const h = Math.max(1, Math.round((y1 - y0) / SAMPLE_PX));
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        (x0 - offsetX) / scale,
        (y0 - offsetY) / scale,
        (x1 - x0) / scale,
        (y1 - y0) / scale,
        0,
        0,
        w,
        h,
      );
      const pixels = ctx.getImageData(0, 0, w, h).data;
      const style = getComputedStyle(el);
      const minRatio = requiredRatio(parseFloat(style.fontSize), Number(style.fontWeight) || 400);

      const washed = new Uint8ClampedArray(pixels);
      for (let row = 0; row < h; row++) {
        const fromBottom = 1 - (y0 + ((row + 0.5) * (y1 - y0)) / h) / box.height;
        for (const wash of washes) {
          const a = washAlpha(wash.alpha, fromBottom);
          for (let o = row * w * 4, end = o + w * 4; o < end; o += 4) {
            washed[o] = washed[o] * (1 - a) + wash.rgb[0] * a;
            washed[o + 1] = washed[o + 1] * (1 - a) + wash.rgb[1] * a;
            washed[o + 2] = washed[o + 2] * (1 - a) + wash.rgb[2] * a;
          }
        }
      }
      light.push({ pixels, minRatio });
      dark.push({ pixels: washed, minRatio });
    }
  } catch {
    return null;
  }
  if (light.length === 0) return null;
  return { light: decideTextTone(light), dark: decideTextTone(dark) };
}

function sameContrast(a: HeroContrast | null, b: HeroContrast | null): boolean {
  const same = (x: ToneDecision, y: ToneDecision) => x.tone === y.tone && x.passes === y.passes;
  return a === b || (!!a && !!b && same(a.light, b.light) && same(a.dark, b.dark));
}
