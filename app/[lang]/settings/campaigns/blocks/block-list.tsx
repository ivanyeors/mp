"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { ArrowDown, ArrowUp, Heading, Minus, MousePointerClick, Pilcrow, Plus, StretchVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    BLOCK_BUTTON_TARGET_LABEL,
    BLOCK_BUTTON_TARGETS,
    CONTENT_LIMITS,
    CONTENT_PLACEHOLDERS,
    EMAIL_BLOCK_TYPES,
    emptyBlock,
    variablesUsed,
    type BlockButton,
    type BlockButtonTarget,
    type CampaignContent,
    type EmailBlock,
    type EmailBlockType,
    type SpacerSize,
    unknownVariableMessage,
} from "@/lib/email-campaigns/content";
import { CAMPAIGN_PLACEHOLDERS } from "@/lib/email-campaigns/rules";
import { CAMPAIGN_VARIABLES } from "@/lib/email-campaigns/variables";
import { Field } from "../field";
import { parseTextSource, textSourceOf } from "./text-source";

/**
 * The email's blocks, plainly (PRD-campaign-email-editor slice 03): *Add
 * block*, a small form per block, Move up and Move down, and Delete. A new
 * block's fields are empty, on their placeholders (decision 7). Slice 04
 * makes this the shared drag-and-drop `BlockEditor`, with this folder as the
 * campaign's own half: its block catalogue and forms.
 */

const BLOCK_KINDS: Record<EmailBlockType, { label: string; description: string; icon: ComponentType<{ className?: string }> }> = {
    heading: { label: "Heading", description: "The email's title, or a part's", icon: Heading },
    text: { label: "Text", description: "Paragraphs and bullets, with bold and links", icon: Pilcrow },
    buttons: { label: "Buttons", description: "One button, or two side by side", icon: MousePointerClick },
    divider: { label: "Divider", description: "A thin line between parts", icon: Minus },
    spacer: { label: "Spacer", description: "Some room between parts", icon: StretchVertical },
};

const SPACER_LABEL: Record<SpacerSize, string> = { s: "Small", m: "Medium", l: "Large" };

const TEXT_PLACEHOLDER = `${CONTENT_PLACEHOLDERS.text} Leave a blank line between paragraphs; start a line with - for a bullet.`;

/** Save's first error for a block's field, or anything under it. */
const errorAt = (errors: Record<string, string>, path: string) =>
    errors[path] ?? Object.entries(errors).find(([k]) => k.startsWith(`${path}.`))?.[1];

