"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, type ReactNode } from "react";
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
import { BolsterCompartmentList } from "@/components/spatial/bolster-compartment-list";
import { useBolsterFit, useCut, useItemMaps, usePillowFit } from "@/components/spatial/use-pillow-fit";
import { confirmSaveWithBolsterFit, confirmSaveWithOverCells } from "@/components/spatial/xray-fit-banner";
import { XrayPackList } from "@/components/spatial/xray-pack-list";
import { XraySectionDock } from "@/components/spatial/xray-section-dock";
import { useStaffOrderBuildOptions } from "@/hooks/use-staff-order-build-options";
import {
    bolsterPlacementsToRows,
    pillowPlacementsToRows,
    placementsExactMatch,
    rowsToBolsterPlacements,
    rowsToPillowPlacements,
    type AnyPlacement,
    type BolsterPlacement,
    type BolsterPlacementRow,
    type PillowPlacement,
    type PillowPlacementRow,
    type Section,
} from "@/lib/spatial-fillings/core";
import { fillingLabel } from "@/lib/spatial-fillings/filling-groups";
import { softBodyFromPayload } from "@/lib/spatial-fillings/soft-body-settings";
import type { BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import { fillingSourceLabel } from "@/lib/staff-orders/build-snapshot";
import type { StaffOrderBuildOptions } from "@/lib/staff-orders/builds";
import type { StaffOrderBuildPlacement } from "@/lib/staff-orders/shared";

const XrayEditor = dynamic(() => import("@/components/spatial/xray-editor").then((m) => m.XrayEditor), {
    ssr: false,
    loading: () => <Skeleton className="aspect-[664/374] w-full rounded-lg" />,
});
const XrayBolsterEditor = dynamic(() => import("@/components/spatial/xray-editor").then((m) => m.XrayBolsterEditor), {
    ssr: false,
    loading: () => <Skeleton className="aspect-[664/374] w-full rounded-lg" />,
});
const XrayCrossSectionStrip = dynamic(
    () => import("@/components/spatial/xray-cross-section-strip").then((m) => m.XrayCrossSectionStrip),
    { ssr: false },
);

export type OrderBuild = {
    templateId: number | null;
    placements: StaffOrderBuildPlacement[];
    filling: string;
    pieces: number;
};

type Template = StaffOrderBuildOptions["templates"][number];

const NO_TEMPLATE = "none";

const money = (n: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(n);

export function OrderBuildDialog({
    open,
    onOpenChange,
    variantId,
    title,
    initial,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    variantId: string | null;
    title: string;
    initial: OrderBuild | null;
    onSave: (build: OrderBuild) => void;
}) {
    const { options, error } = useStaffOrderBuildOptions(open ? variantId : null);
    const saveLabel = initial ? "Save fillings" : "Add to order";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-6xl md:max-h-[92dvh] md:w-[calc(100%-2rem)] md:overflow-y-auto"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
                }}
            >
                <DialogHeader>
                    <DialogTitle>Fillings for {title}</DialogTitle>
                    <DialogDescription>
                        Start from a Filling Template, then change what this customer needs. Fillings do not change
                        the price; each Ear Comfort Pad placed inside adds its own. Stock leaves when the order is
                        paid.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <p className="text-sm text-destructive" role="alert">
                        {error}
                    </p>
                ) : !options ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Loading the Filling Templates…
                    </div>
                ) : options.productType === "pillow" ? (
                    <PillowBuild
                        key={options.variantId}
                        options={options}
                        initial={initial}
                        saveLabel={saveLabel}
                        onCancel={() => onOpenChange(false)}
                        onSave={onSave}
                    />
                ) : (
                    <BolsterBuild
                        key={options.variantId}
                        options={options}
                        initial={initial}
                        saveLabel={saveLabel}
                        onCancel={() => onOpenChange(false)}
                        onSave={onSave}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

type BuildProps = {
    options: StaffOrderBuildOptions;
    initial: OrderBuild | null;
    saveLabel: string;
    onCancel: () => void;
    onSave: (build: OrderBuild) => void;
};

function startingTemplate(options: StaffOrderBuildOptions, initial: OrderBuild | null): Template | null {
    const id = initial ? initial.templateId : options.defaultTemplateId;
    return options.templates.find((t) => t.id === id) ?? null;
}

function useBuildTemplate<P extends AnyPlacement>(
    options: StaffOrderBuildOptions,
    initial: OrderBuild | null,
    toPlacements: (rows: Template["placements"]) => P[],
) {
    const [template, setTemplate] = useState<Template | null>(() => startingTemplate(options, initial));
    const [placements, setPlacements] = useState<P[]>(() =>
        toPlacements(initial ? (initial.placements as Template["placements"]) : (template?.placements ?? [])),
    );
    const templatePlacements = useMemo(() => (template ? toPlacements(template.placements) : []), [template, toPlacements]);
    const matches = template !== null && placementsExactMatch(placements, templatePlacements);
    const choose = (value: string) => {
        const next = options.templates.find((t) => String(t.id) === value) ?? null;
        setTemplate(next);
        setPlacements(next ? toPlacements(next.placements) : []);
    };
    const filling = fillingSourceLabel({ matched: matches ? template : null, basedOn: template });
    return { template, placements, setPlacements, matches, choose, filling, reset: () => setPlacements(templatePlacements) };
}

function TemplatePicker({
    options,
    template,
    matches,
    pieces,
    onChoose,
    onReset,
}: {
    options: StaffOrderBuildOptions;
    template: Template | null;
    matches: boolean;
    pieces: number;
    onChoose: (value: string) => void;
    onReset: () => void;
}) {
    const scope =
        options.productType === "pillow" ? `Size ${options.size} · ${options.tier}` : `${options.length} length`;
    return (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="w-full space-y-1.5 sm:w-72">
                <Label htmlFor="order-build-template">Filling Template</Label>
                <Select value={template ? String(template.id) : ""} onValueChange={onChoose}>
                    <SelectTrigger id="order-build-template" className="w-full">
                        <SelectValue placeholder="Choose a template" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.templates.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                                {t.name}
                                {t.id === options.defaultTemplateId ? " (default)" : ""}
                            </SelectItem>
                        ))}
                        <SelectItem value={NO_TEMPLATE}>No template: start empty</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1.5 text-sm">
                <Badge variant="secondary" className="capitalize">
                    {scope}
                </Badge>
                <span className="text-muted-foreground tabular-nums">
                    {pieces} piece{pieces === 1 ? "" : "s"}
                </span>
                {template && !matches ? (
                    <>
                        <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                            Adjusted
                        </Badge>
                        <Button type="button" size="sm" variant="ghost" onClick={onReset}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            Back to {template.name}
                        </Button>
                    </>
                ) : null}
            </div>
            {options.templates.length === 0 ? (
                <p className="w-full text-sm text-muted-foreground">
                    No Filling Template is laid out for this size yet. Place the fillings by hand, or add a template
                    under Inventory → Configure.
                </p>
            ) : null}
        </div>
    );
}

