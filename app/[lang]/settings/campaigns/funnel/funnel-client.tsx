"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowRight, CircleSlash, DoorOpen, Hourglass, LogIn, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { UNENGAGED_WHO } from "@/lib/crm/engagement";
import { AT_RISK_AFTER_MONTHS, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { FlowCampaign, FlowStep, FunnelResultRow, FunnelStageView, FunnelView, StepState } from "@/lib/email-funnel/model";
import { daysWords, FUNNEL_PATHS } from "@/lib/email-funnel/programme";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { EmailPreview, type PreviewDevice, type PreviewScheme } from "../email-preview";
import { ThumbnailFrame } from "../thumbnail-frame";
import { LIFECYCLE_PALETTE_CLASS } from "../../customers/lifecycle-card";
import { renderFunnelEmails, type FunnelRender } from "./actions";
import {
    addEmailHref,
    bandSizes,
    campaignKey,
    campaignNamesOf,
    countText,
    flowTree,
    FOLLOW_UP_CHOICES,
    FOLLOW_UP_SHORT,
    followUpHref,
    GROUP_THUMBNAILS,
    renderKeysOf,
    resultCells,
    sequenceDays,
    stageEmailCounts,
    starterKey,
    templateKey,
} from "./funnel-format";
import { lifecycleStageColour, outcomeText, Results, Segments, StageHeader, StateBadge } from "./funnel-panels";

/**
 * The Email funnel as a marketer's workspace (PRD-email-funnel slice 03;
 * owner, 2026-11-18): the five stages as a funnel picture, and for the chosen
 * one its Email flow as cards carrying each email as the real renderer draws
 * it, joined in order, from which a marketer opens an email, adds one to the
 * stage, or adds a follow-up. Segments and Results follow (./funnel-panels).
 *
 * The renders are asked for after the page shows, only for the chosen stage
 * (`renderFunnelEmails`); a card whose render failed shows without a picture.
 */

const n = (v: number) => v.toLocaleString("en-SG");

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
    campaigns: "The campaigns could not be read, so the flow shows only the designed emails.",
    results: "The campaign results could not be read.",
    switches: "The aftercare and draft reminder settings could not be read, so their emails show as off.",
};

/** A render asked for: undefined while it loads, null when it failed, else the email. */
type Renders = Record<string, FunnelRender | null>;

