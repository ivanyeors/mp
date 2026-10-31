"use client";

import type { CSSProperties } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JOURNEY_HERE_MEANS, JOURNEY_STAGES, type JourneyStage, type JourneyStep } from "@/lib/customer-migration/journey";
import { cn } from "@/lib/utils";

/**
 * The Shopify migration as one funnel (owner, 2026-10-31). Each row is a
 * **Journey stage**; its bar is everyone who reached it, drawn against all
 * imported, in three parts:
 *
 *   went further  the light step: exactly the next row's bar, so the bars
 *                 step down like a staircase and each row's dark tail is
 *                 where people stopped;
 *   here now      the dark step: at this stage, and no further;
 *   can't email   gray: here now, but unsubscribed, bounced or marked as
 *                 spam, so no campaign email will move them.
 *
 * One hue, two steps (validated as an ordinal ramp in both modes, adjacent
 * ΔE ≥ 18) and a de-emphasis gray. The figures beside each bar are the
 * table view: nothing is read from the colours or the tooltip alone.
 */

/** Light: ramp 250 / 450 and a gray. Dark: ramp 600 / 400 and a darker gray. */
export const JOURNEY_PALETTE_CLASS =
    "[--journey-further:#86b6ef] [--journey-here:#2a78d6] [--journey-out:#9b9a96] " +
    "dark:[--journey-further:#184f95] dark:[--journey-here:#3987e5] dark:[--journey-out:#6b6a66]";

type SegmentKind = "further" | "here" | "out" | "track";

const SEGMENT_FILL: Record<SegmentKind, string> = {
    further: "bg-[var(--journey-further)]",
    here: "bg-[var(--journey-here)]",
    out: "bg-[var(--journey-out)]",
    track: "bg-muted",
};

export const SEGMENT_LABEL: Record<Exclude<SegmentKind, "track">, string> = {
    here: "Here now",
    further: "Went further",
    out: "Here, can't be emailed",
};

export interface BarSegment {
    kind: SegmentKind;
    /** Fractions of everyone imported. */
    from: number;
    to: number;
}

/**
 * The bar's parts, left to right, leaving out the empty ones. Went further
 * comes first so it lines up with the next row's bar.
 */
export function barSegments(step: Pick<JourneyStep, "wentFurther" | "here" | "unreachable" | "reached" | "total">): BarSegment[] {
    const { total } = step;
    if (total <= 0) return [{ kind: "track", from: 0, to: 1 }];
    const parts: [SegmentKind, number][] = [
        ["further", step.wentFurther],
        ["here", step.here - step.unreachable],
        ["out", step.unreachable],
        ["track", total - step.reached],
    ];
    const segments: BarSegment[] = [];
    let at = 0;
    for (const [kind, value] of parts) {
        if (value <= 0) continue;
        segments.push({ kind, from: at / total, to: (at + value) / total });
        at += value;
    }
    return segments;
}

const GAP_PX = 2;
const MIN_PX = 2;

/**
 * Where a part sits, in CSS. A 2px gap in the card's colour follows every part
 * but the last. A part never draws thinner than 2px, so one customer still
 * shows; it pushes the parts after it along rather than hiding under them.
 */
function segmentStyle(s: BarSegment, index: number, last: boolean): CSSProperties {
    const pct = (v: number) => `${(v * 100).toFixed(4)}%`;
    return {
        left: index === 0 ? 0 : `max(${pct(s.from)}, ${index * (MIN_PX + GAP_PX)}px)`,
        right: last ? 0 : `calc(${pct(1 - s.to)} + ${GAP_PX}px)`,
        minWidth: MIN_PX,
    };
}

const n = (v: number) => v.toLocaleString("en-SG");

function JourneyBar({ step, note }: { step: JourneyStep; note?: string }) {
    const segments = barSegments(step);
    const lastData = segments.filter((s) => s.kind !== "track").length - 1;
    // The second stage's step before is everyone imported: say it once.
    const ofPrevious = step.ofPrevious && step.stage !== JOURNEY_STAGES[1] ? `, ${step.ofPrevious} of ${step.previousLabel}` : "";
    const summary =
        `${step.label}: ${n(step.reached)} reached, ${step.ofTotal} of imported` +
        ofPrevious +
        `. ${n(step.here)} here now` +
        (step.unreachable > 0 ? `, ${n(step.unreachable)} of them can't be emailed` : "") +
        `; ${n(step.wentFurther)} went further.`;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    role="img"
                    aria-label={summary}
                    tabIndex={0}
                    className="relative h-5 w-full rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                    {segments.map((s, i) => (
                        <span
                            key={s.kind}
                            data-segment={s.kind}
                            className={cn(
                                "absolute inset-y-0 transition-[filter]",
                                SEGMENT_FILL[s.kind],
                                // Square at the baseline, a 4px round on the data end and on the track's end.
                                (i === lastData || s.kind === "track") && "rounded-r-[4px]",
                                s.kind === "track" && i === 0 && "rounded-l-[4px]",
                            )}
                            style={segmentStyle(s, i, i === segments.length - 1)}
                        />
                    ))}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-72 space-y-1 text-left leading-relaxed">
                <p className="font-medium">
                    {step.label}: {n(step.reached)} reached
                </p>
                <p>
                    {step.ofTotal} of imported{ofPrevious}.
                    {step.didStep ? ` ${step.didStep}; ${n(step.skipped)} skipped this step.` : ""}
                </p>
                <p>
                    {n(step.here)} here now{step.stage === "ordered" ? "" : `: ${JOURNEY_HERE_MEANS[step.stage]}`}.
                    {step.unreachable > 0 ? ` ${n(step.unreachable)} of them can't be emailed.` : ""}
                    {step.wentFurther > 0 ? ` ${n(step.wentFurther)} went further.` : ""}
                </p>
                {note ? <p>{note}</p> : null}
            </TooltipContent>
        </Tooltip>
    );
}

