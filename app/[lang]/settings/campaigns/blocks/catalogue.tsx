"use client";

import { useMemo } from "react";
import { Columns2, Heading, Image as ImageIcon, Minus, MousePointerClick, PanelTop, Pilcrow, ShoppingBag, StretchVertical } from "lucide-react";
import { AiButton } from "@/components/block-editor/ai-button";
import { PresetPicker } from "@/components/block-editor/preset-picker";
import { RichText } from "@/components/block-editor/rich-text";
import { richTextFromWords, richTextWords } from "@/components/block-editor/rich-text-doc";
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
    paragraphRuns,
    PRODUCT_BUTTON_LABEL,
    SPLIT_SIDES,
    unknownVariableMessage,
    type BlockButton,
    type BlockButtonTarget,
    type EmailBlock,
    type ImageLinkTarget,
    type ImageWidth,
    type Paragraph,
    type ProductLayout,
    type SpacerSize,
    type SplitSide,
} from "@/lib/email-campaigns/content";
import { CAMPAIGN_PLACEHOLDERS } from "@/lib/email-campaigns/rules";
import { cn } from "@/lib/utils";
import { useCampaignAi } from "../ai/ai-context";
import { RewriteOffered, rewriteOffered } from "../ai/rewrite-tools";
import { useChineseEditing } from "../chinese/chinese-context";
import { BlockTools, ChineseTools } from "../chinese/chinese-tools";
import { Field } from "../field";
import { ImageField } from "./image-field";
import { ProductField, ProductsField } from "./products-field";
import { paragraphsOf, richTextOf } from "./runs";
import { useCampaignVariables } from "./variables";

/**
 * The campaign's half of the shared block editor (PRD-campaign-email-editor
 * slice 04): its block catalogue, each block's card as it will read in the
 * email, editable in place, with its fields on their placeholders (decision
 * 7), and its presets under it when selected (decision 2). The content model
 * and its checks are slice 03's (lib/email-campaigns/content.ts).
 *
 * A new block type is one entry here and its form; slices 05 to 07 add theirs.
 *
 * In the editor's 中文 (slice 17) the same forms show the 中文 words, with
 * `layoutLocked`: each keeps its word fields and fixes its targets, pictures,
 * parts and options, which are the English's.
 */

type Of<T extends EmailBlock["type"]> = Extract<EmailBlock, { type: T }>;

const SPACER_LABEL: Record<SpacerSize, string> = { s: "Small", m: "Medium", l: "Large" };
const SPACER_HEIGHT: Record<SpacerSize, string> = { s: "h-3", m: "h-8", l: "h-14" };

/** The words a block's field shows its error in, or nothing. */
const FieldError = ({ text }: { text?: string | null }) => (text ? <p className="mt-1 text-xs text-destructive">{text}</p> : null);

/** Save's error for a field, or anything under it. */
const errorAt = (errors: Record<string, string>, path: string) =>
    errors[path] ?? Object.entries(errors).find(([k]) => k.startsWith(`${path}.`))?.[1];

