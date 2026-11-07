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
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import { XraySectionDock } from "@/components/spatial/xray-section-dock";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import type { PillowSizeKey } from "@/lib/customer-pillow/match";
import type { CustomerPillowReadjustInput, CustomerPillowView } from "@/lib/customer-pillow/view";
import {
    flattenToPackList,
    pillowPlacementsToRows,
    rowsToPillowPlacements,
    type PillowPlacement,
    type Section,
} from "@/lib/spatial-fillings/core";
import { fillingLabel } from "@/lib/spatial-fillings/filling-groups";
import { softBodyFromPayload } from "@/lib/spatial-fillings/soft-body-settings";

// The x-ray brings @dnd-kit and the sunburst picker with it; the cut its own SVG.
const XrayEditor = dynamic(() => import("@/components/spatial/xray-editor").then((m) => m.XrayEditor), {
    ssr: false,
    loading: () => <Skeleton className="aspect-[664/374] w-full rounded-lg" />,
});
// Left, centre and right at once, each still an editor, as on Result detail.
const XrayCrossSectionStrip = dynamic(
    () => import("@/components/spatial/xray-cross-section-strip").then((m) => m.XrayCrossSectionStrip),
    { ssr: false },
);

/** One filling's change in count between the pillow Staff opened and what is in it now. */
type CountChange = { itemId: number; label: string; was: number; now: number };

/** Every filling whose count changed, in the order the pack list reads. */
function countChanges(before: PillowPlacement[], after: PillowPlacement[], labelOf: (id: number) => string): CountChange[] {
    const was = new Map(flattenToPackList(before).map((l) => [l.item_id, l.count]));
    const now = new Map(flattenToPackList(after).map((l) => [l.item_id, l.count]));
    return [...new Set([...was.keys(), ...now.keys()])]
        .map((itemId) => ({ itemId, label: labelOf(itemId), was: was.get(itemId) ?? 0, now: now.get(itemId) ?? 0 }))
        .filter((c) => c.was !== c.now)
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Re-adjust (ADR 0042 l): change the fillings in the pillow a Customer already
 * has, at a Re-adjustment visit. The X-ray editor opens on the pillow the card
 * draws (a link's template, an order's build, a fitting's match, or the last
 * Re-adjustment) and Save writes what Staff leave in it onto the Staff link.
 * The Customer page and their Profile then draw it as it now is. A Service:
 * no stock moves, no price or order changes.
 */
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
    /** The placeable Items, kept by the card once read so a second opening does not read them again. */
    catalog: FillingItem[] | null;
    onCatalog: (items: FillingItem[]) => void;
}) {
    const initial = useMemo(() => rowsToPillowPlacements(pillow.placements), [pillow.placements]);
    const [placements, setPlacements] = useState<PillowPlacement[]>(initial);
    const [size, setSize] = useState<PillowSizeKey>(pillow.size ?? "M");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    // The placeable Items, read on the first opening.
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

    // The picker offers the active catalog; a piece already in the pillow whose Item is no longer listed still draws.
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
    // The dived Section's cut is ringed; a pouch moved to another cut hands the ring to that Section.
    const { setCut, onDiveChange } = useCut();
    const [divedSection, setDivedSection] = useState<Section | null>(null);
    // From md, the dived Section's controls dock in the Section editor beside the x-ray, off the art (phones keep
    // theirs under the pillow). On the art they were 9px chips with the add picker blooming in among them.
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
            size !== (pillow.size ?? "M") ||
            JSON.stringify(pillowPlacementsToRows(placements)) !== JSON.stringify(pillowPlacementsToRows(initial)),
        [size, pillow.size, placements, initial],
    );
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
            onSaved(json.pillow as CustomerPillowView);
        } catch {
            setError("Could not save the re-adjustment.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="sm:max-w-6xl md:max-h-[92dvh] md:w-[calc(100%-2rem)] md:overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Re-adjust the pillow</DialogTitle>
                    <DialogDescription>
                        Change the fillings in this customer&apos;s pillow at a Re-adjustment visit: click a section to swap, add or
                        remove pieces. Saving replaces the pillow drawn on this page and on their Profile. No stock moves, and no
                        order or price changes.
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

                {/* Phones read the pack list and the changes before the cuts, as before; from md the cuts follow the
                    x-ray they cut, and the lists come after them. */}
                <div className="flex flex-col gap-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                        {/* lg: beside the x-ray, as tall as its content but never taller than the x-ray (absolute in
                            its grid cell, so a long dive scrolls in the panel instead of pushing the cuts down).
                            md: under the x-ray. */}
                        <div className="relative max-md:hidden">
                            <XraySectionDock
                                dived={divedSection}
                                onSlot={setControlsSlot}
                                className="flex max-h-[26rem] bg-background lg:absolute lg:inset-x-0 lg:top-0 lg:max-h-full"
                            />
                        </div>
                    </div>
                    <div className="grid gap-3 md:order-last md:grid-cols-2 md:items-start">
                        <section className="rounded-md border">
                            <h3 className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-medium">
                                Derived pack list
                                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                                    {pieces} piece{pieces === 1 ? "" : "s"}
                                </span>
                            </h3>
                            <XrayPackList
                                placements={placements}
                                onPlacementsChange={editable ? setPlacements : undefined}
                                items={labelItems}
                            />
                        </section>
                        <section className="rounded-md border" aria-live="polite">
                            <h3 className="border-b px-3 py-2 text-sm font-medium">Changes</h3>
                            {changes.length === 0 ? (
                                <p className="px-3 py-2.5 text-sm text-muted-foreground">
                                    {dirty ? "Pieces moved; the same fillings are in it." : "Nothing changed yet."}
                                </p>
                            ) : (
                                <ul className="divide-y text-sm">
                                    {changes.map((c) => (
                                        <li key={c.itemId} className="flex items-center justify-between gap-2 px-3 py-2">
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
                        defaultOpen
                    />
                </div>

                {/* From md, pinned to the bottom of the scrolling dialog so Save stays in reach under the x-ray and
                    cut; sticky offsets sit inside the dialog's padding, so it reaches past it to the edge. A phone's
                    drawer keeps it at the end of the scroll: three stacked buttons would cover half the drawer. */}
                <div className="space-y-2 md:sticky md:-bottom-6 md:z-10 md:-mx-6 md:-mb-6 md:border-t md:bg-background md:px-6 md:py-4">
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setPlacements(initial);
                                setSize(pillow.size ?? "M");
                            }}
                            disabled={saving || !dirty}
                        >
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
