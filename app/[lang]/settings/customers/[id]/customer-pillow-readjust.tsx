"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCut, useItemMaps, usePillowFit } from "@/components/spatial/use-pillow-fit";
import { confirmSaveWithOverCells } from "@/components/spatial/xray-fit-banner";
import { InsertOrderList } from "@/components/spatial/insert-order-list";
import { XraySectionDock } from "@/components/spatial/xray-section-dock";
import { DraftNotice, DraftSavedHint } from "@/components/spatial/draft-notice";
import { useAutosaveDraft } from "@/hooks/use-autosave-draft";
import { readDraft } from "@/lib/editor-drafts";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import type { PillowSizeKey } from "@/lib/customer-pillow/match";
import type { CustomerPillowReadjustInput, CustomerPillowView } from "@/lib/customer-pillow/view";
import {
    flattenToPackList,
    pillowPlacementsToRows,
    rowsToPillowPlacements,
    type PillowPlacement,
    type PillowPlacementRow,
    type Section,
} from "@/lib/spatial-fillings/core";
import { fillingLabel } from "@/lib/spatial-fillings/filling-groups";
import { softBodyFromPayload } from "@/lib/spatial-fillings/soft-body-settings";

const XrayEditor = dynamic(() => import("@/components/spatial/xray-editor").then((m) => m.XrayEditor), {
    ssr: false,
    loading: () => <Skeleton className="aspect-[664/374] w-full rounded-lg" />,
});
const XrayCrossSectionStrip = dynamic(
    () => import("@/components/spatial/xray-cross-section-strip").then((m) => m.XrayCrossSectionStrip),
    { ssr: false },
);

type ReadjustDraft = { base: string; size: PillowSizeKey; placements: PillowPlacementRow[] };

export const readjustDraftKey = (customerId: string) => `readjust:${customerId}`;

function pillowBase(size: PillowSizeKey, placements: PillowPlacement[]): string {
    return JSON.stringify({ size, placements: pillowPlacementsToRows(placements) });
}

type CountChange = { itemId: number; label: string; was: number; now: number };

function countChanges(before: PillowPlacement[], after: PillowPlacement[], labelOf: (id: number) => string): CountChange[] {
    const was = new Map(flattenToPackList(before).map((l) => [l.item_id, l.count]));
    const now = new Map(flattenToPackList(after).map((l) => [l.item_id, l.count]));
    return [...new Set([...was.keys(), ...now.keys()])]
        .map((itemId) => ({ itemId, label: labelOf(itemId), was: was.get(itemId) ?? 0, now: now.get(itemId) ?? 0 }))
        .filter((c) => c.was !== c.now)
        .sort((a, b) => a.label.localeCompare(b.label));
}

