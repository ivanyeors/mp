"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { DragDropProvider, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/react";
import {
    ChevronDown,
    CircleSlash,
    DoorOpen,
    Eye,
    EyeOff,
    GitBranch,
    GripVertical,
    Lock,
    LogIn,
    MoreHorizontal,
    Plus,
    Sparkles,
    Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoTip } from "@/components/ui/info-tip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UNENGAGED_WHO } from "@/lib/crm/engagement";
import { AT_RISK_AFTER_MONTHS, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { FlowCampaign, FlowStep, FunnelResultRow, FunnelStageView, FunnelView, StepState } from "@/lib/email-funnel/model";
import { planArrangement, type MoveDid } from "@/lib/email-funnel/move";
import { daysWords, FUNNEL_PATHS } from "@/lib/email-funnel/programme";
import { cn } from "@/lib/utils";
import { ThumbnailFrame } from "../thumbnail-frame";
import type { FunnelRender } from "./actions";
import { addPlaybookDraft, moveFunnelEmail } from "./arrange-actions";
import {
    addEmailHref,
    campaignKey,
    countText,
    flowLayout,
    FOLLOW_UP_CHOICES,
    FOLLOW_UP_SHORT,
    followUpHref,
    GROUP_THUMBNAILS,
    menuMoves,
    nodesOf,
    resultCells,
    sequenceDays,
    starterKey,
    templateKey,
    zoneMove,
    zoneWords,
    type FlowLayout,
    type FlowNode,
    type PageMove,
} from "./funnel-format";
import { outcomeText, StateBadge } from "./funnel-panels";

/**
 * The Email flow (PRD-email-funnel slices 03 and 07; owner, 2026-11-19): one
 * column read top to bottom, the same on a phone. Who enters; the Automatic
 * emails, fixed; then sequences, each email under the one it follows,
 * numbered, with the condition and the wait between them; then where to start
 * a new one, the drafts not in the funnel yet, and what moves people on.
 *
 * A draft is moved by its grip (pointer, touch or keyboard) onto a drop zone
 * that says what the drop will do, or by its menu: every move works without
 * dragging. A move is drawn at once, sent to `moveFunnelEmail`, rolled back
 * with the refusal's words if refused, and the page reads the flow again.
 * Nothing here sends: a move only re-points a draft's Segment.
 *
 * Each card shows its email (the real render) under it, or hides it behind
 * its chevron; *Hide previews* sets them all, remembered per browser.
 */

const n = (v: number) => v.toLocaleString("en-SG");

/** A render asked for: undefined while it loads, null when it failed, else the email. */
export type Renders = Record<string, FunnelRender | null>;

/** What the opened preview shows. */
export interface PreviewTarget {
    key: string;
    title: string;
    kind: string;
    state: StepState | null;
    rules: { label: string; text: string }[];
    numbers: ReactNode;
    actions: { label: string; href: string; primary?: boolean }[];
    /** A campaign or a Starter: Dark asks for the render again, dark (as the editor's preview does). */
    redrawsDark: boolean;
}

/** Everything a card needs from the page. */
export interface FlowCtx {
    stage: FunnelStageView;
    view: FunnelView;
    renders: Renders;
    to: (href: string) => string;
    /** The page's one link rule (`canOpenWith`): paths without the locale. */
    canOpen: (href: string) => boolean;
    open: (t: PreviewTarget) => void;
    /** May arrange the flow: `campaigns`, and `customers-edit`, since a move may make a Segment. */
    canArrange: boolean;
    /** Whether the card `key`'s preview shows, and its chevron. */
    shown: (key: string) => boolean;
    toggle: (key: string) => void;
}

/** What moves someone on from each stage: the exits drawn last in its Email flow. */
const STAGE_EXITS: Record<LifecycleStage, string[]> = {
    lead: ["Their first purchase moves them to New."],
    new: [
        "A second purchase, or an attended re-adjustment booking, moves them to Loyal.",
        `No purchase or attended booking for over ${AT_RISK_AFTER_MONTHS} months moves them to At risk.`,
    ],
    loyal: [`No purchase or attended booking for over ${AT_RISK_AFTER_MONTHS} months moves them to At risk.`],
    at_risk: ["A purchase or an attended booking moves them back to Loyal."],
    lost: ["A purchase or an attended booking moves them back. Subscribing again lets campaigns reach them."],
};

const NO_MOVES: ReadonlyMap<string, { id: string; did: MoveDid } | null> = new Map();

const IF_WORDS: Record<MoveDid, string> = { sent: "If they got it", clicked: "If they clicked it", "not-clicked": "If they didn't click" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const rulesOf = (step: FlowStep) =>
    [
        { label: "Who", text: step.who },
        { label: "When", text: step.when },
        { label: "Stops", text: step.stops },
        { label: "Consent", text: step.consent },
    ].filter((r) => r.text);

function campaignNumbers(stage: FunnelStageView, id: string) {
    const row = stage.results.rows.find((r): r is Extract<FunnelResultRow, { kind: "campaign" }> => r.kind === "campaign" && r.campaignId === id);
    return row ? resultCells(row.numbers) : null;
}
function automaticRow(stage: FunnelStageView, stepId: string) {
    return stage.results.rows.find((r): r is Extract<FunnelResultRow, { kind: "automatic" }> => r.kind === "automatic" && r.stepId === stepId) ?? null;
}
/** The Segment a campaign sends to, by name, from the stage's Segments. */
function segmentName(stage: FunnelStageView, campaignId: string): string | null {
    return stage.segments.find((s) => s.sendsTo.some((c) => c.id === campaignId))?.name ?? null;
}
function automaticNumbers(stage: FunnelStageView, step: FlowStep): string | null {
    const row = automaticRow(stage, step.key);
    if (!row) return null;
    if (!row.counted) return "Not counted";
    return `${row.sentLabel}: ${countText(row.sent)} · ${row.outcomeLabel}: ${countText(row.outcome)}`;
}

/** The email's picture: a skeleton while it renders, a plain card when it failed. */
function Thumb({ render, className }: { render: FunnelRender | null | undefined; className?: string }) {
    if (render === undefined) return <div className={cn("aspect-[4/3] w-full animate-pulse rounded-sm border bg-muted", className)} />;
    return <ThumbnailFrame id="" shape="landscape" html={render?.html ?? null} className={className} />;
}

/** The id a card's preview region has, for its chevron's `aria-controls`. */
const regionId = (key: string) => `flow-preview-${key.replace(/[^a-z0-9_-]/gi, "-")}`;

// ─── The flow ────────────────────────────────────────────────────────────────

export function EmailFlow({ ctx, allShown, onShowAll }: { ctx: FlowCtx; allShown: boolean; onShowAll: (shown: boolean) => void }) {
    const { stage, view } = ctx;
    const router = useRouter();

    // An optimistic move: campaign id → the email it now follows (null: it starts a sequence). Cleared when the page reads again.
    // Kept with the view and stage it was made on: a new read of the page, or another stage, draws without it.
    type Moved = ReadonlyMap<string, { id: string; did: MoveDid } | null>;
    const [made, setMade] = useState<{ view: FunnelView; stage: LifecycleStage; map: Moved } | null>(null);
    const moved: Moved = made && made.view === view && made.stage === stage.stage ? made.map : NO_MOVES;
    const setMoved = (map: Moved) => setMade({ view, stage: stage.stage, map });
    const layout = useMemo(() => flowLayout(stage, stage.stage === "lost" ? [] : view.unplaced, moved), [stage, view.unplaced, moved]);
    const [said, setSaid] = useState("");
    const [dragging, setDragging] = useState<string | null>(null);

    const nameOf = (id: string) => layout.nodes.find((x) => x.id === id)?.name ?? "this email";
    /** Whether `m` would change anything (`planArrangement`, the server's own plan on the page's ids). */
    const can = (m: PageMove | null) => {
        if (!m) return false;
        const p = planArrangement(layout.nodes, m);
        return p.ok && p.changes.length > 0;
    };

    const move = (m: PageMove) => {
        const plan = planArrangement(layout.nodes, m);
        if (!plan.ok) {
            toast.error(plan.error);
            setSaid(plan.error);
            return;
        }
        if (!plan.changes.length) return;
        const before = moved;
        const next = new Map(moved);
        for (const ch of plan.changes) next.set(ch.campaignId, ch.campaign);
        setMoved(next);
        const words = `“${nameOf(m.campaignId)}”: ${zoneWords(m, nameOf).replace("Start a new sequence with it", "starts a new sequence")}`;
        setSaid(`Moving ${words}.`);
        moveFunnelEmail({ ...m, stage: stage.stage })
            .then((res) => {
                if (res.ok) {
                    setSaid(`Moved ${words}. Nothing was sent.`);
                } else {
                    setMoved(before);
                    toast.error(res.error);
                    setSaid(res.error);
                }
            })
            .catch(() => {
                setMoved(before);
                const words = "The move could not be saved, so nothing changed. Try again.";
                toast.error(words);
                setSaid(words);
            })
            .finally(() => router.refresh());
    };

    const hasCampaign = layout.items.some((i) => i.kind === "sequence");
    const flowCtx: Arrange = { ctx, layout, dragging, can, move, nameOf };

    return (
        <Card className="min-w-0">
            <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                <div className="min-w-0 space-y-1.5">
                    <CardTitle className="flex items-center gap-1.5 text-base">
                        Email flow
                        <InfoTip label="About the email flow">
                            <p>
                                The emails this stage is sent, in the order they reach a person. Each sequence starts with an
                                email to a Segment of the stage; the emails under it go to the people who got, clicked or
                                didn&apos;t click the one before.
                            </p>
                            <p>
                                Drag a draft by its grip, or use its menu, to put it in order: that points it at the Segment
                                that reads the email before it. Nothing is sent: a person still sends each campaign&apos;s
                                first wave. Started campaigns and Playbooks stay where they are.
                            </p>
                            <p>{view.restPeriod.text}</p>
                        </InfoTip>
                    </CardTitle>
                    <CardDescription>
                        {ctx.canArrange && stage.stage !== "lost"
                            ? "Each email in the order people get it. Drag a draft by its grip to change the order; nothing is sent."
                            : "Each email in the order people get it. Open one to preview it."}
                    </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onShowAll(!allShown)}>
                    {allShown ? <EyeOff className="mr-1.5 size-4" aria-hidden /> : <Eye className="mr-1.5 size-4" aria-hidden />}
                    {allShown ? "Hide previews" : "Show previews"}
                </Button>
            </CardHeader>
            <CardContent>
                <p aria-live="polite" className="sr-only">
                    {said}
                </p>
                <DragDropProvider
                    onDragStart={(e) => setDragging(String(e.operation.source?.id ?? "") || null)}
                    onDragEnd={(e) => {
                        const source = e.operation.source?.id;
                        const target = e.operation.target?.data as { move?: (id: string) => PageMove } | undefined;
                        setDragging(null);
                        if (e.canceled || !source || !target?.move) return;
                        move(target.move(String(source)));
                    }}
                >
                    <div className="space-y-5" aria-label={`${stage.header.label} email flow`} role="group">
                        <EndBlock icon={LogIn} label="Enters">
                            <p>{stage.entry.enters}</p>
                            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                {countText(stage.header.customers)} now ·{" "}
                                {stage.header.subscribed === null ? "subscribed not counted" : `${n(stage.header.subscribed)} subscribed`}
                            </p>
                        </EndBlock>

                        {stage.entry.nothingSent ? (
                            <EndBlock icon={CircleSlash} label="Sent" muted>
                                {stage.entry.nothingSent}
                            </EndBlock>
                        ) : null}

                        {layout.automatic.length ? (
                            <section aria-labelledby="flow-automatic" className="space-y-2">
                                <SectionTitle id="flow-automatic" hint="Sent by the platform, each in its fixed place.">
                                    Automatic emails
                                </SectionTitle>
                                <ul className="space-y-2">
                                    {layout.automatic.map((step) => (
                                        <AutomaticRows key={step.key} step={step} ctx={ctx} />
                                    ))}
                                </ul>
                            </section>
                        ) : null}

                        {stage.stage !== "lost" ? (
                            <section aria-labelledby="flow-sequences" className="space-y-3">
                                <SectionTitle id="flow-sequences" hint="Each starts with an email to a Segment; the emails under it follow it.">
                                    Sequences
                                </SectionTitle>
                                {layout.items.map((item, i) =>
                                    item.kind === "suggested" ? (
                                        <SuggestedRow key={item.step.key} step={item.step} ctx={ctx} />
                                    ) : (
                                        <section
                                            key={item.root.campaign.id}
                                            aria-label={`Sequence ${i + 1}, starting with ${item.root.campaign.name}`}
                                            className="rounded-2xl border bg-muted/20 p-2 sm:p-3"
                                        >
                                            <Chain node={item.root} a={flowCtx} />
                                        </section>
                                    ),
                                )}
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <StartZone a={flowCtx} />
                                    <AddEmailCard stage={stage} to={ctx.to} canOpen={ctx.canOpen} main={!hasCampaign} />
                                </div>
                                {ctx.canArrange && layout.unplaced.length ? <Unplaced a={flowCtx} /> : null}
                            </section>
                        ) : (
                            <AddEmailCard stage={stage} to={ctx.to} canOpen={ctx.canOpen} main={false} />
                        )}

                        <EndBlock icon={DoorOpen} label="Leaves">
                            <ul className="space-y-1">
                                {STAGE_EXITS[stage.stage].map((e) => (
                                    <li key={e}>{e}</li>
                                ))}
                                {stage.stage !== "lost" ? <li>Unsubscribing moves them to Lost.</li> : null}
                                {stage.entry.sunsetRule ? (
                                    <li className="text-muted-foreground">
                                        Sunset rule: people who {UNENGAGED_WHO} are left out of campaigns, unless a win-back
                                        includes them.
                                    </li>
                                ) : null}
                            </ul>
                        </EndBlock>
                    </div>
                    <DragOverlay dropAnimation={null}>
                        {(source) => {
                            const node = layout.items.flatMap((i) => (i.kind === "sequence" ? nodesOf(i.root) : [])).find((x) => x.campaign.id === source.id);
                            const loose = layout.unplaced.find((c) => c.id === source.id);
                            const c = node?.campaign ?? loose;
                            if (!c) return null;
                            return (
                                <div className="flex w-[min(28rem,calc(100vw-2rem))] items-center gap-2 rounded-xl border bg-card p-2 shadow-lg">
                                    <GripVertical className="size-4 text-muted-foreground" aria-hidden />
                                    {node ? <StepNumber n={node.number} /> : null}
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                                    <StateBadge state={c.state} />
                                </div>
                            );
                        }}
                    </DragOverlay>
                </DragDropProvider>
            </CardContent>
        </Card>
    );
}

/** What the arranging parts share. */
interface Arrange {
    ctx: FlowCtx;
    layout: FlowLayout;
    /** The draft being dragged, by id. */
    dragging: string | null;
    can: (m: PageMove | null) => boolean;
    move: (m: PageMove) => void;
    nameOf: (id: string) => string;
}

function SectionTitle({ id, hint, children }: { id: string; hint: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {children}
            </h3>
            <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}

function EndBlock({ icon: Icon, label, children, muted }: { icon: typeof LogIn; label: string; children: ReactNode; muted?: boolean }) {
    return (
        <div className={cn("rounded-xl border bg-muted/30 p-3 text-sm", muted && "text-muted-foreground")}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Icon className="size-3.5" aria-hidden />
                {label}
            </p>
            {children}
        </div>
    );
}

function StepNumber({ n: number, className }: { n: number; className?: string }) {
    return (
        <span
            aria-label={`Step ${number}`}
            className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background tabular-nums", className)}
        >
            {number}
        </span>
    );
}

/** Why a card stays where it is: a lock in place of the grip, its reason on hover and focus. */
function LockMark({ reason }: { reason: string }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    tabIndex={0}
                    aria-label={`Stays in place: ${reason}`}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Lock className="size-4" aria-hidden />
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{reason}</TooltipContent>
        </Tooltip>
    );
}

function Chevron({ cardKey, title, ctx }: { cardKey: string; title: string; ctx: FlowCtx }) {
    const open = ctx.shown(cardKey);
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            aria-expanded={open}
            aria-controls={regionId(cardKey)}
            aria-label={`${open ? "Hide" : "Show"} the preview of ${title}`}
            onClick={() => ctx.toggle(cardKey)}
        >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </Button>
    );
}

