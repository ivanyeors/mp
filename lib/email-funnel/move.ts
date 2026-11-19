/**
 * Arranging the Email flow (PRD-email-funnel slice 07; ADR 0054 (8)), pure.
 *
 * Send order is not a stored position: B is sent after A when B's Segment
 * reads A (`campaign=<A>:sent|clicked|not-clicked`). So a move changes only
 * the *Campaign* filter of the Segments of the drafts it touches, as a list:
 *
 * - D placed after P (with a condition) reads P; placed at the start of a
 *   stage it reads nothing, and names the stage when its filters name none.
 * - The gap D leaves closes: D's draft follow-ups now follow what D followed,
 *   each with its own condition, or start the stage. A started follow-up
 *   cannot be re-pointed, so it stays under D (and D cannot then follow it).
 * - D dropped between P and P's draft follow-up C takes C's place (follows
 *   P with C's condition) and C follows D (*got it*).
 *
 * `planArrangement` is the structure alone, on ids: the page runs it for its
 * optimistic redraw and the server for the write, so both agree. `planMove`
 * reads the facts as the page does (`readFunnel`) and adds each change's
 * filters and the name a Segment would be created with. Filters stay on the
 * server: the browser never sees a Segment's filters (they may name a
 * Customer).
 */

import { stageFilterParam, type CampaignFilterState } from "@/lib/crm/customer-filters";
import { filtersKey } from "@/lib/crm/filters-key";
import { LIFECYCLE_STAGE_LABEL, type LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { SEGMENT_NAME_MAX } from "@/lib/crm/segment-rules";
import { isUnplaced, moveLock, readFunnel, stageFollowOf, stagesNamedBy, type FunnelCampaignFact, type FunnelFacts } from "./model";

/** What a follow-up's people did with the email before: *Didn't get it* is not a follow-up. */
export type MoveDid = Exclude<CampaignFilterState, "not-sent">;
export const MOVE_DIDS: readonly MoveDid[] = ["sent", "clicked", "not-clicked"];

/** A move, as the page sends it: ids, a stage and a condition, never filters. */
export interface FunnelMove {
  campaignId: string;
  stage: LifecycleStage;
  /** The email it follows, and what its people did with it; null: it starts a sequence. */
  after: { campaignId: string; did: MoveDid } | null;
  /**
   * Dropped in front of this draft: between `after` and this follow-up of it, or, with no `after`, in front
   * of the first email of a sequence. This one then follows the moved one (*got it*).
   */
  before: string | null;
}

/** One email as the arrangement sees it. */
export interface ArrangeNode {
  id: string;
  name: string;
  /** The email it follows up, as the model reads it; null when it follows nothing. */
  parent: { id: string; did: CampaignFilterState } | null;
  /** Why it cannot move (`moveLock`), or null. */
  lock: string | null;
  /** In the stage's flow. */
  inStage: boolean;
  /** A draft in no stage yet (`isUnplaced`). */
  unplaced: boolean;
  /**
   * The campaign its Segment reads (got, clicked or didn't click it), in any stage; null for none. Left out,
   * `parent` stands for it. It never draws or re-points anything: it only refuses a move that would make
   * two emails wait for each other through emails outside the stage's flow.
   */
  reads?: string | null;
}

/** One campaign's new *Campaign* filter: the email it follows and the condition, or null to start a sequence. */
export interface ArrangeChange {
  campaignId: string;
  campaign: { id: string; did: MoveDid } | null;
}

export type Refusal = { ok: false; error: string };
export type Arrangement = { ok: true; changes: ArrangeChange[] } | Refusal;

const refuse = (error: string): Refusal => ({ ok: false, error });
const quote = (n: { name: string }) => `“${n.name}”`;
const isDid = (v: unknown): v is MoveDid => MOVE_DIDS.includes(v as MoveDid);

/** The words refusing a move that would make two emails wait for each other: `x` would follow `y`, which already comes after `x`. */
const waitsWords = (x: { name: string }, y: { name: string }) =>
  `${quote(x)} cannot follow ${quote(y)}: ${quote(y)} already comes after ${quote(x)}, through emails outside this stage's flow, so each would wait for the other and neither would ever send. Change who ${quote(y)} goes to first.`;

/**
 * Pure — the changes `move` makes to `nodes`, in an order where no step leaves
 * a cycle, or a refusal in words. No changes when nothing would change.
 */
export function planArrangement(nodes: readonly ArrangeNode[], move: Pick<FunnelMove, "campaignId" | "after" | "before">): Arrangement {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const d = byId.get(move.campaignId);
  if (!d) return refuse("That email is no longer live.");
  if (d.lock) return refuse(`${quote(d)} stays where it is. ${d.lock}`);
  if (!d.inStage && !d.unplaced) return refuse(`${quote(d)} is not in this stage's flow.`);
  if (move.after && !isDid(move.after.did)) return refuse("Choose who it goes to: those who got it, clicked it or didn't click.");

  const p = move.after ? byId.get(move.after.campaignId) : null;
  if (move.after && (!p || !p.inStage)) return refuse("The email to follow is archived or not in this stage's flow.");
  if (p && p.id === d.id) return refuse(`${quote(d)} cannot follow itself.`);

  let did: MoveDid | null = move.after ? move.after.did : null;
  const c = move.before ? byId.get(move.before) : null;
  if (move.before) {
    if (!c || !c.inStage) return refuse("The email to slot in front of is archived or not in this stage's flow.");
    if (c.id === d.id) return { ok: true, changes: [] };
    if (p ? c.parent?.id !== p.id || !isDid(c.parent.did) : c.parent !== null) {
      return refuse(`${quote(c)} does not ${p ? `follow ${quote(p)}` : "start its sequence"} any more. The page will read the flow again.`);
    }
    if (c.lock) return refuse(`${quote(c)} stays where it is. ${c.lock}`);
    // D takes C's place: it follows P with C's condition, or starts the sequence C started.
    did = p && c.parent && isDid(c.parent.did) ? c.parent.did : null;
  }

  const target = p && did ? { id: p.id, did } : null;
  const same = (a: ArrangeNode["parent"], b: ArrangeChange["campaign"]) => (a === null ? b === null : b !== null && a.id === b.id && a.did === b.did);

  // Already there: nothing changes (an unplaced draft placed at the start still gets the stage).
  if (!c && d.inStage && same(d.parent, target)) return { ok: true, changes: [] };

  // Only the condition changes: D keeps its place, and its follow-ups stay under it.
  const conditionOnly = !c && d.inStage && target !== null && d.parent?.id === target.id;

  // The gap D leaves: its draft follow-ups follow what D followed; its started ones, and all under them, stay under D.
  const children = nodes.filter((n) => n.inStage && n.parent?.id === d.id && n.id !== d.id);
  const repointed = d.inStage && !conditionOnly ? children.filter((n) => !n.lock) : [];
  const repointedIds = new Set(repointed.map((n) => n.id));
  // Everything under D that stays under it: as drawn (`parent`), and as the Segments read whatever the stage (`reads`).
  const readOf = (n: ArrangeNode) => (n.reads !== undefined ? n.reads : (n.parent?.id ?? null));
  const under = (first: (n: ArrangeNode) => boolean, next: (n: ArrangeNode) => string | null) => {
    const out = new Set<string>();
    const stack = nodes.filter((n) => n.id !== d.id && first(n) && !repointedIds.has(n.id)).map((n) => n.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id) || id === d.id) continue;
      out.add(id);
      for (const n of nodes) if (next(n) === id) stack.push(n.id);
    }
    return out;
  };
  const staysUnder = under((n) => n.inStage && n.parent?.id === d.id, (n) => n.parent?.id ?? null);
  if (p && staysUnder.has(p.id)) {
    return refuse(`${quote(d)} cannot follow ${quote(p)}: ${quote(p)} comes after it and has started, so it stays under ${quote(d)}.`);
  }
  if (p && under((n) => readOf(n) === d.id, readOf).has(p.id)) {
    return refuse(waitsWords(d, p));
  }

  const changes: ArrangeChange[] = [
    ...repointed.flatMap((n): ArrangeChange[] => {
      const nd = n.parent && isDid(n.parent.did) ? n.parent.did : "sent";
      return [{ campaignId: n.id, campaign: d.parent && isDid(d.parent.did) ? { id: d.parent.id, did: nd } : null }];
    }),
    // Slotted in front of C while already following P that way (a new email from *Add an email here*): only C changes.
    ...(c && d.inStage && same(d.parent, target) ? [] : [{ campaignId: d.id, campaign: target }]),
    ...(c ? [{ campaignId: c.id, campaign: { id: d.id, did: "sent" as const } }] : []),
  ];

  // Each step is checked, on what every Segment reads whatever the stage: no changed email may come back to itself.
  const reads = new Map(nodes.map((n) => [n.id, readOf(n)]));
  const byId2 = new Map(nodes.map((n) => [n.id, n]));
  for (const ch of changes) {
    reads.set(ch.campaignId, ch.campaign?.id ?? null);
    const seen = new Set<string>();
    for (let at = reads.get(ch.campaignId) ?? null; at && !seen.has(at); at = reads.get(at) ?? null) {
      if (at === ch.campaignId) {
        const x = byId2.get(ch.campaignId)!;
        const y = byId2.get(ch.campaign!.id);
        return refuse(y ? waitsWords(x, y) : `That would make ${quote(d)} follow itself.`);
      }
      seen.add(at);
    }
  }
  return { ok: true, changes };
}

