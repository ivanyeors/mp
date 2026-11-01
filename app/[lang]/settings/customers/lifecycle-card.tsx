"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LifecycleStage } from "@/lib/crm/lifecycle-stage";
import {
    lifecycleStageOf,
    type LifecyclePart,
    type LifecyclePartKey,
    type LifecycleShade,
    type LifecycleStageSummary,
    type LifecycleSummary,
} from "@/lib/crm/lifecycle-summary";
import { cn } from "@/lib/utils";
import { UNDATED_TITLE } from "./lifecycle-stage-badge";
import { stackedPartStyle } from "./stacked-bar";

/**
 * The Customer lifecycle on the Customers page (owner, 2026-10-31): one chart
 * of every Customer's **Lifecycle stage** and the sub-status within it. Each
 * row is a stage, in funnel order *Lead > New > Loyal > At risk > Lost*; its
 * bar is the stage's share of all Customers, split into its sub-statuses.
 * Choosing a row filters the list below to that stage.
 *
 * Colour: each stage keeps its badge's hue (blue New, green Loyal, amber At
 * risk, red Lost; Lead recedes in gray), and a stage's sub-statuses are an
 * ordinal ramp of that hue, more ink further along. Every ramp is validated
 * (monotone lightness, visible steps, light end ≥ 2:1) on the card in both
 * modes. Hatching marks *no dates yet*: placed by the Shopify-era order count.
 * The counts beside and under each bar are the table view: nothing is read
 * from colour alone.
 */

/** The CSS name of a stage's hue (Tailwind reads `_` in a class as a space). */
const HUE: Record<LifecycleStage, string> = { lead: "lead", new: "new", loyal: "loyal", at_risk: "risk", lost: "lost" };

export const LIFECYCLE_PALETTE_CLASS =
    "[--lc-lead-3:#9b9a96] [--lc-new-1:#86b6ef] [--lc-new-2:#3987e5] [--lc-new-3:#1c5cab] " +
    "[--lc-loyal-1:#10b981] [--lc-loyal-3:#047857] [--lc-risk-1:#eda100] [--lc-risk-3:#a35c00] [--lc-lost-3:#e34948] " +
    "dark:[--lc-lead-3:#6b6a66] dark:[--lc-new-1:#184f95] dark:[--lc-new-2:#2a78d6] dark:[--lc-new-3:#6da7ec] " +
    "dark:[--lc-loyal-1:#047857] dark:[--lc-loyal-3:#34d399] dark:[--lc-risk-1:#a16207] dark:[--lc-risk-3:#fbbf24] dark:[--lc-lost-3:#e66767]";

const colour = (stage: LifecycleStage, shade: LifecycleShade) => `var(--lc-${HUE[stage]}-${shade})`;

function fill(stage: LifecycleStage, shade: LifecycleShade, hatched: boolean): CSSProperties {
    const c = colour(stage, shade);
    return hatched
        ? { background: `repeating-linear-gradient(135deg, ${c} 0 2px, color-mix(in oklab, ${c} 30%, transparent) 2px 5px)` }
        : { background: c };
}

export interface LifecycleBarPart {
    /** The sub-status, or `track` for the rest of the Customers. */
    key: LifecyclePartKey | "track";
    shade: LifecycleShade;
    /** *No dates yet*. */
    hatched: boolean;
    /** Fractions of every Customer. */
    from: number;
    to: number;
}

/**
 * A stage's bar, left to right: each sub-status, its dated Customers then
 * those with no dates yet, then the empty track. Empty parts are left out.
 */
export function lifecycleBarParts(stage: Pick<LifecycleStageSummary, "parts" | "customers">, total: number): LifecycleBarPart[] {
    if (total <= 0) return [{ key: "track", shade: 1, hatched: false, from: 0, to: 1 }];
    const out: LifecycleBarPart[] = [];
    let at = 0;
    const push = (key: LifecycleBarPart["key"], shade: LifecycleShade, hatched: boolean, value: number) => {
        if (value <= 0) return;
        out.push({ key, shade, hatched, from: at / total, to: (at + value) / total });
        at += value;
    };
    for (const p of stage.parts) {
        push(p.key, p.shade, false, p.customers - p.undated);
        push(p.key, p.shade, true, p.undated);
    }
    push("track", 1, false, total - stage.customers);
    return out;
}

const n = (v: number) => v.toLocaleString("en-SG");

/** The parts a row names under its bar: the stage's sub-statuses with anyone in them. */
function namedParts(row: LifecycleStageSummary): LifecyclePart[] {
    return row.parts.length > 1 ? row.parts.filter((p) => p.customers > 0) : [];
}

/** "With no dates yet" beside the sub-statuses, where it is not one of them (Loyal). */
function undatedWithin(row: LifecycleStageSummary): number {
    return row.parts.filter((p) => !p.undatedPart).reduce((t, p) => t + p.undated, 0);
}

