"use client";

import Link from "next/link";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
    ArrowRight,
    Bookmark,
    CircleSlash,
    DoorOpen,
    ExternalLink,
    Hourglass,
    LogIn,
    Mail,
    Send,
    Users,
} from "lucide-react";
import { EmptyState } from "@/components/settings/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UNENGAGED_WHO } from "@/lib/crm/engagement";
import { AT_RISK_AFTER_MONTHS, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { CAMPAIGN_AUDIENCE_LABEL } from "@/lib/email-campaigns/rules";
import type { FlowStep, FunnelResultRow, FunnelSegmentView, FunnelStageView, FunnelView, StepState } from "@/lib/email-funnel/model";
import { FUNNEL_PATHS } from "@/lib/email-funnel/programme";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { LIFECYCLE_PALETTE_CLASS } from "../../customers/lifecycle-card";
import { campaignNamesOf, countText, flowTree, FOLLOW_UP_WORDS, resultCells, segmentChips, stillCounting } from "./funnel-format";

const n = (v: number) => v.toLocaleString("en-SG");

/** A stage's own colour: the Customer lifecycle chart's strongest shade, read from `LIFECYCLE_PALETTE_CLASS`. */
const STAGE_HUE: Record<LifecycleStage, string> = { lead: "lead", new: "new", loyal: "loyal", at_risk: "risk", lost: "lost" };
const lifecycleStageColour = (stage: LifecycleStage) => `var(--lc-${STAGE_HUE[stage]}-3)`;

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

const PART_WORDS: Record<FunnelView["notRead"][number], string> = {
    summary: "The stage counts could not be read.",
    segments: "The Segments could not be read.",
    campaigns: "The campaigns could not be read, so the flow shows only the programme.",
    results: "The campaign results could not be read.",
    switches: "The aftercare and draft reminder settings could not be read, so their steps show as off.",
};

/** A step's state, as a coloured badge: green sends, amber needs a person, grey waits. */
function StateBadge({ state }: { state: StepState }) {
    const tone: Record<StepState["state"], string> = {
        on: "border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
        keeps_sending: "border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
        started: "border-transparent bg-secondary text-secondary-foreground",
        draft: "",
        paused: "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
        off_in_settings: "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
        not_set_up: "border-dashed text-muted-foreground",
        words_waiting: "border-dashed text-muted-foreground",
    };
    return (
        <Badge variant="outline" className={cn("max-w-full whitespace-normal text-left", tone[state.state])}>
            {state.label}
        </Badge>
    );
}

/** The node on the flow's rail: filled when it sends, hollow when it does not. */
const NODE_TONE: Record<StepState["state"], string> = {
    on: "bg-emerald-500 border-emerald-500",
    keeps_sending: "bg-emerald-500 border-emerald-500",
    started: "bg-foreground/60 border-foreground/60",
    draft: "bg-background border-muted-foreground",
    paused: "bg-amber-500 border-amber-500",
    off_in_settings: "bg-background border-amber-500",
    not_set_up: "bg-background border-muted-foreground border-dashed",
    words_waiting: "bg-background border-muted-foreground border-dashed",
};

export function FunnelClient({
    view,
    initialStage,
    locale,
    canSeeCustomers,
    openable,
}: {
    view: FunnelView;
    initialStage: LifecycleStage;
    locale: Locale;
    /** The role holds `customers`: links to the Customers list show. */
    canSeeCustomers: boolean;
    /** Step links the role can open; others are not offered. */
    openable: string[];
}) {
    const [stage, setStage] = useState<LifecycleStage>(initialStage);
    const current = view.stages.find((s) => s.stage === stage) ?? view.stages[0];
    const names = useMemo(() => campaignNamesOf(view), [view]);
    const to = (href: string) => withLocale(href, locale);
    const stageHref = (s: FunnelStageView) => to(`/settings/campaigns/funnel?stage=${s.param}`);
    const canOpen = (href: string) => openable.includes(href);

    // The stage lives in the URL, so a view can be shared; switching needs no new read.
    const choose = (s: FunnelStageView) => (e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        setStage(s.stage);
        window.history.replaceState(window.history.state, "", stageHref(s));
    };

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">Email funnel</h1>
                    <InfoTip label="About the email funnel">
                        <p>
                            Every email we send by itself, laid along the customer lifecycle. It starts at Lead: someone
                            who has not given us an email cannot be sent one.
                        </p>
                        <p>
                            A stage&apos;s count is not who will be emailed: consent, bounces, spam reports, the rest
                            period and the sunset rule narrow it again at every send.
                        </p>
                        <p>This page reads what is set up. Change a step where its link goes.</p>
                    </InfoTip>
                </div>
                <p className="text-sm text-muted-foreground">
                    Choose a stage to see who it is, what we send them and what each email did.
                </p>
            </div>

            {view.notRead.length ? (
                <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {view.notRead.map((p) => (
                        <p key={p}>{PART_WORDS[p]}</p>
                    ))}
                </div>
            ) : null}

            <StageStrip view={view} current={current.stage} href={stageHref} onChoose={choose} />

            <StageHeader stage={current} customersHref={canSeeCustomers ? to(`/settings/customers?stage=${current.param}`) : null} />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
                <EmailFlow stage={current} view={view} to={to} canOpen={canOpen} />
                <Segments stage={current} names={names} to={to} canSeeCustomers={canSeeCustomers} />
            </div>

            <Results stage={current} view={view} to={to} />
        </div>
    );
}