// ─── With the facts: filters and names, server only ──────────────────────────

/** A change with what the write needs: the Segment's filters, and the name it is created with when none has them. */
export interface MoveChange extends ArrangeChange {
  name: string;
  filters: Record<string, string>;
  segmentName: string;
}

export type MovePlan = { ok: true; changes: MoveChange[] } | Refusal;

const DID_VERB: Record<MoveDid, string> = { sent: "got", clicked: "clicked", "not-clicked": "didn't click" };

/** Pure — `<prefix>“<quoted>”<suffix>`, the quoted words cut so it is a Segment name. */
const named = (prefix: string, quoted: string, suffix = "") =>
  `${prefix}“${quoted.slice(0, Math.max(1, SEGMENT_NAME_MAX - prefix.length - suffix.length - 2)).trimEnd()}”${suffix}`;

/** Pure — the live campaign `c`'s Segment reads (got, clicked or didn't click it), whatever the stage; null for none. */
function readsOf(reading: ReturnType<typeof readFunnel>, c: FunnelCampaignFact): string | null {
  const read = reading.segmentOf(c)?.campaign;
  if (!read || !isDid(read.state) || read.id === c.campaign.id) return null;
  return reading.byId.has(read.id) ? read.id : null;
}

/** Pure — the arrangement as the model reads the facts, for `stage`. */
export function arrangeNodes(reading: ReturnType<typeof readFunnel>, stage: LifecycleStage): ArrangeNode[] {
  return reading.campaigns.map((c) => {
    // The page's own reading of the stage (`stageFollowOf`): a parent counts only in this stage's flow.
    const f = stageFollowOf(reading, c, stage);
    return {
      id: c.campaign.id,
      name: c.campaign.name,
      parent: f ? { id: f.parent.campaign.id, did: f.did } : null,
      lock: moveLock(reading, c),
      inStage: reading.stagesOf(c).has(stage),
      unplaced: isUnplaced(reading, c),
      reads: readsOf(reading, c),
    };
  });
}