/**
 * One email as a row: grip or lock, step number, name and subject, state,
 * Segment and numbers, the chevron and the ⋯ menu; its preview under it when
 * shown. The name opens the full-size preview, as does the preview itself.
 */
function Row({
    cardKey,
    title,
    subtitle,
    lead,
    badges,
    meta,
    menu,
    onOpen,
    ctx,
    tone = "plain",
    preview,
    children,
    rowRef,
    placeholder,
    wide = false,
}: {
    cardKey: string;
    title: string;
    subtitle: ReactNode;
    lead: ReactNode;
    badges: ReactNode;
    meta?: ReactNode;
    menu?: ReactNode;
    onOpen: () => void;
    ctx: FlowCtx;
    tone?: "plain" | "suggested" | "waiting" | "automatic";
    preview?: ReactNode;
    children?: ReactNode;
    rowRef?: (el: Element | null) => void;
    placeholder?: boolean;
    /** A preview of several emails (the order emails): a row of small ones under the details, at every width. */
    wide?: boolean;
}) {
    const shown = ctx.shown(cardKey);
    return (
        <div
            ref={rowRef}
            data-card={cardKey}
            className={cn(
                "min-w-0 rounded-xl border bg-card shadow-xs transition-opacity",
                tone === "suggested" && "border-dashed",
                tone === "waiting" && "border-dashed bg-muted/30 opacity-80",
                tone === "automatic" && "bg-muted/20",
                placeholder && "border-dashed opacity-40 shadow-none",
            )}
        >
            {/* Desktop: the details on the left, the email's top on the right; a phone: the email under the details. */}
            <div className={cn("flex flex-col", !wide && "md:flex-row")}>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5 p-1.5 sm:gap-2 sm:p-2">
                        <div className="flex shrink-0 items-center gap-1 pt-0.5">{lead}</div>
                        <button
                            type="button"
                            onClick={onOpen}
                            aria-label={`Preview ${title}`}
                            className="min-w-0 flex-1 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="block break-words text-sm font-medium leading-snug">{title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                        </button>
                        <div className="flex shrink-0 items-center">
                            <Chevron cardKey={cardKey} title={title} ctx={ctx} />
                            {menu}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 px-2 pb-2 sm:pl-[5.25rem]">
                        {badges}
                        {meta ? <span className="w-full text-xs text-muted-foreground tabular-nums sm:w-auto sm:pl-1">{meta}</span> : null}
                    </div>
                    {children ? <div className="flex flex-wrap gap-2 px-2 pb-2 sm:pl-[5.25rem]">{children}</div> : null}
                </div>
                <div
                    id={regionId(cardKey)}
                    hidden={!shown}
                    className={cn("border-t bg-muted/30 p-1.5", !wide && "md:w-52 md:shrink-0 md:rounded-r-xl md:border-l md:border-t-0")}
                >
                    {shown ? preview : null}
                </div>
            </div>
        </div>
    );
}