/** What the opened preview shows. */
interface PreviewTarget {
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
interface Ctx {
    stage: FunnelStageView;
    view: FunnelView;
    renders: Renders;
    to: (href: string) => string;
    canOpen: (href: string) => boolean;
    canEditTemplates: boolean;
    open: (t: PreviewTarget) => void;
}

export function FunnelClient({
    view,
    initialStage,
    locale,
    canSeeCustomers,
    canEditTemplates,
    openable,
}: {
    view: FunnelView;
    initialStage: LifecycleStage;
    locale: Locale;
    /** The role holds `customers`: links to the Customers list show. */
    canSeeCustomers: boolean;
    /** The role holds `email-templates`: an Automatic email offers *Edit words*. */
    canEditTemplates: boolean;
    /** Step links the role can open; others are not offered. */
    openable: string[];
}) {
    const [stage, setStage] = useState<LifecycleStage>(initialStage);
    const current = view.stages.find((s) => s.stage === stage) ?? view.stages[0];
    const names = useMemo(() => campaignNamesOf(view), [view]);
    const to = (href: string) => withLocale(href, locale);
    const stageHref = (s: FunnelStageView) => to(`/settings/campaigns/funnel?stage=${s.param}`);
    const canOpen = (href: string) => openable.includes(href);

    // The chosen stage's renders, asked for once the page shows; a stage seen before is not asked again.
    const [renders, setRenders] = useState<Renders>({});
    const asked = useRef(new Set<string>());
    useEffect(() => {
        const keys = renderKeysOf(current).filter((k) => !asked.current.has(k));
        if (!keys.length) return;
        for (const k of keys) asked.current.add(k);
        const settle = (got: Record<string, FunnelRender>) =>
            setRenders((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, got[k] ?? null])) }));
        renderFunnelEmails(keys)
            .then((r) => settle(r.ok ? r.renders : {}))
            .catch(() => settle({}));
    }, [current]);

    const [target, setTarget] = useState<PreviewTarget | null>(null);

    // The stage lives in the URL, so a view can be shared; switching needs no new page read.
    const choose = (s: FunnelStageView) => (e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        setStage(s.stage);
        window.history.replaceState(window.history.state, "", stageHref(s));
    };

    const ctx: Ctx = { stage: current, view, renders, to, canOpen, canEditTemplates, open: setTarget };

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">Email funnel</h1>
                    <InfoTip label="About the email funnel">
                        <p>
                            Every email we send, laid along the customer lifecycle. It starts at Lead: someone who has
                            not given us an email cannot be sent one.
                        </p>
                        <p>
                            A stage&apos;s count is not who will be emailed: consent, bounces, spam reports, the rest
                            period and the sunset rule narrow it again at every send.
                        </p>
                    </InfoTip>
                </div>
                <p className="text-sm text-muted-foreground">
                    Choose a stage to see its emails as they look, open one, or add an email where it belongs.
                </p>
            </div>

            {view.notRead.length ? (
                <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {view.notRead.map((p) => (
                        <p key={p}>{PART_WORDS[p]}</p>
                    ))}
                </div>
            ) : null}

            <FunnelPicture view={view} current={current.stage} href={stageHref} onChoose={choose} />

            <StageHeader stage={current} customersHref={canSeeCustomers ? to(`/settings/customers?stage=${current.param}`) : null} />

            <EmailFlow ctx={ctx} />

            <Segments stage={current} names={names} to={to} canSeeCustomers={canSeeCustomers} />

            <Results stage={current} view={view} to={to} />

            <EmailPreviewDialog target={target} renders={renders} onClose={() => setTarget(null)} />
        </div>
    );
}

// ─── The funnel picture ──────────────────────────────────────────────────────

/**
 * The five stages as joined, tapering bands: left to right on a desktop, top
 * to bottom on a phone. Each band's size is its Customers (`bandSizes`), and
 * its far edge meets the next band's, so the shape reads as a funnel.
 */
