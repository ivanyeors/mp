"use client";

import { lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { History, Loader2, Sparkles } from "lucide-react";
import { useBlockEditor } from "@/components/block-editor/block-editor";
import type { EditorBlock, PaletteItem } from "@/components/block-editor/types";
import type { EmailBlock } from "@/lib/email-campaigns/content";
import { BLANK_PREVIEW } from "@/lib/email-campaigns/starters";
import { cn } from "@/lib/utils";
import { StarterThumbnail } from "./starter-thumbnail";

const PastCampaigns = lazy(() => import("./past-campaigns").then((m) => ({ default: m.PastCampaigns })));

type Open = "starter" | "past" | null;

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
    starters: readonly PaletteItem<EmailBlock>[];
    onBlank: () => void;
    ai: { disabledReason: string | null; onClick: () => void } | null;
    onPastCampaign: (id: string) => void;
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
                {ai ? (
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
                ) : null}
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