/** The shown preview: the real render, large enough to read its top; a click opens it full size. */
function PreviewPane({ render, onOpen }: { render: FunnelRender | null | undefined; onOpen: () => void }) {
    if (render === null) return <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Preview not available</p>;
    // The email's top in a landscape crop: about 155px tall beside the details, at most 180px under them on a phone.
    return (
        <button type="button" tabIndex={-1} aria-hidden onClick={onOpen} className="block max-h-[180px] w-full cursor-zoom-in overflow-hidden rounded-md">
            <Thumb render={render} className="w-full" />
        </button>
    );
}

// ─── Automatic emails ────────────────────────────────────────────────────────

function AutomaticRows({ step, ctx }: { step: FlowStep; ctx: FlowCtx }) {
    const { stage } = ctx;
    const days = sequenceDays(step);
    if (days) {
        const row = automaticRow(stage, step.key);
        return (
            <>
                {step.templates.map((t, i) => {
                    const sent = row?.also.find((a) => a.label === `After ${daysWords(days[i])}`)?.count;
                    const numbers = row && !row.counted ? "Not counted" : sent !== undefined ? `Sent ${n(sent)}` : null;
                    const title = `${step.name.replace(/\s*\(.*\)$/, "")} · ${daysWords(days[i])}`;
                    return (
                        <li key={t}>
                            <AutomaticRow step={step} template={t} title={title} when={`${daysWords(days[i])} after the last save`} numbers={numbers} ofSequence ctx={ctx} />
                        </li>
                    );
                })}
            </>
        );
    }
    return (
        <li>
            {step.templates.length > 1 ? (
                <GroupRow step={step} ctx={ctx} />
            ) : (
                <AutomaticRow step={step} template={step.templates[0]} title={step.name} when={step.when} numbers={automaticNumbers(stage, step)} ctx={ctx} />
            )}
        </li>
    );
}