/** A heading's words as they read, in one line, with Variables as chips (`VariableLine`). */
function HeadingForm({ block: b, onChange, readOnly, errors, idPrefix }: BlockFormProps<Of<"heading">>) {
    const ai = useCampaignAi();
    if (rewriteOffered(ai, b.id) && !readOnly) return <RewriteOffered block={b} idPrefix={idPrefix} />;
    return (
        <div>
            <VariableLine
                id={`${idPrefix}-text`}
                label={b.level === 1 ? "Title" : "Heading"}
                text={b.text}
                onChange={(text, burst) => onChange({ ...b, text }, burst)}
                readOnly={readOnly}
                error={errorAt(errors, "text")}
                placeholder={CONTENT_PLACEHOLDERS.heading}
                className={cn("border-transparent px-2 py-1 font-semibold tracking-tight shadow-none hover:border-input", b.level === 1 ? "text-2xl md:text-2xl" : "text-lg md:text-lg")}
            />
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

/**
 * A text block's words, in paragraphs and bullets with bold, italic and
 * links, and Variables as chips (slice 13): a text block's, and the words
 * beside an image + text's image. `also` is a check of the block's own, shown
 * after the Variables'.
 */
function TextRuns({
    id,
    label,
    paragraphs,
    onChange,
    readOnly,
    error,
    also,
    onSlash,
    link = isHttpsUrl,
}: {
    id: string;
    label: string;
    paragraphs: Paragraph[];
    onChange: (next: Paragraph[], burst?: string) => void;
    readOnly: boolean;
    error?: string;
    also?: string | null;
    onSlash?: () => void;
    /** Which links its words may carry: any https one, or in 中文 only the English block's (slice 17). */
    link?: (url: string) => boolean;
}) {
    const variables = useCampaignVariables();
    const value = useMemo(() => richTextOf(paragraphs), [paragraphs]);
    const shown = error ?? unknownVariableMessage(richTextWords(value)) ?? also;
    return (
        <>
            <RichText
                id={id}
                aria-label={label}
                aria-invalid={Boolean(shown)}
                value={value}
                marks={{ bold: true, italic: true, bullets: true, link }}
                variables={variables}
                placeholder={CONTENT_PLACEHOLDERS.text}
                readOnly={readOnly}
                onSlash={onSlash}
                onChange={(next, how) => onChange(paragraphsOf(next), how.paste ? undefined : id)}
            />
            <FieldError text={shown} />
        </>
    );
}

/** In 中文 a link is one of the English block's, by its place (slice 17): no other can be added there. */
function useLinkCheck(id: string): ((url: string) => boolean) | undefined {
    const zh = useChineseEditing();
    return zh ? (url) => zh.links(id).includes(url) : undefined;
}

function TextForm({ block: b, onChange, readOnly, errors, idPrefix, onSlash }: BlockFormProps<Of<"text">>) {
    // An empty text block offers to be written from the subject (slice 09), while AI writing is on.
    const ai = useCampaignAi();
    const link = useLinkCheck(b.id);
    const empty = !paragraphRuns(b.paragraphs).some((r) => "var" in r || r.text.trim());
    const writing = ai?.writing?.id === b.id ? ai.writing.stage : null;
    if (rewriteOffered(ai, b.id) && !readOnly) return <RewriteOffered block={b} idPrefix={idPrefix} />;
    return (
        <div>
            <TextRuns
                id={`${idPrefix}-text`}
                label="Text"
                paragraphs={b.paragraphs}
                onChange={(paragraphs, burst) => onChange({ ...b, paragraphs }, burst)}
                readOnly={readOnly}
                error={errorAt(errors, "paragraphs")}
                onSlash={onSlash}
                link={link}
            />
            {ai && empty && !readOnly ? (
                <AiButton
                    variant="ghost"
                    className="mt-1"
                    onClick={() => ai.writeBlock(b.id)}
                    working={writing}
                    onStop={ai.stop}
                    disabledReason={writing ? null : ai.reason}
                >
                    Write this from the subject
                </AiButton>
            ) : null}
        </div>
    );
}

/** A button sent somewhere else: only a link button keeps a link of its own, and only a product button a product. */
const retarget = (x: BlockButton, target: BlockButtonTarget): BlockButton =>
    target === "url"
        ? { label: x.label, target, url: x.url ?? "", style: x.style }
        : target === "product"
          ? { label: x.label, target, product: x.product ?? "", style: x.style }
          : { label: x.label, target, style: x.style };

function ButtonsForm({ block: b, onChange, readOnly, layoutLocked, errors, idPrefix }: BlockFormProps<Of<"buttons">>) {
    const set = (j: number, x: BlockButton, burst?: string) => onChange({ ...b, buttons: b.buttons.map((y, k) => (k === j ? x : y)) }, burst);
    // In 中文 (slice 17) the labels change; where each goes is the English's.
    const fixed = readOnly || Boolean(layoutLocked);
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
                                    <SelectTrigger id={`${bid}-target`} className="w-full justify-between" disabled={fixed}>
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
                                        disabled={fixed}
                                        onChange={(e) => set(j, { ...x, url: e.target.value }, typingBurst(e, `${bid}-url`))}
                                    />
                                </Field>
                            ) : null}
                            {x.target === "product" ? (
                                <ProductField
                                    product={x.product ?? ""}
                                    onChange={(product) => set(j, { ...x, product })}
                                    readOnly={fixed}
                                    error={errors[`buttons.${j}.product`]}
                                />
                            ) : null}
                            {x.target === "sign_in" ? (
                                <p className="text-xs text-muted-foreground">
                                    Imported customers who haven&apos;t signed in get their own link, with their email already filled in.
                                </p>
                            ) : null}
                            {b.buttons.length > 1 && !fixed ? (
                                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange({ ...b, buttons: b.buttons.filter((_, k) => k !== j) })}>
                                    Remove this button
                                </Button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            <FieldError text={errors.buttons} />
            {b.buttons.length < 2 && !fixed ? (
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

function ImageForm({ block: b, onChange, readOnly, layoutLocked, errors, idPrefix }: BlockFormProps<Of<"image">>) {
    const linkId = `${idPrefix}-link`;
    const fixed = readOnly || Boolean(layoutLocked);
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
                layoutLocked={layoutLocked}
            />
            <Field label="Links to" htmlFor={linkId}>
                <Select value={b.link?.target ?? NO_LINK} onValueChange={relink}>
                    <SelectTrigger id={linkId} className="w-full justify-between" disabled={fixed}>
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
                        disabled={fixed}
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

/** A button's two looks, as its presets name them. */
const BUTTON_STYLE_OPTIONS = [
    { value: "primary", label: "Filled" },
    { value: "secondary", label: "Outline" },
] as const;

/**
 * One button's fields, its label typed on the button as it reads (a hero's,
 * an image + text's): where it goes, and its link when it is a link. Errors
 * are keyed from the block, `button.label` and `button.url`.
 */
function OneButtonFields({
    button: x,
    onChange,
    readOnly,
    errors,
    idPrefix,
    name,
    align,
    layoutLocked = false,
}: {
    button: BlockButton;
    onChange: (next: BlockButton, burst?: string) => void;
    readOnly: boolean;
    errors: Record<string, string>;
    idPrefix: string;
    /** What the label box is called: "Hero button". */
    name: string;
    align: "center" | "left";
    /** In 中文 (slice 17): its label changes, where it goes doesn't. */
    layoutLocked?: boolean;
}) {
    const bid = `${idPrefix}-button`;
    const fixed = readOnly || layoutLocked;
    return (
        <div className="space-y-3">
            <div className={cn(align === "center" && "text-center")}>
                <input
                    id={`${bid}-label`}
                    aria-label={`${name}: label`}
                    aria-invalid={errors["button.label"] ? true : undefined}
                    value={x.label}
                    placeholder={CAMPAIGN_PLACEHOLDERS.buttonLabel}
                    maxLength={CONTENT_LIMITS.buttonLabel}
                    disabled={readOnly}
                    onChange={(e) => onChange({ ...x, label: e.target.value }, typingBurst(e, `${bid}-label`))}
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
                <Select value={x.target} onValueChange={(v) => onChange(retarget(x, v as BlockButtonTarget))}>
                    <SelectTrigger id={`${bid}-target`} className="w-full justify-between" disabled={fixed}>
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
                        disabled={fixed}
                        onChange={(e) => onChange({ ...x, url: e.target.value }, typingBurst(e, `${bid}-url`))}
                    />
                </Field>
            ) : null}
            {x.target === "product" ? (
                <ProductField product={x.product ?? ""} onChange={(product) => onChange({ ...x, product })} readOnly={fixed} error={errors["button.product"]} />
            ) : null}
        </div>
    );
}

/**
 * A one-line field of a block's words that takes Variables as chips (slice
 * 13): a heading block's, a hero's heading and line, an image + text's
 * heading. Stored as a string, each Variable written `{first_name}`, as the
 * subject is.
 */
function VariableLine({
    id,
    label,
    text,
    onChange,
    readOnly,
    error,
    placeholder,
    className,
}: {
    id: string;
    label: string;
    text: string;
    onChange: (next: string, burst?: string) => void;
    readOnly: boolean;
    error?: string;
    placeholder: string;
    className: string;
}) {
    const variables = useCampaignVariables();
    const value = useMemo(() => richTextFromWords(text, variables), [text, variables]);
    const shown = error ?? unknownVariableMessage(text);
    return (
        <>
            <RichText
                id={id}
                singleLine
                aria-label={label}
                aria-invalid={Boolean(shown)}
                value={value}
                variables={variables}
                placeholder={placeholder}
                readOnly={readOnly}
                onChange={(next, how) => onChange(richTextWords(next), how.paste ? undefined : id)}
                className={className}
            />
            <FieldError text={shown} />
        </>
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

function HeroForm({ block: b, onChange, readOnly, layoutLocked, errors, idPrefix }: BlockFormProps<Hero>) {
    const headingId = `${idPrefix}-heading`;
    const lineId = `${idPrefix}-line`;
    // In 中文 (slice 17) the parts are the English's: none is added or removed there.
    const fixed = readOnly || Boolean(layoutLocked);
    const remove = (part: HeroPart) =>
        fixed ? null : (
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange(withoutPart(b, part))}>
                Remove the {PART_NAME[part]}
            </Button>
        );
    const missing = (["heading", "line", "button"] as const).filter((part) => b[part] === undefined);
    const x = b.button;
    return (
        <div className="space-y-4">
            <ImageField image={b.image} onChange={(image, burst) => onChange({ ...b, image }, burst)} readOnly={readOnly} errors={errors} idPrefix={idPrefix} layoutLocked={layoutLocked} />
            {/* Below the image, never on it: real words and a real button (decision 6). */}
            {b.heading !== undefined ? (
                <div className="text-center">
                    <VariableLine
                        id={headingId}
                        label="Hero heading"
                        text={b.heading}
                        onChange={(heading, burst) => onChange({ ...b, heading }, burst)}
                        readOnly={readOnly}
                        error={errors.heading}
                        placeholder={CONTENT_PLACEHOLDERS.heading}
                        className="border-transparent px-2 py-1 text-center text-xl font-semibold tracking-tight shadow-none hover:border-input md:text-xl"
                    />
                    {remove("heading")}
                </div>
            ) : null}
            {b.line !== undefined ? (
                <div className="text-center">
                    <VariableLine
                        id={lineId}
                        label="Hero line"
                        text={b.line}
                        onChange={(line, burst) => onChange({ ...b, line }, burst)}
                        readOnly={readOnly}
                        error={errors.line}
                        placeholder={CONTENT_PLACEHOLDERS.line}
                        className="border-transparent px-2 py-1 text-center shadow-none hover:border-input"
                    />
                    {remove("line")}
                </div>
            ) : null}
            {x ? (
                <div className="space-y-3">
                    <OneButtonFields
                        button={x}
                        onChange={(button, burst) => onChange({ ...b, button }, burst)}
                        readOnly={readOnly}
                        errors={errors}
                        idPrefix={idPrefix}
                        name="Hero button"
                        align="center"
                        layoutLocked={layoutLocked}
                    />
                    {remove("button")}
                </div>
            ) : null}
            {missing.length && !fixed ? (
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
            options={BUTTON_STYLE_OPTIONS}
            disabled={readOnly}
            onChange={(style) => onChange({ ...b, button: { ...x, style } })}
        />
    );
}

type Split = Of<"split">;

const SIDE_LABEL: Record<SplitSide, string> = { left: "Left", right: "Right" };

/** The words beside an image, in characters, as Save counts them: a Variable counts none. */
const splitLength = (b: Split) => paragraphRuns(b.paragraphs).reduce((n, r) => n + ("text" in r ? r.text.length : 0), 0);

/**
 * An image + text (slice 06): the image on its side of the card when the card
 * has room, as the email lays it out; stacked, the image first, as a phone
 * shows it whichever side it is on. Its words are a heading, a text block's
 * runs and an optional button; its image always says what it shows.
 */
function SplitForm({ block: b, onChange, readOnly, layoutLocked, errors, idPrefix }: BlockFormProps<Split>) {
    const headingId = `${idPrefix}-heading`;
    const x = b.button;
    const fixed = readOnly || Boolean(layoutLocked);
    const link = useLinkCheck(b.id);
    return (
        <div className="@container">
            <div className="grid gap-4 @md:grid-cols-2 @md:items-center">
                <div className={cn(b.side === "right" && "@md:order-2")}>
                    <ImageField
                        image={b.image}
                        onChange={(image, burst) => onChange({ ...b, image }, burst)}
                        readOnly={readOnly}
                        errors={errors}
                        idPrefix={idPrefix}
                        allowDecorative={false}
                        layoutLocked={layoutLocked}
                    />
                </div>
                <div className="space-y-3">
                    <div>
                        <VariableLine
                            id={headingId}
                            label="Heading beside the image"
                            text={b.heading}
                            onChange={(heading, burst) => onChange({ ...b, heading }, burst)}
                            readOnly={readOnly}
                            error={errors.heading}
                            placeholder={CONTENT_PLACEHOLDERS.heading}
                            className="border-transparent px-2 py-1 text-lg font-semibold tracking-tight shadow-none hover:border-input md:text-lg"
                        />
                    </div>
                    <div>
                        <TextRuns
                            id={`${idPrefix}-text`}
                            label="Text beside the image"
                            paragraphs={b.paragraphs}
                            onChange={(paragraphs, burst) => onChange({ ...b, paragraphs }, burst)}
                            readOnly={readOnly}
                            error={errorAt(errors, "paragraphs")}
                            also={splitLength(b) > CONTENT_LIMITS.splitText ? `At most ${CONTENT_LIMITS.splitText} characters.` : null}
                            link={link}
                        />
                    </div>
                    {x ? (
                        <div className="space-y-3">
                            <OneButtonFields
                                button={x}
                                onChange={(button, burst) => onChange({ ...b, button }, burst)}
                                readOnly={readOnly}
                                errors={errors}
                                idPrefix={idPrefix}
                                name="Button beside the image"
                                align="left"
                                layoutLocked={layoutLocked}
                            />
                            {fixed ? null : (
                                <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    className="h-auto px-0"
                                    onClick={() => {
                                        const next = { ...b };
                                        delete next.button;
                                        onChange(next);
                                    }}
                                >
                                    Remove the button
                                </Button>
                            )}
                        </div>
                    ) : fixed ? null : (
                        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange({ ...b, button: NEW_PART.button })}>
                            Add a button
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

function SplitOptions({ block: b, onChange, readOnly }: BlockFormProps<Split>) {
    const x = b.button;
    return (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
            <PresetPicker
                label="Image"
                value={b.side}
                options={SPLIT_SIDES.map((side) => ({ value: side, label: SIDE_LABEL[side] }))}
                disabled={readOnly}
                onChange={(side) => onChange({ ...b, side })}
            />
            {x ? (
                <PresetPicker
                    label="Button"
                    value={x.style}
                    options={BUTTON_STYLE_OPTIONS}
                    disabled={readOnly}
                    onChange={(style) => onChange({ ...b, button: { ...x, style } })}
                />
            ) : null}
        </div>
    );
}

type Products = Of<"products">;

const PRODUCT_LAYOUT_LABEL: Record<ProductLayout, string> = { rows: "One per row", side_by_side: "Side by side" };

/**
 * Products (slice 07): up to three of the shop's Listed products, each shown
 * as the email shows it, with the shop's photo, name and price, never typed;
 * then the label every product's button carries.
 */
function ProductsForm({ block: b, onChange, readOnly, layoutLocked, errors, idPrefix }: BlockFormProps<Products>) {
    const labelId = `${idPrefix}-button-label`;
    return (
        <div className="space-y-4">
            {/* In 中文 (slice 17) the products are the English's; their names are the 中文 shop's, at send. */}
            <ProductsField products={b.products} layout={b.layout} onChange={(products) => onChange({ ...b, products })} readOnly={readOnly || Boolean(layoutLocked)} errors={errors} />
            <div className="text-center">
                {/* Each product's button, its label typed on it. */}
                <input
                    id={labelId}
                    aria-label="Each product's button: label"
                    aria-invalid={errors.buttonLabel ? true : undefined}
                    value={b.buttonLabel}
                    placeholder={PRODUCT_BUTTON_LABEL}
                    maxLength={CONTENT_LIMITS.buttonLabel}
                    disabled={readOnly}
                    onChange={(e) => onChange({ ...b, buttonLabel: e.target.value }, typingBurst(e, labelId))}
                    className="h-10 w-full max-w-60 rounded-md border border-primary bg-primary px-4 text-center text-sm font-semibold text-primary-foreground outline-none transition-[box-shadow] placeholder:font-normal placeholder:text-primary-foreground/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70 aria-invalid:border-destructive max-md:min-h-11"
                />
                <FieldError text={errors.buttonLabel} />
            </div>
        </div>
    );
}

function ProductsOptions({ block: b, onChange, readOnly }: BlockFormProps<Products>) {
    return (
        <PresetPicker
            label="Layout"
            value={b.layout}
            options={(Object.keys(PRODUCT_LAYOUT_LABEL) as ProductLayout[]).map((layout) => ({ value: layout, label: PRODUCT_LAYOUT_LABEL[layout] }))}
            disabled={readOnly}
            onChange={(layout) => onChange({ ...b, layout })}
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
        Tools: BlockTools,
    },
    text: {
        label: "Text",
        description: "Paragraphs and bullets, with bold and links",
        icon: Pilcrow,
        create: () => emptyBlock("text") as Of<"text">,
        Form: TextForm,
        Tools: BlockTools,
    },
    buttons: {
        label: "Buttons",
        description: "One button, or two side by side",
        icon: MousePointerClick,
        create: () => emptyBlock("buttons") as Of<"buttons">,
        Form: ButtonsForm,
        Options: ButtonsOptions,
        Tools: ChineseTools,
    },
    image: {
        label: "Image",
        description: "A photo from the Media Library, with its alt text",
        icon: ImageIcon,
        create: () => emptyBlock("image") as Of<"image">,
        Form: ImageForm,
        Options: ImageOptions,
        Tools: ChineseTools,
    },
    hero: {
        label: "Hero",
        description: "A big photo, then a heading, a line and a button below it",
        icon: PanelTop,
        create: () => emptyBlock("hero") as Hero,
        Form: HeroForm,
        Options: HeroOptions,
        Tools: ChineseTools,
    },
    split: {
        label: "Image + text",
        description: "A photo beside a few lines",
        icon: Columns2,
        create: () => emptyBlock("split") as Split,
        Form: SplitForm,
        Options: SplitOptions,
        Tools: ChineseTools,
    },
    products: {
        label: "Products",
        description: "Up to three from the shop, at its prices",
        icon: ShoppingBag,
        create: () => emptyBlock("products") as Products,
        Form: ProductsForm,
        Options: ProductsOptions,
        Tools: ChineseTools,
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
