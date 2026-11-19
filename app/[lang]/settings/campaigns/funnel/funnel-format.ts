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
import { formatRate, formatSgd, resultRates, type FlowCampaign, type FunnelStageView, type FunnelView } from "@/lib/email-funnel/model";
import type { ResultNumbers } from "@/lib/email-campaigns/results";
import { FUNNEL_PROGRAMME } from "@/lib/email-funnel/programme";
import type { ArrangeNode, FunnelMove, MoveDid } from "@/lib/email-funnel/move";
import { permissionForHref } from "@/lib/auth/permissions";

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

// ─── The Email flow's layout (slice 07) ──────────────────────────────────────

type Step = FunnelStageView["flow"][number];

/** One email of a sequence, with the emails that follow it. */
export interface FlowNode {
    step: Step;
    campaign: FlowCampaign;
    /** The email it follows, as drawn (an optimistic move included); null for a sequence's first. */
    parent: { id: string; did: CampaignFilterState } | null;
    /** Step number in its sequence: 1 for the first. */
    number: number;
    children: FlowNode[];
}

export type FlowItem = { kind: "sequence"; root: FlowNode } | { kind: "suggested"; step: Step };

export interface FlowLayout {
    /** The stage's Automatic emails, in programme order. */
    automatic: Step[];
    /** Sequences and Suggested Playbooks, in the flow's order. */
    items: FlowItem[];
    /** Every email as `planArrangement` reads it, for drops and the menu's moves. */
    nodes: ArrangeNode[];
    /** Drafts in no stage, still not placed. */
    unplaced: FlowCampaign[];
}

const DID_ORDER: Record<CampaignFilterState, number> = { sent: 0, clicked: 1, "not-clicked": 2, "not-sent": 3 };

/** A draft placed from outside the funnel, drawn as an email of the stage until the page reads it again. */
const placedStep = (c: FlowCampaign): Step => ({
    key: `campaign:${c.id}`,
    kind: "campaign",
    name: c.name,
    purpose: "marketing",
    consent: "Marketing consent: only to people subscribed",
    who: "",
    when: "Once, when a person sends a Wave",
    stops: "",
    state: c.state,
    href: c.href,
    setUpHref: null,
    templates: [],
    starterId: null,
    campaigns: [c],
    after: null,
});

/**
 * Pure — the stage's flow as one column: Automatic emails, then sequences,
 * each email under the one it follows (`after`), with `moved` (an optimistic
 * move: campaign id → the email it now follows, or null) laid over the view.
 * Every email appears exactly once, even when follow-ups loop (the model
 * breaks loops; this never trusts it).
 */