const automaticKind = (step: FlowStep) => (step.purpose === "service" ? "Automatic · Service" : "Automatic · Marketing");
const AUTOMATIC_LOCK = "Automatic: the platform sends it by itself, at its fixed time. Its words are changed in Email templates.";

function automaticTarget(step: FlowStep, key: string, title: string, numbers: ReactNode, ctx: FlowCtx, ofSequence = false): PreviewTarget {
    const render = ctx.renders[key];
    const actions: PreviewTarget["actions"] = [];
    const words = render?.templateId ? `${FUNNEL_PATHS.emailTemplates}/${encodeURIComponent(render.templateId)}` : null;
    if (words && ctx.canOpen(words)) actions.push({ label: "Edit words", href: ctx.to(words), primary: true });
    if (step.href !== FUNNEL_PATHS.emailTemplates && ctx.canOpen(step.href)) {
        actions.push({ label: step.href === FUNNEL_PATHS.aftercare ? "Settings (Customers → Settings)" : "Settings (General)", href: ctx.to(step.href) });
    }
    const row = automaticRow(ctx.stage, step.key);
    return {
        key,
        title,
        kind: automaticKind(step),
        state: step.state,
        rules: rulesOf(step),
        // One email of a sequence shows the row's own numbers; the sequence's outcome is its Results row's.
        numbers: ofSequence ? (numbers ? <p>{numbers}</p> : null) : row ? <p>{outcomeText(row)}</p> : numbers,
        actions,
        redrawsDark: false,
    };
}