function FunnelPicture({
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
    const sizes = bandSizes(view.stages.map((s) => s.header.customers), 0.62);
    return (
        <nav aria-label="Lifecycle stages" className={cn("space-y-2", LIFECYCLE_PALETTE_CLASS)}>
            <ol className="flex flex-col items-stretch gap-1 md:flex-row md:gap-0.5">
                {view.stages.map((s, i) => {
                    const active = s.stage === current;
                    const a = sizes[i];
                    const b = sizes[i + 1] ?? sizes[i] * 0.8;
                    const inA = ((1 - a) / 2) * 100;
                    const inB = ((1 - b) / 2) * 100;
                    const colour = lifecycleStageColour(s.stage);
                    const fill = { background: `color-mix(in oklab, ${colour} ${active ? 46 : 20}%, transparent)` };
                    const counts = stageEmailCounts(s);
                    const emails = `${counts.emails} ${counts.emails === 1 ? "email" : "emails"}${counts.keepSending ? ` · ${counts.keepSending} keep${counts.keepSending === 1 ? "s" : ""} sending` : ""}`;
                    return (
                        <li key={s.stage} className="min-w-0 md:flex-1">
                            <a
                                href={href(s)}
                                onClick={onChoose(s)}
                                aria-current={active ? "page" : undefined}
                                aria-label={`${s.header.label}: ${countText(s.header.customers)} customers, ${s.header.subscribed === null ? "subscribed not counted" : `${n(s.header.subscribed)} subscribed`}, ${emails}`}
                                className="group relative block h-[4.5rem] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-48"
                            >
                                {/* Phone: the band narrows downwards. */}
                                <span
                                    aria-hidden
                                    className="absolute inset-0 transition-[background] group-hover:brightness-95 md:hidden"
                                    style={{ ...fill, clipPath: `polygon(${inA}% 0, ${100 - inA}% 0, ${100 - inB}% 100%, ${inB}% 100%)` }}
                                />
                                {/* Desktop: the band narrows to the right. */}
                                <span
                                    aria-hidden
                                    className="absolute inset-0 hidden transition-[background] group-hover:brightness-95 md:block"
                                    style={{ ...fill, clipPath: `polygon(0 ${inA}%, 100% ${inB}%, 100% ${100 - inB}%, 0 ${100 - inA}%)` }}
                                />
                                <span aria-hidden className="relative flex h-full flex-col items-center justify-center px-2 text-center leading-tight">
                                    <span className="flex items-baseline gap-2 md:flex-col md:items-center md:gap-0.5">
                                        <span className={cn("text-sm", active ? "font-semibold" : "font-medium")}>{s.header.label}</span>
                                        <span className="text-base font-semibold tabular-nums md:text-2xl">{countText(s.header.customers)}</span>
                                    </span>
                                    <span className="mt-0.5 text-xs text-muted-foreground tabular-nums md:mt-1">
                                        {s.header.subscribed === null ? "subscribed not counted" : `${n(s.header.subscribed)} subscribed`}
                                        <span className="md:hidden"> · {emails}</span>
                                    </span>
                                    <span className="mt-0.5 hidden text-xs text-muted-foreground md:block">{emails}</span>
                                </span>
                                {active ? (
                                    <span
                                        aria-hidden
                                        className="absolute -bottom-2 left-1/2 hidden size-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent md:block"
                                        style={{ borderTopColor: colour }}
                                    />
                                ) : null}
                            </a>
                        </li>
                    );
                })}
            </ol>
            <p className="text-xs text-muted-foreground">
                Each band&apos;s size is its Customers. Choose a stage to see its emails.
            </p>
        </nav>
    );
}

// ─── The Email flow ──────────────────────────────────────────────────────────

/** The card's kind badge; null where its state already says it (*Keeps sending, 20 a day*). */
function kindOf(step: FlowStep, c?: FlowCampaign): string | null {
    if (step.kind === "automatic") return step.purpose === "service" ? "Automatic · Service" : "Automatic · Marketing";
    const state = (c?.state ?? step.state).state;
    if (state === "keeps_sending" || state === "paused") return step.kind === "playbook" ? "Playbook" : null;
    return step.kind === "playbook" && !c ? "Playbook" : "One-off";
}

const rulesOf = (step: FlowStep) =>
    [
        { label: "Who", text: step.who },
        { label: "When", text: step.when },
        { label: "Stops", text: step.stops },
        { label: "Consent", text: step.consent },
    ].filter((r) => r.text);

/** A campaign's results in this stage, as the card and the preview show them. */
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

function EmailFlow({ ctx }: { ctx: Ctx }) {
    const { stage, view } = ctx;
    const tree = flowTree(stage.flow);
    const hasCampaign = stage.flow.some((s) => s.campaigns.length > 0);
    // The Rest period sits before a marketing email that follows another one.
    const firstMarketing = tree.findIndex(({ step }) => step.purpose === "marketing");
    const restBefore = (i: number) => firstMarketing !== -1 && i > firstMarketing && tree[i].step.purpose === "marketing";

    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                    Email flow
                    <InfoTip label="About the email flow">
                        <p>
                            The emails this stage is sent, in the order they reach a person, each as it looks. Open one
                            to see it large, on a phone or in dark mode.
                        </p>
                        <p>
                            Service emails go whatever their marketing consent; marketing emails only to people
                            subscribed. A campaign keeps sending once a person sends its first wave and turns on Keep
                            sending. A follow-up is a campaign to the people who got, clicked or didn&apos;t click
                            another.
                        </p>
                        <p>{view.restPeriod.text}</p>
                    </InfoTip>
                </CardTitle>
                <CardDescription>Who enters, each email in order, and what moves them on. Open an email to preview it.</CardDescription>
            </CardHeader>
            <CardContent>
                <ol className="flex flex-col items-stretch md:flex-row md:flex-wrap md:items-start md:gap-y-8" aria-label={`${stage.header.label} email flow`}>
                    <Unit incoming={false} narrow>
                        <EndCard icon={LogIn} label="Enters">
                            <p>{stage.entry.enters}</p>
                            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                {countText(stage.header.customers)} now ·{" "}
                                {stage.header.subscribed === null ? "subscribed not counted" : `${n(stage.header.subscribed)} subscribed`}
                            </p>
                        </EndCard>
                    </Unit>

                    {stage.entry.nothingSent ? (
                        <Unit>
                            <EndCard icon={CircleSlash} label="Sent" muted>
                                {stage.entry.nothingSent}
                            </EndCard>
                        </Unit>
                    ) : null}

                    {tree.map(({ step, followUps }, i) => (
                        <StepNodes key={step.key} step={step} followUps={followUps} rest={restBefore(i)} ctx={ctx} />
                    ))}

                    <Unit>
                        <AddEmailCard stage={stage} to={ctx.to} main={!hasCampaign} />
                    </Unit>

                    <Unit>
                        <EndCard icon={DoorOpen} label="Leaves">
                            <ul className="space-y-1">
                                {STAGE_EXITS[stage.stage].map((e) => (
                                    <li key={e}>{e}</li>
                                ))}
                                {stage.stage !== "lost" ? <li>Unsubscribing moves them to Lost.</li> : null}
                                {stage.entry.sunsetRule ? (
                                    <li className="text-muted-foreground">
                                        Sunset rule: people who {UNENGAGED_WHO} are left out of campaigns, unless a
                                        win-back includes them.
                                    </li>
                                ) : null}
                            </ul>
                        </EndCard>
                    </Unit>
                </ol>
            </CardContent>
        </Card>
    );
}