export function flowLayout(
    stage: Pick<FunnelStageView, "flow">,
    unplaced: readonly FlowCampaign[] = [],
    moved: ReadonlyMap<string, { id: string; did: CampaignFilterState } | null> = new Map(),
): FlowLayout {
    const automatic = stage.flow.filter((s) => s.kind === "automatic");
    type Entry = { step: Step; campaign: FlowCampaign; parent: FlowNode["parent"]; order: number };
    const entries: Entry[] = [];
    for (const step of stage.flow) {
        if (step.kind === "automatic") continue;
        for (const c of step.campaigns) entries.push({ step, campaign: c, parent: step.kind === "campaign" && step.after ? { id: step.after.campaignId, did: step.after.did } : null, order: entries.length });
    }
    const placed = unplaced.filter((c) => moved.has(c.id));
    for (const c of placed) entries.push({ step: placedStep(c), campaign: c, parent: null, order: entries.length });
    for (const e of entries) if (moved.has(e.campaign.id)) e.parent = moved.get(e.campaign.id) ?? null;

    const byId = new Map(entries.map((e) => [e.campaign.id, e]));
    const childrenOf = new Map<string, Entry[]>();
    const isRoot = (e: Entry) => !e.parent || !byId.has(e.parent.id) || e.parent.id === e.campaign.id;
    for (const e of entries) {
        if (isRoot(e)) continue;
        childrenOf.set(e.parent!.id, [...(childrenOf.get(e.parent!.id) ?? []), e]);
    }
    const seen = new Set<string>();
    const grow = (e: Entry, number: number, asRoot: boolean): FlowNode => {
        seen.add(e.campaign.id);
        const kids = (childrenOf.get(e.campaign.id) ?? [])
            .filter((k) => !seen.has(k.campaign.id))
            .sort((a, b) => DID_ORDER[a.parent!.did] - DID_ORDER[b.parent!.did] || a.order - b.order);
        const node: FlowNode = { step: e.step, campaign: e.campaign, parent: asRoot ? null : e.parent, number, children: [] };
        for (const k of kids) if (!seen.has(k.campaign.id)) node.children.push(grow(k, number + 1, false));
        return node;
    };

    const items: FlowItem[] = [];
    for (const step of stage.flow) {
        if (step.kind === "automatic") continue;
        if (step.kind === "playbook" && !step.campaigns.length) {
            items.push({ kind: "suggested", step });
            continue;
        }
        for (const c of step.campaigns) {
            const e = byId.get(c.id)!;
            if (isRoot(e) && !seen.has(c.id)) items.push({ kind: "sequence", root: grow(e, 1, true) });
        }
    }
    for (const c of placed) {
        const e = byId.get(c.id)!;
        if (isRoot(e) && !seen.has(c.id)) items.push({ kind: "sequence", root: grow(e, 1, true) });
    }
    // A loop leaves its emails unreached: each starts a sequence of its own, so none is lost.
    for (const e of entries) if (!seen.has(e.campaign.id)) items.push({ kind: "sequence", root: grow(e, 1, true) });

    const rest = unplaced.filter((c) => !moved.has(c.id));
    const nodes: ArrangeNode[] = [
        ...entries.map((e) => ({ id: e.campaign.id, name: e.campaign.name, parent: e.parent, lock: e.campaign.lock, inStage: true, unplaced: false })),
        ...rest.map((c) => ({ id: c.id, name: c.name, parent: null, lock: c.lock, inStage: false, unplaced: true })),
    ];
    return { automatic, items, nodes, unplaced: rest };
}

/** Every node of a sequence, depth first. */
export const nodesOf = (n: FlowNode): FlowNode[] => [n, ...n.children.flatMap(nodesOf)];

const isFollowUp = (d: CampaignFilterState): d is MoveDid => d !== "not-sent";

/** A move as the page sends it, before the stage is added. */
export type PageMove = Omit<FunnelMove, "stage">;

/**
 * Pure — the moves a card's menu offers, each the input the matching drop
 * sends (`planArrangement` says whether it can be done): *Move earlier* puts
 * it in front of the email it follows; *Move later* behind its first
 * follow-up; *Start a new sequence* makes it follow nothing.
 */
export function menuMoves(layout: FlowLayout, id: string): { earlier: PageMove | null; later: PageMove | null; start: PageMove } {
    const all = new Map(layout.items.flatMap((i) => (i.kind === "sequence" ? nodesOf(i.root) : [])).map((n) => [n.campaign.id, n]));
    const node = all.get(id);
    const start: PageMove = { campaignId: id, after: null, before: null };
    if (!node) return { earlier: null, later: null, start };
    const parent = node.parent ? all.get(node.parent.id) : undefined;
    const grand = parent?.parent;
    const earlier: PageMove | null = !parent
        ? null
        : grand && isFollowUp(grand.did)
          ? { campaignId: id, after: { campaignId: grand.id, did: grand.did }, before: parent.campaign.id }
          : { campaignId: id, after: null, before: parent.campaign.id };
    const next = node.children[0];
    const beyond = next?.children[0];
    const later: PageMove | null = !next
        ? null
        : beyond && !beyond.campaign.lock && beyond.parent && isFollowUp(beyond.parent.did)
          ? { campaignId: id, after: { campaignId: next.campaign.id, did: beyond.parent.did }, before: beyond.campaign.id }
          : { campaignId: id, after: { campaignId: next.campaign.id, did: "sent" }, before: null };
    return { earlier, later, start };
}

/**
 * Pure — a drop zone's move: between `from` and its follow-up `to`, the
 * dragged draft takes `to`'s place when `to` can move, else it follows `from`
 * beside it; after the last email of a sequence it follows that one; with no
 * `from` it starts a new sequence.
 */
