"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BedDouble, ChevronDown, Link2, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroupLabel, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { formatTemplateKeys, PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import { rowsToPillowPlacements } from "@/lib/spatial-fillings/core";
import type { MatchableTemplate, PillowSizeKey } from "@/lib/customer-pillow/match";
import { matchNotices } from "@/lib/customer-pillow/notices";
import type { CustomerPillowResult, CustomerPillowView } from "@/lib/customer-pillow/view";

// The x-ray brings @dnd-kit and the sunburst picker with it; nothing to render on the server.
const XrayEditor = dynamic(() => import("@/components/spatial/xray-editor").then((m) => m.XrayEditor), {
    ssr: false,
    loading: () => <Skeleton className="aspect-[664/374] w-full rounded-lg" />,
});

/** No template chosen: the size is known, the filling is not. */
const NO_TEMPLATE = "none";

/**
 * The Customer's pillow (ADR 0042 j): the x-ray of the Filling Template they
 * have, at their size. For a customer from before this platform it is read
 * from their latest Fitting record, the old form's size and configuration
 * type (`S · T12`) matched to the template of that type (`Type-12`); a Staff
 * member holding `customers-edit` can link another size or template, or one
 * for a customer with no fitting. Read-only: it shows a recipe, it does not
 * build one, and nothing here reaches a Result, stock or a price.
 */
export function CustomerPillowCard({
    customerId,
    pillow: initial,
    canEdit,
}: {
    customerId: string;
    pillow: CustomerPillowResult | undefined;
    canEdit: boolean;
}) {
    const [pillow, setPillow] = useState<CustomerPillowView | null>(initial ?? null);
    const [open, setOpen] = useState(false);
    // Each opening starts from what is shown, not from what was picked and cancelled last time.
    const [session, setSession] = useState(0);
    const openDialog = () => {
        setSession((n) => n + 1);
        setOpen(true);
    };

    if (initial === undefined) return null;
    if (pillow === null) {
        return (
            <Card>
                <CardContent className="py-4 text-sm text-muted-foreground">Could not load this customer&apos;s pillow.</CardContent>
            </Card>
        );
    }

    return (
        <Card data-section="pillow">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                        <CardTitle className="text-base flex items-center gap-2">
                            <BedDouble className="h-4 w-4" aria-hidden />
                            Pillow
                        </CardTitle>
                        <CardDescription>
                            <Source pillow={pillow} />
                            {pillow.source === "none" && canEdit ? " Link the size and Filling Template they have to draw it here." : ""}
                        </CardDescription>
                    </div>
                    {canEdit && (
                        <Button variant="outline" size="sm" className="shrink-0" onClick={openDialog}>
                            <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
                            {pillow.source === "none" ? "Link pillow" : "Change pillow"}
                        </Button>
                    )}
                </div>
            </CardHeader>
            {pillow.source !== "none" && (
                <CardContent className="space-y-4">
                    <Drawing pillow={pillow} />
                </CardContent>
            )}
            {canEdit && (
                <LinkDialog
                    key={session}
                    customerId={customerId}
                    pillow={pillow}
                    open={open}
                    onOpenChange={setOpen}
                    onSaved={(next) => {
                        setPillow(next);
                        setOpen(false);
                    }}
                />
            )}
        </Card>
    );
}

/** Where the pillow drawn comes from, in one line. */
function Source({ pillow }: { pillow: CustomerPillowView }) {
    if (pillow.source === "linked" && pillow.link) {
        return (
            <>
                Linked{pillow.link.linkedBy ? ` by ${pillow.link.linkedBy}` : ""} on {formatAdminDateMY(pillow.link.linkedAt)}.
                {pillow.fitting ? ` The fitting on ${formatAdminDateMY(pillow.fitting.fittedAt)} recorded ${pillow.fitting.label}.` : ""}
            </>
        );
    }
    if (pillow.source === "fitting" && pillow.fitting) {
        return (
            <>
                From the fitting on {formatAdminDateMY(pillow.fitting.fittedAt)}: {pillow.fitting.label}. Drawn from the Filling
                Template of that type as it is now.
            </>
        );
    }
    if (pillow.fitting) {
        return (
            <>
                No pillow on record: the fitting on {formatAdminDateMY(pillow.fitting.fittedAt)} recorded no pillow size or
                configuration type, and none is linked.
            </>
        );
    }
    return <>No pillow on record: no fitting names one, and none is linked.</>;
}