/**
 * One place on the flow with the connector that leads into it: they wrap
 * together, so a row always starts with *wait → card* and no arrow ends a row.
 * A column on a desktop (its follow-ups hang under it), stacked on a phone.
 */
function Unit({
    children,
    chips,
    rest,
    incoming = true,
    narrow,
}: {
    children: ReactNode;
    chips?: string[];
    rest?: boolean;
    incoming?: boolean;
    narrow?: boolean;
}) {
    return (
        <li className="flex list-none flex-col items-stretch md:flex-row md:items-start">
            {incoming ? <Connector chips={chips} rest={rest} /> : null}
            <div className={cn("min-w-0 md:shrink-0", narrow ? "md:w-44" : "md:w-52")}>{children}</div>
        </li>
    );
}

/** The join between two places, with the wait or condition before the next one, and the Rest period where it applies. */
function Connector({ chips = [], rest }: { chips?: string[]; rest?: boolean }) {
    return (
        <div aria-hidden={chips.length === 0 && !rest ? true : undefined} className="flex flex-col items-center justify-center gap-1 py-1.5 md:w-[5.5rem] md:shrink-0 md:justify-start md:px-1 md:py-0 md:pt-16">
            {rest ? (
                <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border border-dashed bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                    <Hourglass className="size-3 shrink-0" aria-hidden />
                    Rest period
                </span>
            ) : null}
            {chips.map((c) => (
                <span key={c} className="max-w-full rounded-full bg-muted px-2 py-0.5 text-center text-[11px] leading-snug text-muted-foreground">
                    {c}
                </span>
            ))}
            <ArrowDown className="size-4 text-muted-foreground/70 md:hidden" aria-hidden />
            <ArrowRight className="hidden size-4 text-muted-foreground/70 md:block" aria-hidden />
        </div>
    );
}