function AutomaticRow({
    step,
    template,
    title,
    when,
    numbers,
    ofSequence = false,
    ctx,
}: {
    step: FlowStep;
    template: string;
    title: string;
    when: string;
    numbers: ReactNode;
    ofSequence?: boolean;
    ctx: FlowCtx;
}) {
    const key = templateKey(template);
    const render = ctx.renders[key];
    const open = () => ctx.open(automaticTarget(step, key, title, numbers, ctx, ofSequence));
    return (
        <Row
            cardKey={key}
            title={title}
            subtitle={render?.subject ?? when}
            lead={
                <>
                    <LockMark reason={AUTOMATIC_LOCK} />
                    <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full border text-muted-foreground">
                        <Zap className="size-3.5" />
                    </span>
                </>
            }
            badges={
                <>
                    <StateBadge state={step.state} />
                    <Badge variant="secondary" className="font-normal">
                        {automaticKind(step)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{when}</span>
                </>
            }
            meta={numbers}
            onOpen={open}
            ctx={ctx}
            tone="automatic"
            preview={<PreviewPane render={render} onOpen={open} />}
        />
    );
}

/** Order, return and quote emails: one row, their pictures when shown. */
function GroupRow({ step, ctx }: { step: FlowStep; ctx: FlowCtx }) {
    const shownTemplates = step.templates.slice(0, GROUP_THUMBNAILS);
    const first = templateKey(step.templates[0]);
    return (
        <Row
            cardKey={step.key}
            title={step.name}
            subtitle={`${step.templates.length} emails, sent as each order, return or quote changes`}
            lead={
                <>
                    <LockMark reason={AUTOMATIC_LOCK} />
                    <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full border text-muted-foreground">
                        <Zap className="size-3.5" />
                    </span>
                </>
            }
            badges={
                <>
                    <StateBadge state={step.state} />
                    <Badge variant="secondary" className="font-normal">
                        {automaticKind(step)}
                    </Badge>
                    {ctx.canOpen(FUNNEL_PATHS.emailTemplates) ? (
                        <Link href={ctx.to(FUNNEL_PATHS.emailTemplates)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                            All of them in Email templates
                        </Link>
                    ) : null}
                </>
            }
            onOpen={() => ctx.open(automaticTarget(step, first, ctx.renders[first]?.subject ?? step.name, null, ctx))}
            ctx={ctx}
            tone="automatic"
            wide
            preview={
                <div className="flex flex-wrap gap-1.5">
                    {shownTemplates.map((t) => {
                        const key = templateKey(t);
                        const render = ctx.renders[key];
                        return (
                            <button
                                key={t}
                                type="button"
                                onClick={() => ctx.open(automaticTarget(step, key, render?.subject ?? step.name, null, ctx))}
                                aria-label={`Preview ${render?.subject ?? t}`}
                                className="w-36 shrink-0 cursor-zoom-in rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
                            >
                                <Thumb render={render} />
                            </button>
                        );
                    })}
                </div>
            }
        />
    );
}

// ─── Sequences ───────────────────────────────────────────────────────────────

/** An email and everything after it: one follow-up continues the column; several branch, each labelled. */
function Chain({ node, a }: { node: FlowNode; a: Arrange }) {
    const kids = node.children;
    return (
        <div className="min-w-0">
            <CampaignRow node={node} a={a} />
            {kids.length === 1 ? (
                <>
                    <Connector from={node} to={kids[0]} a={a} />
                    <Chain node={kids[0]} a={a} />
                </>
            ) : kids.length > 1 ? (
                <div className="space-y-2">
                    {kids.map((k) => (
                        <div key={k.campaign.id} className="ml-3 border-l-2 border-dashed pl-2 sm:ml-5 sm:pl-3">
                            <p className="flex items-center gap-1 pt-2 text-xs font-medium text-muted-foreground">
                                <GitBranch className="size-3.5" aria-hidden />
                                {k.parent && k.parent.did !== "not-sent" ? IF_WORDS[k.parent.did] : "Then"}
                            </p>
                            <Connector from={node} to={k} a={a} />
                            <Chain node={k} a={a} />
                        </div>
                    ))}
                    <Connector from={node} to={null} a={a} end />
                </div>
            ) : (
                <Connector from={node} to={null} a={a} end />
            )}
        </div>
    );
}

/**
 * Between two emails: the wait and who it goes to; for a draft the condition is
 * a control that re-points it. A **+** adds an email here. While a draft is
 * dragged, it is a drop zone that says what a drop will do.
 */
function Connector({ from, to, a, end = false }: { from: FlowNode; to: FlowNode | null; a: Arrange; end?: boolean }) {
    const { ctx, dragging } = a;
    const zone = (id: string) => zoneMove(id, from, to);
    const valid = dragging !== null && a.can(zone(dragging));
    const { ref, isDropTarget } = useDroppable({
        id: `zone:${from.campaign.id}:${to?.campaign.id ?? "end"}`,
        disabled: !valid,
        data: { move: zone },
    });
    const did = to?.parent?.did;
    const slot = to && !to.campaign.lock && ctx.canArrange && did && did !== "not-sent";
    const add = slot
        ? { href: `/settings/campaigns/new?after=${from.campaign.id}:${did}&before=${to.campaign.id}`, label: "Add an email here" }
        : { href: followUpHref(from.campaign.id, "sent"), label: "Add a follow-up" };
    const rest = `${daysWords(ctx.view.restPeriod.days)} or more after`;

    return (
        <div ref={ref} className={cn("relative ml-[1.6rem] border-l-2 py-1.5 pl-4 sm:ml-[3.15rem]", end && "border-dashed")}>
            {dragging !== null && valid ? (
                <div
                    className={cn(
                        "rounded-lg border-2 border-dashed px-3 py-2.5 text-sm transition-colors",
                        isDropTarget ? "border-primary bg-primary/10 text-foreground" : "border-primary/40 text-muted-foreground",
                    )}
                >
                    {zoneWords(zone(dragging), a.nameOf)}
                </div>
            ) : (
                <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", dragging !== null && "opacity-50")}>
                    {to && did ? (
                        <>
                            <span>{rest} · to those who</span>
                            {ctx.canArrange && !to.campaign.lock && did !== "not-sent" ? (
                                <ConditionControl node={to} from={from} a={a} />
                            ) : (
                                <span className="font-medium text-foreground">{FOLLOW_UP_SHORT[did]}</span>
                            )}
                        </>
                    ) : end && !from.children.length ? (
                        <span>End of this sequence</span>
                    ) : null}
                    {ctx.canOpen(add.href) && ctx.stage.stage !== "lost" ? (
                        <Link
                            href={ctx.to(add.href)}
                            className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Plus className="size-3.5" aria-hidden />
                            {add.label}
                        </Link>
                    ) : null}
                </div>
            )}
        </div>
    );
}

/** A draft's condition: *got it*, *clicked it* or *didn't click* the email before; changing it re-points its Segment. */
function ConditionControl({ node, from, a }: { node: FlowNode; from: FlowNode; a: Arrange }) {
    const did = node.parent!.did as MoveDid;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Who “${node.campaign.name}” goes to: those who ${FOLLOW_UP_SHORT[did]} “${from.campaign.name}”. Change`}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border bg-background px-2 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {FOLLOW_UP_SHORT[did]}
                    <ChevronDown className="size-3.5" aria-hidden />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuLabel>To those who, with “{from.campaign.name}”</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={did}
                    onValueChange={(v) => a.move({ campaignId: node.campaign.id, after: { campaignId: from.campaign.id, did: v as MoveDid }, before: null })}
                >
                    {FOLLOW_UP_CHOICES.map((c) => (
                        <DropdownMenuRadioItem key={c.did} value={c.did}>
                            {c.label}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function CampaignRow({ node, a }: { node: FlowNode; a: Arrange }) {
    const { ctx } = a;
    const { stage, view } = ctx;
    const c = node.campaign;
    const step = node.step;
    const key = campaignKey(c.id);
    const movable = ctx.canArrange && c.lock === null && stage.stage !== "lost";
    const { ref, handleRef, isDragSource } = useDraggable({ id: c.id, disabled: !movable });
    const cells = campaignNumbers(stage, c.id);
    const started = c.state.state !== "draft";
    const segment = segmentName(stage, c.id) ?? (step.kind === "campaign" ? step.who : null);
    const kind = step.kind === "playbook" ? "Playbook" : c.state.state === "keeps_sending" || c.state.state === "paused" ? null : "One-off";
    const actions: PreviewTarget["actions"] = !ctx.canOpen(c.href)
        ? []
        : started
          ? [
                { label: "Open campaign", href: ctx.to(c.href), primary: true },
                { label: "Results", href: ctx.to(`${c.href}?tab=results`) },
            ]
          : [{ label: "Edit", href: ctx.to(c.href), primary: true }];
    const open = () =>
        ctx.open({
            key,
            title: c.name,
            kind: kind ?? (step.kind === "playbook" ? "Playbook" : "Campaign"),
            state: c.state,
            rules: rulesOf(step),
            numbers: cells ? (
                <p>
                    Sent {cells.sent} · clicked {cells.clicked} · unsubscribed {cells.unsubscribed} · marked as spam {cells.complained} · bought within{" "}
                    {view.resultWindowDays} days {cells.bought}
                    {cells.spent !== "—" ? `, ${cells.spent}` : ""}
                </p>
            ) : (
                <p>Nothing sent to people at this stage yet.</p>
            ),
            actions,
            redrawsDark: true,
        });
    const render = ctx.renders[key];
    const moves = menuMoves(a.layout, c.id);

    return (
        <Row
            rowRef={ref}
            placeholder={isDragSource}
            cardKey={key}
            title={c.name}
            subtitle={c.subject || render?.subject || "No subject yet"}
            lead={
                <>
                    {movable ? (
                        <button
                            ref={handleRef}
                            type="button"
                            aria-label={`Drag “${c.name}” to move it`}
                            className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        >
                            <GripVertical className="size-4" aria-hidden />
                        </button>
                    ) : c.lock ? (
                        <LockMark reason={c.lock} />
                    ) : (
                        <span className="hidden size-9 shrink-0 sm:block" aria-hidden />
                    )}
                    <StepNumber n={node.number} />
                </>
            }
            badges={
                <>
                    <StateBadge state={c.state} />
                    {kind ? (
                        <Badge variant="secondary" className="font-normal">
                            {kind}
                        </Badge>
                    ) : null}
                    {segment ? (
                        <Badge variant="outline" className="max-w-full justify-start font-normal" title={segment}>
                            <span className="truncate">{segment}</span>
                        </Badge>
                    ) : null}
                </>
            }
            meta={cells ? `Sent ${cells.sent} · Clicked ${cells.clicked} · Bought in ${view.resultWindowDays} days ${cells.bought}` : null}
            menu={
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Actions for “${c.name}”`}>
                            <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        {ctx.canOpen(c.href) ? (
                            <DropdownMenuItem asChild>
                                <Link href={ctx.to(c.href)}>{started ? "Open" : "Open to edit"}</Link>
                            </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onSelect={open}>Preview</DropdownMenuItem>
                        {ctx.canOpen(followUpHref(c.id, "sent")) && stage.stage !== "lost" ? (
                            <DropdownMenuItem asChild>
                                <Link href={ctx.to(followUpHref(c.id, "sent"))}>Add a follow-up</Link>
                            </DropdownMenuItem>
                        ) : null}
                        {movable ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={!a.can(moves.earlier)} onSelect={() => moves.earlier && a.move(moves.earlier)}>
                                    Move earlier
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!a.can(moves.later)} onSelect={() => moves.later && a.move(moves.later)}>
                                    Move later
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!a.can(moves.start)} onSelect={() => a.move(moves.start)}>
                                    Start a new sequence
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            }
            onOpen={open}
            ctx={ctx}
            preview={<PreviewPane render={render} onOpen={open} />}
        />
    );
}

