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
    // A follow-up of a follow-up hangs under the first campaign, in order: one level of indent.
    const rootOf = (s: Step): Step | undefined => {
        const seen = new Set<string>([s.key]);
        let p = parentOf(s);
        while (p && parentOf(p) && !seen.has(parentOf(p)!.key)) {
            seen.add(p.key);
            p = parentOf(p);
        }
        return p;
    };
    const children = new Map<string, FunnelStageView["flow"]>();
    const top: FunnelStageView["flow"] = [];
    for (const step of flow) {
        const parent = rootOf(step);
        if (parent && parent.key !== step.key) children.set(parent.key, [...(children.get(parent.key) ?? []), step]);
        else top.push(step);
    }
    return top.map((step) => ({ step, followUps: children.get(step.key) ?? [] }));
}