function BuildFooter({
    children,
    saveLabel,
    disabled,
    onCancel,
    onSave,
}: {
    children?: ReactNode;
    saveLabel: string;
    disabled: boolean;
    onCancel: () => void;
    onSave: () => void;
}) {
    return (
        <div className="md:sticky md:-bottom-6 md:z-10 md:-mx-6 md:-mb-6 md:border-t md:bg-background md:px-6 md:py-4">
            <DialogFooter className="items-center gap-2 sm:justify-between">
                <p className="text-sm text-muted-foreground">{children}</p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={onSave} disabled={disabled}>
                        {saveLabel}
                    </Button>
                </div>
            </DialogFooter>
        </div>
    );
}

const toPillow = (rows: Template["placements"]) => rowsToPillowPlacements(rows as PillowPlacementRow[]);
const toBolster = (rows: Template["placements"]) => rowsToBolsterPlacements(rows as BolsterPlacementRow[]);

function PillowBuild({ options, initial, saveLabel, onCancel, onSave }: BuildProps) {
    const build = useBuildTemplate<PillowPlacement>(options, initial, toPillow);
    const { placements, setPlacements } = build;
    const { items, colorOverrides, dimensionOverrides } = options;

    const fit = usePillowFit(placements, options.size, items, dimensionOverrides);
    const { itemSubtypes, itemSizes, itemDims } = useItemMaps(items, dimensionOverrides);
    const softBody = useMemo(() => softBodyFromPayload(dimensionOverrides), [dimensionOverrides]);
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
    const pieces = placements.length;
    const extras = useMemo(() => {
        const priceOf = new Map(items.flatMap((i) => (i.msrp == null ? [] : [[i.id, i.msrp] as const])));
        const charged = placements.filter((p) => priceOf.has(p.itemId));
        return { count: charged.length, amount: charged.reduce((sum, p) => sum + (priceOf.get(p.itemId) ?? 0), 0) };
    }, [items, placements]);

    const save = () => {
        if (!confirmSaveWithOverCells(fit, saveLabel)) return;
        onSave({
            templateId: build.template?.id ?? null,
            placements: pillowPlacementsToRows(placements),
            filling: build.filling,
            pieces,
        });
    };

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <TemplatePicker
                options={options}
                template={build.template}
                matches={build.matches}
                pieces={pieces}
                onChoose={build.choose}
                onReset={build.reset}
            />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="mx-auto w-full min-w-0 max-w-[52rem]">
                    <XrayEditor
                        placements={placements}
                        onPlacementsChange={setPlacements}
                        items={items}
                        pillowSize={options.size}
                        colorOverrides={colorOverrides}
                        dimensionOverrides={dimensionOverrides}
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
            <XrayCrossSectionStrip
                fit={fit}
                active={divedSection}
                onActiveChange={setCut}
                itemSubtypes={itemSubtypes}
                itemSizes={itemSizes}
                itemDims={itemDims}
                placements={placements}
                onPlacementsChange={setPlacements}
                items={items}
                colorOverrides={colorOverrides}
                softBody={softBody}
            />
            <section className="rounded-md border" aria-label="What goes in">
                <h3 className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-medium">
                    What goes in
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {pieces} piece{pieces === 1 ? "" : "s"}
                    </span>
                </h3>
                {pieces === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                        Nothing yet. Choose a template, or click a section on the x-ray to add a filling.
                    </p>
                ) : (
                    <XrayPackList placements={placements} onPlacementsChange={setPlacements} items={items} />
                )}
            </section>
            <BuildFooter saveLabel={saveLabel} disabled={pieces === 0} onCancel={onCancel} onSave={save}>
                {build.filling}
                {extras.count > 0
                    ? ` · ${extras.count} Ear Comfort Pad${extras.count === 1 ? "" : "s"} add${extras.count === 1 ? "s" : ""} ${money(extras.amount)}`
                    : ""}
            </BuildFooter>
        </div>
    );
}