/** A Playbook not started: a dashed *Suggested* row with *Add as a draft*, or, while its words wait for the owner, a muted one with no action. */
export function SuggestedRow({ step, ctx }: { step: FlowStep; ctx: FlowCtx }) {
    const router = useRouter();
    const [adding, setAdding] = useState(false);
    const waiting = step.state.state === "words_waiting";
    const key = step.starterId ? starterKey(step.starterId) : `step:${step.key}`;
    const start = !waiting && step.setUpHref && ctx.canOpen(step.setUpHref) ? ctx.to(step.setUpHref) : null;
    const segment = ctx.stage.segments.find((s) => s.notCreated && s.starterId === step.starterId)?.name ?? null;
    const render = ctx.renders[key];
    const open = () =>
        ctx.open({
            key,
            title: step.name,
            kind: waiting ? "Playbook, words waiting for the owner" : "Suggested Playbook",
            state: waiting ? step.state : null,
            rules: rulesOf(step),
            numbers: null,
            actions: start ? [{ label: "Start from this", href: start, primary: true }] : [],
            redrawsDark: true,
        });
    const addDraft = async () => {
        if (!step.starterId) return;
        setAdding(true);
        try {
            const res = await addPlaybookDraft(step.starterId);
            if (res.ok) {
                toast(`“${step.name}” is in the flow as a draft. Nothing was sent.`);
                router.refresh();
            } else toast.error(res.error);
        } catch {
            toast.error("The draft could not be saved. Try again.");
        } finally {
            setAdding(false);
        }
    };
    return (
        <Row
            cardKey={key}
            title={step.name}
            subtitle={render?.subject ?? step.when}
            lead={
                <>
                    <span className="hidden size-9 shrink-0 sm:block" aria-hidden />
                    <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                        <Sparkles className="size-3.5" />
                    </span>
                </>
            }
            badges={
                <>
                    {waiting ? <StateBadge state={step.state} /> : null}
                    <Badge variant="secondary" className="font-normal">
                        {waiting ? "Playbook" : "Suggested"}
                    </Badge>
                    <Badge variant="outline" className="max-w-full justify-start font-normal" title={segment ?? step.who}>
                        <span className="truncate">{segment ?? step.who}</span>
                    </Badge>
                </>
            }
            onOpen={open}
            ctx={ctx}
            tone={waiting ? "waiting" : "suggested"}
            preview={<PreviewPane render={render} onOpen={open} />}
        >
            {waiting ? (
                <p className="text-xs text-muted-foreground">Words waiting for the owner: it can be started once they are approved.</p>
            ) : start ? (
                <>
                    <Button type="button" size="sm" onClick={addDraft} disabled={adding}>
                        <Plus className="mr-1 size-3.5" aria-hidden />
                        {adding ? "Adding…" : "Add as a draft"}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                        <Link href={start}>
                            <Sparkles className="mr-1 size-3.5" aria-hidden />
                            Start from this
                        </Link>
                    </Button>
                </>
            ) : null}
        </Row>
    );
}