function Drawing({ pillow }: { pillow: CustomerPillowView }) {
    const placements = useMemo(() => rowsToPillowPlacements(pillow.placements), [pillow.placements]);
    const notices = pillow.source === "fitting" ? matchNotices(pillow.match) : [];
    if (pillow.source === "linked" && pillow.template && !pillow.templates.some((t) => t.id === pillow.template?.id)) {
        notices.push(`${pillow.template.name} is no longer active in Configure.`);
    }
    const pieces = placements.length;
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Size {pillow.size ?? "not recorded"}</Badge>
                <span className="font-medium">{pillow.template?.name ?? "No Filling Template"}</span>
                {pillow.template && (
                    <span className="text-xs text-muted-foreground">
                        {pieces} piece{pieces === 1 ? "" : "s"}
                        {pillow.template.keys.length ? ` · serves ${formatTemplateKeys("pillow", pillow.template.keys)}` : ""}
                    </span>
                )}
            </div>
            {notices.length > 0 && (
                <ul className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    {notices.map((n) => (
                        <li key={n} className="flex gap-2">
                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            <span>{n}</span>
                        </li>
                    ))}
                </ul>
            )}
            {pillow.template && (
                <>
                    <div className="mx-auto w-full max-w-[52rem]">
                        <XrayEditor
                            placements={placements}
                            items={pillow.items}
                            pillowSize={pillow.size}
                            colorOverrides={pillow.colorOverrides}
                            dimensionOverrides={pillow.dimensionOverrides}
                        />
                    </div>
                    {pieces > 0 ? (
                        <Collapsible className="rounded-md border">
                            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted/50 max-md:min-h-11 [&[data-state=open]>svg]:rotate-180">
                                <span>
                                    Derived pack list
                                    <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                                        {pieces} piece{pieces === 1 ? "" : "s"}
                                    </span>
                                </span>
                                <ChevronDown className="size-4 transition-transform" aria-hidden />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="border-t">
                                <XrayPackList placements={placements} items={pillow.items} />
                            </CollapsibleContent>
                        </Collapsible>
                    ) : (
                        <p className="text-sm text-muted-foreground">{pillow.template.name} has no placements laid out yet.</p>
                    )}
                </>
            )}
        </>
    );
}

function templateOption(t: MatchableTemplate) {
    return (
        <SelectItem key={t.id} value={String(t.id)} textValue={t.name}>
            <span className="flex flex-wrap items-baseline gap-x-2">
                <span>{t.name}</span>
                {t.keys.length > 0 && (
                    <span className="text-xs text-muted-foreground">{formatTemplateKeys("pillow", t.keys)}</span>
                )}
            </span>
        </SelectItem>
    );
}

/** Link a size and template, or go back to the fitting's. */
function LinkDialog({
    customerId,
    pillow,
    open,
    onOpenChange,
    onSaved,
}: {
    customerId: string;
    pillow: CustomerPillowView;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (next: CustomerPillowView) => void;
}) {
    const [size, setSize] = useState<PillowSizeKey>(pillow.size ?? "M");
    const [templateId, setTemplateId] = useState<string>(pillow.template ? String(pillow.template.id) : NO_TEMPLATE);
    const [saving, setSaving] = useState<"link" | "unlink" | null>(null);
    const [error, setError] = useState<string | null>(null);

    const serving = pillow.templates.filter((t) => t.keys.includes(size));
    const others = pillow.templates.filter((t) => !t.keys.includes(size));
    const picked = pillow.templates.find((t) => String(t.id) === templateId) ?? null;

    const close = (next: boolean) => {
        if (!saving) onOpenChange(next);
    };

    const send = async (kind: "link" | "unlink") => {
        setSaving(kind);
        setError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/pillow`, {
                method: kind === "link" ? "PUT" : "DELETE",
                headers: kind === "link" ? { "Content-Type": "application/json" } : undefined,
                body:
                    kind === "link"
                        ? JSON.stringify({ size, fillingTemplateId: templateId === NO_TEMPLATE ? null : Number(templateId) })
                        : undefined,
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setError(json?.error ?? "Could not save the pillow.");
                return;
            }
            onSaved(json.pillow as CustomerPillowView);
        } catch {
            setError("Could not save the pillow.");
        } finally {
            setSaving(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{pillow.source === "none" ? "Link a pillow" : "Change the pillow"}</DialogTitle>
                    <DialogDescription>
                        The size and Filling Template this customer has. It replaces what the fitting records on this page, and
                        changes no Result, order or stock.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="pillow-size">Size</Label>
                        <Select value={size} onValueChange={(v) => setSize(v as PillowSizeKey)}>
                            <SelectTrigger id="pillow-size" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PILLOW_TEMPLATE_KEYS.map((k) => (
                                    <SelectItem key={k} value={k}>
                                        {k}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="pillow-template">Filling Template</Label>
                        <Select value={templateId} onValueChange={setTemplateId}>
                            <SelectTrigger id="pillow-template" className="w-full">
                                <SelectValue placeholder="Choose a template" />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                                <SelectItem value={NO_TEMPLATE} textValue="None, size only">
                                    None, size only
                                </SelectItem>
                                {serving.length > 0 && <SelectGroupLabel>Serves {size}</SelectGroupLabel>}
                                {serving.map(templateOption)}
                                {others.length > 0 && <SelectGroupLabel>Other sizes</SelectGroupLabel>}
                                {others.map(templateOption)}
                            </SelectContent>
                        </Select>
                        {picked && !picked.keys.includes(size) && (
                            <p className="text-xs text-muted-foreground">
                                {picked.name} serves {formatTemplateKeys("pillow", picked.keys)}: it will be drawn at {size}.
                            </p>
                        )}
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                    {pillow.source === "linked" ? (
                        <Button variant="ghost" onClick={() => void send("unlink")} disabled={saving !== null}>
                            {saving === "unlink" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            {pillow.fitting ? "Use the fitting's" : "Remove link"}
                        </Button>
                    ) : (
                        <span className="max-sm:hidden" />
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <Button variant="outline" onClick={() => close(false)} disabled={saving !== null}>
                            Cancel
                        </Button>
                        <Button onClick={() => void send("link")} disabled={saving !== null}>
                            {saving === "link" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            Save pillow
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