/** The row as one sentence: the link's name, and what the tooltip says first. */
export function lifecycleRowSummary(row: LifecycleStageSummary): string {
    const parts = namedParts(row).map((p) => `${p.label} ${n(p.customers)}`);
    const within = undatedWithin(row);
    return (
        `${row.label}: ${n(row.customers)} customer${row.customers === 1 ? "" : "s"}, ${row.share} of all.` +
        (parts.length ? ` ${parts.join(", ")}.` : "") +
        (within > 0 ? ` ${n(within)} with no dates yet.` : "")
    );
}

function Swatch({ stage, shade, hatched }: { stage: LifecycleStage; shade: LifecycleShade; hatched: boolean }) {
    return <span className="inline-block size-2.5 shrink-0 rounded-[2px]" style={fill(stage, shade, hatched)} aria-hidden />;
}

function LifecycleBar({ row, total }: { row: LifecycleStageSummary; total: number }) {
    const parts = lifecycleBarParts(row, total);
    const lastData = parts.filter((p) => p.key !== "track").length - 1;
    const named = namedParts(row);
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="relative h-5 w-full rounded-[4px]" aria-hidden>
                    {parts.map((p, i) => (
                        <span
                            key={`${p.key}-${p.hatched}`}
                            data-part={p.key}
                            data-hatched={p.hatched || undefined}
                            className={cn(
                                "absolute inset-y-0",
                                p.key === "track" && "bg-muted",
                                // Square at the baseline, a 4px round on the data end and on the track's end.
                                (i === lastData || p.key === "track") && "rounded-r-[4px]",
                                p.key === "track" && i === 0 && "rounded-l-[4px]",
                            )}
                            style={{
                                ...stackedPartStyle(p, i, i === parts.length - 1),
                                ...(p.key === "track" ? {} : fill(row.stage, p.shade, p.hatched)),
                            }}
                        />
                    ))}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-80 space-y-1 text-left leading-relaxed">
                <p className="font-medium">
                    {row.label}: {n(row.customers)} customer{row.customers === 1 ? "" : "s"}, {row.share} of all
                </p>
                <p>{row.rule}.</p>
                {named.length ? (
                    <ul className="space-y-0.5">
                        {named.map((p) => (
                            <li key={p.key}>
                                <span className="font-medium">
                                    {p.label} {n(p.customers)}
                                </span>
                                : {p.means}
                                {p.undated > 0 && !p.undatedPart ? `; ${n(p.undated)} with no dates yet` : ""}.
                            </li>
                        ))}
                    </ul>
                ) : null}
                {row.undated > 0 ? <p>No dates yet: {UNDATED_TITLE}</p> : null}
            </TooltipContent>
        </Tooltip>
    );
}

/** Under the bar: each sub-status with anyone in it, then those with no dates yet within them. */
function PartsLegend({ row }: { row: LifecycleStageSummary }) {
    const named = namedParts(row);
    const within = undatedWithin(row);
    if (!named.length && !within) return null;
    return (
        <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
            {named.map((p) => (
                <li key={p.key} className="inline-flex items-center gap-1.5">
                    <Swatch stage={row.stage} shade={p.shade} hatched={Boolean(p.undatedPart)} />
                    {p.label} {n(p.customers)}
                </li>
            ))}
            {within > 0 ? (
                <li className="inline-flex items-center gap-1.5">
                    <Swatch stage={row.stage} shade={3} hatched />
                    {n(within)} with no dates yet
                </li>
            ) : null}
        </ul>
    );
}

const ROW_GRID =
    "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 " +
    "@4xl:grid-cols-[15rem_minmax(0,1fr)_5.5rem_4rem] @4xl:items-start @4xl:gap-x-5 @4xl:gap-y-0";

/**
 * The chart. Below a 56rem card each row stacks: the stage and its count, the
 * bar, then its sub-statuses; from 56rem it is a table with the bar in the
 * middle.
 */