/**
 * Pure — the move planned on the live facts: each change with the filters of
 * the Segment the campaign is then pointed at (its other filters kept, the
 * *Campaign* filter replaced), and the name such a Segment is created with,
 * unique among live Segments with other filters.
 */
export function planMove(facts: Pick<FunnelFacts, "segments" | "campaigns">, move: FunnelMove): MovePlan {
  if (move.stage === "lost") return refuse("A Lost customer has unsubscribed from marketing email, so nothing is arranged there.");
  const reading = readFunnel(facts);
  const planned = planArrangement(arrangeNodes(reading, move.stage), move);
  if (!planned.ok) return planned;

  const nameOf = (id: string) => reading.byId.get(id)?.campaign.name ?? "";
  const taken = (key: string | null) => new Set(reading.segments.filter((s) => s.key !== key).map((s) => s.fact.name.toLowerCase()));
  const made = new Set<string>();

  const changes = planned.changes.map((ch): MoveChange => {
    const c = reading.byId.get(ch.campaignId) as FunnelCampaignFact;
    const seg = reading.segmentOf(c);
    const filters: Record<string, string> = {};
    for (const [k, v] of Object.entries(seg?.fact.params ?? {})) if (v !== undefined && k !== "campaign") filters[k] = v;
    if (ch.campaign) filters.campaign = `${ch.campaign.id.toLowerCase()}:${ch.campaign.did}`;
    else if (filters.stage === undefined) filters.stage = stageFilterParam(move.stage);

    // Named after the stage its filters name (a follow-up's whose filters name none: this stage's).
    const named0 = stagesNamedBy(filters.stage);
    const label = LIFECYCLE_STAGE_LABEL[named0.length && !named0.includes(move.stage) ? named0[0] : move.stage];
    const onlyStage = Object.keys(filters).length === 1 && filters.stage !== undefined;
    // *Lead · got “Welcome”*; a start with only the stage is the stage's own Segment, *Lead*.
    const make = (suffix = "") =>
      ch.campaign
        ? named(`${label} · ${DID_VERB[ch.campaign.did]} `, nameOf(ch.campaign.id), suffix)
        : onlyStage
          ? `${label}${suffix}`
          : named(`${label} · `, c.campaign.name, suffix);
    const names = taken(filtersKey(filters));
    let name = make();
    for (let n = 2; names.has(name.toLowerCase()) || made.has(name.toLowerCase()); n++) name = make(` (${n})`);
    made.add(name.toLowerCase());
    return { ...ch, name: c.campaign.name, filters, segmentName: name };
  });
  return { ok: true, changes };
}

