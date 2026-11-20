"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, Eye, EyeOff, Link2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PillowContents, PillowXray } from "@/components/customer-pillow/pillow-drawing";
import { DraftNotice } from "@/components/spatial/draft-notice";
import { useDraftSavedAt } from "@/hooks/use-autosave-draft";
import { clearDraft, readDraft } from "@/lib/editor-drafts";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { formatTemplateKeys, PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import { rowsToPillowPlacements } from "@/lib/spatial-fillings/core";
import type { MatchableTemplate, PillowSizeKey } from "@/lib/customer-pillow/match";
import { matchNotices } from "@/lib/customer-pillow/notices";
import type { CustomerPillowResult, CustomerPillowView } from "@/lib/customer-pillow/view";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { ReadjustDialog, readjustDraftKey } from "./customer-pillow-readjust";

const NO_TEMPLATE = "none";

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
    const [open, setOpen] = useState<"link" | "readjust" | null>(null);
    const [session, setSession] = useState(0);
    const openDialog = (kind: "link" | "readjust") => {
        setSession((n) => n + 1);
        setOpen(kind);
    };
    const canReadjust = canEdit && pillow !== null && pillow.source !== "none";
    const draftKey = readjustDraftKey(customerId);
    const draftAt = useDraftSavedAt(canReadjust ? draftKey : null);
    const reopened = useRef(false);
    useEffect(() => {
        if (!canReadjust || reopened.current || !readDraft(draftKey)) return;
        reopened.current = true;
        setSession((n) => n + 1);
        setOpen("readjust");
    }, [canReadjust, draftKey]);
    const [catalog, setCatalog] = useState<FillingItem[] | null>(null);
    const saved = (next: CustomerPillowView) => {
        setPillow(next);
        setOpen(null);
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
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <BedDouble className="h-4 w-4" aria-hidden />
                        Pillow
                    </CardTitle>
                    {canEdit && (
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => openDialog("link")}>
                                <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
                                {pillow.source === "none" ? "Link pillow" : "Change pillow"}
                            </Button>
                            {pillow.source !== "none" && (
                                <Button variant="outline" size="sm" onClick={() => openDialog("readjust")}>
                                    <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                                    Re-adjust
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                <CardDescription>
                    <Source pillow={pillow} />
                    {pillow.source === "none" && canEdit ? " Link the size and Filling Template they have to draw it here." : ""}
                </CardDescription>
                <ProfileLine pillow={pillow} />
            </CardHeader>
            {pillow.source !== "none" && (
                <CardContent className="space-y-4">
                    {canReadjust && draftAt !== null && open !== "readjust" && (
                        <DraftNotice
                            kind="waiting"
                            what="re-adjustment"
                            savedAt={draftAt}
                            onRestore={() => openDialog("readjust")}
                            onDiscard={() => clearDraft(draftKey)}
                        />
                    )}
                    <Drawing pillow={pillow} />
                </CardContent>
            )}
            {canEdit && (
                <LinkDialog
                    key={`link-${session}`}
                    customerId={customerId}
                    pillow={pillow}
                    open={open === "link"}
                    onOpenChange={(next) => setOpen(next ? "link" : null)}
                    onSaved={saved}
                />
            )}
            {canEdit && pillow.source !== "none" && open === "readjust" && (
                <ReadjustDialog
                    key={`readjust-${session}`}
                    customerId={customerId}
                    pillow={pillow}
                    open
                    onOpenChange={(next) => setOpen(next ? "readjust" : null)}
                    onSaved={saved}
                    catalog={catalog}
                    onCatalog={setCatalog}
                />
            )}
        </Card>
    );
}

function orderLabel(order: NonNullable<CustomerPillowView["order"]>) {
    return `${order.size ?? "Size not recorded"} · ${order.templateName ?? "custom mix"}`;
}

function boughtOn(order: NonNullable<CustomerPillowView["order"]>) {
    return `${formatAdminDateMY(order.paidAt)}${order.orderNumber ? `, order ${order.orderNumber}` : ""}`;
}

function Source({ pillow }: { pillow: CustomerPillowView }) {
    if (pillow.source === "linked" && pillow.link) {
        return (
            <>
                {pillow.link.readjusted ? "Re-adjusted" : "Linked"}
                {pillow.link.linkedBy ? ` by ${pillow.link.linkedBy}` : ""} on {formatAdminDateMY(pillow.link.linkedAt)}
                {pillow.link.readjusted ? `, from ${pillow.template?.name ?? "a custom mix"}` : ""}.
                {pillow.order
                    ? ` Bought here on ${boughtOn(pillow.order)}: ${orderLabel(pillow.order)}.`
                    : pillow.fitting
                      ? ` The fitting on ${formatAdminDateMY(pillow.fitting.fittedAt)} recorded ${pillow.fitting.label}.`
                      : ""}
            </>
        );
    }
    if (pillow.source === "order" && pillow.order) {
        return (
            <>
                Bought here on {boughtOn(pillow.order)}, drawn as it was built.
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

function ProfileLine({ pillow }: { pillow: CustomerPillowView }) {
    if (pillow.placements.length === 0) return null;
    const shown = pillow.onProfile;
    const Icon = shown ? Eye : EyeOff;
    return (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
                {shown
                    ? "Their Profile shows it too."
                    : "Not on their Profile until they buy a pillow here, or one is linked."}
            </span>
        </p>
    );
}

function Drawing({ pillow }: { pillow: CustomerPillowView }) {
    const placements = useMemo(() => rowsToPillowPlacements(pillow.placements), [pillow.placements]);
    const notices = pillow.source === "fitting" ? matchNotices(pillow.match) : [];
    const readjusted = pillow.source === "linked" && pillow.link?.readjusted === true;
    if (pillow.source === "linked" && !readjusted && pillow.template && !pillow.templates.some((t) => t.id === pillow.template?.id)) {
        notices.push(`${pillow.template.name} is no longer active in Configure.`);
    }
    if (pillow.source === "linked" && pillow.link && pillow.order && Date.parse(pillow.order.paidAt) > Date.parse(pillow.link.linkedAt)) {
        notices.push(
            `They bought a pillow here on ${formatAdminDateMY(pillow.order.paidAt)}, after this ${readjusted ? "re-adjustment" : "link"}. Use the order's, under Change pillow, to draw it as it was built.`,
        );
    }
    const pieces = placements.length;
    const drawn = pillow.template !== null || pieces > 0;
    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Size {pillow.size ?? "not recorded"}</Badge>
                <span className="font-medium">
                    {pillow.template?.name ?? (pillow.source === "order" || readjusted ? "Custom mix" : "No Filling Template")}
                </span>
                {readjusted && <Badge variant="outline">Re-adjusted</Badge>}
                {drawn && (
                    <span className="text-xs text-muted-foreground">
                        {pieces} piece{pieces === 1 ? "" : "s"}
                        {!readjusted && pillow.template?.keys.length
                            ? ` · serves ${formatTemplateKeys("pillow", pillow.template.keys)}`
                            : ""}
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
            {drawn && (
                <>
                    <PillowXray
                        placements={placements}
                        items={pillow.items}
                        size={pillow.size}
                        colorOverrides={pillow.colorOverrides}
                        dimensionOverrides={pillow.dimensionOverrides}
                    />
                    {pieces > 0 ? (
                        <PillowContents label="Derived pack list" placements={placements} items={pillow.items} />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {pillow.template?.name ?? "This pillow"} has no placements laid out yet.
                        </p>
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
                        The size and Filling Template this customer has. It replaces what their order or fitting records on this
                        page{pillow.link?.readjusted ? ", and the fillings their last re-adjustment left in it" : ""}, shows on their
                        Profile too, and changes no Result, order or stock.
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
                            {pillow.order ? "Use the order's" : pillow.fitting ? "Use the fitting's" : "Remove link"}
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