/** *Start a new sequence*: while a draft is dragged, the zone that makes it follow nothing. */
function StartZone({ a }: { a: Arrange }) {
    const { dragging } = a;
    const zone = (id: string): PageMove => ({ campaignId: id, after: null, before: null });
    const valid = dragging !== null && a.can(zone(dragging));
    const { ref, isDropTarget } = useDroppable({ id: "zone:start", disabled: !valid, data: { move: zone } });
    if (!a.ctx.canArrange) return null;
    return (
        <div
            ref={ref}
            className={cn(
                "flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-3 text-center text-sm text-muted-foreground transition-colors",
                valid && "border-primary/50",
                isDropTarget && "border-primary bg-primary/10 text-foreground",
            )}
        >
            <GitBranch className="size-4" aria-hidden />
            <span className="font-medium text-foreground">Start a new sequence</span>
            <span className="text-xs">
                {valid ? `Drop “${a.nameOf(dragging!)}” here: it goes to the stage's Segment, after nothing.` : "Drop a draft here to start a sequence with it."}
            </span>
        </div>
    );
}

/** Drafts in no stage yet: each can be dragged into a zone, or placed at the start with *Add to this stage*. */
function Unplaced({ a }: { a: Arrange }) {
    return (
        <section aria-labelledby="flow-unplaced" className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <SectionTitle id="flow-unplaced" hint="Live drafts no stage holds: they go to everyone subscribed, or to a Segment that names no stage.">
                Drafts not in the funnel yet
            </SectionTitle>
            <ul className="flex flex-wrap gap-2">
                {a.layout.unplaced.map((c) => (
                    <UnplacedChip key={c.id} c={c} a={a} />
                ))}
            </ul>
        </section>
    );
}

