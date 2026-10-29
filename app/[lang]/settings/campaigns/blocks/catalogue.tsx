"use client";

import { useMemo } from "react";
import { Heading, Image as ImageIcon, Minus, MousePointerClick, PanelTop, Pilcrow, StretchVertical } from "lucide-react";
import { PresetPicker } from "@/components/block-editor/preset-picker";
import { RichText } from "@/components/block-editor/rich-text";
import { richTextWords } from "@/components/block-editor/rich-text-doc";
import type { BlockCatalogue, BlockFormProps } from "@/components/block-editor/types";
import { typingBurst } from "@/components/block-editor/use-editor-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    BLOCK_BUTTON_TARGET_LABEL,
    BLOCK_BUTTON_TARGETS,
    CONTENT_LIMITS,
    CONTENT_PLACEHOLDERS,
    emptyBlock,
    IMAGE_LINK_TARGETS,
    isHttpsUrl,
    unknownVariableMessage,
    type BlockButton,
    type BlockButtonTarget,
    type EmailBlock,
    type ImageLinkTarget,
    type ImageWidth,
    type SpacerSize,
} from "@/lib/email-campaigns/content";
import { CAMPAIGN_PLACEHOLDERS } from "@/lib/email-campaigns/rules";
import { cn } from "@/lib/utils";
import { Field } from "../field";
import { ImageField } from "./image-field";
import { paragraphsOf, richTextOf, TEXT_VARIABLES } from "./runs";

/**
 * The campaign's half of the shared block editor (PRD-campaign-email-editor
 * slice 04): its block catalogue, each block's card as it will read in the
 * email, editable in place, with its fields on their placeholders (decision
 * 7), and its presets under it when selected (decision 2). The content model
 * and its checks are slice 03's (lib/email-campaigns/content.ts).
 *
 * A new block type is one entry here and its form; slices 05 to 07 add theirs.
 */

type Of<T extends EmailBlock["type"]> = Extract<EmailBlock, { type: T }>;

const SPACER_LABEL: Record<SpacerSize, string> = { s: "Small", m: "Medium", l: "Large" };
const SPACER_HEIGHT: Record<SpacerSize, string> = { s: "h-3", m: "h-8", l: "h-14" };

/** The words a block's field shows its error in, or nothing. */
const FieldError = ({ text }: { text?: string | null }) => (text ? <p className="mt-1 text-xs text-destructive">{text}</p> : null);

/** Save's error for a field, or anything under it. */
const errorAt = (errors: Record<string, string>, path: string) =>
    errors[path] ?? Object.entries(errors).find(([k]) => k.startsWith(`${path}.`))?.[1];

function HeadingForm({ block: b, onChange, readOnly, errors, idPrefix }: BlockFormProps<Of<"heading">>) {
    const id = `${idPrefix}-text`;
    const error = errorAt(errors, "text");
    return (
        <div>
            <Input
                id={id}
                aria-label={b.level === 1 ? "Title" : "Heading"}
                aria-invalid={error ? true : undefined}
                value={b.text}
                placeholder={CONTENT_PLACEHOLDERS.heading}
                maxLength={CONTENT_LIMITS.heading}
                disabled={readOnly}
                onChange={(e) => onChange({ ...b, text: e.target.value }, typingBurst(e, id))}
                className={cn("h-auto border-transparent px-2 py-1 font-semibold tracking-tight shadow-none hover:border-input", b.level === 1 ? "text-2xl md:text-2xl" : "text-lg md:text-lg")}
            />
            <FieldError text={error} />
        </div>
    );
}

function HeadingOptions({ block: b, onChange, readOnly }: BlockFormProps<Of<"heading">>) {
    return (
        <PresetPicker
            label="Size"
            value={String(b.level) as "1" | "2"}
            options={[
                { value: "1", label: "Title" },
                { value: "2", label: "Heading" },
            ]}
            disabled={readOnly}
            onChange={(v) => onChange({ ...b, level: v === "1" ? 1 : 2 })}
        />
    );
}

