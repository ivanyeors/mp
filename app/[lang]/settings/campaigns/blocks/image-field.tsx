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

/**
 * An image block's picture (PRD-campaign-email-editor slice 05), shared by
 * the image and the hero: chosen from the Media Library with its picker
 * (library, upload, or *Select from Drive*), with its alt text, prefilled
 * from the Media Asset's own and the block's to change, or marked decorative.
 *
 * Choosing an image makes its email rendition first (`placeCampaignImage`),
 * so a block only ever places an image an inbox can show; the card shows that
 * rendition, on the light plate when it has transparency, as the email does.
 *
 * An image beside words (slice 06's image + text) always says what it shows,
 * so it offers no *Decorative*.
 */

// The picker and its Drive dialog load with the first image block, not with the page.
const ImagePicker = lazy(() => import("@/components/ui/image-picker").then((m) => ({ default: m.ImagePicker })));

type Placed = { ok: true; image: PlacedCampaignImage } | { ok: false; error: string };

/** Each asset's rendition, asked for once while the page is open; a failure is asked again next time. */
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

/** The rendition of `assetId` for the card, once it arrives. */
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
    /** The block's errors, keyed from the block: `image.asset`, `image.alt`. */
    errors: Record<string, string>;
    idPrefix: string;
    /** Shown narrower, as the email's *Inset* width. */
    inset?: boolean;
    /** Offer *Decorative*; when not, the image always has alt text. Default true. */
    allowDecorative?: boolean;
    /** In 中文 (slice 17): its alt text changes, the picture and whether it is decorative don't. */
    layoutLocked?: boolean;
}) {
    const shown = usePlaced(image.asset);
    const [placing, setPlacing] = useState(false);
    const [pickError, setPickError] = useState<string | null>(null);
    const altId = `${idPrefix}-alt`;
    const decorativeId = `${idPrefix}-decorative`;
    const decorative = allowDecorative && Boolean(image.decorative);
    // The block as it is now: Staff keep editing while a first rendition is made,
    // and the choice lands on what they did meanwhile, not on the block as it was.
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
        // Its block was deleted meanwhile: nothing to place it in.
        if (!live.current) return;
        setPlacing(false);
        if (!res.ok) return setPickError(res.error);
        const { image: now, onChange: change } = latest.current;
        // Alt text typed meanwhile stays; else the asset's own when it has some; a first image keeps what was typed.
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
                    // The rendition, as the email shows it: on its light plate when it has transparency.
                    // eslint-disable-next-line @next/next/no-img-element
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
                    // Typed alt text is never decorative, even where a stored image says it was.
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