/** What New campaign slots a new email in front of (`?after=<P>:<did>&before=<C>`): C, P and the stage. */
export interface SlotBefore {
  before: { id: string; name: string };
  after: { campaignId: string; did: MoveDid };
  stage: LifecycleStage;
}

/**
 * Pure — `?before=<C>` with `?after=<P>:<did>`, when it can be done: C is a
 * draft that can move, it follows P now, and both sit in a stage's flow (the
 * first such stage). Null otherwise, and the address is then ignored: the new
 * email is an ordinary follow-up of P.
 */
export function slotBefore(
  facts: Pick<FunnelFacts, "segments" | "campaigns">,
  after: { id: string; state: MoveDid } | null,
  before: string | string[] | undefined,
): SlotBefore | null {
  const raw = Array.isArray(before) ? before[0] : before;
  if (!after || typeof raw !== "string") return null;
  const reading = readFunnel(facts);
  const c = reading.byId.get(raw.toLowerCase());
  const p = reading.byId.get(after.id);
  if (!c || !p || moveLock(reading, c) !== null) return null;
  const stage = [...reading.stagesOf(c)].find((s) => s !== "lost" && stageFollowOf(reading, c, s)?.parent.campaign.id === p.campaign.id);
  return stage ? { before: { id: c.campaign.id, name: c.campaign.name }, after: { campaignId: p.campaign.id, did: after.state }, stage } : null;
}
