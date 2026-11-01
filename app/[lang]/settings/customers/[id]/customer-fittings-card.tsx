"use client";

import { useState } from "react";
import { ExternalLink, FileText, ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FittingHistory } from "@/components/fittings/fitting-history";
import { formatAdminDateTimeMY } from "@/lib/format/admin-date";
import {
    DRIVE_SLOT_LABELS,
    driveFileUrl,
    fittingFileSrc,
    type FittingFileView,
    type FittingRecordView,
} from "@/lib/fitting-import/view";

/** What the page read: the records, or null when the read failed. */
export type CustomerFittingsResult = FittingRecordView[] | null;

/**
 * Fitting history on the Customer page (ADR 0039): the customer's Profile shows
 * the same card, and Staff also get the Drive photos and the contact the form
 * held. Shown only to Staff holding `customers`, and only when the Customer has
 * a fitting. Photos are previewed from Drive through the platform and never
 * copied.
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
        <FittingHistory
            fittings={fittings}
            formatDate={formatAdminDateTimeMY}
            description={
                <>
                    {fittings.length === 1 ? "One in-store fitting" : `${fittings.length} in-store fittings`} from the
                    fitting form. Measurements are in inches, as recorded. The customer sees the same on their Profile,
                    without the photos.
                </>
            }
            media={(f) => (f.files.length > 0 ? <Photos customerId={customerId} fitting={f} /> : null)}
            footer={(f) => <OnTheForm fitting={f} />}
        />
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