function EndCard({ icon: Icon, label, children, muted }: { icon: typeof LogIn; label: string; children: ReactNode; muted?: boolean }) {
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

/** A top-level step of the flow and its follow-ups. */
function StepNodes({ step, followUps, rest, ctx }: { step: FlowStep; followUps: FlowStep[]; rest: boolean; ctx: Ctx }) {
    const { stage } = ctx;
    // The draft reminders: one card per email, each after its wait.
    const days = sequenceDays(step);
    if (days) {
        const row = automaticRow(stage, step.key);
        return (
            <>
                {step.templates.map((t, i) => {
                    const sent = row?.also.find((a) => a.label === `After ${daysWords(days[i])}`)?.count;
                    const last = i === step.templates.length - 1;
                    return (
                        <Unit key={t} chips={[`${daysWords(days[i])} after the last save`]} rest={i === 0 && rest}>
                                <AutomaticCard
                                    step={step}
                                    template={t}
                                    title={`${step.name.replace(/\s*\(.*\)$/, "")} · ${daysWords(days[i])}`}
                                    numbers={
                                        row && !row.counted
                                            ? "Not counted"
                                            : sent !== undefined
                                              ? `Sent ${n(sent)}${last && row ? ` · ${row.outcomeLabel} ${countText(row.outcome)}` : ""}`
                                              : null
                                    }
                                    ctx={ctx}
                                />
                        </Unit>
                    );
                })}
            </>
        );
    }
    return (
        <Unit chips={[step.when]} rest={rest}>
                <div className="space-y-3">
                    {step.kind === "automatic" ? (
                        step.templates.length > 1 ? (
                            <GroupCard step={step} ctx={ctx} />
                        ) : (
                            <AutomaticCard step={step} template={step.templates[0]} title={step.name} numbers={automaticNumbers(stage, step)} ctx={ctx} />
                        )
                    ) : step.campaigns.length ? (
                        step.campaigns.map((c) => <CampaignCard key={c.id} step={step} campaign={c} ctx={ctx} />)
                    ) : (
                        <SuggestedCard step={step} ctx={ctx} />
                    )}
                    {followUps.map((f) => (
                        <div key={f.key}>
                            <div className="flex flex-col items-center py-1">
                                <span className="h-3 w-px bg-border" aria-hidden />
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {f.after ? `To those who ${FOLLOW_UP_SHORT[f.after.did]}` : "Follow-up"}
                                    {f.after && !step.campaigns.some((c) => c.id === f.after!.campaignId)
                                        ? ` · ${ctx.stage.flow.flatMap((s) => s.campaigns).find((c) => c.id === f.after!.campaignId)?.name ?? ""}`
                                        : ""}
                                </span>
                                <ArrowDown className="size-3.5 text-muted-foreground/70" aria-hidden />
                            </div>
                            {f.campaigns.map((c) => (
                                <CampaignCard key={c.id} step={f} campaign={c} ctx={ctx} />
                            ))}
                        </div>
                    ))}
                </div>
        </Unit>
    );
}

function automaticNumbers(stage: FunnelStageView, step: FlowStep): string | null {
    const row = automaticRow(stage, step.key);
    if (!row) return null;
    if (!row.counted) return "Not counted";
    return `Sent ${countText(row.sent)} · ${row.outcomeLabel} ${countText(row.outcome)}`;
}

/** The email's picture: a skeleton while it renders, a plain card when it failed. */
function Thumb({ render, className }: { render: FunnelRender | null | undefined; className?: string }) {
    if (render === undefined) return <div className={cn("aspect-[4/3] w-full animate-pulse rounded-sm border bg-muted", className)} />;
    return <ThumbnailFrame id="" shape="landscape" html={render?.html ?? null} className={className} />;
}

/** One email as a card: its picture, name, subject, kind and state, its Segment, its numbers; opening it previews it. */
function EmailCard({
    renderKey,
    title,
    kind,
    state,
    segment,
    numbers,
    onOpen,
    ctx,
    tone = "plain",
    children,
}: {
    renderKey: string;
    title: string;
    kind: string | null;
    state: StepState | null;
    segment: string | null;
    numbers: ReactNode;
    onOpen: () => void;
    ctx: Ctx;
    tone?: "plain" | "suggested" | "waiting";
    children?: ReactNode;
}) {
    const render = ctx.renders[renderKey];
    return (
        <div
            data-card={renderKey}
            className={cn(
                "overflow-hidden rounded-xl border bg-card shadow-xs",
                tone !== "plain" && "border-dashed",
                tone === "waiting" && "bg-muted/30 opacity-75",
            )}
        >
            <button
                type="button"
                onClick={onOpen}
                className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`Preview ${title}`}
            >
                <div className="border-b bg-muted/40 p-2">
                    <Thumb render={render} className="max-md:mx-auto max-md:max-w-60" />
                </div>
                <div className="space-y-1.5 p-3 pb-2">
                    <p className="min-w-0 break-words text-sm font-medium leading-snug">{title}</p>
                    <p className="truncate text-xs text-muted-foreground" title={render?.subject}>
                        {render === undefined ? " " : render ? render.subject : "Preview not available"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {state ? <StateBadge state={state} /> : null}
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
                    </div>
                    {numbers ? <div className="text-xs text-muted-foreground tabular-nums">{numbers}</div> : null}
                </div>
            </button>
            {children ? <div className="space-y-2 border-t px-3 py-2">{children}</div> : null}
        </div>
    );
}

function AutomaticCard({ step, template, title, numbers, ctx }: { step: FlowStep; template: string; title: string; numbers: ReactNode; ctx: Ctx }) {
    const key = templateKey(template);
    return (
        <EmailCard
            renderKey={key}
            title={title}
            kind={kindOf(step)}
            state={step.state}
            segment={null}
            numbers={numbers}
            ctx={ctx}
            onOpen={() => ctx.open(automaticTarget(step, key, title, numbers, ctx))}
        />
    );
}

function automaticTarget(step: FlowStep, key: string, title: string, numbers: ReactNode, ctx: Ctx): PreviewTarget {
    const render = ctx.renders[key];
    const actions: PreviewTarget["actions"] = [];
    if (ctx.canEditTemplates && render?.templateId) {
        actions.push({ label: "Edit words", href: ctx.to(`${FUNNEL_PATHS.emailTemplates}/${encodeURIComponent(render.templateId)}`), primary: true });
    }
    if (step.href !== FUNNEL_PATHS.emailTemplates && ctx.canOpen(step.href)) {
        actions.push({ label: step.href === FUNNEL_PATHS.aftercare ? "Settings (Customers → Settings)" : "Settings (General)", href: ctx.to(step.href) });
    }
    const row = automaticRow(ctx.stage, step.key);
    return {
        key,
        title,
        kind: kindOf(step) ?? "Automatic",
        state: step.state,
        rules: rulesOf(step),
        numbers: row ? <p>{outcomeText(row)}</p> : numbers,
        actions,
        redrawsDark: false,
    };
}

/** Order, return and quote emails: one card, a row of their pictures. */
function GroupCard({ step, ctx }: { step: FlowStep; ctx: Ctx }) {
    const shown = step.templates.slice(0, GROUP_THUMBNAILS);
    const more = step.templates.length - shown.length;
    return (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs" data-card={step.key}>
            <div className="grid grid-cols-2 gap-1.5 border-b bg-muted/40 p-2">
                {shown.map((t) => {
                    const key = templateKey(t);
                    const render = ctx.renders[key];
                    return (
                        <button
                            key={t}
                            type="button"
                            onClick={() => ctx.open(automaticTarget(step, key, render?.subject ?? step.name, null, ctx))}
                            aria-label={`Preview ${render?.subject ?? t}`}
                            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Thumb render={render} />
                        </button>
                    );
                })}
            </div>
            <div className="space-y-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-medium leading-snug">{step.name}</p>
                    <StateBadge state={step.state} />
                </div>
                <p className="text-xs text-muted-foreground">
                    {step.templates.length} emails{more > 0 ? `, ${shown.length} shown` : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="font-normal">
                        {kindOf(step)}
                    </Badge>
                </div>
                {ctx.canEditTemplates ? (
                    <Link href={ctx.to(FUNNEL_PATHS.emailTemplates)} className="inline-block text-xs text-muted-foreground underline-offset-2 hover:underline">
                        All of them in Email templates
                    </Link>
                ) : null}
            </div>
        </div>
    );
}

function CampaignCard({ step, campaign: c, ctx }: { step: FlowStep; campaign: FlowCampaign; ctx: Ctx }) {
    const key = campaignKey(c.id);
    const cells = campaignNumbers(ctx.stage, c.id);
    const numbers = cells ? (
        <dl className="grid grid-cols-3 gap-1">
            <div>
                <dt>Sent</dt>
                <dd className="text-foreground">{cells.sent}</dd>
            </div>
            <div>
                <dt>Clicked</dt>
                <dd className="text-foreground">{cells.clicked}</dd>
            </div>
            <div>
                <dt>Bought in {ctx.view.resultWindowDays} days</dt>
                <dd className="text-foreground">{cells.bought}</dd>
            </div>
        </dl>
    ) : null;
    const started = c.state.state !== "draft";
    const actions: PreviewTarget["actions"] = started
        ? [
              { label: "Open campaign", href: ctx.to(c.href), primary: true },
              { label: "Results", href: ctx.to(`${c.href}?tab=results`) },
          ]
        : [{ label: "Edit", href: ctx.to(c.href), primary: true }];
    return (
        <EmailCard
            renderKey={key}
            title={c.name}
            kind={kindOf(step, c)}
            state={c.state}
            segment={segmentName(ctx.stage, c.id) ?? (step.kind === "campaign" ? step.who : null)}
            numbers={numbers}
            ctx={ctx}
            onOpen={() =>
                ctx.open({
                    key,
                    title: c.name,
                    kind: kindOf(step, c) ?? (step.kind === "playbook" ? "Playbook" : "Campaign"),
                    state: c.state,
                    rules: rulesOf(step),
                    numbers: cells ? (
                        <p>
                            Sent {cells.sent} · clicked {cells.clicked} · unsubscribed {cells.unsubscribed} · marked as spam {cells.complained} · bought
                            within {ctx.view.resultWindowDays} days {cells.bought}
                            {cells.spent !== "—" ? `, ${cells.spent}` : ""}
                        </p>
                    ) : (
                        <p>Nothing sent to people at this stage yet.</p>
                    ),
                    actions,
                    redrawsDark: true,
                })
            }
        >
            <FollowUpLinks campaignId={c.id} to={ctx.to} />
        </EmailCard>
    );
}

/** *Add a follow-up*: to the people who got it, clicked it, or didn't click. */
export function FollowUpLinks({ campaignId, to }: { campaignId: string; to: (href: string) => string }) {
    return (
        <div className="text-xs">
            <p className="mb-1 flex items-center gap-1 font-medium text-muted-foreground">
                <Plus className="size-3.5" aria-hidden />
                Add a follow-up to those who
            </p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Add a follow-up">
                {FOLLOW_UP_CHOICES.map((f) => (
                    <Link
                        key={f.did}
                        href={to(followUpHref(campaignId, f.did))}
                        className="rounded-full border px-2 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {f.label}
                    </Link>
                ))}
            </div>
        </div>
    );
}

/** A Playbook not started: a dashed *Suggested* card, or, while its words wait for the owner, a muted one with no action. */
export function SuggestedCard({ step, ctx }: { step: FlowStep; ctx: Ctx }) {
    const waiting = step.state.state === "words_waiting";
    const key = step.starterId ? starterKey(step.starterId) : `step:${step.key}`;
    const start = !waiting && step.setUpHref && ctx.canOpen(step.setUpHref) ? ctx.to(step.setUpHref) : null;
    const segment = ctx.stage.segments.find((s) => s.notCreated && s.starterId === step.starterId)?.name ?? null;
    return (
        <EmailCard
            renderKey={key}
            title={step.name}
            kind={waiting ? "Playbook" : "Suggested"}
            state={waiting ? step.state : null}
            segment={segment ?? step.who}
            numbers={null}
            tone={waiting ? "waiting" : "suggested"}
            ctx={ctx}
            onOpen={() =>
                ctx.open({
                    key,
                    title: step.name,
                    kind: waiting ? "Playbook, words waiting for the owner" : "Suggested Playbook",
                    state: waiting ? step.state : null,
                    rules: rulesOf(step),
                    numbers: null,
                    actions: start ? [{ label: "Start from this", href: start, primary: true }] : [],
                    redrawsDark: true,
                })
            }
        >
            {waiting ? (
                <p className="text-xs text-muted-foreground">Words waiting for the owner: it can be started once they are approved.</p>
            ) : start ? (
                <Button asChild size="sm" className="w-full">
                    <Link href={start}>
                        <Sparkles className="mr-1 size-3.5" aria-hidden />
                        Start from this
                    </Link>
                </Button>
            ) : null}
        </EmailCard>
    );
}

/** *Add an email* to the stage: the flow's last card, and its main call to action when the stage has no campaign. */
export function AddEmailCard({ stage, to, main }: { stage: FunnelStageView; to: (href: string) => string; main: boolean }) {
    if (stage.stage === "lost") {
        return (
            <EndCard icon={Plus} label="Add an email" muted>
                People here unsubscribed from marketing email, so a campaign to this stage would reach nobody.
            </EndCard>
        );
    }
    return (
        <Link
            href={to(addEmailHref(stage.param))}
            className={cn(
                "flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                main && "border-primary/60 bg-primary/5",
            )}
        >
            <span className={cn("flex size-9 items-center justify-center rounded-full", main ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <Plus className="size-5" aria-hidden />
            </span>
            <span className="font-medium">Add an email</span>
            <span className="text-xs text-muted-foreground">
                {main ? `No campaign reaches ${stage.header.label} yet. ` : ""}Start blank, with AI, from a Starter or a past campaign.
            </span>
        </Link>
    );
}

// ─── The opened email ────────────────────────────────────────────────────────

function EmailPreviewDialog({
    target,
    renders,
    onClose,
}: {
    target: PreviewTarget | null;
    renders: Renders;
    onClose: () => void;
}) {
    const [device, setDevice] = useState<PreviewDevice>("desktop");
    const [scheme, setScheme] = useState<PreviewScheme>("light");
    const [dark, setDark] = useState<Record<string, FunnelRender | null>>({});
    const key = target?.key ?? null;

    // Dark: a campaign or a Starter is drawn again with the shell's dark rules, as the editor's preview does.
    useEffect(() => {
        if (!key || scheme !== "dark" || !target?.redrawsDark || key in dark) return;
        let live = true;
        renderFunnelEmails([key], { dark: true })
            .then((r) => live && setDark((d) => ({ ...d, [key]: r.ok ? (r.renders[key] ?? null) : null })))
            .catch(() => live && setDark((d) => ({ ...d, [key]: null })));
        return () => {
            live = false;
        };
    }, [key, scheme, target?.redrawsDark, dark]);

    const light = key ? renders[key] : undefined;
    const shown = scheme === "dark" && target?.redrawsDark && key ? (dark[key] ?? light) : light;

    return (
        <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto md:max-w-3xl">
                {target ? (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex flex-wrap items-center gap-2">
                                {target.title}
                                {target.state ? <StateBadge state={target.state} /> : null}
                            </DialogTitle>
                            <DialogDescription>{target.kind}</DialogDescription>
                            {/* Above the email, so they show without scrolling past it. */}
                            {target.actions.length ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {target.actions.map((a) => (
                                        <Button key={a.label} asChild variant={a.primary ? "default" : "outline"} size="sm">
                                            <Link href={a.href}>{a.label}</Link>
                                        </Button>
                                    ))}
                                </div>
                            ) : null}
                        </DialogHeader>
                        {light === null ? (
                            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">This email could not be drawn.</p>
                        ) : (
                            <EmailPreview
                                html={shown?.html ?? null}
                                subject={shown?.subject ?? ""}
                                from={null}
                                error={null}
                                device={device}
                                onDevice={setDevice}
                                scheme={scheme}
                                onScheme={setScheme}
                                selected={null}
                                onSelectBlock={() => undefined}
                            />
                        )}
                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                            {target.rules.map((r) => (
                                <div key={r.label} className="contents">
                                    <dt className="text-muted-foreground">{r.label}</dt>
                                    <dd className="min-w-0 break-words">{r.text}</dd>
                                </div>
                            ))}
                        </dl>
                        {target.numbers ? <div className="rounded-md bg-muted/50 p-3 text-sm tabular-nums">{target.numbers}</div> : null}
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
