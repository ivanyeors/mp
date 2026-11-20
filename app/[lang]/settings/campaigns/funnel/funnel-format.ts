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

function rated(count: number, r: number | null): string {
    return r === null ? "—" : `${n(count)} (${formatRate(r)})`;
}

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

export const countText = (v: number | null) => (v === null ? "—" : n(v));

export const FOLLOW_UP_WORDS: Record<CampaignFilterState, string> = {
    sent: "To those who got it",
    clicked: "To those who clicked it",
    "not-clicked": "To those who got it and didn't click",
    "not-sent": "To those who didn't get it",
};

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

export function campaignNamesOf(view: Pick<FunnelView, "stages">): Map<string, string> {
    const names = new Map<string, string>();
    for (const s of view.stages) {
        for (const step of s.flow) for (const c of step.campaigns) names.set(c.id, c.name);
        for (const seg of s.segments) for (const c of [...seg.sendsTo, ...seg.leftOutBy]) names.set(c.id, c.name);
        for (const row of s.results.rows) if (row.kind === "campaign") names.set(row.campaignId, row.name);
    }
    return names;
}

export const stillCounting = (stage: FunnelStageView) =>
    stage.results.rows.reduce((sum, r) => sum + (r.kind === "campaign" ? r.numbers.counting : 0), 0);

type Step = FunnelStageView["flow"][number];

export interface FlowNode {
    step: Step;
    campaign: FlowCampaign;
    parent: { id: string; did: CampaignFilterState } | null;
    number: number;
    children: FlowNode[];
}

export type FlowItem = { kind: "sequence"; root: FlowNode } | { kind: "suggested"; step: Step };

export interface FlowLayout {
    automatic: Step[];
    items: FlowItem[];
    nodes: ArrangeNode[];
    unplaced: FlowCampaign[];
}

const DID_ORDER: Record<CampaignFilterState, number> = { sent: 0, clicked: 1, "not-clicked": 2, "not-sent": 3 };

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
    for (const e of entries) if (!seen.has(e.campaign.id)) items.push({ kind: "sequence", root: grow(e, 1, true) });

    const rest = unplaced.filter((c) => !moved.has(c.id));
    const nodes: ArrangeNode[] = [
        ...entries.map((e) => ({ id: e.campaign.id, name: e.campaign.name, parent: e.parent, lock: e.campaign.lock, inStage: true, unplaced: false })),
        ...rest.map((c) => ({ id: c.id, name: c.name, parent: null, lock: c.lock, inStage: false, unplaced: true })),
    ];
    return { automatic, items, nodes, unplaced: rest };
}

export const nodesOf = (n: FlowNode): FlowNode[] => [n, ...n.children.flatMap(nodesOf)];

const isFollowUp = (d: CampaignFilterState): d is MoveDid => d !== "not-sent";

export type PageMove = Omit<FunnelMove, "stage">;

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

export function zoneMove(campaignId: string, from: FlowNode | null, to: FlowNode | null): PageMove {
    if (!from) return { campaignId, after: null, before: null };
    if (to && !to.campaign.lock && to.parent && isFollowUp(to.parent.did)) {
        return { campaignId, after: { campaignId: from.campaign.id, did: to.parent.did }, before: to.campaign.id };
    }
    return { campaignId, after: { campaignId: from.campaign.id, did: "sent" }, before: null };
}

export function nodeConnectors(node: FlowNode): (FlowNode | null)[] {
    if (node.children.length === 1) return [node.children[0]];
    return [...node.children, null];
}

export function flowZones(layout: FlowLayout): { from: FlowNode | null; to: FlowNode | null }[] {
    const nodes = layout.items.flatMap((i) => (i.kind === "sequence" ? nodesOf(i.root) : []));
    return [...nodes.flatMap((from) => nodeConnectors(from).map((to) => ({ from, to }))), { from: null, to: null }];
}

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

export function zoneWords(move: PageMove, nameOf: (id: string) => string): string {
    if (!move.after) return "Start a new sequence with it";
    const head = `After “${nameOf(move.after.campaignId)}”, to those who ${FOLLOW_UP_SHORT[move.after.did]}`;
    return move.before ? `${head}, then “${nameOf(move.before)}”` : head;
}

export function canOpenWith(permissions: readonly string[]): (href: string) => boolean {
    return (href) => {
        const key = permissionForHref(href.split("?")[0]);
        return !key || permissions.includes(key);
    };
}

export const MAX_RENDER_KEYS = 40;

export const addEmailHref = (stageParam: string) => `/settings/campaigns/new?stage=${stageParam}`;

export const FOLLOW_UP_CHOICES = [
    { did: "sent", label: "Got it" },
    { did: "clicked", label: "Clicked it" },
    { did: "not-clicked", label: "Didn't click" },
] as const satisfies readonly { did: CampaignFilterState; label: string }[];

export type FollowUpDid = (typeof FOLLOW_UP_CHOICES)[number]["did"];

export const followUpHref = (id: string, did: FollowUpDid) => `/settings/campaigns/new?after=${id}:${did}`;

export const FOLLOW_UP_SHORT: Record<CampaignFilterState, string> = {
    sent: "got it",
    clicked: "clicked it",
    "not-clicked": "didn't click",
    "not-sent": "didn't get it",
};

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

export function bandSizes(customers: readonly (number | null)[], min = 0.4): number[] {
    const max = Math.max(1, ...customers.map((c) => c ?? 0));
    return customers.map((c) => Math.max(min, Math.sqrt((c ?? 0) / max)));
}

export const campaignKey = (id: string) => `campaign:${id}`;
export const starterKey = (id: string) => `starter:${id}`;
export const templateKey = (id: string) => `template:${id}`;

export const GROUP_THUMBNAILS = 4;

export function sequenceDays(step: Pick<FunnelStageView["flow"][number], "key" | "kind" | "templates">): readonly number[] | null {
    if (step.kind !== "automatic") return null;
    const p = FUNNEL_PROGRAMME.find((x) => x.id === step.key);
    const days = p?.kind === "automatic" ? p.afterDays : undefined;
    return days && days.length === step.templates.length && days.length > 1 ? days : null;
}

const isSequence = (step: Pick<FunnelStageView["flow"][number], "key" | "kind" | "templates">) => sequenceDays(step) !== null;

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

export function renderKeysOf(stage: Pick<FunnelStageView, "flow">): string[] {
    return [...new Set(cardRenderKeys(stage).flatMap((c) => c.keys))];
}
