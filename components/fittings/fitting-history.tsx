"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { fittingLabel, inches, yesNo, type FittingAnswersView } from "@/lib/fitting-import/view";

/**
 * Fitting history (ADR 0039): each in-store fitting the old Google Form
 * recorded, newest first and open, older ones folded. One person often came
 * more than once, and each visit is its own record with its own
 * measurements: with more than one, the newest is marked Latest and each
 * measurement says what it was at the visit before. One UI for Staff on the
 * Customer page and for the customer on their own Profile (decision h). The
 * Staff page adds the Drive photos and the contact on the form through `media`
 * and `footer`; the Profile adds neither, and its records carry no Drive file.
 */
export function FittingHistory<F extends FittingAnswersView>({
    fittings,
    description,
    formatDate,
    media,
    footer,
    className,
}: {
    fittings: F[];
    description: ReactNode;
    formatDate: (iso: string) => string;
    /** After the notes: the Staff page's Drive photos. */
    media?: (f: F) => ReactNode;
    /** Last in each fitting: the Staff page's contact on the form. */
    footer?: (f: F) => ReactNode;
    className?: string;
}) {
    return (
        <Card className={className} data-section="fittings">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Ruler className="h-4 w-4" aria-hidden />
                    Fitting history
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {fittings.map((f, k) => (
                    <FittingSection
                        key={f.id}
                        fitting={f}
                        previous={fittings[k + 1]}
                        latest={k === 0 && fittings.length > 1}
                        defaultOpen={k === 0}
                        formatDate={formatDate}
                        media={media}
                        footer={footer}
                    />
                ))}
            </CardContent>
        </Card>
    );
}

function FittingSection<F extends FittingAnswersView>({
    fitting: f,
    previous,
    latest,
    defaultOpen,
    formatDate,
    media,
    footer,
}: {
    fitting: F;
    /** The visit before this one, when there was one. */
    previous?: F;
    latest: boolean;
    defaultOpen: boolean;
    formatDate: (iso: string) => string;
    media?: (f: F) => ReactNode;
    footer?: (f: F) => ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border" id={`fitting-${f.id}`}>
            <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 p-3 text-left max-md:min-h-11">
                <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                        {fittingLabel(f)}
                        {latest && (
                            <Badge variant="secondary" className="font-normal">
                                Latest
                            </Badge>
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {formatDate(f.fittedAt)}
                        {f.servicedBy ? ` · Serviced by ${f.servicedBy}` : ""}
                    </p>
                </div>
                <ChevronDown
                    className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    aria-hidden
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="@container space-y-4 border-t p-3">
                <Measurements fitting={f} previous={previous} />
                <Answers fitting={f} />
                {f.notes && (
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Additional notes</p>
                        <p className="whitespace-pre-wrap text-sm">{f.notes}</p>
                    </div>
                )}
                {media?.(f)}
                {f.otherAnswers.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Other answers on the form</p>
                        <dl className="space-y-1 text-sm">
                            {f.otherAnswers.map(([q, a]) => (
                                <div key={q} className="grid gap-x-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                                    <dt className="text-muted-foreground [overflow-wrap:anywhere]">{q}</dt>
                                    <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{a}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}
                {footer?.(f)}
            </CollapsibleContent>
        </Collapsible>
    );
}

type MeasurementKey = "shoulderLengthIn" | "neckToBackIn" | "headToBackIn" | "neckLengthIn";
const MEASUREMENTS: [string, string, MeasurementKey][] = [
    ["A", "Shoulder length", "shoulderLengthIn"],
    ["B", "Neck to back", "neckToBackIn"],
    ["C", "Head to back", "headToBackIn"],
    ["D", "Neck length", "neckLengthIn"],
];

/** A, B, C and D, each with what it was at the visit before when that differs. */
function Measurements({ fitting: f, previous }: { fitting: FittingAnswersView; previous?: FittingAnswersView }) {
    return (
        <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
            {MEASUREMENTS.map(([letter, label, key]) => {
                const value = f[key];
                const before = previous?.[key] ?? null;
                return (
                    <div key={letter} className="rounded-md bg-muted/50 px-3 py-2">
                        <dt className="text-xs text-muted-foreground">
                            {letter}) {label}
                        </dt>
                        <dd className="text-lg font-semibold tabular-nums">{inches(value)}</dd>
                        {value !== null && before !== null && before !== value && (
                            <dd className="text-xs text-muted-foreground tabular-nums">was {inches(before)}</dd>
                        )}
                    </div>
                );
            })}
        </dl>
    );
}

function Answers({ fitting: f }: { fitting: FittingAnswersView }) {
    const rows: [string, string | null][] = [
        ["Recommended size", f.recommendedSize],
        ["Configuration type", f.configurationType],
        ["Profile side", f.profileSide],
        ["Sleeper", f.sleeperType],
        ["During or after sleep", f.sleepSymptoms.length ? f.sleepSymptoms.join(", ") : null],
        ["Blood pressure", f.bloodPressure],
        ["Acid reflux", f.acidReflux === null ? null : yesNo(f.acidReflux)],
        ["Ear discomfort on side sleep", f.earDiscomfortSideSleep === null ? null : yesNo(f.earDiscomfortSideSleep)],
        ["Bed firmness", f.bedFirmness],
        ["Uses bolsters", f.usesBolster === null ? null : yesNo(f.usesBolster)],
        ["Age group", f.ageGroup],
        ["Gender", f.gender],
        ["Heard of Mpillow from", f.discoverySource],
        ["Referred by", f.referredBy],
    ];
    const shown = rows.filter((r): r is [string, string] => Boolean(r[1]));
    if (!shown.length) return null;
    return (
        <dl className="grid gap-x-6 text-sm @xl:grid-cols-2">
            {shown.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 border-b border-dashed py-1.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium break-words">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