function TextForm({ block: b, onChange, readOnly, errors, idPrefix, onSlash }: BlockFormProps<Of<"text">>) {
    const id = `${idPrefix}-text`;
    const value = useMemo(() => richTextOf(b.paragraphs), [b.paragraphs]);
    const error = errorAt(errors, "paragraphs") ?? unknownVariableMessage(richTextWords(value));
    return (
        <div>
            <RichText
                id={id}
                aria-label="Text"
                aria-invalid={Boolean(error)}
                value={value}
                marks={{ bold: true, italic: true, bullets: true, link: isHttpsUrl }}
                variables={TEXT_VARIABLES}
                placeholder={CONTENT_PLACEHOLDERS.text}
                readOnly={readOnly}
                onSlash={onSlash}
                onChange={(next, how) => onChange({ ...b, paragraphs: paragraphsOf(next) }, how.paste ? undefined : id)}
            />
            <FieldError text={error} />
        </div>
    );
}

/** A button sent somewhere else: only a link button keeps a link of its own. */
const retarget = (x: BlockButton, target: BlockButtonTarget): BlockButton =>
    target === "url" ? { label: x.label, target, url: x.url ?? "", style: x.style } : { label: x.label, target, style: x.style };

function ButtonsForm({ block: b, onChange, readOnly, errors, idPrefix }: BlockFormProps<Of<"buttons">>) {
    const set = (j: number, x: BlockButton, burst?: string) => onChange({ ...b, buttons: b.buttons.map((y, k) => (k === j ? x : y)) }, burst);
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                {b.buttons.map((x, j) => {
                    const bid = `${idPrefix}-button-${j}`;
                    const which = b.buttons.length > 1 ? (j === 0 ? "First button" : "Second button") : "Button";
                    return (
                        <div key={j} className={cn("space-y-3", b.buttons.length === 1 && "sm:col-span-2")}>
                            {/* The button as it reads: its label typed on it. */}
                            <div>
                                <input
                                    id={`${bid}-label`}
                                    aria-label={`${which}: label`}
                                    aria-invalid={errors[`buttons.${j}.label`] ? true : undefined}
                                    value={x.label}
                                    placeholder={CAMPAIGN_PLACEHOLDERS.buttonLabel}
                                    maxLength={CONTENT_LIMITS.buttonLabel}
                                    disabled={readOnly}
                                    onChange={(e) => set(j, { ...x, label: e.target.value }, typingBurst(e, `${bid}-label`))}
                                    className={cn(
                                        "h-10 w-full max-w-60 rounded-md border px-4 text-center text-sm font-semibold outline-none transition-[box-shadow] placeholder:font-normal focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70 aria-invalid:border-destructive max-md:min-h-11",
                                        x.style === "primary"
                                            ? "border-primary bg-primary text-primary-foreground placeholder:text-primary-foreground/70"
                                            : "border-foreground/60 bg-transparent text-foreground placeholder:text-muted-foreground",
                                    )}
                                />
                                <FieldError text={errors[`buttons.${j}.label`]} />
                            </div>
                            <Field label="Goes to" htmlFor={`${bid}-target`}>
                                <Select value={x.target} onValueChange={(v) => set(j, retarget(x, v as BlockButtonTarget))}>
                                    <SelectTrigger id={`${bid}-target`} className="w-full justify-between" disabled={readOnly}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BLOCK_BUTTON_TARGETS.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {BLOCK_BUTTON_TARGET_LABEL[t]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            {x.target === "url" ? (
                                <Field label="Link" htmlFor={`${bid}-url`} error={errors[`buttons.${j}.url`]}>
                                    <Input
                                        id={`${bid}-url`}
                                        value={x.url ?? ""}
                                        placeholder="https://"
                                        disabled={readOnly}
                                        onChange={(e) => set(j, { ...x, url: e.target.value }, typingBurst(e, `${bid}-url`))}
                                    />
                                </Field>
                            ) : null}
                            {x.target === "sign_in" ? (
                                <p className="text-xs text-muted-foreground">
                                    Imported customers who haven&apos;t signed in get their own link, with their email already filled in.
                                </p>
                            ) : null}
                            {b.buttons.length > 1 && !readOnly ? (
                                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange({ ...b, buttons: b.buttons.filter((_, k) => k !== j) })}>
                                    Remove this button
                                </Button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            <FieldError text={errors.buttons} />
            {b.buttons.length < 2 && !readOnly ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    onClick={() => onChange({ ...b, buttons: [...b.buttons, { label: "", target: "shop", style: "secondary" }] })}
                >
                    Add a second button beside it
                </Button>
            ) : null}
        </div>
    );
}

function ButtonsOptions({ block: b, onChange, readOnly }: BlockFormProps<Of<"buttons">>) {
    return (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
            {b.buttons.map((x, j) => (
                <PresetPicker
                    key={j}
                    label={b.buttons.length > 1 ? (j === 0 ? "First button" : "Second button") : "Style"}
                    value={x.style}
                    options={[
                        { value: "primary", label: "Filled" },
                        { value: "secondary", label: "Outline" },
                    ]}
                    disabled={readOnly}
                    onChange={(style) => onChange({ ...b, buttons: b.buttons.map((y, k) => (k === j ? { ...y, style } : y)) })}
                />
            ))}
        </div>
    );
}

const IMAGE_WIDTH_LABEL: Record<ImageWidth, string> = { full: "Full", inset: "Inset" };

/** Where an image goes when tapped: nowhere, a page of the site, or a link of its own. */
const NO_LINK = "none";

function ImageForm({ block: b, onChange, readOnly, errors, idPrefix }: BlockFormProps<Of<"image">>) {
    const linkId = `${idPrefix}-link`;
    const relink = (v: string) => {
        const unlinked = { ...b };
        delete unlinked.link;
        if (v === NO_LINK) return onChange(unlinked);
        const target = v as ImageLinkTarget;
        onChange({ ...unlinked, link: target === "url" ? { target, url: b.link?.url ?? "" } : { target } });
    };
    return (
        <div className="space-y-4">
            <ImageField
                image={b.image}
                onChange={(image, burst) => onChange({ ...b, image }, burst)}
                readOnly={readOnly}
                errors={errors}
                idPrefix={idPrefix}
                inset={b.width === "inset"}
            />
            <Field label="Links to" htmlFor={linkId}>
                <Select value={b.link?.target ?? NO_LINK} onValueChange={relink}>
                    <SelectTrigger id={linkId} className="w-full justify-between" disabled={readOnly}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NO_LINK}>Nothing</SelectItem>
                        {IMAGE_LINK_TARGETS.map((t) => (
                            <SelectItem key={t} value={t}>
                                {BLOCK_BUTTON_TARGET_LABEL[t]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {b.link?.target === "url" ? (
                <Field label="Link" htmlFor={`${linkId}-url`} error={errors["link.url"]}>
                    <Input
                        id={`${linkId}-url`}
                        value={b.link.url ?? ""}
                        placeholder="https://"
                        disabled={readOnly}
                        onChange={(e) => onChange({ ...b, link: { target: "url", url: e.target.value } }, typingBurst(e, `${linkId}-url`))}
                    />
                </Field>
            ) : null}
        </div>
    );
}

function ImageOptions({ block: b, onChange, readOnly }: BlockFormProps<Of<"image">>) {
    return (
        <PresetPicker
            label="Width"
            value={b.width}
            options={(Object.keys(IMAGE_WIDTH_LABEL) as ImageWidth[]).map((w) => ({ value: w, label: IMAGE_WIDTH_LABEL[w] }))}
            disabled={readOnly}
            onChange={(width) => onChange({ ...b, width })}
        />
    );
}

type Hero = Of<"hero">;
/** A hero's parts below its image, each of which may be left out. */
type HeroPart = "heading" | "line" | "button";

/** The hero without one of its parts. */
function withoutPart(b: Hero, part: HeroPart): Hero {
    const next = { ...b };
    delete next[part];
    return next;
}

/** A new part, on its placeholder. */
const NEW_PART = { heading: "", line: "", button: { label: "", target: "shop", style: "primary" } } as const satisfies Required<Pick<Hero, HeroPart>>;

const PART_NAME: Record<HeroPart, string> = { heading: "heading", line: "line", button: "button" };

function HeroForm({ block: b, onChange, readOnly, errors, idPrefix }: BlockFormProps<Hero>) {
    const headingId = `${idPrefix}-heading`;
    const lineId = `${idPrefix}-line`;
    const bid = `${idPrefix}-button`;
    const remove = (part: HeroPart) =>
        readOnly ? null : (
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange(withoutPart(b, part))}>
                Remove the {PART_NAME[part]}
            </Button>
        );
    const missing = (["heading", "line", "button"] as const).filter((part) => b[part] === undefined);
    const x = b.button;
    return (
        <div className="space-y-4">
            <ImageField image={b.image} onChange={(image, burst) => onChange({ ...b, image }, burst)} readOnly={readOnly} errors={errors} idPrefix={idPrefix} />
            {/* Below the image, never on it: real words and a real button (decision 6). */}
            {b.heading !== undefined ? (
                <div className="text-center">
                    <Input
                        id={headingId}
                        aria-label="Hero heading"
                        aria-invalid={errors.heading ? true : undefined}
                        value={b.heading}
                        placeholder={CONTENT_PLACEHOLDERS.heading}
                        maxLength={CONTENT_LIMITS.heading}
                        disabled={readOnly}
                        onChange={(e) => onChange({ ...b, heading: e.target.value }, typingBurst(e, headingId))}
                        className="h-auto border-transparent px-2 py-1 text-center text-xl font-semibold tracking-tight shadow-none hover:border-input md:text-xl"
                    />
                    <FieldError text={errors.heading} />
                    {remove("heading")}
                </div>
            ) : null}
            {b.line !== undefined ? (
                <div className="text-center">
                    <Input
                        id={lineId}
                        aria-label="Hero line"
                        aria-invalid={errors.line ? true : undefined}
                        value={b.line}
                        placeholder={CONTENT_PLACEHOLDERS.line}
                        maxLength={CONTENT_LIMITS.line}
                        disabled={readOnly}
                        onChange={(e) => onChange({ ...b, line: e.target.value }, typingBurst(e, lineId))}
                        className="h-auto border-transparent px-2 py-1 text-center shadow-none hover:border-input"
                    />
                    <FieldError text={errors.line} />
                    {remove("line")}
                </div>
            ) : null}
            {x ? (
                <div className="space-y-3">
                    <div className="text-center">
                        <input
                            id={`${bid}-label`}
                            aria-label="Hero button: label"
                            aria-invalid={errors["button.label"] ? true : undefined}
                            value={x.label}
                            placeholder={CAMPAIGN_PLACEHOLDERS.buttonLabel}
                            maxLength={CONTENT_LIMITS.buttonLabel}
                            disabled={readOnly}
                            onChange={(e) => onChange({ ...b, button: { ...x, label: e.target.value } }, typingBurst(e, `${bid}-label`))}
                            className={cn(
                                "h-10 w-full max-w-60 rounded-md border px-4 text-center text-sm font-semibold outline-none transition-[box-shadow] placeholder:font-normal focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70 aria-invalid:border-destructive max-md:min-h-11",
                                x.style === "primary"
                                    ? "border-primary bg-primary text-primary-foreground placeholder:text-primary-foreground/70"
                                    : "border-foreground/60 bg-transparent text-foreground placeholder:text-muted-foreground",
                            )}
                        />
                        <FieldError text={errors["button.label"]} />
                    </div>
                    <Field label="Goes to" htmlFor={`${bid}-target`}>
                        <Select value={x.target} onValueChange={(v) => onChange({ ...b, button: retarget(x, v as BlockButtonTarget) })}>
                            <SelectTrigger id={`${bid}-target`} className="w-full justify-between" disabled={readOnly}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {BLOCK_BUTTON_TARGETS.map((t) => (
                                    <SelectItem key={t} value={t}>
                                        {BLOCK_BUTTON_TARGET_LABEL[t]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    {x.target === "url" ? (
                        <Field label="Link" htmlFor={`${bid}-url`} error={errors["button.url"]}>
                            <Input
                                id={`${bid}-url`}
                                value={x.url ?? ""}
                                placeholder="https://"
                                disabled={readOnly}
                                onChange={(e) => onChange({ ...b, button: { ...x, url: e.target.value } }, typingBurst(e, `${bid}-url`))}
                            />
                        </Field>
                    ) : null}
                    {remove("button")}
                </div>
            ) : null}
            {missing.length && !readOnly ? (
                <div className="flex flex-wrap gap-x-4">
                    {missing.map((part) => (
                        <Button key={part} type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange({ ...b, [part]: NEW_PART[part] })}>
                            Add a {PART_NAME[part]}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function HeroOptions({ block: b, onChange, readOnly }: BlockFormProps<Hero>) {
    const x = b.button;
    if (!x) return null;
    return (
        <PresetPicker
            label="Button"
            value={x.style}
            options={[
                { value: "primary", label: "Filled" },
                { value: "secondary", label: "Outline" },
            ]}
            disabled={readOnly}
            onChange={(style) => onChange({ ...b, button: { ...x, style } })}
        />
    );
}

function DividerForm() {
    return (
        <div className="py-2">
            <hr className="border-border" />
            <span className="sr-only">A thin line across the email.</span>
        </div>
    );
}

function SpacerForm({ block: b }: BlockFormProps<Of<"spacer">>) {
    return (
        <div className={cn("flex items-center justify-center rounded border border-dashed text-[11px] text-muted-foreground", SPACER_HEIGHT[b.size])}>
            {SPACER_LABEL[b.size]} space
        </div>
    );
}

function SpacerOptions({ block: b, onChange, readOnly }: BlockFormProps<Of<"spacer">>) {
    return (
        <PresetPicker
            label="Size"
            value={b.size}
            options={(Object.keys(SPACER_LABEL) as SpacerSize[]).map((s) => ({ value: s, label: SPACER_LABEL[s] }))}
            disabled={readOnly}
            onChange={(size) => onChange({ ...b, size })}
        />
    );
}

/** Every Email block type the campaign editor offers, in the palette's order. */
export const CAMPAIGN_BLOCKS: BlockCatalogue<EmailBlock> = {
    heading: {
        label: "Heading",
        description: "The email's title, or a part's",
        icon: Heading,
        create: () => emptyBlock("heading") as Of<"heading">,
        Form: HeadingForm,
        Options: HeadingOptions,
    },
    text: {
        label: "Text",
        description: "Paragraphs and bullets, with bold and links",
        icon: Pilcrow,
        create: () => emptyBlock("text") as Of<"text">,
        Form: TextForm,
    },
    buttons: {
        label: "Buttons",
        description: "One button, or two side by side",
        icon: MousePointerClick,
        create: () => emptyBlock("buttons") as Of<"buttons">,
        Form: ButtonsForm,
        Options: ButtonsOptions,
    },
    image: {
        label: "Image",
        description: "A photo from the Media Library, with its alt text",
        icon: ImageIcon,
        create: () => emptyBlock("image") as Of<"image">,
        Form: ImageForm,
        Options: ImageOptions,
    },
    hero: {
        label: "Hero",
        description: "A big photo, then a heading, a line and a button below it",
        icon: PanelTop,
        create: () => emptyBlock("hero") as Hero,
        Form: HeroForm,
        Options: HeroOptions,
    },
    divider: {
        label: "Divider",
        description: "A thin line between parts",
        icon: Minus,
        create: () => emptyBlock("divider") as Of<"divider">,
        Form: DividerForm,
    },
    spacer: {
        label: "Spacer",
        description: "Some room between parts",
        icon: StretchVertical,
        create: () => emptyBlock("spacer") as Of<"spacer">,
        Form: SpacerForm,
        Options: SpacerOptions,
    },
};