export function LifecycleChart({
    summary,
    activeStage,
    stageHref,
    onChooseStage,
}: {
    summary: LifecycleSummary;
    /** The stage the list is filtered to, alone; its row reads as chosen. */
    activeStage: LifecycleStage | null;
    stageHref: (stage: LifecycleStage) => string;
    onChooseStage: (stage: LifecycleStage) => void;
}) {
    const anyUndated = summary.stages.some((s) => s.undated > 0);
    return (
        <div className={cn("@container", LIFECYCLE_PALETTE_CLASS)}>
            <div className={cn(ROW_GRID, "hidden px-2 pb-1.5 text-xs text-muted-foreground @4xl:grid")} aria-hidden>
                <span>Stage</span>
                <span>Share of all customers</span>
                <span className="text-right">Customers</span>
                <span className="text-right">Of all</span>
            </div>
            <ol className="-mx-2 space-y-0.5" aria-label="Customer lifecycle">
                {summary.stages.map((row) => {
                    const active = activeStage === row.stage;
                    return (
                        <li key={row.stage} data-stage={row.stage}>
                            <a
                                href={stageHref(row.stage)}
                                onClick={(e) => {
                                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                                    e.preventDefault();
                                    onChooseStage(row.stage);
                                }}
                                aria-label={`${lifecycleRowSummary(row)} ${active ? "Showing them in the list; choose again to show everyone." : "Show them in the list."}`}
                                aria-current={active ? "true" : undefined}
                                className={cn(
                                    ROW_GRID,
                                    "rounded-md px-2 py-2 outline-none transition-colors hover:bg-muted/60 active:bg-press focus-visible:ring-2 focus-visible:ring-ring",
                                    active && "bg-muted ring-1 ring-border",
                                )}
                            >
                                <div className="col-start-1 row-start-1 min-w-0">
                                    <p className="flex items-center gap-2 text-sm font-medium leading-tight">
                                        <span
                                            className="size-2.5 shrink-0 rounded-full"
                                            style={{ background: colour(row.stage, 3) }}
                                            aria-hidden
                                        />
                                        {row.label}
                                    </p>
                                    <p className="mt-0.5 hidden pl-[18px] text-xs text-muted-foreground @md:block">{row.rule}</p>
                                </div>
                                <div className="col-span-2 row-start-2 @4xl:col-span-1 @4xl:col-start-2 @4xl:row-start-1">
                                    <LifecycleBar row={row} total={summary.total} />
                                    <PartsLegend row={row} />
                                </div>
                                <p className="col-start-2 row-start-1 text-right text-sm font-semibold leading-tight tabular-nums @4xl:col-start-3">
                                    {n(row.customers)}
                                    <span className="ml-1.5 text-xs font-normal text-muted-foreground @4xl:hidden">{row.share}</span>
                                </p>
                                <p className="hidden text-right text-sm leading-tight tabular-nums @4xl:col-start-4 @4xl:row-start-1 @4xl:block">
                                    {row.share}
                                </p>
                            </a>
                        </li>
                    );
                })}
            </ol>
            {anyUndated ? (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="mt-0.5 inline-block size-2.5 shrink-0 rounded-[2px]" style={fill("lead", 3, true)} aria-hidden />
                    <span>
                        Hatched: no dates yet. {UNDATED_TITLE} Until then they can&apos;t be At risk.
                    </span>
                </p>
            ) : null}
        </div>
    );
}

/**
 * The card above the Customers list, with `customers`. Phones open on a
 * one-line summary; the chart is a tap away.
 */
export function LifecycleCard({
    summary,
    activeStage,
    stageHref,
    onChooseStage,
}: {
    summary: LifecycleSummary;
    activeStage: LifecycleStage | null;
    stageHref: (stage: LifecycleStage) => string;
    onChooseStage: (stage: LifecycleStage) => void;
}) {
    const [open, setOpen] = useState(false);
    if (summary.total < 1) return null;
    const loyal = lifecycleStageOf(summary, "loyal");
    return (
        <Card className="max-md:gap-1">
            <CardHeader className="pb-3 max-md:pb-0">
                <CardTitle className="text-base flex items-center gap-1.5">
                    Customer lifecycle
                    <InfoTip label="About the customer lifecycle">
                        <p>
                            Every customer is in one stage, read from their purchases, their attended re-adjustment
                            bookings and their email consent, and nothing else. It is checked in order: Lost, Lead, At
                            risk, Loyal, New.
                        </p>
                        <p>
                            Each bar is the stage&apos;s share of all customers, split by where they are within it.
                            Customers move both ways: an At risk customer who buys again is Loyal again.
                        </p>
                        <p>Choose a stage to list its customers below; the count is what the list shows.</p>
                    </InfoTip>
                </CardTitle>
                <CardDescription className="max-md:hidden">
                    {`Where each of your ${n(summary.total)} customers is now. Choose a stage to list them.`}
                </CardDescription>
            </CardHeader>
            <CardContent className="max-md:space-y-0">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 text-left text-sm transition-colors active:bg-press md:hidden"
                >
                    <span className="min-w-0">
                        <span className="font-semibold tabular-nums">{n(summary.total)}</span>
                        {" customers, "}
                        <span className="font-semibold tabular-nums">{`${n(loyal.customers)} (${loyal.share})`}</span>
                        {" Loyal"}
                    </span>
                    <ChevronDown
                        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                        aria-hidden
                    />
                </button>
                <div className={cn("max-md:pt-2 max-md:pb-3", !open && "max-md:hidden")}>
                    <LifecycleChart
                        summary={summary}
                        activeStage={activeStage}
                        stageHref={stageHref}
                        onChooseStage={onChooseStage}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