function UnplacedChip({ c, a }: { c: FlowCampaign; a: Arrange }) {
    const { ref, handleRef, isDragSource } = useDraggable({ id: c.id, disabled: c.lock !== null });
    const place: PageMove = { campaignId: c.id, after: null, before: null };
    return (
        <li ref={ref} className={cn("flex min-w-0 max-w-full items-center gap-1 rounded-lg border bg-card py-1 pl-1 pr-1.5 text-sm", isDragSource && "border-dashed opacity-40")}>
            <button
                ref={handleRef}
                type="button"
                aria-label={`Drag “${c.name}” into the flow`}
                className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <GripVertical className="size-4" aria-hidden />
            </button>
            <span className="min-w-0 truncate font-medium">{c.name}</span>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" disabled={!a.can(place)} onClick={() => a.move(place)}>
                Add to this stage
            </Button>
        </li>
    );
}

/** *Add an email* to the stage: *Start a new sequence*'s companion, and the main call to action when the stage has no campaign. */
export function AddEmailCard({
    stage,
    to,
    canOpen,
    main,
}: {
    stage: FunnelStageView;
    to: (href: string) => string;
    canOpen: (href: string) => boolean;
    main: boolean;
}) {
    if (stage.stage === "lost" || !canOpen(addEmailHref(stage.param))) {
        return (
            <EndBlock icon={Plus} label="Add an email" muted>
                People here unsubscribed from marketing email, so a campaign to this stage would reach nobody.
            </EndBlock>
        );
    }
    return (
        <Link
            href={to(addEmailHref(stage.param))}
            className={cn(
                "flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-3 text-center text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                main && "border-primary/60 bg-primary/5",
            )}
        >
            <span className={cn("flex size-8 items-center justify-center rounded-full", main ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <Plus className="size-4" aria-hidden />
            </span>
            <span className="font-medium">Add an email</span>
            <span className="text-xs text-muted-foreground">
                {main ? `No campaign reaches ${stage.header.label} yet. ` : ""}A new sequence: blank, with AI, from a Starter or a past campaign.
            </span>
        </Link>
    );
}