// ─── The stage strip ─────────────────────────────────────────────────────────

function StageStrip({
    view,
    current,
    href,
    onChoose,
}: {
    view: FunnelView;
    current: LifecycleStage;
    href: (s: FunnelStageView) => string;
    onChoose: (s: FunnelStageView) => (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
    const max = Math.max(1, ...view.stages.map((s) => s.header.customers ?? 0));
    return (
        <nav aria-label="Lifecycle stages" className={LIFECYCLE_PALETTE_CLASS}>
            <ol className="grid gap-2 md:grid-cols-5 md:gap-3">
                {view.stages.map((s, i) => {
                    const active = s.stage === current;
                    const customers = s.header.customers;
                    const width = customers ? Math.max(2, (customers / max) * 100) : 0;
                    return (
                        <li key={s.stage} className="relative min-w-0">
                            <a
                                href={href(s)}
                                onClick={onChoose(s)}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "group block h-full rounded-xl border bg-card p-3 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-4",
                                    active && "border-foreground/50 bg-muted/50 shadow-sm",
                                )}
                            >
                                <span className="flex items-center justify-between gap-2 md:block">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span
                                            aria-hidden
                                            className="size-2.5 shrink-0 rounded-full"
                                            style={{ background: lifecycleStageColour(s.stage) }}
                                        />
                                        <span className={cn("truncate text-sm font-medium", active && "font-semibold")}>{s.header.label}</span>
                                        <span className="text-xs text-muted-foreground md:hidden">{i + 1} of 5</span>
                                    </span>
                                    <span className="flex shrink-0 items-baseline gap-2 md:mt-2 md:flex-col md:gap-0">
                                        <span className="text-lg font-semibold tabular-nums md:text-2xl">{countText(customers)}</span>
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {s.header.subscribed === null ? "subscribed not counted" : `${n(s.header.subscribed)} subscribed`}
                                        </span>
                                    </span>
                                </span>
                                <span aria-hidden className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-muted md:mt-3">
                                    <span
                                        className="block h-full rounded-full"
                                        style={{ width: `${width}%`, background: lifecycleStageColour(s.stage) }}
                                    />
                                </span>
                            </a>
                            {i < view.stages.length - 1 ? (
                                <ArrowRight
                                    aria-hidden
                                    className="absolute -right-3 top-1/2 z-10 hidden size-3 -translate-y-1/2 text-muted-foreground md:block"
                                />
                            ) : null}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

function StageHeader({ stage, customersHref }: { stage: FunnelStageView; customersHref: string | null }) {
    // Sub-statuses only where a stage has more than one.
    const parts = stage.header.parts.length > 1 ? stage.header.parts.filter((p) => p.customers > 0) : [];
    return (
        <div className={cn("flex flex-wrap items-end justify-between gap-3 border-b pb-4", LIFECYCLE_PALETTE_CLASS)}>
            <div className="min-w-0 space-y-1">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <span aria-hidden className="size-3 rounded-full" style={{ background: lifecycleStageColour(stage.stage) }} />
                    {stage.header.label}
                </h2>
                <p className="text-sm text-muted-foreground">{stage.header.rule}</p>
                {parts.length ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                        {parts.map((p) => `${p.label} ${n(p.customers)}`).join(" · ")}
                    </p>
                ) : null}
            </div>
            {customersHref ? (
                <Button asChild variant="outline" size="sm">
                    <Link href={customersHref}>
                        <Users className="mr-1 h-4 w-4" aria-hidden />
                        Open in Customers
                    </Link>
                </Button>
            ) : null}
        </div>
    );
}

// ─── Email flow ──────────────────────────────────────────────────────────────

function EmailFlow({
    stage,
    view,
    to,
    canOpen,
}: {
    stage: FunnelStageView;
    view: FunnelView;
    to: (href: string) => string;
    canOpen: (href: string) => boolean;
}) {
    const tree = flowTree(stage.flow);
    const hasCampaign = stage.flow.some((s) => s.kind !== "automatic" && s.campaigns.length > 0);
    let seenMarketing = false;
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                    Email flow
                    <InfoTip label="About the email flow">
                        <p>
                            The emails this stage is sent, in the order they reach a person. Service emails go whatever
                            their marketing consent; marketing emails only to people subscribed.
                        </p>
                        <p>
                            A campaign keeps sending once a person sends its first wave and turns on Keep sending. A
                            follow-up is a campaign whose Segment reads another one.
                        </p>
                    </InfoTip>
                </CardTitle>
                <CardDescription>Who enters, each email in order, and what moves them on.</CardDescription>
            </CardHeader>
            <CardContent>
                <ol className="relative">
                    <FlowNode icon={LogIn} label="Enters">
                        {stage.entry.enters}
                    </FlowNode>

                    {stage.entry.nothingSent ? (
                        <FlowNode icon={CircleSlash} label="Sent" muted>
                            {stage.entry.nothingSent}
                        </FlowNode>
                    ) : (
                        tree.map(({ step, followUps }) => {
                            const rest = step.purpose === "marketing" && seenMarketing;
                            if (step.purpose === "marketing") seenMarketing = true;
                            return (
                                <li key={step.key} className="list-none">
                                    {rest ? <RestConnector view={view} /> : null}
                                    <ol>
                                        <StepCard step={step} to={to} canOpen={canOpen} />
                                        {followUps.length ? (
                                            <li className="list-none">
                                                <ol className="ml-6 border-l border-dashed pl-0 sm:ml-10">
                                                    {followUps.map((f) => (
                                                        <StepCard key={f.key} step={f} to={to} canOpen={canOpen} followUp />
                                                    ))}
                                                </ol>
                                            </li>
                                        ) : null}
                                    </ol>
                                </li>
                            );
                        })
                    )}

                    {!stage.entry.nothingSent && !hasCampaign ? (
                        <FlowNode icon={Mail} label="Campaigns" muted>
                            No campaign is sent to a Segment of this stage yet.
                        </FlowNode>
                    ) : null}

                    <FlowNode icon={DoorOpen} label="Leaves" last>
                        <ul className="space-y-1">
                            {STAGE_EXITS[stage.stage].map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                            {stage.stage !== "lost" ? <li>Unsubscribing from marketing email moves them to Lost.</li> : null}
                            {stage.entry.sunsetRule ? (
                                <li>
                                    The sunset rule: people who {UNENGAGED_WHO} are left out of campaigns, unless a
                                    win-back includes them.
                                </li>
                            ) : null}
                        </ul>
                    </FlowNode>
                </ol>
            </CardContent>
        </Card>
    );
}

/** A plain node on the rail: the entry, nothing sent, the exits. */
function FlowNode({
    icon: Icon,
    label,
    children,
    muted,
    last,
}: {
    icon: typeof LogIn;
    label: string;
    children: ReactNode;
    muted?: boolean;
    last?: boolean;
}) {
    return (
        <li className="relative list-none pb-4 pl-10 last:pb-0">
            {!last ? <span aria-hidden className="absolute bottom-0 left-[15px] top-8 w-px bg-border" /> : null}
            <span
                aria-hidden
                className="absolute left-0 top-0 flex size-8 items-center justify-center rounded-full border bg-muted text-muted-foreground"
            >
                <Icon className="size-4" />
            </span>
            <div className={cn("min-h-8 pt-1 text-sm", muted && "text-muted-foreground")}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <div className="mt-0.5">{children}</div>
            </div>
        </li>
    );
}

function RestConnector({ view }: { view: FunnelView }) {
    return (
        <div className="relative pb-4 pl-10">
            <span aria-hidden className="absolute bottom-0 left-[15px] top-0 w-px bg-border" />
            <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed bg-background py-0.5 pl-2 pr-0.5 text-xs text-muted-foreground">
                <Hourglass className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">
                    Rest period: {view.restPeriod.days} days apart, at most {view.restPeriod.maxPer30Days} in 30
                </span>
                <InfoTip label="About the rest period">
                    <p>{view.restPeriod.text}</p>
                </InfoTip>
            </p>
        </div>
    );
}

function kindLabel(step: FlowStep): string {
    if (step.kind === "automatic") return "Automatic";
    if (step.kind === "playbook") return "Playbook";
    return step.state.state === "keeps_sending" || step.state.state === "paused" ? "Keeps sending" : "One-off";
}

/** Where a step is changed, in words. */
function linkLabel(step: FlowStep): string {
    if (step.kind !== "automatic") return step.campaigns.length ? "Open campaign" : "Campaigns";
    if (step.href === FUNNEL_PATHS.aftercare) return "Customers → Settings";
    if (step.href === FUNNEL_PATHS.draftReminders) return "General settings";
    if (step.href === FUNNEL_PATHS.emailTemplates) return "Email templates";
    return "Open";
}

function StepCard({
    step,
    to,
    canOpen,
    followUp,
}: {
    step: FlowStep;
    to: (href: string) => string;
    canOpen: (href: string) => boolean;
    followUp?: boolean;
}) {
    // A Playbook links through its campaigns or Set up; one waiting for the owner offers nothing to do.
    const showLink = canOpen(step.href) && step.kind !== "playbook";
    return (
        <li className="relative list-none pb-4 pl-10">
            <span aria-hidden className="absolute bottom-0 left-[15px] top-0 w-px bg-border" />
            <span
                aria-hidden
                className={cn("absolute left-[9px] top-4 size-3.5 rounded-full border-2", NODE_TONE[step.state.state])}
            />
            <div className="rounded-lg border bg-card p-3 shadow-xs">
                {followUp && step.after ? (
                    <p className="mb-1 text-xs font-medium text-muted-foreground">↳ {FOLLOW_UP_WORDS[step.after.did]}</p>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                    <p className="min-w-0 break-words font-medium">{step.name}</p>
                    <StateBadge state={step.state} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="font-normal">
                        {kindLabel(step)}
                    </Badge>
                    <Badge
                        variant="outline"
                        className={cn(
                            "font-normal",
                            step.purpose === "service"
                                ? "border-sky-300 text-sky-800 dark:border-sky-700 dark:text-sky-300"
                                : "border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-300",
                        )}
                    >
                        {step.purpose === "service" ? "Service" : "Marketing"}
                    </Badge>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Who</dt>
                    <dd className="min-w-0 break-words">{step.who}</dd>
                    <dt className="text-muted-foreground">When</dt>
                    <dd className="min-w-0 break-words">{step.when}</dd>
                    {step.stops ? (
                        <>
                            <dt className="text-muted-foreground">Stops</dt>
                            <dd className="min-w-0 break-words">{step.stops}</dd>
                        </>
                    ) : null}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{step.consent}</p>

                {step.kind === "playbook" && step.campaigns.length ? (
                    <ul className="mt-2 space-y-1 border-t pt-2 text-sm">
                        {step.campaigns.map((c) => (
                            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                                <Link href={to(c.href)} className="min-w-0 break-words font-medium hover:underline">
                                    {c.name}
                                </Link>
                                <span className="text-xs text-muted-foreground">{c.state.label}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}

                {step.setUpHref || showLink ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {step.setUpHref && canOpen(step.setUpHref) ? (
                            <Button asChild size="sm">
                                <Link href={to(step.setUpHref)}>Set up</Link>
                            </Button>
                        ) : null}
                        {showLink ? (
                            <Button asChild size="sm" variant="ghost" className="-ml-2 h-8 px-2 text-muted-foreground">
                                <Link href={to(step.href)}>
                                    {linkLabel(step)}
                                    <ExternalLink className="ml-1 size-3.5" aria-hidden />
                                </Link>
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </li>
    );
}

// ─── Segments ────────────────────────────────────────────────────────────────

function Segments({
    stage,
    names,
    to,
    canSeeCustomers,
}: {
    stage: FunnelStageView;
    names: ReadonlyMap<string, string>;
    to: (href: string) => string;
    canSeeCustomers: boolean;
}) {
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                    Segments
                    <InfoTip label="About Segments here">
                        <p>Every saved Segment whose Stage filter names this stage, with how many it chooses now.</p>
                        <p>A Playbook&apos;s Segment that has not been saved yet is listed as Not created.</p>
                    </InfoTip>
                </CardTitle>
                <CardDescription>Who in this stage we write to.</CardDescription>
            </CardHeader>
            <CardContent>
                {stage.segments.length === 0 ? (
                    <EmptyState icon={Bookmark} className="md:p-8">
                        No Segment names this stage yet.
                        {canSeeCustomers ? (
                            <>
                                {" "}
                                <Link href={to(`/settings/customers?stage=${stage.param}`)} className="underline">
                                    Filter Customers by it
                                </Link>{" "}
                                and save one.
                            </>
                        ) : null}
                    </EmptyState>
                ) : (
                    <ul className="space-y-3">
                        {stage.segments.map((s) => (
                            <SegmentItem key={s.id ?? `nc-${s.name}`} segment={s} names={names} to={to} canSeeCustomers={canSeeCustomers} />
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

function SegmentItem({
    segment: s,
    names,
    to,
    canSeeCustomers,
}: {
    segment: FunnelSegmentView;
    names: ReadonlyMap<string, string>;
    to: (href: string) => string;
    canSeeCustomers: boolean;
}) {
    const searchHidden = (s as FunnelSegmentView & { searchHidden?: boolean }).searchHidden === true;
    const chips = segmentChips(s.params, names, searchHidden);
    // A search is never put in a link from here: it may hold a name or an email.
    const listParams = Object.fromEntries(Object.entries(s.params).filter(([k]) => k !== "search"));
    return (
        <li className={cn("rounded-lg border p-3", s.notCreated && "border-dashed bg-muted/30")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words font-medium">{s.name}</p>
                {s.notCreated ? (
                    <Badge variant="outline" className="border-dashed font-normal text-muted-foreground">
                        Not created
                    </Badge>
                ) : (
                    <span className="text-sm tabular-nums">
                        <span className="font-semibold">{countText(s.count)}</span>{" "}
                        <span className="text-muted-foreground">{s.count === null ? "not counted" : "now"}</span>
                    </span>
                )}
            </div>
            {s.needsReview || s.unreadable ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    {s.unreadable ? "A filter could not be read: check it on Customers." : "Needs review: a filter changed meaning."}
                </p>
            ) : null}
            {chips.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Filters">
                    {chips.map((c) => (
                        <li key={c} className="max-w-full break-words rounded-md bg-muted px-2 py-0.5 text-xs">
                            {c}
                        </li>
                    ))}
                </ul>
            ) : null}
            {s.notCreated ? (
                <p className="mt-2 text-xs text-muted-foreground">Saved when its Playbook is set up.</p>
            ) : (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <p>
                        <Send className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                        {s.sendsTo.length ? (
                            <>
                                Receives{" "}
                                {s.sendsTo.map((c, i) => (
                                    <span key={c.id}>
                                        {i ? ", " : ""}
                                        <Link href={to(`/settings/campaigns/${c.id}`)} className="text-foreground hover:underline">
                                            {c.name}
                                        </Link>
                                    </span>
                                ))}
                            </>
                        ) : (
                            "No campaign sends to it"
                        )}
                    </p>
                    {s.leftOutBy.length ? (
                        <p>
                            Left out of{" "}
                            {s.leftOutBy.map((c, i) => (
                                <span key={c.id}>
                                    {i ? ", " : ""}
                                    <Link href={to(`/settings/campaigns/${c.id}`)} className="text-foreground hover:underline">
                                        {c.name}
                                    </Link>
                                </span>
                            ))}
                        </p>
                    ) : null}
                </div>
            )}
            {s.id ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                    {canSeeCustomers ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={to(`/settings/customers?${new URLSearchParams(listParams).toString()}`)}>Open in Customers</Link>
                        </Button>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                        <Link href={to(`/settings/campaigns/new?segment=${s.id}`)}>Email this Segment</Link>
                    </Button>
                </div>
            ) : null}
        </li>
    );
}

// ─── Results ─────────────────────────────────────────────────────────────────

function kindOfRow(r: FunnelResultRow): string {
    if (r.kind === "automatic") return "Automatic";
    return r.keepsSending ? "Keeps sending" : "One-off";
}

function outcomeText(r: Extract<FunnelResultRow, { kind: "automatic" }>): string {
    if (!r.counted) return "Not counted: it could not be read.";
    return [`${r.outcomeLabel}: ${countText(r.outcome)}`, ...r.also.map((a) => `${a.label}: ${n(a.count)}`)].join(" · ");
}

function Results({ stage, view, to }: { stage: FunnelStageView; view: FunnelView; to: (href: string) => string }) {
    const { rows, totals, unsubscribedFrom } = stage.results;
    const campaignRows = rows.filter((r) => r.kind === "campaign");
    const counting = stillCounting(stage);
    const href = (r: FunnelResultRow) => to(r.kind === "campaign" ? `${r.href}?tab=results` : r.href);
    const total = resultCells(totals.campaigns);
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                    Results
                    <InfoTip label="How results are counted">
                        <p>
                            Rates are of the people sent it, never of opens: Apple Mail marks nearly every email as
                            opened. Clicks are approximate.
                        </p>
                        <p>
                            A purchase is a paid order with goods in it, made within {view.resultWindowDays} days after
                            the email, less anything refunded. People buy for many reasons, so not every purchase here
                            came from the email.
                        </p>
                        <p>Automatic emails show what they record themselves, not clicks or purchases.</p>
                    </InfoTip>
                </CardTitle>
                {/* ponytail: no period picker (PRD decision 6): `email_campaign_stage_results` has no dates, so every
                    number is since each email started. Upgrade: a dated results view and a `since` on FunnelFacts. */}
                <CardDescription>
                    Since each email started, counted by the stage people had when it reached them.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {rows.length === 0 && stage.stage === "lost" ? (
                    <p className="text-sm text-muted-foreground">No marketing email reaches people at this stage, so none has results here.</p>
                ) : rows.length === 0 ? (
                    <EmptyState icon={Mail} className="md:p-8">
                        Nothing has been sent to people at this stage yet.
                    </EmptyState>
                ) : (
                    <>
                        {/* Phone: one card per email. */}
                        <ul className="divide-y rounded-lg border md:hidden">
                            {rows.map((r) => (
                                <ResultCard key={r.kind === "campaign" ? r.campaignId : r.stepId} row={r} href={href(r)} windowDays={view.resultWindowDays} />
                            ))}
                        </ul>
                        {/* Desktop: the table. */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Kind</TableHead>
                                        <TableHead className="text-right">Sent</TableHead>
                                        <TableHead className="text-right">Clicked</TableHead>
                                        <TableHead className="text-right">Unsubscribed</TableHead>
                                        <TableHead className="text-right">Marked as spam</TableHead>
                                        <TableHead className="text-right">Bought within {view.resultWindowDays} days</TableHead>
                                        <TableHead className="text-right">Spent</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((r) => {
                                        if (r.kind === "automatic") {
                                            return (
                                                <TableRow key={r.stepId}>
                                                    <TableCell className="whitespace-normal">
                                                        <Link href={href(r)} className="font-medium hover:underline">
                                                            {r.name}
                                                        </Link>
                                                        {r.acrossStages ? (
                                                            <p className="text-xs text-muted-foreground">Every stage it reaches: not split by stage</p>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell className="text-sm">Automatic</TableCell>
                                                    <TableCell className="text-right tabular-nums">{r.counted ? countText(r.sent) : "—"}</TableCell>
                                                    <TableCell colSpan={5} className="whitespace-normal text-sm text-muted-foreground">
                                                        {outcomeText(r)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }
                                        const c = resultCells(r.numbers);
                                        return (
                                            <TableRow key={r.campaignId}>
                                                <TableCell className="whitespace-normal">
                                                    <Link href={href(r)} className="font-medium hover:underline">
                                                        {r.name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">{CAMPAIGN_AUDIENCE_LABEL[r.audience]}</p>
                                                </TableCell>
                                                <TableCell className="text-sm">{kindOfRow(r)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.sent}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.clicked}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.unsubscribed}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.complained}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.bought}</TableCell>
                                                <TableCell className="text-right tabular-nums">{c.spent}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                                {campaignRows.length > 1 ? (
                                    <TableFooter>
                                        <TableRow>
                                            <TableCell colSpan={2} className="font-medium">
                                                All campaigns
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{total.sent}</TableCell>
                                            <TableCell className="text-right tabular-nums">{total.clicked}</TableCell>
                                            <TableCell className="text-right tabular-nums">{total.unsubscribed}</TableCell>
                                            <TableCell className="text-right tabular-nums">{total.complained}</TableCell>
                                            <TableCell className="text-right tabular-nums">{total.bought}</TableCell>
                                            <TableCell className="text-right tabular-nums">{total.spent}</TableCell>
                                        </TableRow>
                                    </TableFooter>
                                ) : null}
                            </Table>
                        </div>
                        {campaignRows.length ? (
                            <p className="text-sm text-muted-foreground">
                                People buy for many reasons, so not every purchase here came from the email.
                                {counting > 0
                                    ? ` Still counting: ${n(counting)} of them were sent under ${view.resultWindowDays} days ago, so these can still rise.`
                                    : ""}
                            </p>
                        ) : null}
                    </>
                )}

                {unsubscribedFrom ? (
                    <section aria-labelledby="unsubscribed-from" className="space-y-2">
                        <h3 id="unsubscribed-from" className="text-sm font-medium">
                            Which emails people unsubscribed from
                        </h3>
                        {unsubscribedFrom.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nobody has unsubscribed from a campaign.</p>
                        ) : (
                            <ul className="divide-y rounded-lg border text-sm">
                                {unsubscribedFrom.map((c) => (
                                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                        <Link href={to(`/settings/campaigns/${c.id}?tab=results`)} className="min-w-0 break-words hover:underline">
                                            {c.name}
                                        </Link>
                                        <span className="shrink-0 tabular-nums">{n(c.unsubscribed)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="text-xs text-muted-foreground">Every stage they were at when sent, added up.</p>
                    </section>
                ) : null}
            </CardContent>
        </Card>
    );
}

function ResultCard({ row: r, href, windowDays }: { row: FunnelResultRow; href: string; windowDays: number }) {
    if (r.kind === "automatic") {
        return (
            <li className="space-y-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                    <Link href={href} className="min-w-0 break-words font-medium hover:underline">
                        {r.name}
                    </Link>
                    <Badge variant="secondary" className="shrink-0 font-normal">
                        Automatic
                    </Badge>
                </div>
                <p className="tabular-nums">Sent {r.counted ? countText(r.sent) : "—"}</p>
                <p className="text-muted-foreground">{outcomeText(r)}</p>
                {r.acrossStages ? <p className="text-xs text-muted-foreground">Every stage it reaches: not split by stage.</p> : null}
            </li>
        );
    }
    const c = resultCells(r.numbers);
    return (
        <li className="space-y-1 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
                <Link href={href} className="min-w-0 break-words font-medium hover:underline">
                    {r.name}
                </Link>
                <Badge variant="secondary" className="shrink-0 font-normal">
                    {kindOfRow(r)}
                </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 tabular-nums min-[420px]:grid-cols-3">
                {(
                    [
                        ["Sent", c.sent],
                        ["Clicked", c.clicked],
                        ["Unsubscribed", c.unsubscribed],
                        ["Marked as spam", c.complained],
                        [`Bought in ${windowDays} days`, c.bought],
                        ["Spent", c.spent],
                    ] as const
                ).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
        </li>
    );
}
