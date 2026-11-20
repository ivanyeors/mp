"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { JOURNEY_TONE_LABEL, type JourneyTone } from "@/lib/crm/journey/chapters";
import { cn } from "@/lib/utils";

export type MapStop = {
    id: string;
    title: string;
    when: string;
    tone: JourneyTone;
    kind: "past" | "now" | "next";
    dimmed?: boolean;
    count?: number;
};

const TONE_Y: Record<JourneyTone, number> = { good: 34, steady: 82, care: 130 };
const TONE_VAR: Record<JourneyTone, string> = {
    good: "var(--j-good)",
    steady: "var(--j-steady)",
    care: "var(--j-care)",
};
const PLOT_HEIGHT = 164;
const AXIS_Y = 156;
const MIN_COL = 88;
const LEVELS: JourneyTone[] = ["good", "steady", "care"];

function curve(points: ReadonlyArray<{ x: number; y: number }>): string {
    if (points.length === 0) return "";
    let d = `M ${points[0]!.x} ${points[0]!.y}`;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const mid = (a.x + b.x) / 2;
        d += ` C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;
    }
    return d;
}

export function JourneyMap({
    stops,
    gaps,
    selectedId,
    onSelect,
}: {
    stops: MapStop[];
    gaps: Array<string | null>;
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const measure = () => setWidth(el.clientWidth);
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const col = stops.length ? Math.max(MIN_COL, width / stops.length) : MIN_COL;
    const total = col * stops.length;
    const x = (i: number) => col * i + col / 2;

    const stopCount = stops.length;
    useEffect(() => {
        const el = scroller.current;
        if (el && width > 0) el.scrollLeft = el.scrollWidth;
    }, [stopCount, width]);

    const points = stops.map((s, i) => ({ x: x(i), y: TONE_Y[s.tone] }));
    const solid = points.filter((_, i) => stops[i]!.kind !== "next");
    const nextIndex = stops.findIndex((s) => s.kind === "next");
    const area =
        solid.length > 1 ? `${curve(solid)} L ${solid[solid.length - 1]!.x} ${AXIS_Y} L ${solid[0]!.x} ${AXIS_Y} Z` : "";

    return (
        <div
            className={cn(
                "flex",
                "[--j-good:var(--color-emerald-500)] [--j-steady:var(--color-slate-400)] [--j-care:var(--color-orange-500)]",
                "dark:[--j-good:var(--color-emerald-400)] dark:[--j-steady:var(--color-slate-500)] dark:[--j-care:var(--color-orange-400)]",
            )}
        >
            <div aria-hidden className="relative w-24 shrink-0 max-md:hidden">
                {LEVELS.map((tone) => (
                    <span
                        key={tone}
                        className="absolute right-2 -translate-y-1/2 text-[11px] leading-none whitespace-nowrap text-muted-foreground"
                        style={{ top: TONE_Y[tone] }}
                    >
                        {JOURNEY_TONE_LABEL[tone]}
                    </span>
                ))}
            </div>

            <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
                <div className="relative" style={{ width: width > 0 ? total : "100%", minWidth: "100%" }}>
                    {width > 0 ? (
                        <svg
                            aria-hidden
                            width={total}
                            height={PLOT_HEIGHT}
                            className="pointer-events-none absolute top-0 left-0 z-[1]"
                        >
                            <defs>
                                <linearGradient id="journey-line" gradientUnits="userSpaceOnUse" x1="0" y1={TONE_Y.good} x2="0" y2={TONE_Y.care}>
                                    <stop offset="0" stopColor="var(--j-good)" />
                                    <stop offset="0.5" stopColor="var(--j-steady)" />
                                    <stop offset="1" stopColor="var(--j-care)" />
                                </linearGradient>
                                <linearGradient id="journey-area" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" stopColor="var(--j-steady)" stopOpacity="0.16" />
                                    <stop offset="1" stopColor="var(--j-steady)" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {LEVELS.map((tone) => (
                                <line
                                    key={tone}
                                    x1="0"
                                    x2={total}
                                    y1={TONE_Y[tone]}
                                    y2={TONE_Y[tone]}
                                    stroke="var(--border)"
                                    strokeDasharray="2 6"
                                />
                            ))}
                            <line x1="0" x2={total} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--border)" />
                            {area ? <path d={area} fill="url(#journey-area)" /> : null}
                            {solid.length > 1 ? (
                                <path d={curve(solid)} fill="none" stroke="url(#journey-line)" strokeWidth="3" strokeLinecap="round" />
                            ) : null}
                            {nextIndex > 0 ? (
                                <path
                                    d={curve([points[nextIndex - 1]!, points[nextIndex]!])}
                                    fill="none"
                                    stroke="var(--muted-foreground)"
                                    strokeWidth="2"
                                    strokeDasharray="3 6"
                                    strokeLinecap="round"
                                    opacity="0.7"
                                />
                            ) : null}
                            {stops.map((s, i) => {
                                const selected = s.id === selectedId;
                                const p = points[i]!;
                                return (
                                    <g key={s.id} opacity={s.dimmed ? 0.35 : 1}>
                                        <line x1={p.x} x2={p.x} y1={p.y} y2={AXIS_Y} stroke="var(--border)" />
                                        {s.kind === "now" ? (
                                            <circle cx={p.x} cy={p.y} r="13" fill="none" stroke={TONE_VAR[s.tone]} strokeWidth="2" opacity="0.35" className="motion-safe:animate-pulse" />
                                        ) : null}
                                        <circle
                                            cx={p.x}
                                            cy={p.y}
                                            r={selected ? 9 : 7}
                                            fill={s.kind === "next" ? "var(--card)" : TONE_VAR[s.tone]}
                                            stroke={s.kind === "next" ? "var(--muted-foreground)" : "var(--card)"}
                                            strokeWidth={s.kind === "next" ? 2 : 3}
                                            strokeDasharray={s.kind === "next" ? "3 3" : undefined}
                                        />
                                        {selected ? (
                                            <circle cx={p.x} cy={p.y} r="13" fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
                                        ) : null}
                                    </g>
                                );
                            })}
                        </svg>
                    ) : null}

                    {width > 0
                        ? gaps.map((gap, i) =>
                              gap && i < stops.length - 1 ? (
                                  <span
                                      key={`${stops[i]!.id}-gap`}
                                      aria-hidden
                                      className="pointer-events-none absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border bg-card px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap text-muted-foreground"
                                      style={{ left: col * (i + 1), top: AXIS_Y }}
                                  >
                                      {gap}
                                  </span>
                              ) : null,
                          )
                        : null}

                    <ol className="relative flex" aria-label="Chapters, oldest first">
                        {stops.map((s, i) => {
                            const selected = s.id === selectedId;
                            const before = i > 0 ? gaps[i - 1] : null;
                            return (
                                <li key={s.id} style={{ width: width > 0 ? col : `${100 / stops.length}%` }} className="shrink-0">
                                    <button
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={`${s.title}, ${s.when}. ${JOURNEY_TONE_LABEL[s.tone]}${
                                            s.count ? `, ${s.count} ${s.count === 1 ? "entry" : "entries"}` : ""
                                        }${before ? `. ${before} after the chapter before` : ""}`}
                                        onClick={() => onSelect(s.id)}
                                        className={cn(
                                            "flex w-full flex-col items-center rounded-lg px-1.5 pb-2 text-center outline-none transition-colors",
                                            "hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-press",
                                            selected && "bg-muted/60",
                                            s.dimmed && "opacity-50",
                                        )}
                                        style={{ paddingTop: PLOT_HEIGHT + 6 }}
                                    >
                                        <span className={cn("line-clamp-2 text-xs leading-tight font-medium", s.kind === "next" && "text-muted-foreground")}>
                                            {s.title}
                                        </span>
                                        <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{s.when}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </div>
        </div>
    );
}
