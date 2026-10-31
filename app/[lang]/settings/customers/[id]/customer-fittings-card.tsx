"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, FileText, ImageOff, Ruler } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatAdminDateTimeMY } from "@/lib/format/admin-date";
import {
    DRIVE_SLOT_LABELS,
    driveFileUrl,
    fittingFileSrc,
    fittingLabel,
    inches,
    yesNo,
    type FittingFileView,
    type FittingRecordView,
} from "@/lib/fitting-import/view";

/** What the page read: the records, or null when the read failed. */
export type CustomerFittingsResult = FittingRecordView[] | null;

/**
 * Fitting history (ADR 0039): each in-store fitting the old Google Form
 * recorded, newest first and open, older ones folded. Shown only to Staff
 * holding `customers`, and only when the Customer has one. Photos are
 * previewed from Drive through the platform and never copied.
 */
export function CustomerFittingsCard({ customerId, fittings }: { customerId: string; fittings: CustomerFittingsResult | undefined }) {
    if (fittings === undefined) return null;
    if (fittings === null) {
        return (
            <Card>
                <CardContent className="py-4 text-sm text-muted-foreground">Could not load this customer&apos;s fittings.</CardContent>
            </Card>
        );
    }
    if (fittings.length === 0) return null;
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    Fitting history
                </CardTitle>
                <CardDescription>
                    {fittings.length === 1 ? "One in-store fitting" : `${fittings.length} in-store fittings`} from the
                    fitting form. Measurements are in inches, as recorded.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {fittings.map((f, k) => (
                    <FittingSection key={f.id} customerId={customerId} fitting={f} defaultOpen={k === 0} />
                ))}
            </CardContent>
        </Card>
    );
}

function FittingSection({ customerId, fitting: f, defaultOpen }: { customerId: string; fitting: FittingRecordView; defaultOpen: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border" id={`fitting-${f.id}`}>
            <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 p-3 text-left max-md:min-h-11">
                <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{fittingLabel(f)}</p>
                    <p className="text-xs text-muted-foreground">
                        {formatAdminDateTimeMY(f.fittedAt)}
                        {f.servicedBy ? ` · Serviced by ${f.servicedBy}` : ""}
                    </p>
                </div>
                <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            </CollapsibleTrigger>
            <CollapsibleContent className="@container space-y-4 border-t p-3">
                <Measurements fitting={f} />
                <Answers fitting={f} />
                {f.notes && (
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Additional notes</p>
                        <p className="whitespace-pre-wrap text-sm">{f.notes}</p>
                    </div>
                )}
                {f.files.length > 0 && <Photos customerId={customerId} fitting={f} />}
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
                <OnTheForm fitting={f} />
            </CollapsibleContent>
        </Collapsible>
    );
}

function Measurements({ fitting: f }: { fitting: FittingRecordView }) {
    const items: [string, string, number | null][] = [
        ["A", "Shoulder length", f.shoulderLengthIn],
        ["B", "Neck to back", f.neckToBackIn],
        ["C", "Head to back", f.headToBackIn],
        ["D", "Neck length", f.neckLengthIn],
    ];
    return (
        <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
            {items.map(([letter, label, value]) => (
                <div key={letter} className="rounded-md bg-muted/50 px-3 py-2">
                    <dt className="text-xs text-muted-foreground">
                        {letter}) {label}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">{inches(value)}</dd>
                </div>
            ))}
        </dl>
    );
}

function Answers({ fitting: f }: { fitting: FittingRecordView }) {
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

function Photos({ customerId, fitting }: { customerId: string; fitting: FittingRecordView }) {
    const [shown, setShown] = useState<FittingFileView | null>(null);
    return (
        <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Photos and forms, from Google Drive</p>
            <ul className="grid grid-cols-2 gap-3 @md:grid-cols-3">
                {fitting.files.map((file) => (
                    <li key={file.index}>
                        <PhotoTile customerId={customerId} fittingId={fitting.id} file={file} onOpen={() => setShown(file)} />
                    </li>
                ))}
            </ul>
            <Dialog open={shown !== null} onOpenChange={(o) => !o && setShown(null)}>
                <DialogContent className="sm:max-w-3xl">
                    {shown && (
                        <>
                            <DialogHeader>
                                <DialogTitle>{DRIVE_SLOT_LABELS[shown.slot]}</DialogTitle>
                                <DialogDescription>
                                    {formatAdminDateTimeMY(fitting.fittedAt)} ·{" "}
                                    <a
                                        href={driveFileUrl(shown.fileId)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 underline underline-offset-2"
                                    >
                                        Open in Drive <ExternalLink className="h-3 w-3" aria-hidden />
                                    </a>
                                </DialogDescription>
                            </DialogHeader>
                            <FullPreview customerId={customerId} fittingId={fitting.id} file={shown} />
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** A thumbnail from Drive; when Drive will not give one, a tile that opens the file in Drive. */
function PhotoTile({
    customerId,
    fittingId,
    file,
    onOpen,
}: {
    customerId: string;
    fittingId: string;
    file: FittingFileView;
    onOpen: () => void;
}) {
    const [failed, setFailed] = useState(false);
    const label = DRIVE_SLOT_LABELS[file.slot];
    if (failed) {
        return (
            <a
                href={driveFileUrl(file.fileId)}
                target="_blank"
                rel="noreferrer"
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground hover:bg-muted/50"
            >
                <ImageOff className="h-5 w-5" aria-hidden />
                <span className="font-medium text-foreground">{label}</span>
                <span className="inline-flex items-center gap-1">
                    No preview · Open in Drive <ExternalLink className="h-3 w-3" aria-hidden />
                </span>
            </a>
        );
    }
    return (
        <button type="button" onClick={onOpen} className="group block w-full space-y-1 text-left">
            <span className="block aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- a Staff-only, uncached route; next/image would cache it */}
                <img
                    src={fittingFileSrc(customerId, fittingId, file.index, "thumb")}
                    alt={label}
                    loading="lazy"
                    onError={() => setFailed(true)}
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                />
            </span>
            <span className="block text-xs text-muted-foreground">{label}</span>
        </button>
    );
}

function FullPreview({ customerId, fittingId, file }: { customerId: string; fittingId: string; file: FittingFileView }) {
    const [failed, setFailed] = useState(false);
    const src = fittingFileSrc(customerId, fittingId, file.index, "full");
    if (failed) {
        return (
            <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/50"
            >
                <FileText className="h-4 w-4" aria-hidden />
                This file is not an image. Open it in a new tab.
            </a>
        );
    }
    return (
        <div className="flex max-h-[70vh] justify-center overflow-auto rounded-md bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- a Staff-only, uncached route; next/image would cache it */}
            <img src={src} alt={DRIVE_SLOT_LABELS[file.slot]} onError={() => setFailed(true)} className="h-auto max-w-full object-contain" />
        </div>
    );
}

/** The contact the form held, and how the record found this Customer. */
function OnTheForm({ fitting: f }: { fitting: FittingRecordView }) {
    const contact = [f.nameOnForm, f.emailOnForm, f.mobileOnForm].filter(Boolean).join(" · ");
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {contact && <span className="[overflow-wrap:anywhere]">On the form: {contact}</span>}
            <Badge variant="outline" className="font-normal">
                {f.matchedBy === "phone" ? "Matched by mobile" : f.createdCustomer ? "New customer from the form" : "Matched by email"}
            </Badge>
        </div>
    );
}