function BolsterBuild({ options, initial, saveLabel, onCancel, onSave }: BuildProps) {
    const build = useBuildTemplate<BolsterPlacement>(options, initial, toBolster);
    const { placements, setPlacements } = build;
    const { items, colorOverrides, dimensionOverrides } = options;
    const length = (options.length ?? "medium") as BolsterLength;
    const fit = useBolsterFit(placements, length, items, dimensionOverrides);
    const listItems = useMemo(() => items.map((i) => ({ ...i, label: fillingLabel(i) })), [items]);
    const pieces = placements.length;

    const save = () => {
        if (!confirmSaveWithBolsterFit(fit, saveLabel)) return;
        onSave({
            templateId: build.template?.id ?? null,
            placements: bolsterPlacementsToRows(placements),
            filling: build.filling,
            pieces,
        });
    };

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <TemplatePicker
                options={options}
                template={build.template}
                matches={build.matches}
                pieces={pieces}
                onChoose={build.choose}
                onReset={build.reset}
            />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="mx-auto w-full min-w-0 max-w-[52rem]">
                    <XrayBolsterEditor
                        placements={placements}
                        length={length}
                        items={items}
                        colorOverrides={colorOverrides}
                        dimensionOverrides={dimensionOverrides}
                        fit={fit}
                    />
                </div>
                <section className="space-y-2" aria-label="What goes in">
                    <h3 className="text-sm font-medium">What goes in, in order</h3>
                    <BolsterCompartmentList value={placements} onChange={setPlacements} items={listItems} />
                </section>
            </div>
            <BuildFooter saveLabel={saveLabel} disabled={pieces === 0} onCancel={onCancel} onSave={save}>
                {build.filling}
            </BuildFooter>
        </div>
    );
}