export function ReadjustDialog({
    customerId,
    pillow,
    open,
    onOpenChange,
    onSaved,
    catalog,
    onCatalog,
}: {
    customerId: string;
    pillow: CustomerPillowView;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (next: CustomerPillowView) => void;
    catalog: FillingItem[] | null;
    onCatalog: (items: FillingItem[]) => void;
}) {
    const initial = useMemo(() => rowsToPillowPlacements(pillow.placements), [pillow.placements]);
    const savedSize: PillowSizeKey = pillow.size ?? "M";
    const base = useMemo(() => pillowBase(savedSize, initial), [savedSize, initial]);
    const draftKey = readjustDraftKey(customerId);
    const [kept, setKept] = useState(() => readDraft<ReadjustDraft>(draftKey));
    const keptFits = kept !== null && kept.data.base === base;
    const [placements, setPlacements] = useState<PillowPlacement[]>(() =>
        keptFits ? rowsToPillowPlacements(kept.data.placements) : initial,
    );
    const [size, setSize] = useState<PillowSizeKey>(() => (keptFits ? kept.data.size : savedSize));
    const [restored, setRestored] = useState<number | null>(() => (keptFits ? kept.savedAt : null));
    const offered = kept !== null && !keptFits ? kept : null;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || catalog) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/shop/customers/${customerId}/pillow/readjust`, { cache: "no-store" });
                const json = await res.json().catch(() => null);
                if (cancelled) return;
                if (!res.ok || !json?.ok) {
                    setCatalogError(json?.error ?? "Could not load the fillings.");
                    return;
                }
                onCatalog(json.items as FillingItem[]);
            } catch {
                if (!cancelled) setCatalogError("Could not load the fillings.");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, catalog, customerId, onCatalog]);

    const items = useMemo<FillingItem[] | undefined>(() => {
        if (!catalog) return undefined;
        const known = new Set(catalog.map((i) => i.id));
        const extra = pillow.items.filter((i) => !known.has(i.id));
        return extra.length ? [...catalog, ...extra] : catalog;
    }, [catalog, pillow.items]);
    const labelItems = items ?? pillow.items;
    const labelOf = useCallback(
        (id: number) => {
            const item = labelItems.find((i) => i.id === id);
            return item ? fillingLabel(item) : `Item #${id}`;
        },
        [labelItems],
    );

    const fit = usePillowFit(placements, size, items ?? pillow.items, pillow.dimensionOverrides);
    const { itemSubtypes, itemSizes, itemDims } = useItemMaps(items ?? pillow.items, pillow.dimensionOverrides);
    const softBody = useMemo(() => softBodyFromPayload(pillow.dimensionOverrides), [pillow.dimensionOverrides]);
    const { setCut, onDiveChange } = useCut();
    const [divedSection, setDivedSection] = useState<Section | null>(null);
    const [controlsSlot, setControlsSlot] = useState<HTMLElement | null>(null);
    const onXrayDive = useCallback(
        (section: Section | null) => {
            onDiveChange(section);
            setDivedSection(section);
        },
        [onDiveChange],
    );

    const changes = useMemo(() => countChanges(initial, placements, labelOf), [initial, placements, labelOf]);
    const dirty = useMemo(
        () =>
            size !== savedSize ||
            JSON.stringify(pillowPlacementsToRows(placements)) !== JSON.stringify(pillowPlacementsToRows(initial)),
        [size, savedSize, placements, initial],
    );
    const draft = useMemo<ReadjustDraft>(
        () => ({ base, size, placements: pillowPlacementsToRows(placements) }),
        [base, size, placements],
    );
    const autosave = useAutosaveDraft(offered ? null : draftKey, draft, dirty);
    const startOver = () => {
        setPlacements(initial);
        setSize(savedSize);
        setRestored(null);
    };
    const restoreOffered = () => {
        if (!offered) return;
        setPlacements(rowsToPillowPlacements(offered.data.placements));
        setSize(offered.data.size);
        setRestored(offered.savedAt);
        setKept(null);
    };
    const discardOffered = () => {
        autosave.discard();
        setKept(null);
    };
    const pieces = placements.length;
    const editable = Boolean(items) && !saving;

    const close = (next: boolean) => {
        if (!saving) onOpenChange(next);
    };

    const save = async () => {
        if (!confirmSaveWithOverCells(fit, "Save re-adjustment")) return;
        setSaving(true);
        setError(null);
        try {
            const body: CustomerPillowReadjustInput = {
                size,
                fillingTemplateId: pillow.template?.id ?? null,
                placements: pillowPlacementsToRows(placements),
            };
            const res = await fetch(`/api/shop/customers/${customerId}/pillow/readjust`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setError(json?.error ?? "Could not save the re-adjustment.");
                return;
            }
            autosave.discard();
            onSaved(json.pillow as CustomerPillowView);
        } catch {
            setError("Could not save the re-adjustment.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent
                className="sm:max-w-6xl md:max-h-[92dvh] md:w-[calc(100%-2rem)] md:overflow-y-auto"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
                }}
            >
                <DialogHeader>
                    <DialogTitle>Re-adjust the pillow</DialogTitle>
                    <DialogDescription>
                        Change the fillings in this customer&apos;s pillow at a Re-adjustment visit: click a section to add or swap
                        pieces, and take one out with its bin (on the x-ray once you click it, or in the insert order) or by
                        dragging it off the x-ray. Saving replaces the pillow drawn on this page and on their Profile. No stock
                        moves, and no order or price changes.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {pillow.size ? (
                        <Badge variant="secondary">Size {pillow.size}</Badge>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Label htmlFor="readjust-size">Size</Label>
                            <Select value={size} onValueChange={(v) => setSize(v as PillowSizeKey)}>
                                <SelectTrigger id="readjust-size" className="h-8 w-24">
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
                    )}
                    <span className="text-muted-foreground">
                        {pillow.template
                            ? `From ${pillow.template.name}`
                            : pillow.source === "order"
                              ? "From the custom mix it was built with"
                              : "From an empty pillow"}
                        {` · ${pieces} piece${pieces === 1 ? "" : "s"}`}
                    </span>
                    {!items && !catalogError && (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            Loading fillings…
                        </span>
                    )}
                </div>

                {catalogError && <p className="text-sm text-destructive">{catalogError}</p>}
                {offered ? (
                    <DraftNotice
                        kind="offered"
                        what="re-adjustment"
                        savedAt={offered.savedAt}
                        onRestore={restoreOffered}
                        onDiscard={discardOffered}
                    />
                ) : (
                    restored !== null &&
                    dirty && <DraftNotice kind="restored" what="re-adjustment" savedAt={restored} onDiscard={startOver} />
                )}

                <div className="flex flex-col gap-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="mx-auto w-full min-w-0 max-w-[52rem]">
                            <XrayEditor
                                placements={placements}
                                onPlacementsChange={editable ? setPlacements : undefined}
                                items={editable ? items : undefined}
                                pillowSize={size}
                                colorOverrides={pillow.colorOverrides}
                                dimensionOverrides={pillow.dimensionOverrides}
                                fit={fit}
                                onDiveChange={onXrayDive}
                                controlsSlot={controlsSlot}
                            />
                        </div>
                        <div className="relative max-md:hidden">
                            <XraySectionDock
                                dived={divedSection}
                                onSlot={setControlsSlot}
                                className="flex max-h-[26rem] bg-background lg:absolute lg:inset-x-0 lg:top-0 lg:max-h-full"
                            />
                        </div>
                    </div>
                    <div className="space-y-3 md:order-last">
                        <section className="rounded-md border" data-readjust-insert-order>
                            <h3 className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-medium">
                                Insert order
                                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                                    {pieces} step{pieces === 1 ? "" : "s"}
                                </span>
                            </h3>
                            <p className="px-3 pt-2.5 text-xs text-muted-foreground">
                                Each Section&apos;s pieces in the order they go in, and where each one sits.
                                {editable ? " Drag to reorder; the bin takes that piece out." : ""}
                            </p>
                            <InsertOrderList
                                placements={placements}
                                onPlacementsChange={editable ? setPlacements : undefined}
                                items={labelItems}
                                columns
                                className="p-3"
                            />
                        </section>
                        <section className="rounded-md border" aria-live="polite">
                            <h3 className="border-b px-3 py-2 text-sm font-medium">Changes</h3>
                            {changes.length === 0 ? (
                                <p className="px-3 py-2.5 text-sm text-muted-foreground">
                                    {dirty ? "Pieces moved; the same fillings are in it." : "Nothing changed yet."}
                                </p>
                            ) : (
                                <ul className="grid gap-x-6 px-3 py-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                                    {changes.map((c) => (
                                        <li key={c.itemId} className="flex items-center justify-between gap-2 py-1.5">
                                            <span className="min-w-0 truncate">{c.label}</span>
                                            <span
                                                className={`shrink-0 tabular-nums ${c.now > c.was ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}
                                            >
                                                {c.was} → {c.now}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                    <XrayCrossSectionStrip
                        fit={fit}
                        active={divedSection}
                        onActiveChange={editable ? setCut : undefined}
                        itemSubtypes={itemSubtypes}
                        itemSizes={itemSizes}
                        itemDims={itemDims}
                        placements={placements}
                        onPlacementsChange={editable ? setPlacements : undefined}
                        items={editable ? items : undefined}
                        colorOverrides={pillow.colorOverrides}
                        softBody={softBody}
                    />
                </div>

                <div className="space-y-2 md:sticky md:-bottom-6 md:z-10 md:-mx-6 md:-mb-6 md:border-t md:bg-background md:px-6 md:py-4">
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {dirty && !offered && <DraftSavedHint savedAt={autosave.savedAt} className="block" />}
                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button variant="ghost" onClick={startOver} disabled={saving || !dirty}>
                            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
                            Start over
                        </Button>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <Button variant="outline" onClick={() => close(false)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button onClick={() => void save()} disabled={saving || !dirty || pieces === 0 || !items}>
                                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                                Save re-adjustment
                            </Button>
                        </div>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