function Swatch({ kind }: { kind: Exclude<SegmentKind, "track"> }) {
    return <span className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", SEGMENT_FILL[kind])} aria-hidden />;
}

export function JourneyLegend({ className, showOut }: { className?: string; showOut: boolean }) {
    // In the bar's order, left to right.
    const kinds: Exclude<SegmentKind, "track">[] = showOut ? ["further", "here", "out"] : ["further", "here"];
    return (
        <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
            {kinds.map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                    <Swatch kind={k} />
                    {SEGMENT_LABEL[k]}
                </li>
            ))}
        </ul>
    );
}

const ROW_GRID =
    "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 " +
    "@4xl:grid-cols-[11rem_minmax(0,1fr)_6.5rem_7.5rem_9.5rem] @4xl:items-center @4xl:gap-x-5 @4xl:gap-y-0";

/**
 * The funnel. Below a 56rem card, each row stacks: name and reach, the bar,
 * then the conversion and who is here; from 56rem it is a table with the bar
 * in the middle.
 */
export function MigrationJourney({
    steps,
    notes = {},
}: {
    steps: JourneyStep[];
    /** One more line for a stage's tooltip, e.g. how many had an account before import. */
    notes?: Partial<Record<JourneyStage, string>>;
}) {
    const showOut = steps.some((s) => s.unreachable > 0);
    return (
        <div className={cn("@container", JOURNEY_PALETTE_CLASS)}>
            <JourneyLegend showOut={showOut} className="mb-3 @4xl:hidden" />
            <div
                className={cn(ROW_GRID, "hidden pb-2 text-xs text-muted-foreground @4xl:grid")}
                aria-hidden
            >
                <span>Stage</span>
                <JourneyLegend showOut={showOut} />
                <span className="text-right">Reached</span>
                <span className="text-right">Of the step before</span>
                <span className="text-right">Here now</span>
            </div>
            <ol className="divide-y divide-border/60 @4xl:divide-y-0" aria-label="Shopify migration journey">
                {steps.map((step) => (
                    <li
                        key={step.stage}
                        data-stage={step.stage}
                        className={cn(ROW_GRID, "py-2.5 first:pt-0 last:pb-0 @4xl:py-1.5 @4xl:first:pt-1.5")}
                    >
                        <div className="col-start-1 row-start-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">{step.label}</p>
                            <p className="hidden text-xs text-muted-foreground @md:block">{step.rule}</p>
                        </div>
                        <div className="col-span-2 row-start-2 @4xl:col-span-1 @4xl:col-start-2 @4xl:row-start-1">
                            <JourneyBar step={step} note={notes[step.stage]} />
                        </div>
                        <div className="col-start-2 row-start-1 text-right tabular-nums @4xl:col-start-3">
                            <p className="text-sm font-semibold leading-tight">
                                {n(step.reached)}
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground @4xl:hidden">{step.ofTotal}</span>
                            </p>
                            <p className="hidden text-xs text-muted-foreground @4xl:block">
                                {step.skipped > 0 ? `${step.ofTotal} · ${n(step.skipped)} skipped it` : `${step.ofTotal} of imported`}
                            </p>
                        </div>
                        <div className="hidden text-right text-sm tabular-nums @4xl:col-start-4 @4xl:row-start-1 @4xl:block">
                            {step.ofPrevious ? (
                                <>
                                    <p className="leading-tight">{step.ofPrevious}</p>
                                    <p className="text-xs text-muted-foreground">of {step.previousLabel}</p>
                                </>
                            ) : (
                                <p className="text-muted-foreground">–</p>
                            )}
                        </div>
                        <div className="hidden text-right text-sm tabular-nums @4xl:col-start-5 @4xl:row-start-1 @4xl:block">
                            <p className="leading-tight">{n(step.here)}</p>
                            {step.unreachable > 0 ? (
                                <p className="text-xs text-muted-foreground">{n(step.unreachable)} can&apos;t be emailed</p>
                            ) : null}
                        </div>
                        <p className="col-span-2 row-start-3 text-xs text-muted-foreground tabular-nums @4xl:hidden">
                            {[
                                step.ofPrevious ? `${step.ofPrevious} of ${step.previousLabel}` : null,
                                step.skipped > 0 ? `${n(step.skipped)} skipped it` : null,
                                `${n(step.here)} here now`,
                                step.unreachable > 0 ? `${n(step.unreachable)} can't be emailed` : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </li>
                ))}
            </ol>
        </div>
    );
}