export function BlockList({
    content,
    lines,
    onChange,
    disabled,
    errors,
}: {
    content: CampaignContent;
    /** The subject and preview line: their Variables take the same fallbacks. */
    lines: readonly string[];
    onChange: (next: CampaignContent) => void;
    /** Sending has started, or a wave is sending: shown as it is, not editable. */
    disabled: boolean;
    /** Save's field errors, keyed by path: `content.blocks.2.text`. */
    errors: Record<string, string>;
}) {
    const blocks = content.blocks;
    const setBlocks = (next: EmailBlock[]) => onChange({ ...content, blocks: next });
    const update = (i: number, b: EmailBlock) => setBlocks(blocks.map((x, j) => (j === i ? b : x)));
    const move = (i: number, by: -1 | 1) => {
        const next = [...blocks];
        [next[i], next[i + by]] = [next[i + by], next[i]];
        setBlocks(next);
    };
    // After an insert, focus goes into the new block, not back to the menu's button.
    const [added, setAdded] = useState<string | null>(null);
    const chose = useRef(false);
    const focusAdded = useCallback(
        () => document.querySelector<HTMLElement>(`[data-block-id="${added}"] :is(input, textarea)`)?.focus(),
        [added],
    );
    useEffect(() => {
        if (added) focusAdded();
    }, [added, focusAdded]);
    const add = (type: EmailBlockType) => {
        chose.current = true;
        const b = emptyBlock(type);
        setBlocks([...blocks, b]);
        setAdded(b.id);
    };
    const used = variablesUsed(content, lines);
    const full = blocks.length >= CONTENT_LIMITS.blocks;

    return (
        <div className="space-y-3">
            {blocks.length ? (
                <ol className="space-y-3" aria-label="The email's blocks">
                    {blocks.map((b, i) => {
                        const kind = BLOCK_KINDS[b.type];
                        const Icon = kind.icon;
                        return (
                            <li key={b.id} data-block-id={b.id} className="space-y-3 rounded-lg border p-3">
                                <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">{kind.label}</span>
                                    {disabled ? null : (
                                        <div className="ml-auto flex gap-1">
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${kind.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                                                <ArrowUp className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${kind.label} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                                                <ArrowDown className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Delete ${kind.label}`} onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <BlockForm block={b} onChange={(next) => update(i, next)} disabled={disabled} errors={errors} path={`content.blocks.${i}`} />
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No blocks yet. Add a heading, some text and a button to write the email.
                </p>
            )}
            {errors["content.blocks"] ? <p className="text-xs text-destructive">{errors["content.blocks"]}</p> : null}

            {disabled ? null : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" disabled={full}>
                            <Plus className="mr-1 h-4 w-4" />
                            Add block
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        onCloseAutoFocus={(e) => {
                            if (!chose.current) return;
                            chose.current = false;
                            e.preventDefault();
                            focusAdded();
                        }}
                    >
                        {EMAIL_BLOCK_TYPES.map((type) => {
                            const Icon = BLOCK_KINDS[type].icon;
                            return (
                                <DropdownMenuItem key={type} onSelect={() => add(type)}>
                                    <Icon className="h-4 w-4" />
                                    <span>
                                        <span className="block">{BLOCK_KINDS[type].label}</span>
                                        <span className="block text-xs text-muted-foreground">{BLOCK_KINDS[type].description}</span>
                                    </span>
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {used.map((key) => {
                const v = CAMPAIGN_VARIABLES[key];
                return (
                    <Field
                        key={key}
                        label={`If a customer has no ${v.label.toLowerCase()}, say`}
                        htmlFor={`c-fallback-${key}`}
                        hint={`Left empty, it says "${v.fallback}".`}
                        error={errors[`content.fallbacks.${key}`]}
                    >
                        <Input
                            id={`c-fallback-${key}`}
                            value={content.fallbacks[key] ?? ""}
                            placeholder={`e.g. ${v.fallback}`}
                            maxLength={60}
                            disabled={disabled}
                            onChange={(e) => onChange({ ...content, fallbacks: { ...content.fallbacks, [key]: e.target.value } })}
                        />
                    </Field>
                );
            })}
        </div>
    );
}

function BlockForm({
    block: b,
    onChange,
    disabled,
    errors,
    path,
}: {
    block: EmailBlock;
    onChange: (next: EmailBlock) => void;
    disabled: boolean;
    errors: Record<string, string>;
    path: string;
}) {
    const id = `c-block-${b.id}`;
    switch (b.type) {
        case "heading":
            return (
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                    <Field label="Size" htmlFor={`${id}-level`}>
                        <Select value={String(b.level)} onValueChange={(v) => onChange({ ...b, level: v === "1" ? 1 : 2 })}>
                            <SelectTrigger id={`${id}-level`} className="w-full justify-between" disabled={disabled}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Title</SelectItem>
                                <SelectItem value="2">Heading</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Words" htmlFor={`${id}-text`} error={errorAt(errors, `${path}.text`)}>
                        <Input
                            id={`${id}-text`}
                            value={b.text}
                            placeholder={CONTENT_PLACEHOLDERS.heading}
                            maxLength={CONTENT_LIMITS.heading}
                            disabled={disabled}
                            onChange={(e) => onChange({ ...b, text: e.target.value })}
                        />
                    </Field>
                </div>
            );
        case "text":
            return <TextBlockForm block={b} onChange={onChange} disabled={disabled} error={errorAt(errors, `${path}.paragraphs`)} id={`${id}-text`} />;
        case "buttons":
            return <ButtonsForm block={b} onChange={onChange} disabled={disabled} errors={errors} path={path} id={id} />;
        case "divider":
            return <p className="text-xs text-muted-foreground">A thin line across the email.</p>;
        case "spacer":
            return (
                <Field label="Size" htmlFor={`${id}-size`}>
                    <Select value={b.size} onValueChange={(v) => onChange({ ...b, size: v as SpacerSize })}>
                        <SelectTrigger id={`${id}-size`} className="w-full justify-between sm:w-40" disabled={disabled}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(SPACER_LABEL) as SpacerSize[]).map((s) => (
                                <SelectItem key={s} value={s}>
                                    {SPACER_LABEL[s]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            );
    }
}

/**
 * The text block's box keeps exactly what was typed, half-typed marks and
 * all, and hands the blocks what it reads. It is written from the block once,
 * when the block appears: Clear all and Undo bring new blocks, so new boxes.
 */
function TextBlockForm({
    block,
    onChange,
    disabled,
    error,
    id,
}: {
    block: Extract<EmailBlock, { type: "text" }>;
    onChange: (next: EmailBlock) => void;
    disabled: boolean;
    error?: string;
    id: string;
}) {
    const [source, setSource] = useState(() => textSourceOf(block.paragraphs));
    return (
        <Field
            label="Words"
            htmlFor={id}
            error={error ?? unknownVariableMessage(source) ?? undefined}
            hint={
                <>
                    **bold**, _italic_, [words](https://…) for a link, and {"{first_name}"} for the customer&apos;s first name.
                </>
            }
        >
            <Textarea
                id={id}
                rows={6}
                value={source}
                placeholder={TEXT_PLACEHOLDER}
                disabled={disabled}
                onChange={(e) => {
                    setSource(e.target.value);
                    onChange({ ...block, paragraphs: parseTextSource(e.target.value) });
                }}
            />
        </Field>
    );
}

/** A button sent somewhere else: only a link button keeps a link of its own. */
const retarget = (x: BlockButton, target: BlockButtonTarget): BlockButton =>
    target === "url" ? { label: x.label, target, url: x.url ?? "", style: x.style } : { label: x.label, target, style: x.style };

function ButtonsForm({
    block: b,
    onChange,
    disabled,
    errors,
    path,
    id,
}: {
    block: Extract<EmailBlock, { type: "buttons" }>;
    onChange: (next: EmailBlock) => void;
    disabled: boolean;
    errors: Record<string, string>;
    path: string;
    id: string;
}) {
    const set = (j: number, x: BlockButton) => onChange({ ...b, buttons: b.buttons.map((y, k) => (k === j ? x : y)) });
    return (
        <div className="space-y-4">
            {b.buttons.map((x, j) => {
                const at = `${path}.buttons.${j}`;
                const bid = `${id}-button-${j}`;
                return (
                    <div key={j} className="space-y-3">
                        {b.buttons.length > 1 ? (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">{j === 0 ? "First button" : "Second button"}</span>
                                {disabled ? null : (
                                    <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onChange({ ...b, buttons: b.buttons.filter((_, k) => k !== j) })}>
                                        Remove this button
                                    </Button>
                                )}
                            </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Label" htmlFor={`${bid}-label`} error={errors[`${at}.label`]}>
                                <Input
                                    id={`${bid}-label`}
                                    value={x.label}
                                    placeholder={CAMPAIGN_PLACEHOLDERS.buttonLabel}
                                    maxLength={CONTENT_LIMITS.buttonLabel}
                                    disabled={disabled}
                                    onChange={(e) => set(j, { ...x, label: e.target.value })}
                                />
                            </Field>
                            <Field label="Goes to" htmlFor={`${bid}-target`}>
                                <Select
                                    value={x.target}
                                    onValueChange={(v) => set(j, retarget(x, v as BlockButtonTarget))}
                                >
                                    <SelectTrigger id={`${bid}-target`} className="w-full justify-between" disabled={disabled}>
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
                                <Field label="Link" htmlFor={`${bid}-url`} error={errors[`${at}.url`]}>
                                    <Input id={`${bid}-url`} value={x.url ?? ""} placeholder="https://" disabled={disabled} onChange={(e) => set(j, { ...x, url: e.target.value })} />
                                </Field>
                            ) : null}
                            <Field label="Style" htmlFor={`${bid}-style`}>
                                <Select value={x.style} onValueChange={(v) => set(j, { ...x, style: v as BlockButton["style"] })}>
                                    <SelectTrigger id={`${bid}-style`} className="w-full justify-between" disabled={disabled}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="primary">Filled</SelectItem>
                                        <SelectItem value="secondary">Outline</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        {x.target === "sign_in" ? (
                            <p className="text-xs text-muted-foreground">
                                Imported customers who haven&apos;t signed in get their own link, with their email already filled in.
                            </p>
                        ) : null}
                    </div>
                );
            })}
            {b.buttons.length < 2 && !disabled ? (
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
