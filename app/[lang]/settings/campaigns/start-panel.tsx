"use client";

import { lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { History, Loader2, Sparkles } from "lucide-react";
import { useBlockEditor } from "@/components/block-editor/block-editor";
import type { EditorBlock, PaletteItem } from "@/components/block-editor/types";
import type { EmailBlock } from "@/lib/email-campaigns/content";
import { BLANK_PREVIEW } from "@/lib/email-campaigns/starters";
import { cn } from "@/lib/utils";
import { StarterThumbnail } from "./starter-thumbnail";

/**
 * The Start panel (PRD-campaign-email-editor slice 08): what an empty email
 * offers, on *New campaign* and after Clear all, in place of the empty
 * column. Four ways to start, as cards: **Blank**, **✨ Write with AI**
 * (slice 09), **a Starter**, or **a past campaign**. A Starter lands as
 * ordinary blocks, with its words and audience when it has them, as one
 * change that Undo removes; a past campaign is Duplicate. Typing in the
 * email, or dropping a block in, ends it, and Blank puts it away until the
 * next Clear all.
 */

// Loaded when it first shows, not with the panel.
const PastCampaigns = lazy(() => import("./past-campaigns").then((m) => ({ default: m.PastCampaigns })));

type Open = "starter" | "past" | null;

/** One way to start: its picture over its name, the whole card one button (the picture beside it: a frame can't go in a button). */
function Choice({
    label,
    description,
    picture,
    onClick,
    disabledReason = null,
    expanded,
    controls,
}: {
    label: ReactNode;
    description: string;
    picture: ReactNode;
    onClick: () => void;
    disabledReason?: string | null;
    /** For a card that opens a list below the cards. */
    expanded?: boolean;
    controls?: string;
}) {
    return (
        <li
            className={cn(
                "relative rounded-md border bg-background shadow-xs transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
                expanded && "border-primary/60 ring-1 ring-primary/30",
                disabledReason && "opacity-60",
            )}
        >
            <div aria-hidden className="pointer-events-none p-1.5 pb-0">
                {picture}
            </div>
            <button
                type="button"
                aria-disabled={disabledReason ? true : undefined}
                aria-expanded={expanded}
                aria-controls={expanded ? controls : undefined}
                title={disabledReason ?? undefined}
                onClick={() => {
                    if (!disabledReason) onClick();
                }}
                className="block w-full rounded-md px-2.5 py-2 text-left text-sm outline-none before:absolute before:inset-0 before:rounded-md aria-disabled:cursor-not-allowed max-md:min-h-11"
            >
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{disabledReason ?? description}</span>
            </button>
        </li>
    );
}

/** A card's picture when it has no one email to show: its icon, in a thumbnail's shape. */
const IconPicture = ({ icon: Icon }: { icon: ComponentType<{ className?: string }> }) => (
    <div className="flex aspect-[3/4] w-full items-center justify-center rounded-sm border bg-muted/50">
        <Icon className="h-8 w-8 text-muted-foreground" />
    </div>
);

export function StartPanel({
    starters,
    onBlank,
    ai,
    onPastCampaign,
    busy = false,
}: {
    /** Each Starter as it starts an email: its `apply` brings its words and audience with its blocks. */
    starters: readonly PaletteItem<EmailBlock>[];
    /** *Blank*: the panel is put away, the email left empty. */
    onBlank: () => void;
    /** *✨ Write with AI* (slice 09): off, saying why, until it is built. */
    ai: { disabledReason: string | null; onClick: () => void };
    /** A past campaign picked: a copy of it as a new draft (Duplicate). */
    onPastCampaign: (id: string) => void;
    /** A copy is being made. */
    busy?: boolean;
}) {
    const ctx = useBlockEditor();
    const [open, setOpen] = useState<Open>(null);
    const toggle = (which: Exclude<Open, null>) => setOpen((o) => (o === which ? null : which));
    return (
        <section aria-labelledby="c-start-title" className="@container space-y-4 text-left text-foreground">
            <div className="space-y-1">
                <h2 id="c-start-title" className="text-sm font-medium">
                    Start the email
                </h2>
                <p className="text-xs text-muted-foreground">
                    Or drag blocks in from the palette. Whatever you start from becomes ordinary blocks, each to change, move or delete.
                </p>
            </div>
            <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-4" aria-label="Ways to start">
                <Choice label="Blank" description="An empty email, built block by block" picture={<StarterThumbnail id={BLANK_PREVIEW} />} onClick={onBlank} />
                <Choice
                    label={
                        <>
                            <Sparkles className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                            Write with AI
                        </>
                    }
                    description="Claude drafts it from the subject and a brief"
                    picture={<IconPicture icon={Sparkles} />}
                    disabledReason={ai.disabledReason}
                    onClick={ai.onClick}
                />
                {starters.length ? (
                    <Choice
                        label="A Starter"
                        description="A ready-made layout to fill in"
                        picture={<StarterThumbnail id={starters[0].id} />}
                        expanded={open === "starter"}
                        controls="c-start-starters"
                        onClick={() => toggle("starter")}
                    />
                ) : null}
                <Choice
                    label="A past campaign"
                    description="A copy of one sent or written before"
                    picture={<IconPicture icon={History} />}
                    expanded={open === "past"}
                    controls="c-start-past"
                    onClick={() => toggle("past")}
                />
            </ul>

            {open === "starter" ? (
                <ul id="c-start-starters" aria-label="Starters" className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
                    {starters.map((item) => (
                        <Choice
                            key={item.id}
                            label={item.label}
                            description={item.description ?? ""}
                            picture={<StarterThumbnail id={item.id} />}
                            disabledReason={item.disabledReason ?? ctx.noRoom(item.blocks().length)}
                            onClick={() => ctx.insert(0, item.blocks(), item as unknown as PaletteItem<EditorBlock>)}
                        />
                    ))}
                </ul>
            ) : null}
            {open === "past" ? (
                <Suspense
                    fallback={
                        <p className="flex items-center text-sm text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                            Reading the campaigns…
                        </p>
                    }
                >
                    <PastCampaigns onPick={onPastCampaign} busy={busy} />
                </Suspense>
            ) : null}
        </section>
    );
}
