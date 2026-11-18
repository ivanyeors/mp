"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bookmark, Mail, Send, Users } from "lucide-react";
import { EmptyState } from "@/components/settings/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CAMPAIGN_AUDIENCE_LABEL } from "@/lib/email-campaigns/rules";
import type { FunnelResultRow, FunnelSegmentView, FunnelStageView, FunnelView, StepState } from "@/lib/email-funnel/model";
import { cn } from "@/lib/utils";
import { LIFECYCLE_PALETTE_CLASS } from "../../customers/lifecycle-card";
import { countText, resultCells, segmentChips, stillCounting } from "./funnel-format";

/**
 * The Email funnel's panels that read as lists and tables (PRD-email-funnel
 * slice 03): the chosen stage's header, its Segments and its Results, and the
 * state badge every card shares. The funnel picture and the Email flow are
 * ./funnel-client.tsx.
 */

const n = (v: number) => v.toLocaleString("en-SG");

/** A stage's own colour: the Customer lifecycle chart's strongest shade, read from `LIFECYCLE_PALETTE_CLASS`. */
const STAGE_HUE: Record<FunnelStageView["stage"], string> = { lead: "lead", new: "new", loyal: "loyal", at_risk: "risk", lost: "lost" };
export const lifecycleStageColour = (stage: FunnelStageView["stage"]) => `var(--lc-${STAGE_HUE[stage]}-3)`;

/**
 * The page's one link rule: a link shows only where the role can open its
 * page (`canOpen`, the sidebar's rule); elsewhere its words show as text.
 * Paths are without the locale; `to` adds it.
 */
export interface Nav {
    to: (href: string) => string;
    canOpen: (href: string) => boolean;
}

/** A link through the rule: the role's page, or plain words. */
export function Gated({ nav, href, className, children }: { nav: Nav; href: string; className?: string; children: ReactNode }) {
    if (nav.canOpen(href)) {
        return (
            <Link href={nav.to(href)} className={cn(className, "hover:underline")}>
                {children}
            </Link>
        );
    }
    return <span className={className}>{children}</span>;
}

/** A step's state, as a coloured badge: green sends, amber needs a person, grey waits. */
export function StateBadge({ state }: { state: StepState }) {
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

/** The chosen stage: its rule, its sub-statuses, and the list on Customers. */
export function StageHeader({ stage, nav }: { stage: FunnelStageView; nav: Nav }) {
    const customersHref = `/settings/customers?stage=${stage.param}`;
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
            {nav.canOpen(customersHref) ? (
                <Button asChild variant="outline" size="sm">
                    <Link href={nav.to(customersHref)}>
                        <Users className="mr-1 h-4 w-4" aria-hidden />
                        Open in Customers
                    </Link>
                </Button>
            ) : null}
        </div>
    );
}

// ─── Segments ────────────────────────────────────────────────────────────────

