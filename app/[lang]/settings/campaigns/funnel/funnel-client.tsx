"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import type { LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { FunnelStageView, FunnelView } from "@/lib/email-funnel/model";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { EmailPreview, type PreviewDevice, type PreviewScheme } from "../email-preview";
import { LIFECYCLE_PALETTE_CLASS } from "../../customers/lifecycle-card";
import { renderFunnelEmails, type FunnelRender } from "./actions";
import { bandSizes, campaignNamesOf, canOpenWith, cardRenderKeys, countText, MAX_RENDER_KEYS, stageEmailCounts } from "./funnel-format";
import { EmailFlow, type FlowCtx, type PreviewTarget, type Renders } from "./funnel-flow";
import { lifecycleStageColour, Results, Segments, StageHeader, StateBadge } from "./funnel-panels";

const n = (v: number) => v.toLocaleString("en-SG");

export const PREVIEWS_KEY = "mp.emailFunnel.previews";

function readPreviewsChoice(): string | null {
    try {
        return window.localStorage.getItem(PREVIEWS_KEY);
    } catch {
        return null;
    }
}
const subscribeToStorage = (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
};

const PART_WORDS: Record<FunnelView["notRead"][number], string> = {
    summary: "The stage counts could not be read.",
    segments: "The Segments could not be read.",
    campaigns: "The campaigns could not be read, so the flow shows only the designed emails.",
    results: "The campaign results could not be read.",
    switches: "The aftercare and draft reminder settings could not be read, so their emails show as off.",
};

export function FunnelClient({
    view,
    initialStage,
    locale,
    permissions,
}: {
    view: FunnelView;
    initialStage: LifecycleStage;
    locale: Locale;
    permissions: readonly string[];
}) {
    const [stage, setStage] = useState<LifecycleStage>(initialStage);
    const current = view.stages.find((s) => s.stage === stage) ?? view.stages[0];
    const names = useMemo(() => campaignNamesOf(view), [view]);
    const to = (href: string) => withLocale(href, locale);
    const stageHref = (s: FunnelStageView) => to(`/settings/campaigns/funnel?stage=${s.param}`);
    const canOpen = canOpenWith(permissions);
    const nav = { to, canOpen };

    const stored = useSyncExternalStore(subscribeToStorage, readPreviewsChoice, () => null);
    const [chosen, setChosen] = useState<boolean | null>(null);
    const allShown = chosen ?? stored !== "hidden";
    const [own, setOwn] = useState<Record<string, boolean>>({});
    const showAll = useCallback((shown: boolean) => {
        setChosen(shown);
        setOwn({});
        try {
            window.localStorage.setItem(PREVIEWS_KEY, shown ? "shown" : "hidden");
        } catch {}
    }, []);
    const shown = useCallback((key: string) => own[key] ?? allShown, [own, allShown]);
    const toggle = useCallback((key: string) => setOwn((o) => ({ ...o, [key]: !(o[key] ?? allShown) })), [allShown]);

    const [renders, setRenders] = useState<Renders>({});
    const asked = useRef(new Set<string>());
    useEffect(() => {
        const keys = [...new Set(cardRenderKeys(current).filter((c) => shown(c.card)).flatMap((c) => c.keys))].filter((k) => !asked.current.has(k));
        if (!keys.length) return;
        for (const k of keys) asked.current.add(k);
        for (let i = 0; i < keys.length; i += MAX_RENDER_KEYS) {
            const chunk = keys.slice(i, i + MAX_RENDER_KEYS);
            const settle = (got: Record<string, FunnelRender>) =>
                setRenders((prev) => ({ ...prev, ...Object.fromEntries(chunk.map((k) => [k, got[k] ?? null])) }));
            renderFunnelEmails(chunk)
                .then((r) => settle(r.ok ? r.renders : {}))
                .catch(() => settle({}));
        }
    }, [current, shown]);

    const [target, setTarget] = useState<PreviewTarget | null>(null);
    useEffect(() => {
        const key = target?.key;
        if (!key || asked.current.has(key)) return;
        asked.current.add(key);
        renderFunnelEmails([key])
            .then((r) => setRenders((prev) => ({ ...prev, [key]: (r.ok ? r.renders[key] : null) ?? null })))
            .catch(() => setRenders((prev) => ({ ...prev, [key]: null })));
    }, [target]);

    const choose = (s: FunnelStageView) => (e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        setStage(s.stage);
        window.history.replaceState(window.history.state, "", stageHref(s));
    };

    const ctx: FlowCtx = {
        stage: current,
        view,
        renders,
        to,
        canOpen,
        open: setTarget,
        canArrange: permissions.includes("campaigns") && permissions.includes("customers-edit"),
        shown,
        toggle,
    };

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
                    Choose a stage to see its emails as they look, put drafts in order, or add an email where it belongs.
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

            <StageHeader stage={current} nav={nav} />

            <EmailFlow ctx={ctx} allShown={allShown} onShowAll={showAll} />

            <Segments stage={current} names={names} nav={nav} />

            <Results stage={current} view={view} nav={nav} />

            <EmailPreviewDialog target={target} renders={renders} onClose={() => setTarget(null)} />
        </div>
    );
}

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
                                <span
                                    aria-hidden
                                    className="absolute inset-0 transition-[background] group-hover:brightness-95 md:hidden"
                                    style={{ ...fill, clipPath: `polygon(${inA}% 0, ${100 - inA}% 0, ${100 - inB}% 100%, ${inB}% 100%)` }}
                                />
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