export function zoneMove(campaignId: string, from: FlowNode | null, to: FlowNode | null): PageMove {
    if (!from) return { campaignId, after: null, before: null };
    if (to && !to.campaign.lock && to.parent && isFollowUp(to.parent.did)) {
        return { campaignId, after: { campaignId: from.campaign.id, did: to.parent.did }, before: to.campaign.id };
    }
    return { campaignId, after: { campaignId: from.campaign.id, did: "sent" }, before: null };
}

/**
 * Pure — the connectors drawn after `node`, each by the email it leads to:
 * its one follow-up; each of several, then one after them all; or, at the
 * end of a sequence, none (null). Every connector is a drop zone.
 */
export function nodeConnectors(node: FlowNode): (FlowNode | null)[] {
    if (node.children.length === 1) return [node.children[0]];
    return [...node.children, null];
}

/** Pure — every drop zone of the flow, as `zoneMove` reads it: each connector, then *Start a new sequence*. */
export function flowZones(layout: FlowLayout): { from: FlowNode | null; to: FlowNode | null }[] {
    const nodes = layout.items.flatMap((i) => (i.kind === "sequence" ? nodesOf(i.root) : []));
    return [...nodes.flatMap((from) => nodeConnectors(from).map((to) => ({ from, to }))), { from: null, to: null }];
}

/**
 * Pure — the places *Move to…* offers the draft `id`: every drop zone that
 * would take it (`can`, the plan on the page's ids), once each, in the zones'
 * own words, so the menu and the drag offer the same places.
 */
export function movePlaces(layout: FlowLayout, id: string, can: (m: PageMove) => boolean, nameOf: (id: string) => string): { move: PageMove; words: string }[] {
    const seen = new Set<string>();
    const out: { move: PageMove; words: string }[] = [];
    for (const z of flowZones(layout)) {
        const move = zoneMove(id, z.from, z.to);
        const key = JSON.stringify(move);
        if (seen.has(key) || !can(move)) continue;
        seen.add(key);
        out.push({ move, words: zoneWords(move, nameOf) });
    }
    return out;
}

/** What a drop zone says it will do, in words. */
export function zoneWords(move: PageMove, nameOf: (id: string) => string): string {
    if (!move.after) return "Start a new sequence with it";
    const head = `After “${nameOf(move.after.campaignId)}”, to those who ${FOLLOW_UP_SHORT[move.after.did]}`;
    return move.before ? `${head}, then “${nameOf(move.before)}”` : head;
}

// ─── Links and renders ───────────────────────────────────────────────────────

/**
 * The page's one link rule, the sidebar's: a path (without the locale; a
 * query is ignored) opens when no permission guards it or the role holds the
 * one that does. Every link on the Email funnel goes through it.
 */
export function canOpenWith(permissions: readonly string[]): (href: string) => boolean {
    return (href) => {
        const key = permissionForHref(href.split("?")[0]);
        return !key || permissions.includes(key);
    };
}

/** The most renders one `renderFunnelEmails` call answers; the page asks in chunks of it. */
export const MAX_RENDER_KEYS = 40;

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

/**
 * Every card of a stage's flow with the renders it shows: its campaigns, its
 * Suggested Playbooks' Starters, its Automatic emails' templates (a group of
 * them is one card). The page asks only for the cards whose preview shows.
 */
export function cardRenderKeys(stage: Pick<FunnelStageView, "flow">): { card: string; keys: string[] }[] {
    return stage.flow.flatMap((step) => {
        if (step.kind === "automatic") {
            if (isSequence(step) || step.templates.length === 1) return step.templates.map((t) => ({ card: templateKey(t), keys: [templateKey(t)] }));
            return [{ card: step.key, keys: step.templates.slice(0, GROUP_THUMBNAILS).map(templateKey) }];
        }
        if (step.campaigns.length) return step.campaigns.map((c) => ({ card: campaignKey(c.id), keys: [campaignKey(c.id)] }));
        return step.starterId ? [{ card: starterKey(step.starterId), keys: [starterKey(step.starterId)] }] : [];
    });
}

/** Every render a stage's flow shows (every card's preview open). */
export function renderKeysOf(stage: Pick<FunnelStageView, "flow">): string[] {
    return [...new Set(cardRenderKeys(stage).flatMap((c) => c.keys))];
}
