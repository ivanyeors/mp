"use client";

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { typingBurst } from "@/components/block-editor/use-editor-history";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AssetSelection } from "@/components/ui/image-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTENT_LIMITS, CONTENT_PLACEHOLDERS, type BlockImage } from "@/lib/email-campaigns/content";
import { cn } from "@/lib/utils";
import { placeCampaignImage, type PlacedCampaignImage } from "../actions";
import { Field } from "../field";

const ImagePicker = lazy(() => import("@/components/ui/image-picker").then((m) => ({ default: m.ImagePicker })));

type Placed = { ok: true; image: PlacedCampaignImage } | { ok: false; error: string };

const placed = new Map<string, Promise<Placed>>();

function place(assetId: string): Promise<Placed> {
    let p = placed.get(assetId);
    if (!p) {
        p = placeCampaignImage(assetId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
        placed.set(assetId, p);
        void p.then((r) => {
            if (!r.ok) placed.delete(assetId);
        });
    }
    return p;
}

function usePlaced(assetId: string): Placed | null {
    const [got, setGot] = useState<{ assetId: string; result: Placed } | null>(null);
    useEffect(() => {
        if (!assetId) return;
        let live = true;
        void place(assetId).then((result) => {
            if (live) setGot({ assetId, result });
        });
        return () => {
            live = false;
        };
    }, [assetId]);
    return got?.assetId === assetId ? got.result : null;
}

export function ImageField({
    image,
    onChange,
    readOnly,
    errors,
    idPrefix,
    inset = false,
    allowDecorative = true,
    layoutLocked = false,
}: {
    image: BlockImage;
    onChange: (next: BlockImage, burst?: string) => void;
    readOnly: boolean;
    errors: Record<string, string>;
    idPrefix: string;
    inset?: boolean;
    allowDecorative?: boolean;
    layoutLocked?: boolean;
}) {
    const shown = usePlaced(image.asset);
    const [placing, setPlacing] = useState(false);
    const [pickError, setPickError] = useState<string | null>(null);
    const altId = `${idPrefix}-alt`;
    const decorativeId = `${idPrefix}-decorative`;
    const decorative = allowDecorative && Boolean(image.decorative);
    const latest = useRef({ image, onChange });
    useLayoutEffect(() => {
        latest.current = { image, onChange };
    });
    const live = useRef(true);
    useEffect(() => {
        live.current = true;
        return () => {
            live.current = false;
        };
    }, []);

    const pick = async (selection: AssetSelection) => {
        const altWhenChosen = image.alt;
        setPlacing(true);
        setPickError(null);
        const res = await place(selection.assetId);
        if (!live.current) return;
        setPlacing(false);
        if (!res.ok) return setPickError(res.error);
        const { image: now, onChange: change } = latest.current;
        const alt = now.alt !== altWhenChosen ? now.alt : selection.alt?.trim().slice(0, CONTENT_LIMITS.alt) || (now.asset ? "" : now.alt);
        change({ ...now, asset: selection.assetId, alt });
    };
    const imageError = pickError ?? errors["image.asset"] ?? (shown && !shown.ok ? shown.error : null);
    const chooseButton = (busy: boolean) => (
        <Button type="button" variant="outline" size="sm" disabled={busy}>
            {placing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
            {placing ? "Getting it ready for email…" : image.asset ? "Replace the image" : "Choose an image"}
        </Button>
    );

    return (
        <div className="space-y-3">
            <div className={cn("mx-auto", inset ? "max-w-[81%]" : "w-full")}>
                {!image.asset ? (
                    <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        <ImageIcon className="h-5 w-5" aria-hidden />
                        {CONTENT_PLACEHOLDERS.image}
                    </div>
                ) : shown?.ok ? (
                    <img
                        src={shown.image.url}
                        alt={decorative ? "" : image.alt}
                        width={shown.image.width}
                        height={shown.image.height}
                        className={cn("block h-auto w-full rounded-md", shown.image.hasAlpha && "bg-white p-4")}
                    />
                ) : (
                    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        {shown ? CONTENT_PLACEHOLDERS.imageUnavailable : <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading the image" />}
                    </div>
                )}
            </div>
            {readOnly || layoutLocked ? null : (
                <Suspense fallback={chooseButton(true)}>
                    <ImagePicker onSelect={(s) => void pick(s)}>{chooseButton(placing)}</ImagePicker>
                </Suspense>
            )}
            {imageError ? <p className="text-xs text-destructive">{imageError}</p> : null}
            <Field label="Alt text" htmlFor={altId} error={errors["image.alt"]} hint="What a screen reader says, and what shows when images are off.">
                <Input
                    id={altId}
                    value={decorative ? "" : image.alt}
                    placeholder={decorative ? "None: it is decorative" : "e.g. A FibreCool cover on a made bed, in white"}
                    maxLength={CONTENT_LIMITS.alt}
                    disabled={readOnly || decorative}
                    aria-invalid={errors["image.alt"] ? true : undefined}
                    onChange={(e) => onChange({ asset: image.asset, alt: e.target.value }, typingBurst(e, altId))}
                />
            </Field>
            {allowDecorative ? (
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={decorativeId}
                        checked={decorative}
                        disabled={readOnly || layoutLocked}
                        onCheckedChange={(v) => onChange(v === true ? { ...image, decorative: true } : { asset: image.asset, alt: image.alt })}
                    />
                    <Label htmlFor={decorativeId} className="font-normal">
                        Decorative: it says nothing a reader would miss
                    </Label>
                </div>
            ) : null}
        </div>
    );
}
