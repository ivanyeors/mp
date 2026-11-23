"use client";

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { typingBurst } from "@/components/block-editor/use-editor-history";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AssetSelection } from "@/components/ui/image-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTENT_LIMITS, CONTENT_PLACEHOLDERS, type BlockImage } from "@/lib/email-campaigns/content";
import { uploadImage } from "@/lib/media-assets/upload-image";
import { cn } from "@/lib/utils";
import { placeCampaignImage, type PlacedCampaignImage } from "../actions";
import { Field } from "../field";

const ImagePicker = lazy(() => import("@/components/ui/image-picker").then((m) => ({ default: m.ImagePicker })));

const DROP_OR_CHOOSE = "Drop an image here, upload one, or choose one from the Media Library.";

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
    altHint = "What a screen reader says, and what shows when images are off.",
    layoutLocked = false,
}: {
    image: BlockImage;
    onChange: (next: BlockImage, burst?: string) => void;
    readOnly: boolean;
    errors: Record<string, string>;
    idPrefix: string;
    inset?: boolean;
    allowDecorative?: boolean;
    altHint?: string;
    layoutLocked?: boolean;
}) {
    const shown = usePlaced(image.asset);
    const [placing, setPlacing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dropping, setDropping] = useState(false);
    const [pickError, setPickError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const fixed = readOnly || layoutLocked;
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
    const upload = async (file: File | undefined) => {
        if (!file || fixed || uploading || placing) return;
        setUploading(true);
        setPickError(null);
        const res = await uploadImage(file);
        if (!live.current) return;
        setUploading(false);
        if (fileInput.current) fileInput.current.value = "";
        if (!res.ok) return setPickError(res.error);
        await pick({ assetId: res.asset.id, url: res.asset.hosted_url, alt: res.asset.alt_text ?? null });
    };
    const filesDragged = (e: React.DragEvent) => !fixed && e.dataTransfer.types.includes("Files");
    const dropZone = {
        onDragOver: (e: React.DragEvent) => {
            if (!filesDragged(e)) return;
            e.preventDefault();
            setDropping(true);
        },
        onDragLeave: () => setDropping(false),
        onDrop: (e: React.DragEvent) => {
            if (!filesDragged(e)) return;
            e.preventDefault();
            setDropping(false);
            void upload(e.dataTransfer.files[0]);
        },
    };
    const busy = uploading || placing;
    const imageError = pickError ?? errors["image.asset"] ?? (shown && !shown.ok ? shown.error : null);
    const chooseButton = (disabled: boolean) => (
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
            {placing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-1 h-4 w-4" />}
            {placing ? "Getting it ready for email…" : "Choose from library"}
        </Button>
    );

    return (
        <div className="space-y-3">
            <div className={cn("mx-auto rounded-md", inset ? "max-w-[81%]" : "w-full", dropping && "ring-2 ring-primary")} {...dropZone}>
                {!image.asset ? (
                    <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                        <ImageIcon className="h-5 w-5" aria-hidden />
                        {fixed ? CONTENT_PLACEHOLDERS.image : DROP_OR_CHOOSE}
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
            {fixed ? null : (
                <div className="flex flex-wrap gap-2">
                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label="Upload an image from this device"
                        onChange={(e) => void upload(e.target.files?.[0])}
                    />
                    <Button type="button" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
                        {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                        {uploading ? "Uploading…" : image.asset ? "Upload a new image" : "Upload an image"}
                    </Button>
                    <Suspense fallback={chooseButton(true)}>
                        <ImagePicker onSelect={(s) => void pick(s)}>{chooseButton(busy)}</ImagePicker>
                    </Suspense>
                </div>
            )}
            {imageError ? <p className="text-xs text-destructive">{imageError}</p> : null}
            <Field label="Alt text" htmlFor={altId} error={errors["image.alt"]} hint={altHint}>
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
