"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Monitor,
  MousePointerSquareDashed,
  Moon,
  RefreshCw,
  Smartphone,
  Sun,
  Tablet,
  Hand,
} from "lucide-react";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { PAGE_BUILDER_PREVIEW_PATH } from "@/lib/routing/preview-route";

export type PreviewDevice = "mobile" | "tablet" | "desktop";
export type PreviewMode = "select" | "interact";

const DEVICE_WIDTH: Record<PreviewDevice, number> = {
  mobile: 390,
  tablet: 834,
  desktop: 1280,
};

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;
const LOCALE_LABEL: Record<Locale, string> = { "en-US": "EN", "zh-CN": "中文" };

const PANE_PADDING = 12;

interface PreviewFrameProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  refreshKey: number;
  initialDevice?: PreviewDevice;
  previewPath?: string;
  title?: string;
}

function sectionElement(el: Element | null): HTMLElement | null {
  return (el?.closest("[data-builder-section]") ?? el?.closest("[data-section]")) as HTMLElement | null;
}

function sectionSlug(el: HTMLElement): string {
  return el.dataset.builderSection ?? el.dataset.section ?? "";
}

export function PreviewFrame({
  locale,
  onLocaleChange,
  selectedSlug,
  onSelect,
  refreshKey,
  initialDevice = "desktop",
  previewPath = PAGE_BUILDER_PREVIEW_PATH,
  title = "Landing page preview",
}: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<PreviewDevice>(initialDevice);
  const [mode, setMode] = useState<PreviewMode>("select");
  const [dark, setDark] = useState(false);
  const [scale, setScale] = useState(1);
  const [hovered, setHovered] = useState<{ top: number; left: number; width: number; height: number; slug: string } | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const width = DEVICE_WIDTH[device];
  const src = `/${locale}${previewPath}`;

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const measure = () => {
      const available = pane.clientWidth - PANE_PADDING * 2;
      if (available <= 0) return;
      setScale(Math.min(1, available / width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [width]);

  const previewDoc = useCallback((): Document | null => {
    const frame = frameRef.current;
    try {
      const doc = frame?.contentDocument ?? null;
      const path = frame?.contentWindow?.location?.pathname ?? "";
      if (!doc || !path.includes(PAGE_BUILDER_PREVIEW_PATH)) return null;
      return doc;
    } catch {
      return null;
    }
  }, []);

  const reloadFrame = useCallback(() => {
    try {
      frameRef.current?.contentWindow?.location.replace(src);
    } catch {}
  }, [src]);

  useEffect(() => {
    if (refreshKey === 0) return;
    reloadFrame();
  }, [refreshKey, reloadFrame]);

  // ponytail: re-applied on every load; if next-themes ever re-runs after hydration and wins, move
  // this to a query param the preview route reads.
  useEffect(() => {
    const doc = previewDoc();
    if (!doc) return;
    const apply = () => {
      doc.documentElement.classList.toggle("dark", dark);
      doc.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    const win = doc.defaultView;
    const media = win?.matchMedia("(prefers-color-scheme: dark)");
    win?.addEventListener("storage", apply);
    media?.addEventListener("change", apply);
    return () => {
      win?.removeEventListener("storage", apply);
      media?.removeEventListener("change", apply);
    };
  }, [dark, previewDoc, loadedAt]);

  useEffect(() => {
    if (!selectedSlug) return;
    const doc = previewDoc();
    const target =
      doc?.querySelector(`[data-builder-section="${CSS.escape(selectedSlug)}"]`) ??
      doc?.getElementById(selectedSlug);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSlug, previewDoc, loadedAt]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el || mode !== "select") return;
    const onWheel = (e: WheelEvent) => {
      const win = previewDoc()?.defaultView;
      if (!win) return;
      e.preventDefault();
      win.scrollBy(e.deltaX, e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mode, previewDoc]);

  const sectionAt = useCallback(
    (clientX: number, clientY: number) => {
      const doc = previewDoc();
      const stage = stageRef.current;
      if (!doc || !stage) return null;
      const box = stage.getBoundingClientRect();
      const x = (clientX - box.left) / scale;
      const y = (clientY - box.top) / scale;
      const el = sectionElement(doc.elementFromPoint(x, y));
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        slug: sectionSlug(el),
        top: rect.top * scale,
        left: rect.left * scale,
        width: rect.width * scale,
        height: rect.height * scale,
      };
    },
    [previewDoc, scale],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-3 py-2">
        <div className="inline-flex rounded-md border bg-background p-0.5" role="group" aria-label="Preview width">
          {(Object.keys(DEVICE_WIDTH) as PreviewDevice[]).map((d) => {
            const Icon = DEVICE_ICON[d];
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                aria-pressed={device === d}
                aria-label={d}
                title={`${d} (${DEVICE_WIDTH[d]}px)`}
                className={`inline-flex h-7 w-8 items-center justify-center rounded transition-colors ${
                  device === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="inline-flex rounded-md border bg-background p-0.5" role="group" aria-label="Preview language">
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onLocaleChange(code)}
              aria-pressed={locale === code}
              className={`h-7 rounded px-2 text-xs font-medium transition-colors ${
                locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {LOCALE_LABEL[code]}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={() => setMode((m) => (m === "select" ? "interact" : "select"))}
          aria-pressed={mode === "select"}
          title={
            mode === "select"
              ? "Selecting sections. Switch to use the page's own buttons."
              : "Using the page. Switch back to select sections."
          }
        >
          {mode === "select" ? (
            <><MousePointerSquareDashed className="mr-1.5 h-3.5 w-3.5" />Select</>
          ) : (
            <><Hand className="mr-1.5 h-3.5 w-3.5" />Interact</>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => setDark((d) => !d)}
          aria-pressed={dark}
          aria-label={dark ? "Preview in light mode" : "Preview in dark mode"}
        >
          {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={reloadFrame}
          aria-label="Reload preview"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {width}px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
        </span>
      </div>

      <div ref={paneRef} className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3">
        <div
          ref={stageRef}
          className="relative mx-auto bg-background shadow-sm ring-1 ring-border"
          style={{ width: width * scale, height: `calc(100vh - 15rem)` }}
        >
          <iframe
            ref={frameRef}
            src={src}
            title={title}
            onLoad={() => setLoadedAt(Date.now())}
            className="origin-top-left border-0"
            style={{ width, height: `calc((100vh - 15rem) / ${scale})`, transform: `scale(${scale})` }}
          />

          {mode === "select" && (
            <div
              ref={overlayRef}
              className="absolute inset-0 z-10 cursor-pointer"
              onMouseMove={(e) => {
                const next = sectionAt(e.clientX, e.clientY);
                setHovered((prev) =>
                  prev && next && prev.slug === next.slug && prev.top === next.top && prev.height === next.height
                    ? prev
                    : next,
                );
              }}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => {
                const hit = sectionAt(e.clientX, e.clientY);
                if (hit?.slug) onSelect(hit.slug);
              }}
            >
              {hovered && (
                <div
                  className="pointer-events-none absolute rounded-sm ring-2 ring-primary/70"
                  style={{
                    top: hovered.top,
                    left: hovered.left,
                    width: hovered.width,
                    height: hovered.height,
                  }}
                >
                  <span className="absolute left-0 top-0 rounded-br-sm bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    {hovered.slug}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
