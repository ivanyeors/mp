/**
 * The Email funnel page's words and cells, pure (PRD-email-funnel slice 03).
 * Results follow the campaign Results tab: rates over people sent, through
 * `rate()`, and a dash when nobody was sent, never 0% or NaN.
 */

import {
    describeCustomerFilters,
    parseCustomerFilters,
    type CampaignFilterState,
} from "@/lib/crm/customer-filters";
import type { LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { formatRate, formatSgd, resultRates, type FunnelStageView, type FunnelView } from "@/lib/email-funnel/model";
import type { ResultNumbers } from "@/lib/email-campaigns/results";
import { FUNNEL_PROGRAMME } from "@/lib/email-funnel/programme";

const n = (v: number) => v.toLocaleString("en-SG");

/** The stage `?stage=` names (hyphenated, as the Customers filter writes it); *Lead* for none or an unknown value. */
export function stageFromParam(view: Pick<FunnelView, "stages">, param: string | string[] | undefined): LifecycleStage {
    const v = Array.isArray(param) ? param[0] : param;
    return view.stages.find((s) => s.param === v)?.stage ?? "lead";
}

export interface ResultCells {
    sent: string;
    clicked: string;
    unsubscribed: string;
    complained: string;
    bought: string;
    spent: string;
}

/** A count and its rate over people sent: "31 (13%)"; a dash when nobody was sent. */
function rated(count: number, r: number | null): string {
    return r === null ? "—" : `${n(count)} (${formatRate(r)})`;
}

/** Pure — one campaign row's cells. Every rate is `rate(part, people)` (via `resultRates`). */
export function resultCells(x: ResultNumbers): ResultCells {
    const r = resultRates(x);
    return {
        sent: x.people > 0 ? n(x.people) : "—",
        clicked: rated(x.clicked, r.clicked),
        unsubscribed: rated(x.unsubscribed, r.unsubscribed),
        complained: rated(x.complained, r.complained),
        bought: rated(x.bought, r.bought),
        spent: x.people > 0 && x.bought > 0 ? formatSgd(x.boughtTotal) : "—",
    };
}

/** A count, or a dash when it was not read. */
export const countText = (v: number | null) => (v === null ? "—" : n(v));

/** How a follow-up reads, after the campaign it hangs under: *Sent to those who clicked it*. */
export const FOLLOW_UP_WORDS: Record<CampaignFilterState, string> = {
    sent: "To those who got it",
    clicked: "To those who clicked it",
    "not-clicked": "To those who got it and didn't click",
    "not-sent": "To those who didn't get it",
};

/**
 * A Segment's filters as the Customers page's chips. A search is never shown
 * in words (it may hold a name or an email): a plain *Search* chip says one is
 * part of the Segment.
 */
export function segmentChips(
    params: Readonly<Record<string, string>>,
    campaignNames: ReadonlyMap<string, string>,
    searchHidden = false,
): string[] {
    const { search, ...rest } = params;
    const { filters } = parseCustomerFilters(new URLSearchParams(rest));
    const chips = describeCustomerFilters(filters, { campaignNames }).map((c) => c.label);
    return search !== undefined || searchHidden ? ["Search", ...chips] : chips;
}

/** Every campaign the view names, by id: the chips' *Got “…”* reads them. */
export function campaignNamesOf(view: Pick<FunnelView, "stages">): Map<string, string> {
    const names = new Map<string, string>();
    for (const s of view.stages) {
        for (const step of s.flow) for (const c of step.campaigns) names.set(c.id, c.name);
        for (const seg of s.segments) for (const c of [...seg.sendsTo, ...seg.leftOutBy]) names.set(c.id, c.name);
        for (const row of s.results.rows) if (row.kind === "campaign") names.set(row.campaignId, row.name);
    }
    return names;
}

/** People of the stage's campaign rows still inside their 30 days. */
export const stillCounting = (stage: FunnelStageView) =>
    stage.results.rows.reduce((sum, r) => sum + (r.kind === "campaign" ? r.numbers.counting : 0), 0);

/** The stage's steps with their follow-ups: each follow-up placed under the step that holds the campaign it reads. */
export function flowTree(flow: FunnelStageView["flow"]): { step: FunnelStageView["flow"][number]; followUps: FunnelStageView["flow"] }[] {
    type Step = FunnelStageView["flow"][number];
    const parentOf = (s: Step) => (s.after ? flow.find((p) => p.key !== s.key && p.campaigns.some((c) => c.id === s.after!.campaignId)) : undefined);
    // A follow-up of a follow-up hangs under the first campaign of its chain: one level of indent.
    // Walked with a visited set: a chain that loops (the model breaks loops; this never trusts it)
    // leaves the step on its own, so every step appears exactly once.
    const rootOf = (s: Step): Step | undefined => {
        const seen = new Set<string>([s.key]);
        let root: Step | undefined;
        for (let p = parentOf(s); p; p = parentOf(p)) {
            if (seen.has(p.key)) return undefined;
            seen.add(p.key);
            root = p;
        }
        return root;
    };
    const children = new Map<string, FunnelStageView["flow"]>();
    const top: FunnelStageView["flow"] = [];
    for (const step of flow) {
        const root = rootOf(step);
        if (root) children.set(root.key, [...(children.get(root.key) ?? []), step]);
        else top.push(step);
    }
    return top.map((step) => ({ step, followUps: children.get(step.key) ?? [] }));
}

// ─── Creating from the funnel (owner, 2026-11-18) ────────────────────────────

/** *Add an email* to a stage: New campaign for the stage's Segment (slice 06). Without the locale. */
export const addEmailHref = (stageParam: string) => `/settings/campaigns/new?stage=${stageParam}`;

/** The follow-ups a campaign offers, in this order. *Didn't get it* is not one. */
export const FOLLOW_UP_CHOICES = [
    { did: "sent", label: "Got it" },
    { did: "clicked", label: "Clicked it" },
    { did: "not-clicked", label: "Didn't click" },
] as const satisfies readonly { did: CampaignFilterState; label: string }[];

export type FollowUpDid = (typeof FOLLOW_UP_CHOICES)[number]["did"];

/** *Add a follow-up*: New campaign to the people who did `did` with campaign `id` (slice 06). Without the locale. */
export const followUpHref = (id: string, did: FollowUpDid) => `/settings/campaigns/new?after=${id}:${did}`;

/** Short words for a follow-up's connector. */
export const FOLLOW_UP_SHORT: Record<CampaignFilterState, string> = {
    sent: "got it",
    clicked: "clicked it",
    "not-clicked": "didn't click",
    "not-sent": "didn't get it",
};

/** What a stage's band counts: each Automatic step and each live campaign as an email; of the campaigns, those that keep sending. */
export function stageEmailCounts(stage: Pick<FunnelStageView, "flow">): { emails: number; keepSending: number } {
    let emails = 0;
    let keepSending = 0;
    for (const step of stage.flow) {
        if (step.kind === "automatic") emails += 1;
        for (const c of step.campaigns) {
            emails += 1;
            if (c.state.state === "keeps_sending") keepSending += 1;
        }
    }
    return { emails, keepSending };
}

/**
 * Each band's size, 0 to 1, by Customers: the square root, so a stage of
 * hundreds beside one of thousands still reads, and never under `min`, so a
 * small stage stays readable and clickable. A stage not counted is `min`.
 */
export function bandSizes(customers: readonly (number | null)[], min = 0.4): number[] {
    const max = Math.max(1, ...customers.map((c) => c ?? 0));
    return customers.map((c) => Math.max(min, Math.sqrt((c ?? 0) / max)));
}

/** The keys a card asks `renderFunnelEmails` for. */
export const campaignKey = (id: string) => `campaign:${id}`;
export const starterKey = (id: string) => `starter:${id}`;
export const templateKey = (id: string) => `template:${id}`;

/** How many of a group's templates (order, return and quote emails) show as thumbnails; the rest are counted. */
export const GROUP_THUMBNAILS = 4;

/**
 * An Automatic step that is a timed sequence (the draft reminders): its days,
 * one per template, from the programme (the code that sends them); null for
 * one email, or a group sent on events.
 */
export function sequenceDays(step: Pick<FunnelStageView["flow"][number], "key" | "kind" | "templates">): readonly number[] | null {
    if (step.kind !== "automatic") return null;
    const p = FUNNEL_PROGRAMME.find((x) => x.id === step.key);
    const days = p?.kind === "automatic" ? p.afterDays : undefined;
    return days && days.length === step.templates.length && days.length > 1 ? days : null;
}

const isSequence = (step: Pick<FunnelStageView["flow"][number], "key" | "kind" | "templates">) => sequenceDays(step) !== null;

/** Every render a stage's flow shows: its campaigns, its Suggested Playbooks' Starters, its Automatic emails' templates. */
export function renderKeysOf(stage: Pick<FunnelStageView, "flow">): string[] {
    return [
        ...new Set(
            stage.flow.flatMap((step) => {
                if (step.kind === "automatic") return (isSequence(step) ? step.templates : step.templates.slice(0, GROUP_THUMBNAILS)).map(templateKey);
                if (step.campaigns.length) return step.campaigns.map((c) => campaignKey(c.id));
                return step.starterId ? [starterKey(step.starterId)] : [];
            }),
        ),
    ];
}