export function Segments({
    stage,
    names,
    nav,
}: {
    stage: FunnelStageView;
    names: ReadonlyMap<string, string>;
    nav: Nav;
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
                        {nav.canOpen("/settings/customers") ? (
                            <>
                                {" "}
                                <Link href={nav.to(`/settings/customers?stage=${stage.param}`)} className="underline">
                                    Filter Customers by it
                                </Link>{" "}
                                and save one.
                            </>
                        ) : null}
                    </EmptyState>
                ) : (
                    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {stage.segments.map((s) => (
                            <SegmentItem key={s.id ?? `nc-${s.name}`} segment={s} names={names} nav={nav} />
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
    nav,
}: {
    segment: FunnelSegmentView;
    names: ReadonlyMap<string, string>;
    nav: Nav;
}) {
    // A Segment that needs review, or whose filters do not all read, is not emailed or listed from
    // here: the list would hold only the filters still read, a wider one than the Segment.
    const flagged = s.needsReview || s.unreadable;
    const listHref = `/settings/customers?${new URLSearchParams(Object.fromEntries(Object.entries(s.params).filter(([k]) => k !== "search"))).toString()}`;
    const emailHref = s.id ? `/settings/campaigns/new?segment=${s.id}` : null;
    const searchHidden = s.searchHidden;
    const chips = segmentChips(s.params, names, searchHidden);
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
                                        <Gated nav={nav} href={`/settings/campaigns/${c.id}`} className="text-foreground">
                                            {c.name}
                                        </Gated>
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
                                    <Gated nav={nav} href={`/settings/campaigns/${c.id}`} className="text-foreground">
                                        {c.name}
                                    </Gated>
                                </span>
                            ))}
                        </p>
                    ) : null}
                </div>
            )}
            {s.id && flagged ? (
                <p className="mt-2.5 text-xs text-muted-foreground" data-segment-review>
                    It needs review on{" "}
                    <Gated nav={nav} href="/settings/customers" className="text-foreground underline-offset-2">
                        Customers
                    </Gated>{" "}
                    before it can be emailed or listed from here.
                </p>
            ) : s.id ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                    {searchHidden ? (
                        // The Customers list opens by filters, never by a Segment's id, and the funnel never
                        // carries a search's words: the list from here would be wider than the Segment.
                        <p className="w-full text-xs text-muted-foreground" data-segment-search>
                            It includes a search, so open it from the Segments on{" "}
                            <Gated nav={nav} href="/settings/customers" className="text-foreground">
                                Customers
                            </Gated>
                            .
                        </p>
                    ) : nav.canOpen(listHref) ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={nav.to(listHref)}>Open in Customers</Link>
                        </Button>
                    ) : null}
                    {emailHref && nav.canOpen(emailHref) ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={nav.to(emailHref)}>Email this Segment</Link>
                        </Button>
                    ) : null}
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

export function outcomeText(r: Extract<FunnelResultRow, { kind: "automatic" }>): string {
    if (!r.counted) return "Not counted: it could not be read.";
    return [`${r.outcomeLabel}: ${countText(r.outcome)}`, ...r.also.map((a) => `${a.label}: ${n(a.count)}`)].join(" · ");
}

export function Results({ stage, view, nav }: { stage: FunnelStageView; view: FunnelView; nav: Nav }) {
    const { rows, totals, unsubscribedFrom } = stage.results;
    const campaignRows = rows.filter((r) => r.kind === "campaign");
    const counting = stillCounting(stage);
    const href = (r: FunnelResultRow) => (r.kind === "campaign" ? `${r.href}?tab=results` : r.href);
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
                                <ResultCard key={r.kind === "campaign" ? r.campaignId : r.stepId} row={r} href={href(r)} nav={nav} windowDays={view.resultWindowDays} />
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
                                                        <Gated nav={nav} href={href(r)} className="font-medium">
                                                            {r.name}
                                                        </Gated>
                                                        {r.counted ? <p className="text-xs text-muted-foreground">{r.sentLabel}</p> : null}
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
                                                    <Gated nav={nav} href={href(r)} className="font-medium">
                                                        {r.name}
                                                    </Gated>
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
                                        <Gated nav={nav} href={`/settings/campaigns/${c.id}?tab=results`} className="min-w-0 break-words">
                                            {c.name}
                                        </Gated>
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

function ResultCard({ row: r, href, nav, windowDays }: { row: FunnelResultRow; href: string; nav: Nav; windowDays: number }) {
    if (r.kind === "automatic") {
        return (
            <li className="space-y-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                    <Gated nav={nav} href={href} className="min-w-0 break-words font-medium">
                        {r.name}
                    </Gated>
                    <Badge variant="secondary" className="shrink-0 font-normal">
                        Automatic
                    </Badge>
                </div>
                <p className="tabular-nums">
                    {r.sentLabel}: {r.counted ? countText(r.sent) : "—"}
                </p>
                <p className="text-muted-foreground">{outcomeText(r)}</p>
                {r.acrossStages ? <p className="text-xs text-muted-foreground">Every stage it reaches: not split by stage.</p> : null}
            </li>
        );
    }
    const c = resultCells(r.numbers);
    return (
        <li className="space-y-1 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
                <Gated nav={nav} href={href} className="min-w-0 break-words font-medium">
                    {r.name}
                </Gated>
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
