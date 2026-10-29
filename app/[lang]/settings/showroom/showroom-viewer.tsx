"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ZONE_TINTS, legendSwatches } from "@/lib/showroom/describe";
import type { ShowroomUnit } from "@/lib/showroom/types";
// Types only: three.js itself loads with the scene, after the page is up.
import type { PickInfo, SceneOptions, ShowroomScene } from "./showroom-scene";
import { InfoTip } from "@/components/ui/info-tip";

type Toggles = Omit<SceneOptions, "dark" | "mode">;

const SHOW: { key: keyof Toggles; label: string }[] = [
  { key: "labels", label: "Room labels" },
  { key: "dims", label: "Dimensions" },
  { key: "shadows", label: "Shadows" },
  { key: "grid", label: "Floor grid" },
];

const VIEW_HEIGHT = "h-[62svh] min-h-[340px] lg:h-[calc(100svh-13rem)] lg:min-h-[520px]";

const rgbCss = ([r, g, b]: readonly number[]) => `rgb(${r} ${g} ${b})`;

export function ShowroomViewer({ unit }: { unit: ShowroomUnit }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ShowroomScene | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [pick, setPick] = useState<PickInfo | null>(null);
  const [mode, setMode] = useState<SceneOptions["mode"]>("materials");
  const [toggles, setToggles] = useState<Toggles>({
    cutaway: false, labels: true, dims: true, shadows: true, grid: true,
  });
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  // The scene reads the latest options when it finishes loading.
  const optsRef = useRef<SceneOptions>({ ...toggles, mode, dark });
  useEffect(() => {
    optsRef.current = { ...toggles, mode, dark };
    sceneRef.current?.update(optsRef.current);
  }, [toggles, mode, dark]);

  useEffect(() => {
    let cancelled = false;
    let scene: ShowroomScene | null = null;
    import("./showroom-scene")
      .then(({ createShowroomScene }) => {
        if (cancelled || !hostRef.current || !overlayRef.current) return;
        scene = createShowroomScene(hostRef.current, overlayRef.current, unit, optsRef.current, setPick);
        sceneRef.current = scene;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [unit]);

  const swatches = mode === "zones"
    ? unit.zoneNames.map((label, i) => ({ label, rgb: ZONE_TINTS[i % ZONE_TINTS.length] }))
    : legendSwatches(unit);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h1>Showroom model</h1>
          <InfoTip label="About Showroom model">
            <p>Drag to look around, tap a wall or pane to see its size.</p>
          </InfoTip>
        </div>
        <p className="text-muted-foreground mt-2">
          {unit.title}, {unit.subtitle}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border bg-[#dde2dd] dark:bg-[#1a1f23]",
            VIEW_HEIGHT,
          )}
        >
          <div
            ref={hostRef}
            tabIndex={0}
            role="application"
            aria-label={`3D model of ${unit.title}. Drag to orbit, W A S D or arrow keys to walk.`}
            className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
          <div ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
          {status === "loading" ? (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {status === "failed" ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
              This browser could not start 3D graphics. Try another browser, or turn on hardware acceleration.
            </div>
          ) : null}
        </div>

        <aside
          aria-label="Model settings"
          className={cn("space-y-5 rounded-xl border bg-card p-4 lg:overflow-y-auto", "lg:h-[calc(100svh-13rem)] lg:min-h-[520px]")}
        >
          <Section title="View">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => sceneRef.current?.resetView()}
              disabled={status !== "ready"}
            >
              <RotateCcw />
              Reset view
            </Button>
            <div role="group" aria-label="Colour by" className="grid grid-cols-2 rounded-lg border p-0.5">
              {(["materials", "zones"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors max-md:min-h-11",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mode === m ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent active:bg-press",
                  )}
                >
                  {m === "materials" ? "Materials" : "Zones"}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Show">
            {SHOW.map(({ key, label }) => (
              <ToggleRow
                key={key}
                id={`showroom-${key}`}
                label={label}
                checked={toggles[key]}
                onChange={(v) => setToggles((t) => ({ ...t, [key]: v }))}
              />
            ))}
            <ToggleRow
              id="showroom-cutaway"
              label={unit.cutaway.label}
              hint={unit.cutaway.hint}
              checked={toggles.cutaway}
              onChange={(v) => setToggles((t) => ({ ...t, cutaway: v }))}
            />
          </Section>

          <Section title="Selected part">
            <div aria-live="polite" className="rounded-lg border bg-background p-3 text-sm">
              {pick ? (
                <div className="space-y-1">
                  <p className="font-medium">{pick.label}</p>
                  {pick.facts.map((f) => (
                    <p key={f} className="text-xs tabular-nums">{f}</p>
                  ))}
                  {pick.zone ? <p className="text-xs text-muted-foreground">Zone: {pick.zone}</p> : null}
                  {pick.note ? <p className="text-xs text-muted-foreground">{pick.note}</p> : null}
                </div>
              ) : (
                <p className="text-muted-foreground">Hover or tap a wall, column or pane.</p>
              )}
            </div>
          </Section>

          <Section title="Key">
            <ul className="space-y-1.5 text-sm">
              {swatches.map(({ label, rgb }) => (
                <li key={label} className="flex min-w-0 items-center gap-2">
                  <span className="size-3.5 shrink-0 rounded-sm border border-foreground/20" style={{ background: rgbCss(rgb) }} />
                  <span className="min-w-0">{label}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Measurements">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {unit.figures.map(({ label, value }) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Moving around">
            {/* A touch screen has no keys, right button or scroll wheel: show it only the gestures. */}
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li className="pointer-coarse:hidden">Drag to orbit. Right-drag or two fingers to slide along the floor.</li>
              <li className="hidden pointer-coarse:list-item">Drag to orbit. Two fingers to slide along the floor.</li>
              <li className="pointer-coarse:hidden">Scroll or pinch to zoom towards the pointer.</li>
              <li className="hidden pointer-coarse:list-item">Pinch to zoom.</li>
              <li className="pointer-coarse:hidden">W A S D or arrow keys to walk, E and Q to rise and sink, Shift to hurry.</li>
            </ul>
          </Section>

          <Section title="Notes">
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {unit.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 max-md:min-h-11 max-md:items-center">
      <label
        htmlFor={id}
        className="min-w-0 cursor-pointer text-sm max-md:flex max-md:min-h-11 max-md:flex-1 max-md:flex-col max-md:justify-center max-md:active:opacity-60"
      >
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}
